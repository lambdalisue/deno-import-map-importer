# import-map-importer

[![JSR](https://jsr.io/badges/@lambdalisue/deno-import-map-importer)](https://jsr.io/@lambdalisue/deno-import-map-importer)
[![Test workflow](https://github.com/lambdalisue/deno-import-map-importer/actions/workflows/test.yml/badge.svg)](https://github.com/lambdalisue/deno-import-map-importer/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/lambdalisue/deno-import-map-importer/graph/badge.svg?token=bBTnWn6fJI)](https://codecov.io/gh/lambdalisue/deno-import-map-importer)

A high-performance import map processor that transforms and caches
JavaScript/TypeScript modules for Deno.

## Usage

```typescript ignore
import { ImportMapImporter } from "@lambdalisue/deno-import-map-importer";

// Define your import map
const importMap = {
  imports: {
    lodash: "https://cdn.skypack.dev/lodash",
    "@utils/": "./src/utils/",
  },
};

// Create an importer instance
const importer = new ImportMapImporter(importMap);

// Import modules with import map transformations applied
const module = await importer.import<{ default: any }>("./src/main.ts");
```

### Replace imports in source code

```typescript ignore
import { replaceImports } from "@lambdalisue/deno-import-map-importer/replace-imports";

const source = `
import { readFile } from "node:fs";
import lodash from "lodash";
`;

const result = await replaceImports(
  "file:///src/app.ts",
  source,
  (spec) => spec === "lodash" ? "https://cdn.skypack.dev/lodash" : spec,
);
// Result will have lodash import replaced with the CDN URL
```

## License

The code follows the MIT license written in [LICENSE](./LICENSE). Contributors
need to agree that any modifications sent to this repository follow the license.
