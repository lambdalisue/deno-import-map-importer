import { crypto } from "@std/crypto/crypto";
import { join } from "@std/path/join";
import { DenoDir } from "@deno/cache-dir";
import type { ImportMap } from "./import_map.ts";

const textEncoder = new TextEncoder();

/**
 * Generates a SHA-256 hash in hexadecimal format for cache identification.
 *
 * Creates a deterministic hash based on the module specifier, source code content,
 * and import map configuration. This ensures that any changes to the module,
 * its content, or the import map will result in a different cache entry.
 *
 * @param specifier - The module specifier (URL or path)
 * @param sourceCode - The source code content of the module
 * @param importMap - The import map configuration used for transformations
 * @returns A 64-character hexadecimal string representing the SHA-256 hash
 */
function getCacheHashHex(
  specifier: string,
  sourceCode: string,
  importMap: ImportMap,
): string {
  const hash = crypto.subtle.digestSync(
    "SHA-256",
    textEncoder.encode(JSON.stringify({
      specifier,
      code: sourceCode,
      importMap,
    })),
  );
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates a SHA-256 hash of a URL string.
 *
 * This matches Deno's internal hashing mechanism for cache file names.
 *
 * @param url - The URL to hash
 * @returns A 64-character hexadecimal string representing the SHA-256 hash
 */
function getUrlHash(url: string): string {
  const hash = crypto.subtle.digestSync(
    "SHA-256",
    textEncoder.encode(url),
  );
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  const pathParts = new URL(specifier).pathname.split("/").filter(Boolean);
  const filename = pathParts.pop() || "index.ts";

  return join(
    hashHex.slice(0, 2),
    hashHex.slice(2, 4),
    `${hashHex}-${filename}`,
  );
}

/**
 * Gets the default Deno cache directory path.
 *
 * Returns the root directory where Deno stores its cached files.
 * This is typically determined by the DENO_DIR environment variable,
 * or falls back to system-specific default locations.
 *
 * @returns The absolute path to Deno's cache directory
 *
 * @example
 * ```typescript
 * const cacheDir = getDefaultDenoCacheDir();
 * // Returns: "/Users/username/Library/Caches/deno" (on macOS)
 * // Returns: "/home/username/.cache/deno" (on Linux)
 * // Returns: "C:\\Users\\username\\AppData\\Local\\deno" (on Windows)
 * ```
 */
export function getDefaultDenoCacheDir(): string {
  const denoDir = new DenoDir();
  return denoDir.root;
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
export function getDenoCacheFilePath(url: string, mediaType?: string): string {
  const cacheDir = getDefaultDenoCacheDir();
  const urlObj = new URL(url);

  if (urlObj.protocol === "file:") {
    const ext = mediaType === "TypeScript"
      ? ".js"
      : mediaType === "TSX"
      ? ".js"
      : mediaType === "JSX"
      ? ".js"
      : "";
    const hash = getUrlHash(url);
    return join(cacheDir, "gen", "file", urlObj.pathname, `${hash}${ext}`);
  } else {
    const protocol = urlObj.protocol.slice(0, -1); // Remove trailing ':'
    const host = urlObj.hostname;
    const port = urlObj.port ? `_PORT${urlObj.port}` : "";
    const hash = getUrlHash(url);

    return join(cacheDir, "deps", protocol, `${host}${port}`, hash);
  }
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
