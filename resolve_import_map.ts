import { dirname, isAbsolute, join, toFileUrl } from "@std/path";
import type { ImportMap } from "./import_map.ts";

/**
 * Options for {@linkcode resolveImportMap}.
 */
export interface ResolveImportMapOptions {
  /**
   * Path to the import map JSON file.
   *
   * This can be a relative or absolute path. If relative, it will be resolved against
   * the current working directory. If not provided, it will be treated as an unknown
   * file in the current working directory.
   *
   * @default "/path/to/cwd/<unknown>"
   */
  path?: string;
}

/**
 * Resolves relative paths in the import map JSON object.
 *
 * This function resolves all relative paths in the imports and scopes sections
 * of an import map object relative to a specified base path. This ensures that
 * relative paths work correctly regardless of where the
 * import map is loaded from.
 *
 * @param importMap - The import map object to resolve
 * @param options - Options for resolving the import map
 * @returns A new import map object with all paths resolved
 *
 * @example
 * If the current working directory is `/project` and calling this function with
 * the following import map object and `path` option:
 * ```typescript ignore
 * const rawImportMap: ImportMap = {
 *   imports: {
 *     "@utils/": "./src/utils/",
 *     "lodash": "https://cdn.skypack.dev/lodash",
 *   },
 * };
 *
 * // Resolve relative paths in the import map object
 * const importMap = resolveImportMap(rawImportMap, {
 *   path: "./config/import_map.json",
 * });
 * ```
 *
 * The resolved result will be:
 * ```json
 * {
 *   "imports": {
 *     "@utils/": "file:///project/config/src/utils/",
 *     "lodash": "https://cdn.skypack.dev/lodash"
 *   }
 * }
 * ```
 */
export function resolveImportMap(
  importMap: ImportMap,
  options: ResolveImportMapOptions = {},
): ImportMap {
  const { path = "<unknown>" } = options;

  // Resolve the path to absolute if it's relative
  const absolutePath = isAbsolute(path) ? path : join(Deno.cwd(), path);

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
