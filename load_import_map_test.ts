import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { loadImportMap } from "./load_import_map.ts";

const testDir = join(Deno.cwd(), "test_fixtures");

Deno.test("loadImportMap - loads and resolves relative paths in imports", async () => {
  // Create test directory and import map file
  await Deno.mkdir(testDir, { recursive: true });

  const importMapPath = join(testDir, "import_map.json");
  const importMapContent = {
    imports: {
      "@utils/": "./src/utils/",
      "@components/": "../components/",
      "lodash": "https://cdn.skypack.dev/lodash",
      "/absolute/": "/usr/local/lib/",
    },
  };

  await Deno.writeTextFile(
    importMapPath,
    JSON.stringify(importMapContent, null, 2),
  );

  try {
    const result = await loadImportMap(importMapPath);

    // Check that relative paths are resolved to file URLs
    assertEquals(
      result.imports["@utils/"],
      new URL("./src/utils/", `file://${testDir}/`).href,
    );
    assertEquals(
      result.imports["@components/"],
      new URL("../components/", `file://${testDir}/`).href,
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
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("loadImportMap - loads and resolves relative paths in scopes", async () => {
  await Deno.mkdir(testDir, { recursive: true });

  const importMapPath = join(testDir, "import_map.json");
  const importMapContent = {
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

  await Deno.writeTextFile(
    importMapPath,
    JSON.stringify(importMapContent, null, 2),
  );

  try {
    const result = await loadImportMap(importMapPath);

    // Check that scope keys are resolved
    const expectedVendorScope = new URL("./vendor/", `file://${testDir}/`).href;
    assertEquals(result.scopes?.[expectedVendorScope], {
      "lodash": new URL("./vendor/lodash/index.js", `file://${testDir}/`).href,
      "react": "https://esm.sh/react",
    });

    // Check that URL scopes remain unchanged
    assertEquals(result.scopes?.["https://example.com/"], {
      "lodash": "https://cdn.jsdelivr.net/npm/lodash",
    });
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("loadImportMap - handles bare specifiers without modification", async () => {
  await Deno.mkdir(testDir, { recursive: true });

  const importMapPath = join(testDir, "import_map.json");
  const importMapContent = {
    imports: {
      "react": "react",
      "@package": "@package",
      "some-lib": "some-lib",
    },
  };

  await Deno.writeTextFile(
    importMapPath,
    JSON.stringify(importMapContent, null, 2),
  );

  try {
    const result = await loadImportMap(importMapPath);

    // Bare specifiers should remain unchanged
    assertEquals(result.imports["react"], "react");
    assertEquals(result.imports["@package"], "@package");
    assertEquals(result.imports["some-lib"], "some-lib");
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("loadImportMap - works with relative path input", async () => {
  await Deno.mkdir(testDir, { recursive: true });

  const importMapPath = join(testDir, "import_map.json");
  const importMapContent = {
    imports: {
      "@test/": "./test/",
    },
  };

  await Deno.writeTextFile(
    importMapPath,
    JSON.stringify(importMapContent, null, 2),
  );

  try {
    // Use relative path from cwd
    const relativePath = `./${join("test_fixtures", "import_map.json")}`;
    const result = await loadImportMap(relativePath);

    assertEquals(
      result.imports["@test/"],
      new URL("./test/", `file://${testDir}/`).href,
    );
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("loadImportMap - throws on invalid JSON", async () => {
  await Deno.mkdir(testDir, { recursive: true });

  const importMapPath = join(testDir, "invalid.json");
  await Deno.writeTextFile(importMapPath, "{ invalid json");

  try {
    await assertRejects(
      () => loadImportMap(importMapPath),
      SyntaxError,
    );
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("loadImportMap - throws on invalid import map structure", async () => {
  await Deno.mkdir(testDir, { recursive: true });

  const importMapPath = join(testDir, "invalid_structure.json");
  const invalidContent = {
    // Missing required 'imports' field
    scopes: {},
  };

  await Deno.writeTextFile(importMapPath, JSON.stringify(invalidContent));

  try {
    await assertRejects(
      () => loadImportMap(importMapPath),
      Error,
    );
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("loadImportMap - handles empty import map", async () => {
  await Deno.mkdir(testDir, { recursive: true });

  const importMapPath = join(testDir, "empty.json");
  const emptyContent = {
    imports: {},
  };

  await Deno.writeTextFile(importMapPath, JSON.stringify(emptyContent));

  try {
    const result = await loadImportMap(importMapPath);
    assertEquals(result.imports, {});
    assertEquals(result.scopes, undefined);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("loadImportMap - uses custom loader when provided", async () => {
  await Deno.mkdir(testDir, { recursive: true });

  const importMapPath = join(testDir, "custom_loader.json");

  // Custom loader that returns a predefined import map
  const customLoader = (_path: string) => {
    return {
      imports: {
        "@custom/": "./custom_loaded/",
        "lodash": "https://custom.cdn/lodash",
      },
    };
  };

  try {
    const result = await loadImportMap(importMapPath, {
      loader: customLoader,
    });

    // Check that the custom loader's result is used and paths are resolved
    assertEquals(
      result.imports["@custom/"],
      new URL("./custom_loaded/", `file://${testDir}/`).href,
    );
    assertEquals(
      result.imports["lodash"],
      "https://custom.cdn/lodash",
    );
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("loadImportMap - custom loader can be async", async () => {
  await Deno.mkdir(testDir, { recursive: true });

  const importMapPath = join(testDir, "async_loader.json");

  // Async custom loader
  const asyncLoader = async (_path: string) => {
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 10));

    return {
      imports: {
        "@async/": "./async_loaded/",
        "react": "https://async.cdn/react",
      },
    };
  };

  try {
    const result = await loadImportMap(importMapPath, {
      loader: asyncLoader,
    });

    // Check imports
    assertEquals(
      result.imports["@async/"],
      new URL("./async_loaded/", `file://${testDir}/`).href,
    );
    assertEquals(
      result.imports["react"],
      "https://async.cdn/react",
    );
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("loadImportMap - custom loader errors are propagated", async () => {
  const importMapPath = join(testDir, "error_loader.json");

  // Custom loader that throws an error
  const errorLoader = () => {
    throw new Error("Custom loader error");
  };

  await assertRejects(
    () => loadImportMap(importMapPath, { loader: errorLoader }),
    Error,
    "Custom loader error",
  );
});
