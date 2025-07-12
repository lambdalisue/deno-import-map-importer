# import-map-importer

[![JSR](https://jsr.io/badges/@lambdalisue/import-map-importer)](https://jsr.io/@lambdalisue/import-map-importer)
[![Test workflow](https://github.com/lambdalisue/deno-import-map-importer/actions/workflows/test.yml/badge.svg)](https://github.com/lambdalisue/deno-import-map-importer/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/lambdalisue/deno-import-map-importer/graph/badge.svg?token=bBTnWn6fJI)](https://codecov.io/gh/lambdalisue/deno-import-map-importer)

A high-performance import map processor for Deno that dynamically transforms and
caches JavaScript/TypeScript modules. This tool enables you to use import maps
in environments where they're not natively supported, with intelligent caching
for optimal performance.

## Features

- 🚀 **High Performance** - Multi-level caching (memory + disk) with parallel
  dependency processing
- 🔄 **Import Map Support** - Full support for imports and scopes as defined in
  the [Import Maps specification](https://github.com/WICG/import-maps)
- 📦 **Smart Caching** - Content-based cache invalidation ensures updates are
  reflected immediately
- 🔍 **Comprehensive Import Detection** - Catches all import/export patterns
  including those missed by standard parsers
- 🛡️ **Type Safety** - Full TypeScript support with exported types
- 🎯 **Zero Dependencies** - Only uses Deno standard library and essential tools

## Installation

```bash
deno add @lambdalisue/import-map-importer
```

## Quick Start

```typescript ignore
import { ImportMapImporter } from "@lambdalisue/import-map-importer";

// Define your import map
const importMap = {
  imports: {
    // Map package names to URLs
    "lodash": "https://cdn.skypack.dev/lodash",
    "react": "https://esm.sh/react@18",

    // Map path prefixes
    "@utils/": "./src/utils/",
    "@components/": "./src/components/",
  },
};

// Create an importer instance
const importer = new ImportMapImporter(importMap);

// Import modules with automatic transformation
// This is an example - replace with your actual module path
const myModule = await importer.import<{ greet: (name: string) => void }>(
  "./src/main.ts",
);
myModule.greet("World"); // Uses transformed imports!
```

## Advanced Usage

### Custom Cache Directory

```typescript
import { ImportMapImporter } from "@lambdalisue/import-map-importer";

const importMap = {
  imports: {
    "lodash": "https://cdn.skypack.dev/lodash",
  },
};

const importer = new ImportMapImporter(importMap, {
  // Use a custom cache directory
  cacheDir: "./.cache/imports",
});
```

### Scoped Imports

```typescript
const importMap = {
  imports: {
    "lodash": "https://cdn.skypack.dev/lodash@4.17.21",
  },
  scopes: {
    "/legacy/": {
      // Use older version in legacy code
      "lodash": "https://cdn.skypack.dev/lodash@3.10.1",
    },
  },
};
```

### Clear Deno Cache

For modules that have their own `deno.json` configurations:

```typescript
import { ImportMapImporter } from "@lambdalisue/import-map-importer";

const importMap = {
  imports: {
    "lodash": "https://cdn.skypack.dev/lodash",
  },
};

const importer = new ImportMapImporter(importMap, {
  // Clear Deno's module cache before importing
  clearDenoCache: true,
});
```

### Type-Safe Imports

```typescript
import { ImportMapImporter } from "@lambdalisue/import-map-importer";

// Define your module interface
interface MyUtils {
  formatDate: (date: Date) => string;
  parseJSON: <T>(json: string) => T;
}

const importMap = {
  imports: {
    "@utils/": "./src/utils/",
  },
};

const importer = new ImportMapImporter(importMap);

// Import with type safety
// This is an example - replace with your actual module path
// const utils = await importer.import<MyUtils>("@utils/helpers.ts");
// const formatted = utils.formatDate(new Date()); // Fully typed!
```

## How It Works

1. **Parse** - When you import a module, the importer parses its source code to
   find all import statements
2. **Transform** - Import specifiers are transformed according to your import
   map rules
3. **Cache** - Transformed modules are cached both in memory and on disk for
   fast subsequent loads
4. **Recurse** - Dependencies are processed recursively and in parallel for
   optimal performance

### Caching Strategy

The caching system uses a content-based approach:

- **Cache Key**: SHA-256 hash of (module URL + source code + import map)
- **Cache Location**: Configurable directory with hierarchical structure
- **Cache Invalidation**: Automatic when source code or import map changes

## API Reference

### `ImportMapImporter`

The main class for import map processing.

```typescript
interface ImportMap {
  imports: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
}

interface ImportMapImporterOptions {
  cacheDir?: string;
  clearDenoCache?: boolean;
}

// Class signature (implementation details omitted)
// class ImportMapImporter {
//   constructor(
//     importMap: ImportMap,
//     options?: ImportMapImporterOptions,
//   );
//
//   import<T>(specifier: string): Promise<T>;
// }
```

### `ImportMap`

The import map configuration type.

```typescript
interface ImportMap {
  imports: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
}
```

### `ImportMapImporterOptions`

Configuration options for the importer.

```typescript
interface ImportMapImporterOptions {
  // Custom cache directory (absolute or relative path)
  cacheDir?: string;

  // Clear Deno's module cache before importing
  clearDenoCache?: boolean;
}
```

### Type Guards

The module also exports type guards for runtime validation:

```typescript
import {
  ImportMapImporter,
  isImportMap,
  isImports,
  isScopes,
} from "@lambdalisue/import-map-importer";

// Validate import map structure
const data: unknown = {
  imports: { "lodash": "https://cdn.skypack.dev/lodash" },
};
if (isImportMap(data)) {
  const importer = new ImportMapImporter(data);
}
```

## Performance Tips

1. **Reuse Importer Instances** - Create one importer and reuse it for multiple
   imports
2. **Use Absolute URLs** - Prefer absolute URLs in import maps for better
   caching
3. **Batch Imports** - Import multiple modules in parallel when possible

```typescript ignore
import { ImportMapImporter } from "@lambdalisue/import-map-importer";

const importMap = {
  imports: {
    "lodash": "https://cdn.skypack.dev/lodash",
  },
};

const importer = new ImportMapImporter(importMap);

// Good - parallel imports
const [moduleA, moduleB] = await Promise.all([
  importer.import("./a.ts"),
  importer.import("./b.ts"),
]);

// Less optimal - sequential imports
const moduleA2 = await importer.import("./a.ts");
const moduleB2 = await importer.import("./b.ts");
```

## Limitations

- Only processes static imports (not dynamic `import()` expressions in the
  initial transformation)
- Remote modules must be accessible via fetch
- Import maps must be known at initialization time

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major
changes, please open an issue first to discuss what you would like to change.

### Development

```bash
# Run tests
deno test -A

# Run linter
deno lint

# Run formatter
deno fmt

# Run type checking
deno check **/*.ts
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE)
file for details.
