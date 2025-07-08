/**
 * Performance comparison between ImportMapImporter V1 and V2
 */

import { ImportMapImporter } from "./import_map_importer.ts";
import { ImportMapImporterV2 } from "./import_map_importer_v2.ts";
import type { ImportMap } from "./import_map.ts";

// Test modules
const simpleModuleUrl = new URL("./testdata/simple.ts", import.meta.url);
const nestedModuleUrl = new URL("./testdata/nested_module.ts", import.meta.url);
const noImportsModuleUrl = new URL("./testdata/no_imports.ts", import.meta.url);
const circularModuleUrl = new URL("./testdata/circular_a.ts", import.meta.url);

// Import map
const importMap: ImportMap = {
  imports: {
    "@example/simple":
      new URL("./testdata/simple_dep.ts", import.meta.url).href,
    "@example/dep1": new URL("./testdata/dep1.ts", import.meta.url).href,
    "@example/dep2": new URL("./testdata/dep2.ts", import.meta.url).href,
    "@example/shared": new URL("./testdata/shared.ts", import.meta.url).href,
    "@example/circular-a":
      new URL("./testdata/circular_a.ts", import.meta.url).href,
    "@example/circular-b":
      new URL("./testdata/circular_b.ts", import.meta.url).href,
  },
};

// Large import map for testing lookup performance
const largeImportMap: ImportMap = {
  imports: {
    ...importMap.imports,
    ...Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [
        `@fake/module${i}`,
        `https://example.com/fake${i}.js`,
      ]),
    ),
  },
  scopes: {
    [new URL("./testdata/", import.meta.url).href]: {
      "@scoped/test": new URL("./testdata/simple_dep.ts", import.meta.url).href,
    },
  },
};

const benchCacheDirV1 = new URL("./.bench_cache_v1", import.meta.url).pathname;
const benchCacheDirV2 = new URL("./.bench_cache_v2", import.meta.url).pathname;

// Cleanup
async function cleanup() {
  try {
    await Promise.all([
      Deno.remove(benchCacheDirV1, { recursive: true }),
      Deno.remove(benchCacheDirV2, { recursive: true }),
    ]);
  } catch {
    // Ignore
  }
}

console.log("🔥 ImportMapImporter V1 vs V2 Performance Comparison\n");

// === 1. COLD CACHE - Simple Module ===
Deno.bench({
  name: "V1: Simple module (cold cache)",
  group: "simple-cold",
  baseline: true,
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDirV1,
    });
    await importer.import(simpleModuleUrl.href);
  },
});

Deno.bench({
  name: "V2: Simple module (cold cache)",
  group: "simple-cold",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporterV2(importMap, {
      cacheDir: benchCacheDirV2,
    });
    await importer.import(simpleModuleUrl.href);
  },
});

// === 2. WARM CACHE - Memory Cache Performance ===
Deno.bench({
  name: "V1: Memory cache hit",
  group: "memory-cache",
  baseline: true,
  async fn(b) {
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDirV1,
    });
    await importer.import(simpleModuleUrl.href);

    b.start();
    for (let i = 0; i < 100; i++) {
      await importer.import(simpleModuleUrl.href);
    }
    b.end();
  },
});

Deno.bench({
  name: "V2: Memory cache hit",
  group: "memory-cache",
  async fn(b) {
    const importer = new ImportMapImporterV2(importMap, {
      cacheDir: benchCacheDirV2,
    });
    await importer.import(simpleModuleUrl.href);

    b.start();
    for (let i = 0; i < 100; i++) {
      await importer.import(simpleModuleUrl.href);
    }
    b.end();
  },
});

// === 3. NO IMPORTS MODULE - Testing Optimization ===
Deno.bench({
  name: "V1: Module with no imports",
  group: "no-imports",
  baseline: true,
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDirV1,
    });
    await importer.import(noImportsModuleUrl.href);
  },
});

Deno.bench({
  name: "V2: Module with no imports (optimized)",
  group: "no-imports",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporterV2(importMap, {
      cacheDir: benchCacheDirV2,
    });
    await importer.import(noImportsModuleUrl.href);
  },
});

// === 4. COMPLEX MODULE GRAPH ===
Deno.bench({
  name: "V1: Nested dependencies",
  group: "complex",
  baseline: true,
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDirV1,
    });
    await importer.import(nestedModuleUrl.href);
  },
});

Deno.bench({
  name: "V2: Nested dependencies (parallel processing)",
  group: "complex",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporterV2(importMap, {
      cacheDir: benchCacheDirV2,
    });
    await importer.import(nestedModuleUrl.href);
  },
});

// === 5. LARGE IMPORT MAP ===
Deno.bench({
  name: "V1: Large import map lookup",
  group: "large-map",
  baseline: true,
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(largeImportMap, {
      cacheDir: benchCacheDirV1,
    });
    await importer.import(simpleModuleUrl.href);
  },
});

Deno.bench({
  name: "V2: Large import map lookup (optimized)",
  group: "large-map",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporterV2(largeImportMap, {
      cacheDir: benchCacheDirV2,
    });
    await importer.import(simpleModuleUrl.href);
  },
});

// === 6. CIRCULAR DEPENDENCIES ===
Deno.bench({
  name: "V1: Circular dependencies",
  group: "circular",
  baseline: true,
  async fn() {
    await cleanup();
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDirV1,
    });
    await importer.import(circularModuleUrl.href);
  },
});

Deno.bench({
  name: "V2: Circular dependencies",
  group: "circular",
  async fn() {
    await cleanup();
    const importer = new ImportMapImporterV2(importMap, {
      cacheDir: benchCacheDirV2,
    });
    await importer.import(circularModuleUrl.href);
  },
});

// === 7. DISK CACHE HIT ===
Deno.bench({
  name: "V1: Disk cache hit",
  group: "disk-cache",
  baseline: true,
  async fn(b) {
    // Setup: populate disk cache
    const setupImporter = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDirV1,
    });
    await setupImporter.import(simpleModuleUrl.href);

    b.start();
    // New importer instance (simulates new process)
    const importer = new ImportMapImporter(importMap, {
      cacheDir: benchCacheDirV1,
    });
    await importer.import(simpleModuleUrl.href);
    b.end();
  },
});

Deno.bench({
  name: "V2: Disk cache hit",
  group: "disk-cache",
  async fn(b) {
    // Setup: populate disk cache
    const setupImporter = new ImportMapImporterV2(importMap, {
      cacheDir: benchCacheDirV2,
    });
    await setupImporter.import(simpleModuleUrl.href);

    b.start();
    // New importer instance (simulates new process)
    const importer = new ImportMapImporterV2(importMap, {
      cacheDir: benchCacheDirV2,
    });
    await importer.import(simpleModuleUrl.href);
    b.end();
  },
});

// Cleanup
globalThis.addEventListener("unload", () => {
  cleanup();
});

console.log("\n📊 Performance Improvements Expected:");
console.log("- No imports: V2 should be faster (skip transformation)");
console.log("- Large import map: V2 should be faster (pre-processed lookups)");
console.log("- Complex modules: V2 should be faster (parallel processing)");
console.log("- Memory cache: Should be similar performance");
console.log("- Disk cache: V2 might be slightly faster (optimized I/O)\n");
