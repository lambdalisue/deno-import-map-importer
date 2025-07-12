import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import outdent from "@cspotcode/outdent";
import {
  findMissingImports,
  type Replacement,
} from "./find_missing_imports.ts";

describe("findMissingImports", () => {
  it("should find missing type import when deno graph only found one", () => {
    const sourceCode = outdent`
      export type * from "@vim-fall/core/source";
      import type { CollectParams, Source } from "@vim-fall/core/source";
      import { something } from "@vim-fall/core/source";
    `;

    const specifierReplacements = new Map([
      ["@vim-fall/core/source", "jsr:@vim-fall/core@^0.3.0/source"],
    ]);

    // Simulate what deno graph found
    const existingReplacements: Replacement[] = [
      {
        startLine: 0,
        startChar: 19,
        endLine: 0,
        endChar: 42,
        specifier: "@vim-fall/core/source",
        newSpecifier: "jsr:@vim-fall/core@^0.3.0/source",
      },
      {
        startLine: 2,
        startChar: 26,
        endLine: 2,
        endChar: 49,
        specifier: "@vim-fall/core/source",
        newSpecifier: "jsr:@vim-fall/core@^0.3.0/source",
      },
    ];

    const missing = findMissingImports(
      sourceCode,
      specifierReplacements,
      existingReplacements,
    );

    assertEquals(missing.length, 1);
    assertEquals(missing[0].startLine, 1);
    assertEquals(missing[0].startChar, 43);
    assertEquals(missing[0].endChar, 66);
  });

  it("should find missing export statements", () => {
    const sourceCode = outdent`
      import { foo } from "./local.ts";
      export { bar } from "./local.ts";
      export * from "./local.ts";
      import type { Baz } from "./local.ts";
    `;

    const specifierReplacements = new Map([
      ["./local.ts", "./replaced.ts"],
    ]);

    // Deno graph typically only finds regular import and type import
    const existingReplacements: Replacement[] = [
      {
        startLine: 0,
        startChar: 20,
        endLine: 0,
        endChar: 32,
        specifier: "./local.ts",
        newSpecifier: "./replaced.ts",
      },
      {
        startLine: 3,
        startChar: 25,
        endLine: 3,
        endChar: 37,
        specifier: "./local.ts",
        newSpecifier: "./replaced.ts",
      },
    ];

    const missing = findMissingImports(
      sourceCode,
      specifierReplacements,
      existingReplacements,
    );

    assertEquals(missing.length, 2);
    // Should find the two export statements
    assertEquals(missing[0].startLine, 1);
    assertEquals(missing[1].startLine, 2);
  });

  it("should find all occurrences in duplicate type imports", () => {
    const sourceCode = outdent`
      import type { A } from "module";
      import type { B } from "module";
      import type { C } from "module";
    `;

    const specifierReplacements = new Map([
      ["module", "replaced-module"],
    ]);

    // Deno graph only tracks the first type import
    const existingReplacements: Replacement[] = [
      {
        startLine: 0,
        startChar: 23,
        endLine: 0,
        endChar: 31,
        specifier: "module",
        newSpecifier: "replaced-module",
      },
    ];

    const missing = findMissingImports(
      sourceCode,
      specifierReplacements,
      existingReplacements,
    );

    assertEquals(missing.length, 2);
    assertEquals(missing[0].startLine, 1);
    assertEquals(missing[1].startLine, 2);
  });

  it("should handle single quotes", () => {
    const sourceCode = outdent`
      import { foo } from 'module';
      import { bar } from "module";
    `;

    const specifierReplacements = new Map([
      ["module", "replaced"],
    ]);

    const existingReplacements: Replacement[] = [];

    const missing = findMissingImports(
      sourceCode,
      specifierReplacements,
      existingReplacements,
    );

    assertEquals(missing.length, 2);
    assertEquals(missing[0].startChar, 20); // Position of 'module'
    assertEquals(missing[1].startChar, 20); // Position of "module"
  });

  it("should return empty array when no replacements needed", () => {
    const sourceCode = `import { foo } from "module";`;

    const specifierReplacements = new Map<string, string>();
    const existingReplacements: Replacement[] = [];

    const missing = findMissingImports(
      sourceCode,
      specifierReplacements,
      existingReplacements,
    );

    assertEquals(missing.length, 0);
  });

  it("should not find duplicates of existing replacements", () => {
    const sourceCode = `import { foo } from "module";`;

    const specifierReplacements = new Map([
      ["module", "replaced"],
    ]);

    const existingReplacements: Replacement[] = [
      {
        startLine: 0,
        startChar: 20,
        endLine: 0,
        endChar: 28,
        specifier: "module",
        newSpecifier: "replaced",
      },
    ];

    const missing = findMissingImports(
      sourceCode,
      specifierReplacements,
      existingReplacements,
    );

    assertEquals(missing.length, 0);
  });

  it("should not handle dynamic imports (they use different regex)", () => {
    const sourceCode = outdent`
      const mod = await import("module");
      import("module").then(m => console.log(m));
    `;

    const specifierReplacements = new Map([
      ["module", "replaced"],
    ]);

    const existingReplacements: Replacement[] = [];

    const missing = findMissingImports(
      sourceCode,
      specifierReplacements,
      existingReplacements,
    );

    // Dynamic imports are not handled by this function
    // They use a different pattern and are handled by deno graph
    assertEquals(missing.length, 0);
  });

  it("should not match non-import occurrences", () => {
    const sourceCode = outdent`
      // This is a comment about "module"
      const str = "module";
      import { foo } from "module";
    `;

    const specifierReplacements = new Map([
      ["module", "replaced"],
    ]);

    const existingReplacements: Replacement[] = [];

    const missing = findMissingImports(
      sourceCode,
      specifierReplacements,
      existingReplacements,
    );

    // Should only find the actual import
    assertEquals(missing.length, 1);
    assertEquals(missing[0].startLine, 2);
  });

  it("should handle multiline imports", () => {
    const sourceCode = outdent`
      import {
        foo,
        bar
      } from "module";
      import type {
        Baz,
        Qux
      } from "module";
      export {
        something
      } from "module";
    `;

    const specifierReplacements = new Map([
      ["module", "replaced-module"],
    ]);

    // Assume deno graph found the first import
    const existingReplacements: Replacement[] = [
      {
        startLine: 3,
        startChar: 7,
        endLine: 3,
        endChar: 15,
        specifier: "module",
        newSpecifier: "replaced-module",
      },
    ];

    const missing = findMissingImports(
      sourceCode,
      specifierReplacements,
      existingReplacements,
    );

    // Should find the type import and export
    assertEquals(missing.length, 2);
    assertEquals(missing[0].startLine, 7);
    assertEquals(missing[0].startChar, 7);
    assertEquals(missing[0].endChar, 15);
    assertEquals(missing[1].startLine, 10);
    assertEquals(missing[1].startChar, 7);
    assertEquals(missing[1].endChar, 15);
  });
});
