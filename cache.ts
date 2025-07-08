import { crypto } from "@std/crypto/crypto";
import { join } from "@std/path/join";
import { homedir } from "node:os";
import type { ImportMap } from "./import_map.ts";

const textEncoder = new TextEncoder();

/**
 * Returns the path to the cache directory for the current platform.
 * This function checks the operating system and returns the appropriate cache directory path.
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
 * Generates a hash in hexadecimal format for a given specifier and content.
 * This function uses the SHA-256 algorithm to create a unique hash
 * based on the specifier and content.
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
 * Generates a cache path for a given specifier and content.
 * The cache path is based on a hash of the specifier and content,
 * and is structured to allow for efficient storage and retrieval.
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
