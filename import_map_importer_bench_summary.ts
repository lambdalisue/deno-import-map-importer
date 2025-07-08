/**
 * Performance Benchmark Summary for ImportMapImporter
 *
 * This benchmark compares ImportMapImporter performance against native dynamic import.
 */

import { ImportMapImporter } from "./import_map_importer.ts";
import type { ImportMap } from "./import_map.ts";

// Test modules
const simpleModuleUrl = new URL("./testdata/simple.ts", import.meta.url);
const noImportsModuleUrl = new URL("./testdata/no_imports.ts", import.meta.url);
const nestedModuleUrl = new URL("./testdata/nested_module.ts", import.meta.url);

// Import map
const importMap: ImportMap = {
  imports: {
    "@example/simple":
      new URL("./testdata/simple_dep.ts", import.meta.url).href,
    "@example/dep1": new URL("./testdata/dep1.ts", import.meta.url).href,
    "@example/dep2": new URL("./testdata/dep2.ts", import.meta.url).href,
    "@example/shared": new URL("./testdata/shared.ts", import.meta.url).href,
  },
};

const benchCacheDir = "./.bench_cache";

// Cleanup
async function cleanup() {
  try {
    await Deno.remove(benchCacheDir, { recursive: true });
  } catch {
    // Ignore
  }
}

// === KEY PERFORMANCE BENCHMARKS ===

console.log("🚀 ImportMapImporter Performance Benchmarks\n");

// 1. First Import Performance (Cold Cache)
Deno.bench({
  name: "First Import: ImportMapImporter (transforms & caches)",
  group: "first-import",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(simpleModuleUrl.href);
  },
});

Deno.bench({
  name: "First Import: Native import()",
  group: "first-import",
  baseline: true,
  async fn() {
    const url = `${simpleModuleUrl.href}?t=${Date.now()}`;
    await import(url);
  },
});

// 2. Subsequent Import Performance (Warm Cache)
Deno.bench({
  name: "Cached Import: ImportMapImporter (memory cache)",
  group: "cached-import",
  async fn(b) {
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(simpleModuleUrl.href); // Warm up

    b.start();
    await importer.import(simpleModuleUrl.href);
    b.end();
  },
});

Deno.bench({
  name: "Cached Import: Native import()",
  group: "cached-import",
  baseline: true,
  async fn(b) {
    await import(simpleModuleUrl.href); // Warm up

    b.start();
    await import(simpleModuleUrl.href);
    b.end();
  },
});

// 3. Complex Module Graph Performance
Deno.bench({
  name: "Complex Graph: ImportMapImporter (nested deps)",
  group: "complex-module",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(nestedModuleUrl.href);
  },
});

Deno.bench({
  name: "Complex Graph: Native import()",
  group: "complex-module",
  baseline: true,
  async fn() {
    // For native import, we need to import the actual resolved modules
    const modules = [
      new URL("./testdata/dep1.ts", import.meta.url).href,
      new URL("./testdata/dep2.ts", import.meta.url).href,
      new URL("./testdata/shared.ts", import.meta.url).href,
    ];

    for (const mod of modules) {
      await import(`${mod}?t=${Date.now()}`);
    }
  },
});

// 4. Overhead for modules with no imports
Deno.bench({
  name: "No Imports: ImportMapImporter overhead",
  group: "no-imports",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(noImportsModuleUrl.href);
  },
});

Deno.bench({
  name: "No Imports: Native import()",
  group: "no-imports",
  baseline: true,
  async fn() {
    const url = `${noImportsModuleUrl.href}?t=${Date.now()}`;
    await import(url);
  },
});

// Cleanup after benchmarks
globalThis.addEventListener("unload", () => {
  cleanup();
});
