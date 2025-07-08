/**
 * Clean Performance Benchmark for ImportMapImporter
 *
 * Compares ImportMapImporter against native import for equivalent functionality
 */

import { ImportMapImporter } from "./import_map_importer.ts";
import type { ImportMap } from "./import_map.ts";

// Test modules that work with both approaches
const noImportsModuleUrl = new URL("./testdata/no_imports.ts", import.meta.url);
const simpleDepUrl = new URL("./testdata/simple_dep.ts", import.meta.url);

// For ImportMapImporter tests
const simpleModuleUrl = new URL("./testdata/simple.ts", import.meta.url);
const nestedModuleUrl = new URL("./testdata/nested_module.ts", import.meta.url);

// Import map
const importMap: ImportMap = {
  imports: {
    "@example/simple": simpleDepUrl.href,
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

console.log("📊 ImportMapImporter Performance Analysis\n");
console.log("Comparing against native import() for equivalent operations.\n");

// === 1. MODULE WITH NO IMPORTS (Pure Overhead Test) ===
Deno.bench({
  name: "No Imports Module - ImportMapImporter (cold)",
  group: "no-imports-cold",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(noImportsModuleUrl.href);
  },
});

Deno.bench({
  name: "No Imports Module - Native import()",
  group: "no-imports-cold",
  baseline: true,
  async fn() {
    const url = `${noImportsModuleUrl.href}?t=${Date.now()}`;
    await import(url);
  },
});

// === 2. CACHED MODULE PERFORMANCE ===
Deno.bench({
  name: "Cached Module - ImportMapImporter",
  group: "cached",
  async fn(b) {
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(noImportsModuleUrl.href); // Warm up

    b.start();
    for (let i = 0; i < 10; i++) {
      await importer.import(noImportsModuleUrl.href);
    }
    b.end();
  },
});

Deno.bench({
  name: "Cached Module - Native import()",
  group: "cached",
  baseline: true,
  async fn(b) {
    await import(noImportsModuleUrl.href); // Warm up

    b.start();
    for (let i = 0; i < 10; i++) {
      await import(noImportsModuleUrl.href);
    }
    b.end();
  },
});

// === 3. TRANSFORM AND CACHE OVERHEAD ===
Deno.bench({
  name: "Transform & Cache - Simple module with imports",
  group: "transform",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(simpleModuleUrl.href);
  },
});

Deno.bench({
  name: "Transform & Cache - Complex module graph",
  group: "transform",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(nestedModuleUrl.href);
  },
});

// === 4. DISK CACHE PERFORMANCE (second process simulation) ===
Deno.bench({
  name: "Disk Cache Hit - ImportMapImporter",
  group: "disk-cache",
  async fn(b) {
    // First, populate the disk cache
    const setupImporter = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await setupImporter.import(simpleModuleUrl.href);

    b.start();
    // Simulate new process by creating new importer
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(simpleModuleUrl.href);
    b.end();
  },
});

// === 5. MEMORY USAGE TEST ===
Deno.bench({
  name: "Memory Test - Import 5 modules",
  group: "memory",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDir,
    });

    // Import various modules
    await importer.import(noImportsModuleUrl.href);
    await importer.import(simpleModuleUrl.href);
    await importer.import(nestedModuleUrl.href);
    await importer.import(simpleModuleUrl.href); // Test cache hit
    await importer.import(noImportsModuleUrl.href); // Test cache hit
  },
});

// Cleanup
globalThis.addEventListener("unload", () => {
  cleanup();
});

console.log("\n💡 Key Metrics:");
console.log("- 'no-imports-cold': Pure overhead of ImportMapImporter");
console.log("- 'cached': Memory cache performance");
console.log("- 'transform': Cost of transforming and caching modules");
console.log("- 'disk-cache': Performance when cache already exists on disk");
console.log(
  "- 'memory': Overall memory impact of importing multiple modules\n",
);
