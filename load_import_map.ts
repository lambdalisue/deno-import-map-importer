import { dirname, isAbsolute, join, toFileUrl } from "@std/path";
import { ensure } from "@core/unknownutil";
import type { ImportMap } from "./import_map.ts";
import { isImportMap } from "./import_map.ts";

/**
 * Loads an import map from a JSON file and resolves relative paths.
 *
 * This function reads an import map JSON file and resolves all relative paths
 * in the imports and scopes sections relative to the import map file's location.
 * This ensures that relative paths work correctly regardless of where the
 * import map is loaded from.
 *
 * @param path - Path to the import map JSON file (can be relative or absolute)
 * @returns A promise that resolves to the loaded and normalized ImportMap
 *
 * @example
 * ```typescript ignore
 * // Load from a relative path
 * const importMap = await loadImportMap("./config/import_map.json");
 *
 * // Load from an absolute path
 * const importMap2 = await loadImportMap("/path/to/import_map.json");
 * ```
 *
 * @example
 * If your import_map.json contains:
 * ```json
 * {
 *   "imports": {
 *     "@utils/": "./src/utils/",
 *     "lodash": "https://cdn.skypack.dev/lodash"
 *   }
 * }
 * ```
 *
 * And is located at `/project/config/import_map.json`, the resolved result will be:
 * ```json
 * {
 *   "imports": {
 *     "@utils/": "file:///project/config/src/utils/",
 *     "lodash": "https://cdn.skypack.dev/lodash"
 *   }
 * }
 * ```
 */
export async function loadImportMap(path: string): Promise<ImportMap> {
  // Resolve the path to absolute if it's relative
  const absolutePath = isAbsolute(path) ? path : join(Deno.cwd(), path);

  // Read and parse the import map file
  const content = await Deno.readTextFile(absolutePath);
  const rawImportMap = JSON.parse(content);

  // Validate the import map structure
  const importMap = ensure(rawImportMap, isImportMap);

  // Get the directory of the import map file for resolving relative paths
  const importMapDir = dirname(absolutePath);

  // Resolve relative paths in imports
  const resolvedImports: Record<string, string> = {};
  for (const [key, value] of Object.entries(importMap.imports)) {
    resolvedImports[key] = resolveImportPath(value, importMapDir);
  }

  // Resolve relative paths in scopes if they exist
  let resolvedScopes: Record<string, Record<string, string>> | undefined;
  if (importMap.scopes) {
    resolvedScopes = {};
    for (const [scopeKey, scopeImports] of Object.entries(importMap.scopes)) {
      // Resolve the scope key itself if it's relative
      const resolvedScopeKey = resolveImportPath(scopeKey, importMapDir);

      // Resolve the imports within this scope
      const resolvedScopeImports: Record<string, string> = {};
      for (const [importKey, importValue] of Object.entries(scopeImports)) {
        resolvedScopeImports[importKey] = resolveImportPath(
          importValue,
          importMapDir,
        );
      }

      resolvedScopes[resolvedScopeKey] = resolvedScopeImports;
    }
  }

  return {
    imports: resolvedImports,
    ...(resolvedScopes && { scopes: resolvedScopes }),
  };
}

/**
 * Resolves a path in an import map relative to a base directory.
 *
 * @param path - The path to resolve (can be relative, absolute, or a URL)
 * @param baseDir - The base directory to resolve relative paths against
 * @returns The resolved path as a URL string
 */
function resolveImportPath(path: string, baseDir: string): string {
  // If it's already a URL (http://, https://, file://), return as-is
  if (isUrl(path)) {
    return path;
  }

  // If it's a relative path (starts with ./ or ../)
  if (path.startsWith("./") || path.startsWith("../")) {
    const resolvedPath = join(baseDir, path);
    return toFileUrl(resolvedPath).href;
  }

  // If it's an absolute path
  if (isAbsolute(path)) {
    return toFileUrl(path).href;
  }

  // Otherwise, return as-is (could be a bare specifier or other pattern)
  return path;
}

/**
 * Checks if a string is a valid URL.
 */
function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}
