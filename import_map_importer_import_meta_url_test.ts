import { afterAll, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { fromFileUrl } from "@std/path/from-file-url";
import { dirname } from "@std/path/dirname";
import { ImportMapImporter } from "./import_map_importer.ts";
import type { ImportMap } from "./import_map.ts";

afterAll(async () => {
  try {
    const cacheDir = fromFileUrl(
      new URL("./.test_cache", import.meta.url),
    );
    await Deno.remove(cacheDir, { recursive: true });
  } catch (error) {
    // Only ignore NotFound errors
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
});

describe("ImportMapImporter - import.meta.url replacement", () => {
  it("should preserve original import.meta.url when module is transformed", async () => {
    const testModuleUrl = new URL(
      "./testdata/import_meta_url.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {},
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });

    const module = await importer.import<{
      currentUrl: string;
      dirname: string;
      getRelativePath: (path: string) => string;
      metadata: {
        url: string;
        protocol: string;
        pathname: string;
      };
    }>(testModuleUrl.href);

    // The import.meta.url should point to the original file, not the cached version
    expect(module.currentUrl).toBe(testModuleUrl.href);
    expect(module.metadata.url).toBe(testModuleUrl.href);
    expect(module.metadata.pathname).toBe(testModuleUrl.pathname);

    // Test that relative URL resolution still works correctly
    const relativePath = module.getRelativePath("./test.txt");
    expect(relativePath).toBe(new URL("./test.txt", testModuleUrl).href);
  });

  it("should handle import.meta.url in modules with import mappings", async () => {
    // Create a test module that uses both import mappings and import.meta.url
    const testContent = `
import { getValue } from "@test/lib";

export const moduleUrl = import.meta.url;
export const libValue = getValue();
export const resourcePath = new URL("./resource.json", import.meta.url).href;
`;

    const libContent = `
export function getValue() {
  return "lib-value";
}

export const libUrl = import.meta.url;
`;

    const testModulePath = new URL(
      "./testdata/test_import_meta_with_mapping.ts",
      import.meta.url,
    );
    const libModulePath = new URL(
      "./testdata/test_lib_for_meta.ts",
      import.meta.url,
    );

    await Deno.writeTextFile(testModulePath, testContent);
    await Deno.writeTextFile(libModulePath, libContent);

    try {
      const importMap: ImportMap = {
        imports: {
          "@test/lib": libModulePath.href,
        },
      };

      const importer = new ImportMapImporter(importMap, {
        cacheDir: "./.test_cache",
      });

      const module = await importer.import<{
        moduleUrl: string;
        libValue: string;
        resourcePath: string;
      }>(testModulePath.href);

      // Both the main module and the imported lib should have their original URLs
      expect(module.moduleUrl).toBe(testModulePath.href);
      expect(module.libValue).toBe("lib-value");
      expect(module.resourcePath).toBe(
        new URL("./resource.json", testModulePath).href,
      );

      // Import the lib module directly to check its URL
      const libModule = await importer.import<{ libUrl: string }>(
        libModulePath.href,
      );
      expect(libModule.libUrl).toBe(libModulePath.href);
    } finally {
      await Deno.remove(testModulePath);
      await Deno.remove(libModulePath);
    }
  });

  it("should handle import.meta.url in deeply nested dependencies", async () => {
    // Create a chain of dependencies all using import.meta.url
    const deepContent = `
export const deepUrl = import.meta.url;
export const deepName = "deep";
`;

    const middleContent = `
import { deepUrl, deepName } from "./deep.ts";

export const middleUrl = import.meta.url;
export const fromDeep = { deepUrl, deepName };
export const middleName = "middle";
`;

    const topContent = `
import { middleUrl, fromDeep, middleName } from "@test/middle";

export const topUrl = import.meta.url;
export const fromMiddle = { middleUrl, middleName };
export const allUrls = {
  top: import.meta.url,
  middle: middleUrl,
  deep: fromDeep.deepUrl,
};
`;

    const deepPath = new URL("./testdata/deep.ts", import.meta.url);
    const middlePath = new URL("./testdata/middle.ts", import.meta.url);
    const topPath = new URL("./testdata/top.ts", import.meta.url);

    await Deno.writeTextFile(deepPath, deepContent);
    await Deno.writeTextFile(middlePath, middleContent);
    await Deno.writeTextFile(topPath, topContent);

    try {
      const importMap: ImportMap = {
        imports: {
          "@test/middle": middlePath.href,
        },
      };

      const importer = new ImportMapImporter(importMap, {
        cacheDir: "./.test_cache",
      });

      const module = await importer.import<{
        topUrl: string;
        fromMiddle: { middleUrl: string; middleName: string };
        allUrls: {
          top: string;
          middle: string;
          deep: string;
        };
      }>(topPath.href);

      // All URLs should point to their original locations
      expect(module.topUrl).toBe(topPath.href);
      expect(module.allUrls.top).toBe(topPath.href);
      expect(module.allUrls.middle).toBe(middlePath.href);
      expect(module.allUrls.deep).toBe(deepPath.href);
      expect(module.fromMiddle.middleUrl).toBe(middlePath.href);
    } finally {
      await Deno.remove(deepPath);
      await Deno.remove(middlePath);
      await Deno.remove(topPath);
    }
  });

  it("should handle import.meta.url with various usage patterns", async () => {
    // Test various ways import.meta.url might be used
    const testContent = `
// Direct usage
export const url1 = import.meta.url;

// In template literal
export const url2 = \`Current module: \${import.meta.url}\`;

// As part of URL construction
export const url3 = new URL("../data", import.meta.url).href;

// In a function
export function getModuleInfo() {
  return {
    url: import.meta.url,
    dir: new URL(".", import.meta.url).href,
  };
}

// In conditional
export const isFileProtocol = import.meta.url.startsWith("file://");

// Multiple uses in one line
export const urls = [import.meta.url, import.meta.url];
`;

    const testPath = new URL(
      "./testdata/various_import_meta_usage.ts",
      import.meta.url,
    );
    await Deno.writeTextFile(testPath, testContent);

    try {
      const importMap: ImportMap = { imports: {} };
      const importer = new ImportMapImporter(importMap, {
        cacheDir: "./.test_cache",
      });

      const module = await importer.import<{
        url1: string;
        url2: string;
        url3: string;
        getModuleInfo: () => { url: string; dir: string };
        isFileProtocol: boolean;
        urls: string[];
      }>(testPath.href);

      // All instances should have the original URL
      expect(module.url1).toBe(testPath.href);
      expect(module.url2).toBe(`Current module: ${testPath.href}`);
      expect(module.url3).toBe(new URL("../data", testPath).href);

      const moduleInfo = module.getModuleInfo();
      expect(moduleInfo.url).toBe(testPath.href);
      expect(moduleInfo.dir).toBe(new URL(".", testPath).href);

      expect(module.isFileProtocol).toBe(true);
      expect(module.urls).toEqual([testPath.href, testPath.href]);
    } finally {
      await Deno.remove(testPath);
    }
  });

  it("should handle import.meta.filename and import.meta.dirname", async () => {
    const testModuleUrl = new URL(
      "./testdata/import_meta_all.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {},
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });

    const module = await importer.import<{
      metaUrl: string;
      metaFilename: string;
      metaDirname: string;
      getFileInfo: () => {
        url: string;
        filename: string;
        dirname: string;
        basename: string | undefined;
      };
      isTypeScript: boolean;
      parentDir: string | undefined;
      dataPath: string;
      configPath: string;
    }>(testModuleUrl.href);

    const expectedFilename = fromFileUrl(testModuleUrl);
    const expectedDirname = dirname(expectedFilename);

    // Check direct exports
    expect(module.metaUrl).toBe(testModuleUrl.href);
    expect(module.metaFilename).toBe(expectedFilename);
    expect(module.metaDirname).toBe(expectedDirname);

    // Check function return values
    const fileInfo = module.getFileInfo();
    expect(fileInfo.url).toBe(testModuleUrl.href);
    expect(fileInfo.filename).toBe(expectedFilename);
    expect(fileInfo.dirname).toBe(expectedDirname);
    expect(fileInfo.basename).toBe("import_meta_all.ts");

    // Check expressions
    expect(module.isTypeScript).toBe(true);
    expect(module.parentDir).toBe("testdata");
    expect(module.dataPath).toBe(expectedDirname + "/data");
    expect(module.configPath).toBe(`${expectedDirname}/config.json`);
  });

  it("should handle filename and dirname in modules with import mappings", async () => {
    const testContent = `
import { getValue } from "@test/lib";

export const moduleInfo = {
  url: import.meta.url,
  filename: import.meta.filename,
  dirname: import.meta.dirname,
  value: getValue(),
};
`;

    const libContent = `
export function getValue() {
  return {
    libUrl: import.meta.url,
    libFilename: import.meta.filename,
    libDirname: import.meta.dirname,
  };
}
`;

    const testModulePath = new URL(
      "./testdata/test_meta_all_with_mapping.ts",
      import.meta.url,
    );
    const libModulePath = new URL(
      "./testdata/test_lib_meta_all.ts",
      import.meta.url,
    );

    await Deno.writeTextFile(testModulePath, testContent);
    await Deno.writeTextFile(libModulePath, libContent);

    try {
      const importMap: ImportMap = {
        imports: {
          "@test/lib": libModulePath.href,
        },
      };

      const importer = new ImportMapImporter(importMap, {
        cacheDir: "./.test_cache",
      });

      const module = await importer.import<{
        moduleInfo: {
          url: string;
          filename: string;
          dirname: string;
          value: {
            libUrl: string;
            libFilename: string;
            libDirname: string;
          };
        };
      }>(testModulePath.href);

      const expectedTestFilename = fromFileUrl(testModulePath);
      const expectedTestDirname = dirname(expectedTestFilename);
      const expectedLibFilename = fromFileUrl(libModulePath);
      const expectedLibDirname = dirname(expectedLibFilename);

      // Check main module values
      expect(module.moduleInfo.url).toBe(testModulePath.href);
      expect(module.moduleInfo.filename).toBe(expectedTestFilename);
      expect(module.moduleInfo.dirname).toBe(expectedTestDirname);

      // Check lib module values
      expect(module.moduleInfo.value.libUrl).toBe(libModulePath.href);
      expect(module.moduleInfo.value.libFilename).toBe(expectedLibFilename);
      expect(module.moduleInfo.value.libDirname).toBe(expectedLibDirname);
    } finally {
      await Deno.remove(testModulePath);
      await Deno.remove(libModulePath);
    }
  });

  it("should handle import.meta.resolve()", async () => {
    const testModuleUrl = new URL(
      "./testdata/import_meta_resolve.ts",
      import.meta.url,
    );
    const importMap: ImportMap = {
      imports: {
        "@std/path": "jsr:@std/path@^1.0.1",
      },
    };

    const importer = new ImportMapImporter(importMap, {
      cacheDir: "./.test_cache",
    });

    const module = await importer.import<{
      resolvedUrl: string;
      resolvedRelative: string;
      resolvedBare: string;
      resolveCustom: (path: string) => string;
      resolvedInExpression: URL;
      resolvedArray: string[];
      resolveDynamic: (moduleName: string) => Promise<string>;
    }>(testModuleUrl.href);

    // Check that resolved URLs are correct
    const baseUrl = testModuleUrl.href;
    expect(module.resolvedUrl).toBe(new URL("./dep1.ts", baseUrl).href);
    expect(module.resolvedRelative).toBe(
      new URL("../testdata/dep2.ts", baseUrl).href,
    );
    expect(module.resolvedBare).toBe(new URL("@std/path", baseUrl).href);

    // Test dynamic resolution
    const customResolved = module.resolveCustom("./custom.ts");
    expect(customResolved).toBe(new URL("./custom.ts", baseUrl).href);

    // Check array of resolved URLs
    expect(module.resolvedArray).toEqual([
      new URL("./file1.ts", baseUrl).href,
      new URL("./file2.ts", baseUrl).href,
    ]);
  });

  it("should handle import.meta.resolve() with import map transformations", async () => {
    const testContent = `
import { getValue } from "@test/lib";

export const resolvedLib = import.meta.resolve("@test/lib");
export const resolvedRelative = import.meta.resolve("./local.ts");
export const value = getValue();

export function resolveModule(name: string) {
  return import.meta.resolve(name);
}
`;

    const libContent = `
export function getValue() {
  return "lib-value";
}

export const libResolved = import.meta.resolve("./helper.ts");
`;

    const testModulePath = new URL(
      "./testdata/test_resolve_with_mapping.ts",
      import.meta.url,
    );
    const libModulePath = new URL(
      "./testdata/test_lib_resolve.ts",
      import.meta.url,
    );

    await Deno.writeTextFile(testModulePath, testContent);
    await Deno.writeTextFile(libModulePath, libContent);

    try {
      const importMap: ImportMap = {
        imports: {
          "@test/lib": libModulePath.href,
        },
      };

      const importer = new ImportMapImporter(importMap, {
        cacheDir: "./.test_cache",
      });

      const module = await importer.import<{
        resolvedLib: string;
        resolvedRelative: string;
        value: string;
        resolveModule: (name: string) => string;
      }>(testModulePath.href);

      // Check that resolved URLs are relative to the original module locations
      expect(module.resolvedLib).toBe(
        new URL("@test/lib", testModulePath).href,
      );
      expect(module.resolvedRelative).toBe(
        new URL("./local.ts", testModulePath).href,
      );
      expect(module.value).toBe("lib-value");

      // Test dynamic resolution
      const dynamicResolved = module.resolveModule("./dynamic.ts");
      expect(dynamicResolved).toBe(
        new URL("./dynamic.ts", testModulePath).href,
      );
    } finally {
      await Deno.remove(testModulePath);
      await Deno.remove(libModulePath);
    }
  });
});
