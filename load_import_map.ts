import { ensure } from "@core/unknownutil";
import type { ImportMap } from "./import_map.ts";
import { isImportMap } from "./import_map.ts";
import { resolveImportMap } from "./resolve_import_map.ts";

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
  // Read and parse the import map file
  const content = await Deno.readTextFile(path);
  const rawImportMap = JSON.parse(content);

  // Validate the import map structure
  const importMap = ensure(rawImportMap, isImportMap);

  return resolveImportMap(importMap, { path });
}
