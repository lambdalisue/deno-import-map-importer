import { assertEquals } from "@std/assert";
import type { ImportMap } from "./import_map.ts";
import { resolveImportMap } from "./resolve_import_map.ts";

Deno.test("resolveImportMap - resolves relative paths in imports", () => {
  const importMap: ImportMap = {
    imports: {
      "@utils/": "./src/utils/",
      "@components/": "../components/",
      "lodash": "https://cdn.skypack.dev/lodash",
      "/absolute/": "/usr/local/lib/",
    },
  };

  const result = resolveImportMap(importMap, {
    path: "/project/config/import_map.json",
  });

  // Check that relative paths are resolved to file URLs
  assertEquals(
    result.imports["@utils/"],
    "file:///project/config/src/utils/",
  );
  assertEquals(
    result.imports["@components/"],
    "file:///project/components/",
  );

  // Check that URLs remain unchanged
  assertEquals(
    result.imports["lodash"],
    "https://cdn.skypack.dev/lodash",
  );

  // Check that absolute paths are converted to file URLs
  assertEquals(
    result.imports["/absolute/"],
    "file:///usr/local/lib/",
  );
});

Deno.test("resolveImportMap - resolves relative paths in scopes", () => {
  const importMap: ImportMap = {
    imports: {
      "lodash": "https://cdn.skypack.dev/lodash",
    },
    scopes: {
      "./vendor/": {
        "lodash": "./vendor/lodash/index.js",
        "react": "https://esm.sh/react",
      },
      "https://example.com/": {
        "lodash": "https://cdn.jsdelivr.net/npm/lodash",
      },
    },
  };

  const result = resolveImportMap(importMap, {
    path: "/project/config/import_map.json",
  });

  // Check that scope keys are resolved
  assertEquals(result.scopes?.["file:///project/config/vendor/"], {
    "lodash": "file:///project/config/vendor/lodash/index.js",
    "react": "https://esm.sh/react",
  });

  // Check that URL scopes remain unchanged
  assertEquals(result.scopes?.["https://example.com/"], {
    "lodash": "https://cdn.jsdelivr.net/npm/lodash",
  });
});

Deno.test("resolveImportMap - handles bare specifiers without modification", () => {
  const importMap: ImportMap = {
    imports: {
      "react": "react",
      "@package": "@package",
      "some-lib": "some-lib",
    },
  };

  const result = resolveImportMap(importMap, {
    path: "/project/import_map.json",
  });

  // Bare specifiers should remain unchanged
  assertEquals(result.imports["react"], "react");
  assertEquals(result.imports["@package"], "@package");
  assertEquals(result.imports["some-lib"], "some-lib");
});

Deno.test("resolveImportMap - works with relative path option", () => {
  const importMap: ImportMap = {
    imports: {
      "@test/": "./test/",
    },
  };

  // Test with relative path that will be resolved from cwd
  const result = resolveImportMap(importMap, {
    path: "./config/import_map.json",
  });

  assertEquals(
    result.imports["@test/"],
    new URL("./config/test/", `file://${Deno.cwd()}/`).href,
  );
});

Deno.test("resolveImportMap - handles empty import map", () => {
  const importMap: ImportMap = {
    imports: {},
  };

  const result = resolveImportMap(importMap, {
    path: "/project/import_map.json",
  });

  assertEquals(result.imports, {});
  assertEquals(result.scopes, undefined);
});

Deno.test("resolveImportMap - preserves file:// URLs", () => {
  const importMap: ImportMap = {
    imports: {
      "@local/": "file:///absolute/path/to/local/",
      "@relative/": "file://./relative/path/",
    },
  };

  const result = resolveImportMap(importMap, {
    path: "/project/import_map.json",
  });

  // file:// URLs should remain unchanged
  assertEquals(result.imports["@local/"], "file:///absolute/path/to/local/");
  assertEquals(result.imports["@relative/"], "file://./relative/path/");
});

Deno.test("resolveImportMap - resolves nested relative paths in scopes", () => {
  const importMap: ImportMap = {
    imports: {},
    scopes: {
      "../external/": {
        "@utils/": "./utils/",
        "@lib/": "../lib/",
      },
      "/absolute/scope/": {
        "@utils/": "./utils/",
      },
    },
  };

  const result = resolveImportMap(importMap, {
    path: "/project/config/import_map.json",
  });

  // Check relative scope resolution
  assertEquals(result.scopes?.["file:///project/external/"], {
    "@utils/": "file:///project/config/utils/",
    "@lib/": "file:///project/lib/",
  });

  // Check absolute scope resolution
  assertEquals(result.scopes?.["file:///absolute/scope/"], {
    "@utils/": "file:///project/config/utils/",
  });
});

Deno.test("resolveImportMap - uses default path when not provided", () => {
  const importMap: ImportMap = {
    imports: {
      "@local/": "./local/",
    },
  };

  // Without path option, it should use cwd/<unknown>
  const result = resolveImportMap(importMap);

  assertEquals(
    result.imports["@local/"],
    new URL("./local/", `file://${Deno.cwd()}/`).href,
  );
});

Deno.test("resolveImportMap - handles mixed path types", () => {
  const importMap: ImportMap = {
    imports: {
      // Relative paths
      "@rel1/": "./relative/path1/",
      "@rel2/": "../relative/path2/",
      // Absolute paths
      "@abs/": "/absolute/path/",
      // URLs
      "@http/": "http://example.com/modules/",
      "@file/": "file:///absolute/file/url/",
      // Bare specifiers
      "module": "module-name",
      // Special cases
      "@dot/": ".",
      "@dotdot/": "..",
    },
  };

  const result = resolveImportMap(importMap, {
    path: "/project/src/import_map.json",
  });

  // Check relative paths
  assertEquals(
    result.imports["@rel1/"],
    "file:///project/src/relative/path1/",
  );
  assertEquals(result.imports["@rel2/"], "file:///project/relative/path2/");

  // Check absolute path
  assertEquals(result.imports["@abs/"], "file:///absolute/path/");

  // Check URLs remain unchanged
  assertEquals(result.imports["@http/"], "http://example.com/modules/");
  assertEquals(result.imports["@file/"], "file:///absolute/file/url/");

  // Check bare specifier remains unchanged
  assertEquals(result.imports["module"], "module-name");

  // Check special cases - these are not relative paths in import map context
  assertEquals(result.imports["@dot/"], ".");
  assertEquals(result.imports["@dotdot/"], "..");
});