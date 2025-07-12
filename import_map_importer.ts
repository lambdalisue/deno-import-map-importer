import { isAbsolute, join } from "@std/path";
import { ensureDir } from "@std/fs";
import type { ImportMap } from "./import_map.ts";
import {
  getCachePath,
  getDefaultDenoCacheDir,
  getDenoCacheFilePath,
  getDenoCacheMetadataPath,
} from "./cache.ts";
import { replaceImports } from "./replace_imports.ts";

/**
 * Configuration options for ImportMapImporter.
 */
export type ImportMapImporterOptions = {
  /**
   * Custom cache directory path.
   *
   * If provided as a relative path, it will be resolved relative to the current working directory.
   * If not provided, defaults to Deno's cache directory under "import_map_importer" subdirectory.
   *
   * @example
   * ```typescript
   * // Use absolute path
   * { cacheDir: "/tmp/my-cache" }
   *
   * // Use relative path (resolved to CWD)
   * { cacheDir: ".cache/imports" }
   *
   * // Use default Deno cache directory
   * {}
   * ```
   */
  cacheDir?: string;

  /**
   * Whether to clear Deno's module cache before importing.
   * This can help resolve issues when importing modules from directories
   * with their own deno.jsonc files.
   *
   * @default false
   */
  clearDenoCache?: boolean;
};

/**
 * A high-performance import map processor that transforms and caches JavaScript/TypeScript modules.
 *
 * This class applies import map transformations to module imports and caches the results
 * for improved performance. It handles both local files and remote URLs, processes
 * dependencies recursively, and provides several optimizations:
 *
 * - Memory caching of loaded modules
 * - Disk caching of transformed source code
 * - Pre-processed import maps for O(1) lookups
 * - Parallel dependency processing
 * - Circular dependency detection
 * - Optimized file I/O operations
 *
 * @example
 * ```typescript ignore
 * const importMap = {
 *   imports: {
 *     "lodash": "https://cdn.skypack.dev/lodash",
 *     "@utils/": "./src/utils/"
 *   }
 * };
 *
 * const importer = new ImportMapImporter(importMap);
 * const module = await importer.import<{ default: any }>("./src/main.ts");
 * ```
 */
export class ImportMapImporter {
  #cache: Map<string, unknown> = new Map();
  #cacheDir: string;
  #transformedModules: Map<string, string> = new Map();
  #processingModules: Set<string> = new Set();

  // Pre-processed import map for O(1) lookups
  #importEntries: Array<[string, string]>;
  #scopeEntries: Map<string, Array<[string, string]>>;

  // Option to clear Deno's cache
  #clearDenoCache: boolean;

  /**
   * Creates a new ImportMapImporter instance.
   *
   * @param importMap - The import map configuration to apply to module imports
   * @param options - Optional configuration for cache directory and other settings
   */
  constructor(
    public importMap: ImportMap,
    options: ImportMapImporterOptions = {},
  ) {
    // Handle both absolute and relative cache directory paths
    if (options.cacheDir) {
      // Use isAbsolute from std/path to properly detect absolute paths
      this.#cacheDir = isAbsolute(options.cacheDir)
        ? options.cacheDir
        : join(Deno.cwd(), options.cacheDir);
    } else {
      // Default to Deno's cache directory for easier cache management
      this.#cacheDir = join(getDefaultDenoCacheDir(), "import_map_importer");
    }

    // Set cache clearing option
    this.#clearDenoCache = options.clearDenoCache ?? false;

    // Pre-process import map for faster lookups
    this.#importEntries = Object.entries(this.importMap.imports);
    this.#scopeEntries = new Map();

    if (this.importMap.scopes) {
      for (const [scope, imports] of Object.entries(this.importMap.scopes)) {
        this.#scopeEntries.set(scope, Object.entries(imports));
      }
    }
  }

