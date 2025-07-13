import { crypto } from "@std/crypto/crypto";
import { join } from "@std/path/join";
import { fromFileUrl } from "@std/path/from-file-url";
import { DenoDir } from "@deno/cache-dir";
import type { ImportMap } from "./import_map.ts";

// Constants for better readability
const HASH_ALGORITHM = "SHA-256" as const;
const HEX_CHARS = 2 as const;
const CACHE_DIR_DEPTH = 2 as const;

// Reusable encoder instance
const textEncoder = new TextEncoder();

/**
 * Converts a byte array to a hexadecimal string.
 * Extracted for reusability and clarity.
 */
function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(HEX_CHARS, "0"))
    .join("");
}

/**
 * Generates a SHA-256 hash for cache identification.
 * Creates a deterministic hash based on module specifier, source code, and import map.
 */
function getCacheHashHex(
  specifier: string,
  sourceCode: string,
  importMap: ImportMap,
): string {
  const data = JSON.stringify({ specifier, code: sourceCode, importMap });
  const hash = crypto.subtle.digestSync(
    HASH_ALGORITHM,
    textEncoder.encode(data),
  );
  return bytesToHex(hash);
}

/**
 * Generates a SHA-256 hash of a URL string.
 * Matches Deno's internal hashing mechanism for cache file names.
 */
function getUrlHash(url: string): string {
  const hash = crypto.subtle.digestSync(
    HASH_ALGORITHM,
    textEncoder.encode(url),
  );
  return bytesToHex(hash);
}

/**
 * Generates a hierarchical cache file path for storing transformed modules.
 *
 * Creates a cache path using a directory structure that prevents filesystem
 * limitations with too many files in a single directory. The path is structured
 * as: `{first-2-hash-chars}/{next-2-hash-chars}/{full-hash}-{filename}`
 *
 * This approach distributes cache files across multiple directories for better
 * filesystem performance and easier cache management.
 *
 * @param specifier - The module specifier (URL or path)
 * @param sourceCode - The source code content of the module
 * @param importMap - The import map configuration used for transformations
 * @returns A relative cache path for storing the transformed module
 *
 * @example
 * ```typescript
 * const cachePath = getCachePath(
 *   "file:///src/utils/helper.ts",
 *   "export const helper = () => {};",
 *   { imports: {} }
 * );
 * // Returns: "a3/f5/a3f5b8c2d1e4f6...-helper.ts"
 * ```
 */
export function getCachePath(
  specifier: string,
  sourceCode: string,
  importMap: ImportMap,
): string {
  const hashHex = getCacheHashHex(specifier, sourceCode, importMap);
  const filename = extractFilename(specifier);

  // Create hierarchical structure: ab/cd/abcd...-filename
  const firstDir = hashHex.slice(0, CACHE_DIR_DEPTH);
  const secondDir = hashHex.slice(CACHE_DIR_DEPTH, CACHE_DIR_DEPTH * 2);

  return join(firstDir, secondDir, `${hashHex}-${filename}`);
}

/**
 * Extracts the filename from a URL or path specifier.
 */
function extractFilename(specifier: string): string {
  const pathname = new URL(specifier).pathname;
  const pathParts = pathname.split("/").filter(Boolean);
  return pathParts.pop() || "index.ts";
}

// Cache the Deno directory to avoid repeated instantiation
let denoDirCache: string | undefined;

/**
 * Gets the default Deno cache directory path.
 * Caches the result for better performance.
 */
export function getDefaultDenoCacheDir(): string {
  if (!denoDirCache) {
    denoDirCache = new DenoDir().root;
  }
  return denoDirCache;
}

/**
 * Computes the Deno cache file path for a given URL.
 *
 * Deno caches remote modules in a specific directory structure:
 * - HTTP/HTTPS: `deps/{protocol}/{host}{port}/{hash}`
 * - File URLs: `gen/file/{absolute_path}/{hash}.{ext}`
 *
 * The hash is a SHA-256 hash of the URL string.
 *
 * @param url - The URL to compute the cache path for
 * @param mediaType - Optional media type for file URLs (e.g., "TypeScript", "JavaScript")
 * @returns The absolute path to the cached file in Deno's cache
 *
 * @example
 * ```typescript
 * const httpPath = getDenoCacheFilePath("https://deno.land/std/path/mod.ts");
 * // Returns: "/Users/.../deno/deps/https/deno.land/{hash}"
 *
 * const filePath = getDenoCacheFilePath("file:///src/app.ts");
 * // Returns: "/Users/.../deno/gen/file/src/app.ts/{hash}.js"
 * ```
 */
/**
 * Media types that compile to JavaScript.
 */
const JS_MEDIA_TYPES = new Set(["TypeScript", "TSX", "JSX"]);

export function getDenoCacheFilePath(url: string, mediaType?: string): string {
  const cacheDir = getDefaultDenoCacheDir();
  const urlObj = new URL(url);
  const hash = getUrlHash(url);

  if (urlObj.protocol === "file:") {
    const ext = mediaType && JS_MEDIA_TYPES.has(mediaType) ? ".js" : "";
    const filePath = fromFileUrl(urlObj);
    return join(cacheDir, "gen", "file", filePath, `${hash}${ext}`);
  }

  // Remote URL caching
  const protocol = urlObj.protocol.slice(0, -1); // Remove trailing ':'
  const hostPort = urlObj.port
    ? `${urlObj.hostname}_PORT${urlObj.port}`
    : urlObj.hostname;
  return join(cacheDir, "deps", protocol, hostPort, hash);
}

/**
 * Gets the metadata file path for a cached module in Deno's cache.
 *
 * Deno stores metadata about cached modules (headers, etc.) in a separate
 * file with the same name as the cached file plus ".metadata.json".
 *
 * @param url - The URL to get the metadata path for
 * @param mediaType - Optional media type for file URLs
 * @returns The absolute path to the metadata file
 *
 * @example
 * ```typescript
 * const metaPath = getDenoCacheMetadataPath("https://deno.land/std/path/mod.ts");
 * // Returns: "/Users/.../deno/deps/https/deno.land/{hash}.metadata.json"
 * ```
 */
export function getDenoCacheMetadataPath(
  url: string,
  mediaType?: string,
): string {
  return getDenoCacheFilePath(url, mediaType) + ".metadata.json";
}

/**
 * Internal functions exported only for testing purposes.
 * These should not be used in production code.
 */
export const _internal = {
  getCacheHashHex,
  getUrlHash,
};
