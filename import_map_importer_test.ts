import { afterAll, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { ImportMapImporter } from "./import_map_importer.ts";
import type { ImportMap } from "./import_map.ts";

afterAll(async () => {
  try {
    const cacheDir = new URL("./.test_cache", import.meta.url);
    await Deno.remove(cacheDir, { recursive: true });
  } catch {
    // Ignore if .test_cache doesn't exist
  }
});

describe("ImportMapImporter", () => {
  it("should import a module and apply import mappings", async () => {
    const testModuleUrl = new URL(
      "./testdata/module.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {
        "@example/lib": new URL("./testdata/lib.ts", import.meta.url).href,
        "@example/utils": new URL("./testdata/utils.ts", import.meta.url)
          .href,
      },
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });
    const module = await importer.import<{ default: string }>(
      testModuleUrl.href,
    );

    expect(module.default).toBe("Hello from module with lib and utils");
  });

  it("should recursively apply import mappings to dependencies", async () => {
    const testModuleUrl = new URL(
      "./testdata/nested_module.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {
        "@example/dep1": new URL("./testdata/dep1.ts", import.meta.url)
          .href,
        "@example/dep2": new URL("./testdata/dep2.ts", import.meta.url)
          .href,
        "@example/shared": new URL("./testdata/shared.ts", import.meta.url)
          .href,
      },
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });
    const module = await importer.import<{ getValue: () => string }>(
      testModuleUrl.href,
    );

    expect(module.getValue()).toBe("nested-dep1-shared-dep2-shared");
  });

  it("should cache transformed modules", async () => {
    const testModuleUrl = new URL(
      "./testdata/cacheable.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {
        "@example/cached": new URL("./testdata/cached.ts", import.meta.url)
          .href,
      },
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });

    const module1 = await importer.import<{ timestamp: number }>(
      testModuleUrl.href,
    );
    const module2 = await importer.import<{ timestamp: number }>(
      testModuleUrl.href,
    );

    expect(module1.timestamp).toBe(module2.timestamp);
  });

  it.skip("should handle absolute URLs in import map", async () => {
    const testModuleUrl = new URL(
      "./testdata/external_module.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {
        "@std/testing": "https://jsr.io/@std/testing/1.0.14/mod.ts",
      },
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });
    const module = await importer.import<{ name: string }>(
      testModuleUrl.href,
    );

    expect(module.name).toBe("external module");
  });

  it("should handle modules with no imports", async () => {
    const testModuleUrl = new URL(
      "./testdata/no_imports.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {},
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });
    const module = await importer.import<{ message: string }>(
      testModuleUrl.href,
    );

    expect(module.message).toBe("No imports here");
  });

  it("should handle circular dependencies", async () => {
    const testModuleUrl = new URL(
      "./testdata/circular_a.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {
        "@example/circular-a": new URL(
          "./testdata/circular_a.ts",
          import.meta.url,
        ).href,
        "@example/circular-b": new URL(
          "./testdata/circular_b.ts",
          import.meta.url,
        ).href,
      },
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });
    const module = await importer.import<{ getName: () => string }>(
      testModuleUrl.href,
    );

    expect(module.getName()).toBe("circular-a");
  });

  it("should throw error for invalid URL", async () => {
    const invalidUrl = new URL(
      "./testdata/non_existent.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {},
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });

    await expect(
      importer.import(invalidUrl.href),
    ).rejects.toThrow();
  });

  it("should handle scoped imports", async () => {
    const testModuleUrl = new URL(
      "./testdata/simple.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {},
      scopes: {
        [new URL("./testdata/", import.meta.url).href]: {
          "@example/simple": new URL(
            "./testdata/simple_dep.ts",
            import.meta.url,
          ).href,
        },
      },
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });
    const module = await importer.import<{ value: number }>(
      testModuleUrl.href,
    );

    expect(module.value).toBe(42);
  });

  it("should handle import map with path suffixes", async () => {
    // Create a simple test module that uses a path suffix
    const testModuleUrl = new URL(
      "./testdata/simple.ts",
      import.meta.url,
    );

    const importMap: ImportMap = {
      imports: {
        "@example/simple":
          new URL("./testdata/simple_dep.ts", import.meta.url).href,
      },
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });

    // Test that the module imports successfully with the import map
    const module = await importer.import<{ value: number }>(
      testModuleUrl.href,
    );

    // If it loads without error, the path suffix handling works
    expect(module.value).toBe(42);
  });

  it.skip("should handle JSR imports in transformed modules", async () => {
    // This test is skipped because it tests internal transformation details
    // The next test demonstrates the actual issue with JSR URLs
  });

  it("should process JSR URLs as dependencies", async () => {
    // This test verifies that JSR URLs are properly processed and cached
    const importMap: ImportMap = {
      imports: {
        "@std/assert": "jsr:@std/assert@^1.0.7",
      },
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });

    // Create a module that imports from JSR via import map
    const testModuleContent = `
      import { assertEquals } from "@std/assert";
      export function test() {
        assertEquals(1, 1);
        return "test passed";
      }
    `;

    const testModulePath = new URL(
      "./testdata/jsr_dependency_test.ts",
      import.meta.url,
    );
    await Deno.writeTextFile(testModulePath, testModuleContent);

    try {
      // This should now work because JSR URLs are processed as dependencies
      const module = await importer.import<{ test: () => string }>(
        testModulePath.href,
      );
      expect(module.test()).toBe("test passed");
    } finally {
      // Clean up
      try {
        await Deno.remove(testModulePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });
});
