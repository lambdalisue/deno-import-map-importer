import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertMatch } from "@std/assert";
import { 
  _internal,
  getCachePath,
  getDefaultDenoCacheDir,
} from "./cache.ts";
import type { ImportMap } from "./import_map.ts";

describe("cache", () => {
  const testImportMap: ImportMap = {
    imports: {
      "foo": "https://example.com/foo.js",
      "bar/": "https://example.com/bar/",
    },
  };

  describe("getCacheHashHex", () => {
    const { getCacheHashHex } = _internal;
    it("should generate consistent hash for same input", () => {
      const specifier = "https://example.com/module.ts";
      const sourceCode = "console.log('hello');";

      const hash1 = getCacheHashHex(specifier, sourceCode, testImportMap);
      const hash2 = getCacheHashHex(specifier, sourceCode, testImportMap);

      assertEquals(hash1, hash2);
    });

    it("should generate different hashes for different specifiers", () => {
      const sourceCode = "console.log('hello');";

      const hash1 = getCacheHashHex(
        "https://example.com/module1.ts",
        sourceCode,
        testImportMap,
      );
      const hash2 = getCacheHashHex(
        "https://example.com/module2.ts",
        sourceCode,
        testImportMap,
      );

      assertMatch(hash1, /^[a-f0-9]{64}$/);
      assertMatch(hash2, /^[a-f0-9]{64}$/);
      assertEquals(hash1.length, 64);
      assertEquals(hash2.length, 64);
      // Hashes should be different
      assertEquals(hash1 === hash2, false);
    });

    it("should generate different hashes for different content", () => {
      const specifier = "https://example.com/module.ts";

      const hash1 = getCacheHashHex(
        specifier,
        "console.log('hello');",
        testImportMap,
      );
      const hash2 = getCacheHashHex(
        specifier,
        "console.log('world');",
        testImportMap,
      );

      // Hashes should be different
      assertEquals(hash1 === hash2, false);
    });

    it("should generate 64-character hexadecimal hash", () => {
      const specifier = "https://example.com/module.ts";
      const sourceCode = "console.log('hello');";

      const hash = getCacheHashHex(specifier, sourceCode, testImportMap);

      // SHA-256 produces 64 hex characters
      assertEquals(hash.length, 64);
      assertMatch(hash, /^[a-f0-9]{64}$/);
    });

    it("should generate different hashes for different import maps", () => {
      const specifier = "https://example.com/module.ts";
      const sourceCode = "console.log('hello');";
      const importMap2: ImportMap = {
        imports: {
          "baz": "https://example.com/baz.js",
        },
      };

      const hash1 = getCacheHashHex(specifier, sourceCode, testImportMap);
      const hash2 = getCacheHashHex(specifier, sourceCode, importMap2);

      // Hashes should be different for different import maps
      assertEquals(hash1 === hash2, false);
    });
  });

  describe("getCachePath", () => {
    const { getCacheHashHex } = _internal;
    it("should generate cache path with correct structure", () => {
      const specifier = "https://example.com/module.ts";
      const sourceCode = "console.log('hello');";

      const cachePath = getCachePath(specifier, sourceCode, testImportMap);
      const hash = getCacheHashHex(specifier, sourceCode, testImportMap);

      // Path should contain hash subdirectories and filename
      assertMatch(
        cachePath,
        new RegExp(
          `${hash.slice(0, 2)}[/\\\\]${
            hash.slice(2, 4)
          }[/\\\\]${hash}-module\\.ts$`,
        ),
      );
    });

    it("should generate cache path with proper directory structure", () => {
      const specifier = "https://example.com/module.ts";
      const sourceCode = "console.log('hello');";

      const cachePath = getCachePath(specifier, sourceCode, testImportMap);

      // Should have the format: xx/yy/hash-filename
      assertMatch(
        cachePath,
        /^[a-f0-9]{2}[\/\\][a-f0-9]{2}[\/\\][a-f0-9]+-module\.ts$/,
      );
    });

    it("should handle URLs without filename", () => {
      const specifier = "https://example.com/";
      const sourceCode = "console.log('hello');";

      const cachePath = getCachePath(specifier, sourceCode, testImportMap);
      const hash = getCacheHashHex(specifier, sourceCode, testImportMap);

      // Should use "index.ts" as default filename
      assertMatch(cachePath, new RegExp(`${hash}-index\\.ts$`));
    });

    it("should handle complex URLs with multiple path segments", () => {
      const specifier = "https://example.com/path/to/deep/module.ts";
      const sourceCode = "console.log('hello');";

      const cachePath = getCachePath(specifier, sourceCode, testImportMap);
      const hash = getCacheHashHex(specifier, sourceCode, testImportMap);

      // Should extract just the filename
      assertMatch(cachePath, new RegExp(`${hash}-module\\.ts$`));
    });

    it("should handle URLs with query parameters", () => {
      const specifier = "https://example.com/module.ts?version=1.0.0";
      const sourceCode = "console.log('hello');";

      const cachePath = getCachePath(specifier, sourceCode, testImportMap);
      const hash = getCacheHashHex(specifier, sourceCode, testImportMap);

      // Should still extract the filename correctly
      assertMatch(cachePath, new RegExp(`${hash}-module\\.ts$`));
    });

    it("should handle file URLs", () => {
      const specifier = "file:///home/user/project/module.ts";
      const sourceCode = "console.log('hello');";

      const cachePath = getCachePath(specifier, sourceCode, testImportMap);
      const hash = getCacheHashHex(specifier, sourceCode, testImportMap);

      // Should extract filename from file URL
      assertMatch(cachePath, new RegExp(`${hash}-module\\.ts$`));
    });

    it("should create consistent paths for same input", () => {
      const specifier = "https://example.com/module.ts";
      const sourceCode = "console.log('hello');";

      const path1 = getCachePath(specifier, sourceCode, testImportMap);
      const path2 = getCachePath(specifier, sourceCode, testImportMap);

      assertEquals(path1, path2);
    });

    it("should create different paths for different inputs", () => {
      const sourceCode = "console.log('hello');";

      const path1 = getCachePath(
        "https://example.com/module1.ts",
        sourceCode,
        testImportMap,
      );
      const path2 = getCachePath(
        "https://example.com/module2.ts",
        sourceCode,
        testImportMap,
      );

      // Paths should be different
      assertEquals(path1 === path2, false);
    });

    it("should create different paths for different import maps", () => {
      const specifier = "https://example.com/module.ts";
      const sourceCode = "console.log('hello');";
      const importMap2: ImportMap = {
        imports: {
          "baz": "https://example.com/baz.js",
        },
      };

      const path1 = getCachePath(specifier, sourceCode, testImportMap);
      const path2 = getCachePath(specifier, sourceCode, importMap2);

      // Paths should be different for different import maps
      assertEquals(path1 === path2, false);
    });
  });

  describe("getDefaultDenoCacheDir", () => {
    it("should return a non-empty string", () => {
      const cacheDir = getDefaultDenoCacheDir();
      assertEquals(typeof cacheDir, "string");
      assertEquals(cacheDir.length > 0, true);
    });

    it("should return an absolute path", () => {
      const cacheDir = getDefaultDenoCacheDir();
      assertEquals(cacheDir.startsWith("/") || cacheDir.match(/^[A-Z]:\\/), true);
    });
  });
});
