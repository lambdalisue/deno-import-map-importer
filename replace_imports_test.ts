import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import outdent from "@cspotcode/outdent";
import { replaceImports } from "./replace_imports.ts";

describe("replaceImports", () => {
  it("should replace import statement with double quotes", async () => {
    const sourceCode = `import { foo } from "bar";`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `import { foo } from "baz";`);
  });

  it("should replace import statement with single quotes", async () => {
    const sourceCode = `import { foo } from 'bar';`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `import { foo } from "baz";`);
  });

  it("should replace multiple import statements", async () => {
    const sourceCode = outdent`
      import { foo } from "bar";
      import { baz } from "qux";
      const x = 1;
    `;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "bar-replaced";
        }
        if (specifier === "qux") {
          return "qux-replaced";
        }
        return specifier;
      },
    );
    assertEquals(
      result,
      outdent`
        import { foo } from "bar-replaced";
        import { baz } from "qux-replaced";
        const x = 1;
      `,
    );
  });

  it("should handle dynamic imports", async () => {
    const sourceCode = `const module = await import("bar");`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `const module = await import("baz");`);
  });

  it("should handle export from statements", async () => {
    const sourceCode = `export { foo } from "bar";`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `export { foo } from "baz";`);
  });

  it("should preserve import paths that are not replaced", async () => {
    const sourceCode = outdent`
      import { foo } from "./local.ts";
      import { bar } from "@std/testing";
    `;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "@std/testing") {
          return "jsr:@std/testing@1.0.0";
        }
        return specifier;
      },
    );
    assertEquals(
      result,
      outdent`
        import { foo } from "./local.ts";
        import { bar } from "jsr:@std/testing@1.0.0";
      `,
    );
  });

  it("should handle import type statements", async () => {
    const sourceCode = `import type { Foo } from "bar";`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `import type { Foo } from "baz";`);
  });

  it("should handle import { type Foo } statements", async () => {
    const sourceCode = `import { type Foo, Bar } from "bar";`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `import { type Foo, Bar } from "baz";`);
  });

  it("should handle mixed type imports", async () => {
    const sourceCode = outdent`
      import { type Foo, Bar, type Baz } from "bar";
      import type { Qux } from "qux";
    `;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "bar-replaced";
        }
        if (specifier === "qux") {
          return "qux-replaced";
        }
        return specifier;
      },
    );
    assertEquals(
      result,
      outdent`
        import { type Foo, Bar, type Baz } from "bar-replaced";
        import type { Qux } from "qux-replaced";
      `,
    );
  });

  it("should handle side-effect imports", async () => {
    const sourceCode = `import "bar";`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `import "baz";`);
  });

  it("should handle namespace imports", async () => {
    const sourceCode = `import * as foo from "bar";`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `import * as foo from "baz";`);
  });

  it("should not modify non-import strings", async () => {
    const sourceCode = outdent`
      import { foo } from "bar";
      const str = "bar";
      const template = \`bar\`;
    `;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(
      result,
      outdent`
        import { foo } from "baz";
        const str = "bar";
        const template = \`bar\`;
      `,
    );
  });

  it("should return original code when no replacements are needed", async () => {
    const sourceCode = outdent`
      import { foo } from "./local.ts";
      const x = 1;
    `;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        return specifier;
      },
    );
    assertEquals(result, sourceCode);
  });

  it("should handle multi-line imports", async () => {
    const sourceCode = outdent`
      import {
        foo,
        bar,
        baz
      } from "module";
    `;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "module") {
          return "new-module";
        }
        return specifier;
      },
    );
    assertEquals(
      result,
      outdent`
        import {
          foo,
          bar,
          baz
        } from "new-module";
      `,
    );
  });

  it("should handle export * statements", async () => {
    const sourceCode = `export * from "bar";`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `export * from "baz";`);
  });

  it("should handle export type statements", async () => {
    const sourceCode = `export type { Foo } from "bar";`;
    const result = await replaceImports(
      "file:///test.ts",
      sourceCode,
      (specifier) => {
        if (specifier === "bar") {
          return "baz";
        }
        return specifier;
      },
    );
    assertEquals(result, `export type { Foo } from "baz";`);
  });
});