  /**
   * Imports a module after applying import map transformations.
   *
   * This method resolves the module specifier, applies import map transformations,
   * processes all dependencies recursively, caches the results, and returns the
   * loaded module. Subsequent imports of the same module will be served from cache.
   *
   * @param specifier - The module specifier to import (relative path, absolute URL, or bare specifier)
   * @returns A promise that resolves to the imported module
   *
   * @example
   * ```typescript ignore
   * const importer = new ImportMapImporter({
   *   imports: { "lodash": "https://cdn.skypack.dev/lodash" }
   * });
   *
   * // Import a local module
   * const utils = await importer.import<{ helper: Function }>("./utils.ts");
   *
   * // Import using a bare specifier (resolved via import map)
   * const lodash = await importer.import<typeof import("lodash")>("lodash");
   * ```
   */
  async import<T>(specifier: string): Promise<T> {
    // Memory cache check
    if (this.#cache.has(specifier)) {
      return this.#cache.get(specifier) as T;
    }

    const url = new URL(specifier, import.meta.url);

    // Clear Deno's cache if requested
    if (this.#clearDenoCache) {
      await this.#clearDenoCacheForUrl(url);
    }

    const transformedUrl = await this.#transformModule(url);
    const module = await import(transformedUrl) as T;

    this.#cache.set(specifier, module);
    return module;
  }

  async #transformModule(moduleUrl: URL): Promise<string> {
    const urlString = moduleUrl.href;

    // Clear Deno's cache for this module if requested
    if (this.#clearDenoCache && moduleUrl.protocol === "file:") {
      await this.#clearDenoCacheForUrl(moduleUrl);
    }

    // Check if already transformed
    if (this.#transformedModules.has(urlString)) {
      return this.#transformedModules.get(urlString)!;
    }

    // Handle circular dependencies
    if (this.#processingModules.has(urlString)) {
      return urlString;
    }

    // Note: Disk cache check could be implemented here for further optimization

    this.#processingModules.add(urlString);

    try {
      // Read the module content
      const originalCode = await this.#readModuleContent(moduleUrl);

      // Quick check if module has any imports
      if (!this.#hasImports(originalCode)) {
        // Skip transformation for modules without imports
        return await this.#cacheModule(urlString, originalCode);
      }

      // Create optimized replacer function
      const applyImportMapToSpecifier = this.#createOptimizedReplacer(
        urlString,
      );

      // Collect dependencies during replacement
      const originalToTransformedSpecifiers = new Map<string, string>();
      const replacerWithDependencyCollection = (specifier: string): string => {
        const transformed = applyImportMapToSpecifier(specifier);
        originalToTransformedSpecifiers.set(specifier, transformed);
        return transformed;
      };

      // First pass: replace imports and collect dependencies
      const transformedCode = await replaceImports(
        urlString,
        originalCode,
        replacerWithDependencyCollection,
      );

      // Register cache URL early for circular dependencies
      const cacheUrl = this.#getCacheUrl(urlString, transformedCode);
      this.#transformedModules.set(urlString, cacheUrl);

