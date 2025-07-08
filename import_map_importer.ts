import { isAbsolute, join } from "@std/path";
import { ensureDir } from "@std/fs";
import type { ImportMap } from "./import_map.ts";
import { getCachePath, getPlatformCacheDir } from "./cache.ts";
import { replaceImports } from "./replace_imports.ts";

export type ImportMapImporterOptions = {
  cacheDir?: string;
};

export class ImportMapImporter {
  #cache: Map<string, unknown> = new Map();
  #cacheDir: string;
  #transformedModules: Map<string, string> = new Map();
  #processingModules: Set<string> = new Set();

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
  }

  async import<T>(specifier: string): Promise<T> {
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

    this.#processingModules.add(urlString);

    try {
      // Read the module content
      const originalCode = moduleUrl.protocol === "file:"
        ? await Deno.readTextFile(moduleUrl.pathname)
        : await fetch(moduleUrl).then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to fetch ${urlString}: ${res.statusText}`);
          }
          return res.text();
        });

      // Create replacer function using import map
      const applyImportMapToSpecifier = (specifier: string): string => {
        // Apply import map replacements
        for (const [key, value] of Object.entries(this.importMap.imports)) {
          if (specifier === key || specifier.startsWith(key + "/")) {
            const suffix = specifier.slice(key.length);
            return value + suffix;
          }
        }

        // Check scopes if available
        if (this.importMap.scopes) {
          for (
            const [scope, imports] of Object.entries(this.importMap.scopes)
          ) {
            if (urlString.startsWith(scope)) {
              for (const [key, value] of Object.entries(imports)) {
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

      // Calculate cache path
      const cachePath = getCachePath(
        urlString,
        transformedCode,
        this.importMap,
      );
      const fullCachePath = join(this.#cacheDir, cachePath);
      const cacheUrl = new URL(`file://${fullCachePath}`).href;

      // Register early for circular dependencies
      this.#transformedModules.set(urlString, cacheUrl);

      // Process dependencies recursively
      const transformedToCachedUrls = new Map<string, string>();
      for (const [, transformedSpecifier] of originalToTransformedSpecifiers) {
        if (
          transformedSpecifier.startsWith(".") ||
          transformedSpecifier.startsWith("/") ||
          transformedSpecifier.startsWith("file://")
        ) {
          const resolvedUrl = new URL(transformedSpecifier, moduleUrl);
          const cachedUrl = await this.#transformModule(resolvedUrl);
          transformedToCachedUrls.set(transformedSpecifier, cachedUrl);
        } else if (
          transformedSpecifier.startsWith("http://") ||
          transformedSpecifier.startsWith("https://")
        ) {
          const resolvedUrl = new URL(transformedSpecifier);
          const cachedUrl = await this.#transformModule(resolvedUrl);
          transformedToCachedUrls.set(transformedSpecifier, cachedUrl);
        }
      }

      // Second pass: replace dependency paths with cached paths
      const finalCode = transformedToCachedUrls.size > 0
        ? await replaceImports(
          urlString,
          transformedCode,
          (specifier) => transformedToCachedUrls.get(specifier) || specifier,
        )
        : transformedCode;

      // Write to cache
      await ensureDir(join(fullCachePath, ".."));
      await Deno.writeTextFile(fullCachePath, finalCode);

      return cacheUrl;
    } finally {
      this.#processingModules.delete(urlString);
    }
  }
}
