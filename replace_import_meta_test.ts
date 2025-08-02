import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import {
  createOriginalUrlComment,
  replaceImportMeta,
} from "./replace_import_meta.ts";

describe("replaceImportMeta", () => {
  it("should replace basic import.meta.url", () => {
    const code = `const url = import.meta.url;`;
    const result = replaceImportMeta(code, "file:///original/path.ts");
    expect(result).toBe(`const url = "file:///original/path.ts";`);
  });

  it("should replace import.meta.filename", () => {
    const code = `const filename = import.meta.filename;`;
    const result = replaceImportMeta(
      code,
      "file:///original/path/module.ts",
    );
    const expected = Deno.build.os === "windows"
      ? `const filename = "\\\\original\\\\path\\\\module.ts";`
      : `const filename = "/original/path/module.ts";`;
    expect(result).toBe(expected);
  });

  it("should replace import.meta.dirname", () => {
    const code = `const dirname = import.meta.dirname;`;
    const result = replaceImportMeta(
      code,
      "file:///original/path/module.ts",
    );
    const expected = Deno.build.os === "windows"
      ? `const dirname = "\\\\original\\\\path";`
      : `const dirname = "/original/path";`;
    expect(result).toBe(expected);
  });

  it("should replace all import.meta properties in one file", () => {
    const code = `
      const url = import.meta.url;
      const filename = import.meta.filename;
      const dirname = import.meta.dirname;
    `;
    const result = replaceImportMeta(code, "file:///test/dir/file.ts");
    const expectedFilename = Deno.build.os === "windows"
      ? "\\\\test\\\\dir\\\\file.ts"
      : "/test/dir/file.ts";
    const expectedDirname = Deno.build.os === "windows"
      ? "\\\\test\\\\dir"
      : "/test/dir";
    expect(result).toBe(`
      const url = "file:///test/dir/file.ts";
      const filename = "${expectedFilename}";
      const dirname = "${expectedDirname}";
    `);
  });

  it("should handle import.meta properties with whitespace variations", () => {
    const expectedFilename = Deno.build.os === "windows"
      ? `"\\\\test\\\\file.ts"`
      : `"/test/file.ts"`;
    const expectedDirname = Deno.build.os === "windows"
      ? `"\\\\test"`
      : `"/test"`;

    const testCases = [
      { code: `import.meta.filename`, expected: expectedFilename },
      { code: `import . meta . filename`, expected: expectedFilename },
      { code: `import\n.meta.dirname`, expected: expectedDirname },
      { code: `import\n.\nmeta\n.\ndirname`, expected: expectedDirname },
    ];

    for (const { code, expected } of testCases) {
      const fullCode = `const x = ${code};`;
      const result = replaceImportMeta(fullCode, "file:///test/file.ts");
      expect(result).toBe(`const x = ${expected};`);
    }
  });

  it("should not replace filename/dirname for non-file URLs", () => {
    const code = `
      const url = import.meta.url;
      const filename = import.meta.filename;
      const dirname = import.meta.dirname;
    `;
    const result = replaceImportMeta(code, "https://example.com/module.ts");
    expect(result).toBe(`
      const url = "https://example.com/module.ts";
      const filename = import.meta.filename;
      const dirname = import.meta.dirname;
    `);
  });

  it("should replace import.meta.url with whitespace variations", () => {
    const testCases = [
      `import.meta.url`,
      `import . meta . url`,
      `import\n.meta.url`,
      `import\n.\nmeta\n.\nurl`,
      `import  .  meta  .  url`,
    ];

    for (const testCase of testCases) {
      const code = `const x = ${testCase};`;
      const result = replaceImportMeta(code, "file:///test.ts");
      expect(result).toBe(`const x = "file:///test.ts";`);
    }
  });

  it("should replace multiple occurrences", () => {
    const code = `
      const url1 = import.meta.url;
      const url2 = import.meta.url;
      console.log(import.meta.url);
    `;
    const result = replaceImportMeta(code, "file:///test.ts");
    expect(result).toBe(`
      const url1 = "file:///test.ts";
      const url2 = "file:///test.ts";
      console.log("file:///test.ts");
    `);
  });

  it("should handle import.meta.url in template literals", () => {
    const code = "const msg = `Current URL: ${import.meta.url}`;";
    const result = replaceImportMeta(code, "file:///test.ts");
    expect(result).toBe('const msg = `Current URL: ${"file:///test.ts"}`;');
  });

  it("should handle import.meta.url in URL constructor", () => {
    const code = `const url = new URL("./data.json", import.meta.url);`;
    const result = replaceImportMeta(code, "file:///test.ts");
    expect(result).toBe(
      `const url = new URL("./data.json", "file:///test.ts");`,
    );
  });

  it("should handle complex expressions with import.meta.url", () => {
    const code = `
      const isFile = import.meta.url.startsWith("file:");
      const pathname = new URL(import.meta.url).pathname;
      const urls = [import.meta.url, import.meta.url];
    `;
    const result = replaceImportMeta(code, "file:///test.ts");
    expect(result).toBe(`
      const isFile = "file:///test.ts".startsWith("file:");
      const pathname = new URL("file:///test.ts").pathname;
      const urls = ["file:///test.ts", "file:///test.ts"];
    `);
  });

  it("should handle complex expressions with filename and dirname", () => {
    const code = `
      const ext = import.meta.filename.endsWith(".ts");
      const parent = import.meta.dirname.split("/").pop();
      const paths = [import.meta.filename, import.meta.dirname];
      const relative = import.meta.filename.replace(import.meta.dirname, "");
    `;
    const result = replaceImportMeta(code, "file:///test/dir/file.ts");
    const expectedFilename = Deno.build.os === "windows"
      ? "\\\\test\\\\dir\\\\file.ts"
      : "/test/dir/file.ts";
    const expectedDirname = Deno.build.os === "windows"
      ? "\\\\test\\\\dir"
      : "/test/dir";
    expect(result).toBe(`
      const ext = "${expectedFilename}".endsWith(".ts");
      const parent = "${expectedDirname}".split("/").pop();
      const paths = ["${expectedFilename}", "${expectedDirname}"];
      const relative = "${expectedFilename}".replace("${expectedDirname}", "");
    `);
  });

  it("should escape special characters in URLs", () => {
    const code = `const url = import.meta.url;`;
    const result = replaceImportMeta(code, 'file:///path/with"quotes".ts');
    expect(result).toBe(`const url = "file:///path/with\\"quotes\\".ts";`);
  });

  it("should handle Windows file URLs for filename and dirname", () => {
    const code = `
      const url = import.meta.url;
      const filename = import.meta.filename;
      const dirname = import.meta.dirname;
    `;

    // Test Windows file URL
    const windowsUrl = "file:///C:/Users/test/project/module.ts";
    const result = replaceImportMeta(code, windowsUrl);

    // On Windows, fromFileUrl returns proper Windows paths
    const expectedFilename = Deno.build.os === "windows"
      ? "C:\\\\Users\\\\test\\\\project\\\\module.ts"
      : "/C:/Users/test/project/module.ts";
    const expectedDirname = Deno.build.os === "windows"
      ? "C:\\\\Users\\\\test\\\\project"
      : "/C:/Users/test/project";

    expect(result).toBe(`
      const url = "file:///C:/Users/test/project/module.ts";
      const filename = "${expectedFilename}";
      const dirname = "${expectedDirname}";
    `);
  });

  it("should handle Windows paths with proper escaping", () => {
    const code = `const filename = import.meta.filename;`;

    // Test with a Windows-style file URL
    const windowsUrl = "file:///C:/Windows/System32/module.ts";
    const result = replaceImportMeta(code, windowsUrl);

    // On Windows, the path should contain escaped backslashes
    if (Deno.build.os === "windows") {
      expect(result).toBe(
        `const filename = "C:\\\\Windows\\\\System32\\\\module.ts";`,
      );
    } else {
      // On Unix-like systems, the path remains with forward slashes
      expect(result).toBe(`const filename = "/C:/Windows/System32/module.ts";`);
    }
  });

  it("should replace import.meta.resolve() with new URL().href", () => {
    const code = `const resolved = import.meta.resolve("./module.ts");`;
    const result = replaceImportMeta(code, "file:///original/path/main.ts");
    expect(result).toBe(
      `const resolved = new URL("./module.ts", "file:///original/path/main.ts").href;`,
    );
  });

  it("should handle import.meta.resolve() with various arguments", () => {
    const testCases = [
      {
        code: `import.meta.resolve("../lib/utils.ts")`,
        expected: `new URL("../lib/utils.ts", "file:///test/main.ts").href`,
      },
      {
        code: `import.meta.resolve("@std/path")`,
        expected: `new URL("@std/path", "file:///test/main.ts").href`,
      },
      {
        code: `import.meta.resolve(moduleName)`,
        expected: `new URL(moduleName, "file:///test/main.ts").href`,
      },
      {
        code: `import.meta.resolve(\`./\${name}.ts\`)`,
        expected: `new URL(\`./\${name}.ts\`, "file:///test/main.ts").href`,
      },
    ];

    for (const { code, expected } of testCases) {
      const result = replaceImportMeta(code, "file:///test/main.ts");
      expect(result).toBe(expected);
    }
  });

  it("should handle import.meta.resolve() with whitespace variations", () => {
    const testCases = [
      {
        code: `import.meta.resolve("./file.ts")`,
        expected: `new URL("./file.ts", "file:///test.ts").href`,
      },
      {
        code: `import . meta . resolve("./file.ts")`,
        expected: `new URL("./file.ts", "file:///test.ts").href`,
      },
      {
        code: `import\n.meta.resolve("./file.ts")`,
        expected: `new URL("./file.ts", "file:///test.ts").href`,
      },
      {
        code: `import.meta.resolve( "./file.ts" )`,
        expected: `new URL("./file.ts", "file:///test.ts").href`,
      },
      {
        code: `import.meta.resolve(\n  "./file.ts"\n)`,
        expected: `new URL("./file.ts", "file:///test.ts").href`,
      },
    ];

    for (const { code, expected } of testCases) {
      const result = replaceImportMeta(code, "file:///test.ts");
      expect(result).toBe(expected);
    }
  });

  it("should handle multiple import.meta.resolve() calls", () => {
    const code = `
      const a = import.meta.resolve("./a.ts");
      const b = import.meta.resolve("./b.ts");
      const urls = [import.meta.resolve("./c.ts"), import.meta.resolve("./d.ts")];
    `;
    const result = replaceImportMeta(code, "file:///test/main.ts");
    expect(result).toBe(`
      const a = new URL("./a.ts", "file:///test/main.ts").href;
      const b = new URL("./b.ts", "file:///test/main.ts").href;
      const urls = [new URL("./c.ts", "file:///test/main.ts").href, new URL("./d.ts", "file:///test/main.ts").href];
    `);
  });

  it("should handle import.meta.resolve() in complex expressions", () => {
    const code = `
      const url = new URL(import.meta.resolve("./data.json"));
      const isLocal = import.meta.resolve("./file.ts").startsWith("file:");
      await import(import.meta.resolve("./module.ts"));
    `;
    const result = replaceImportMeta(code, "file:///app/main.ts");
    expect(result).toBe(`
      const url = new URL(new URL("./data.json", "file:///app/main.ts").href);
      const isLocal = new URL("./file.ts", "file:///app/main.ts").href.startsWith("file:");
      await import(new URL("./module.ts", "file:///app/main.ts").href);
    `);
  });

  it("should handle all import.meta properties and methods together", () => {
    const code = `
      const url = import.meta.url;
      const filename = import.meta.filename;
      const dirname = import.meta.dirname;
      const resolved = import.meta.resolve("./lib.ts");
    `;
    const result = replaceImportMeta(code, "file:///project/src/main.ts");
    const expectedFilename = Deno.build.os === "windows"
      ? "\\\\project\\\\src\\\\main.ts"
      : "/project/src/main.ts";
    const expectedDirname = Deno.build.os === "windows"
      ? "\\\\project\\\\src"
      : "/project/src";

    expect(result).toContain(`const url = "file:///project/src/main.ts";`);
    expect(result).toContain(`const filename = "${expectedFilename}";`);
    expect(result).toContain(`const dirname = "${expectedDirname}";`);
    expect(result).toContain(
      `const resolved = new URL("./lib.ts", "file:///project/src/main.ts").href;`,
    );
  });
});

describe("createOriginalUrlComment", () => {
  it("should create a proper comment banner", () => {
    const comment = createOriginalUrlComment("file:///original/module.ts");
    expect(comment).toContain("// Original source: file:///original/module.ts");
    expect(comment).toContain(
      "// This file has been transformed by ImportMapImporter",
    );
    expect(comment).toContain(
      "// import.meta.url, import.meta.filename, import.meta.dirname, and import.meta.resolve() have been replaced",
    );
  });
});