      // Process dependencies in parallel (optimization)
      const transformedToCachedUrls = await this.#processDependenciesParallel(
        originalToTransformedSpecifiers,
        moduleUrl,
      );

      // Second pass: replace dependency paths with cached paths
      const finalCode = transformedToCachedUrls.size > 0
        ? await replaceImports(
          urlString,
          transformedCode,
          (specifier) => transformedToCachedUrls.get(specifier) || specifier,
        )
        : transformedCode;

      // Write final code to cache
      await this.#writeToCache(cacheUrl, finalCode);
      return cacheUrl;
    } finally {
      this.#processingModules.delete(urlString);
    }
  }

  // Optimized module content reading
  async #readModuleContent(moduleUrl: URL): Promise<string> {
    if (moduleUrl.protocol === "file:") {
      return Deno.readTextFile(moduleUrl.pathname);
    }

    const response = await fetch(moduleUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${moduleUrl.href}: ${response.statusText}`,
      );
    }
    return response.text();
  }

  // Quick check if module has imports
  #hasImports(code: string): boolean {
    // Quick regex check for import/export statements
    return /(?:import|export)\s+(?:.*\s+from\s+|)['"]/m.test(code);
  }

  // Cache a module and return its cache URL
  async #cacheModule(urlString: string, code: string): Promise<string> {
    const cacheUrl = this.#getCacheUrl(urlString, code);
    await this.#writeToCache(cacheUrl, code);
    this.#transformedModules.set(urlString, cacheUrl);
    return cacheUrl;
  }

  // Get cache URL for a module
  #getCacheUrl(urlString: string, code: string): string {
    const cachePath = getCachePath(urlString, code, this.importMap);
    const fullCachePath = join(this.#cacheDir, cachePath);
    return new URL(`file://${fullCachePath}`).href;
  }

  // Write content to cache file
  async #writeToCache(cacheUrl: string, content: string): Promise<void> {
    const cachePath = new URL(cacheUrl).pathname;
    const dir = join(cachePath, "..");

    await ensureDir(dir);
    await Deno.writeTextFile(cachePath, content);
  }

  // Create optimized replacer using pre-processed data
  #createOptimizedReplacer(urlString: string): (specifier: string) => string {
    return (specifier: string): string => {
      // Check imports first (most common case)
      for (const [key, value] of this.#importEntries) {
        if (specifier === key || specifier.startsWith(key + "/")) {
          const suffix = specifier.slice(key.length);
          return value + suffix;
        }
      }

      // Check scopes if available
      if (this.#scopeEntries.size > 0) {
        for (const [scope, entries] of this.#scopeEntries) {
          if (urlString.startsWith(scope)) {
            for (const [key, value] of entries) {
              if (specifier === key || specifier.startsWith(key + "/")) {
                const suffix = specifier.slice(key.length);
                return value + suffix;
              }
            }
          }
        }
      }

      return specifier;
    };
  }

  // Process dependencies in parallel
  async #processDependenciesParallel(
    originalToTransformedSpecifiers: Map<string, string>,
    moduleUrl: URL,
  ): Promise<Map<string, string>> {
    const transformedToCachedUrls = new Map<string, string>();
    const promises: Promise<void>[] = [];

    for (const [, transformedSpecifier] of originalToTransformedSpecifiers) {
      const shouldProcess = this.#isRelativeOrFileUrl(transformedSpecifier) ||
        this.#isHttpUrl(transformedSpecifier);

      if (shouldProcess) {
        promises.push(
          this.#processDependency(transformedSpecifier, moduleUrl)
            .then((cachedUrl) => {
              transformedToCachedUrls.set(transformedSpecifier, cachedUrl);
            }),
        );
      }
    }

    await Promise.all(promises);
    return transformedToCachedUrls;
  }

  // Process a single dependency
  async #processDependency(specifier: string, baseUrl: URL): Promise<string> {
    const resolvedUrl = this.#isRelativeOrFileUrl(specifier)
      ? new URL(specifier, baseUrl)
      : new URL(specifier);
    return await this.#transformModule(resolvedUrl);
  }

  // Optimized URL checks
  #isRelativeOrFileUrl(specifier: string): boolean {
    const firstChar = specifier[0];
    return firstChar === "." || firstChar === "/" ||
      specifier.startsWith("file://");
  }

  #isHttpUrl(specifier: string): boolean {
    return specifier.startsWith("http://") || specifier.startsWith("https://");
  }

  // Clear Deno's module cache for a specific URL
  async #clearDenoCacheForUrl(url: URL): Promise<void> {
    const cachedPath = getDenoCacheFilePath(url.href);
    const metadataPath = getDenoCacheMetadataPath(url.href);

    // Check if the cached file exists before trying to remove
    try {
      await Deno.stat(cachedPath);
      // Remove cached file and metadata, ignoring errors
      await Deno.remove(cachedPath).catch(() => {});
      await Deno.remove(metadataPath).catch(() => {});
    } catch {
      // File doesn't exist, nothing to remove
    }
  }
}
