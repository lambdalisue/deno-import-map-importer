import { crypto } from "@std/crypto/crypto";
import { join } from "@std/path/join";
import { homedir } from "node:os";
import type { ImportMap } from "./import_map.ts";

const textEncoder = new TextEncoder();

/**
 * Returns the platform-specific cache directory path.
 *
 * This function detects the current operating system and returns the appropriate
 * system cache directory where applications typically store cached data.
 * It respects environment variables like XDG_CACHE_HOME on Linux and LOCALAPPDATA on Windows.
 *
 * @returns The absolute path to the platform's cache directory
 *
 * @example
 * ```typescript
 * const cacheDir = getPlatformCacheDir();
 * // macOS: /Users/username/Library/Caches
 * // Windows: C:\Users\username\AppData\Local
 * // Linux: /home/username/.cache
 * ```
 */
export function getPlatformCacheDir(): string {
  switch (Deno.build.os) {
    case "darwin":
      return join(homedir(), "Library", "Caches");
    case "windows":
      return Deno.env.get("LOCALAPPDATA") ||
        join(homedir(), "AppData", "Local");
    default:
      return Deno.env.get("XDG_CACHE_HOME") || join(homedir(), ".cache");
  }
}

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
 *
 * @example
 * ```typescript
 * const hash = getCacheHashHex(
 *   "file:///src/app.ts",
 *   "import { foo } from 'bar';",
 *   { imports: { "bar": "./bar.js" } }
 * );
 * // Returns: "a3f5b8c2d1e4f6..."
 * ```
 */
export function getCacheHashHex(
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
