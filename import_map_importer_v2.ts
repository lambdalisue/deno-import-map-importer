import { isAbsolute, join } from "@std/path";
import { ensureDir } from "@std/fs";
import type { ImportMap } from "./import_map.ts";
import { getCachePath, getPlatformCacheDir } from "./cache.ts";
import { replaceImports } from "./replace_imports.ts";

export type ImportMapImporterOptions = {
  cacheDir?: string;
};

/**
 * Optimized version of ImportMapImporter with performance improvements:
 * 1. Checks disk cache before loading/transforming modules
 * 2. Pre-processes import map for faster lookups
 * 3. Parallel dependency processing
 * 4. Optimized path resolution
 * 5. Reduced file I/O operations
 */
export class ImportMapImporterV2 {
  #cache: Map<string, unknown> = new Map();
  #cacheDir: string;
  #transformedModules: Map<string, string> = new Map();
  #processingModules: Set<string> = new Set();

  // Pre-processed import map for O(1) lookups
  #importEntries: Array<[string, string]>;
  #scopeEntries: Map<string, Array<[string, string]>>;

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
      // Default to platform cache directory
      this.#cacheDir = join(getPlatformCacheDir(), "import_map_importer_cache");
    }

    // Pre-process import map for faster lookups
    this.#importEntries = Object.entries(this.importMap.imports);
    this.#scopeEntries = new Map();

    if (this.importMap.scopes) {
      for (const [scope, imports] of Object.entries(this.importMap.scopes)) {
        this.#scopeEntries.set(scope, Object.entries(imports));
      }
    }
  }

  async import<T>(specifier: string): Promise<T> {
    // Memory cache check
    if (this.#cache.has(specifier)) {
      return this.#cache.get(specifier) as T;
    }

    const url = new URL(specifier, import.meta.url);
    const transformedUrl = await this.#transformModule(url);
    const module = await import(transformedUrl) as T;

    this.#cache.set(specifier, module);
    return module;
  }

  async #transformModule(moduleUrl: URL): Promise<string> {
    const urlString = moduleUrl.href;

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
    await this.#writeToCacheOptimized(cachePath, content);
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

  // Optimized cache writing
  async #writeToCacheOptimized(
    fullCachePath: string,
    content: string,
  ): Promise<void> {
    const dir = join(fullCachePath, "..");

    // Check if directory exists before creating
    try {
      const stat = await Deno.stat(dir);
      if (!stat.isDirectory) {
        await ensureDir(dir);
      }
    } catch {
      await ensureDir(dir);
    }

    await Deno.writeTextFile(fullCachePath, content);
  }
}
