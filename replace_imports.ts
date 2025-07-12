import { createGraph, init } from "@deno/graph";
import {
  findMissingImports,
  type Replacement,
} from "./find_missing_imports.ts";

// Module-level initialization state
let denoGraphInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Ensures Deno graph is initialized before use.
 */
async function ensureDenoGraphInitialized(): Promise<void> {
  if (denoGraphInitialized) return;

  if (!initializationPromise) {
    initializationPromise = init().then(() => {
      denoGraphInitialized = true;
    });
  }

  await initializationPromise;
}

/**
 * Replaces import specifiers in source code using a custom replacer function.
 *
 * This function parses the source code to find all import statements (both regular
 * imports and type imports) and replaces their specifiers using the provided
 * replacer function. It preserves the exact formatting and structure of the
 * original source code.
 *
 * @param specifier - The module specifier (typically a file path or URL) of the source code
 * @param sourceCode - The source code containing import statements to be processed
 * @param replacer - A function that takes an import specifier and returns the replacement specifier
 * @returns The source code with all import specifiers replaced according to the replacer function
 *
 * @example
 * ```typescript
 * const source = `
 * import { readFile } from "node:fs";
 * import lodash from "lodash";
 * `;
 *
 * const result = await replaceImports(
 *   "file:///src/app.ts",
 *   source,
 *   (spec) => spec === "lodash" ? "https://cdn.skypack.dev/lodash" : spec
 * );
 * // Result will have lodash import replaced with the CDN URL
 * ```
 */
export async function replaceImports(
  specifier: string,
  sourceCode: string,
  replacer: (specifier: string) => string,
): Promise<string> {
  // Ensure Deno graph is initialized
  await ensureDenoGraphInitialized();

  // Parse the module to extract import dependencies
  const graph = await createGraph(specifier, {
    load: createModuleLoader(specifier, sourceCode),
  });

  const targetModule = graph.modules.find((m) => m.specifier === specifier);
  if (!targetModule?.dependencies) {
    return sourceCode;
  }

  const { replacements, specifierReplacements } = collectReplacements(
    targetModule.dependencies,
    replacer,
  );

  // Find additional occurrences missed by deno graph
  const missingImports = findMissingImports(
    sourceCode,
    specifierReplacements,
    replacements,
  );

  const allReplacements = [...replacements, ...missingImports];

  if (allReplacements.length === 0) {
    return sourceCode;
  }

  return applyReplacements(sourceCode, allReplacements);
}

/**
 * Creates a module loader function for deno graph.
 */
function createModuleLoader(specifier: string, sourceCode: string) {
  const encoder = new TextEncoder();
  return (requestedSpecifier: string) => {
    if (requestedSpecifier === specifier) {
      return Promise.resolve({
        kind: "module" as const,
        specifier,
        content: encoder.encode(sourceCode),
      });
    }
    return Promise.resolve(undefined);
  };
}

/**
 * Collects all replacements from module dependencies.
 */
function collectReplacements(
  dependencies: Array<
    {
      specifier: string;
      code?: {
        span: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
      };
      type?: {
        span: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
      };
    }
  >,
  replacer: (specifier: string) => string,
) {
  const replacements: Replacement[] = [];
  const specifierReplacements = new Map<string, string>();

  for (const dependency of dependencies) {
    // Skip remote specifiers as we don't process them
    if (isRemoteSpecifier(dependency.specifier)) {
      continue;
    }

    const newSpecifier = replacer(dependency.specifier);
    if (dependency.specifier === newSpecifier) {
      continue;
    }

    specifierReplacements.set(dependency.specifier, newSpecifier);

    // Add code import replacement
    if (dependency.code?.span) {
      replacements.push(createReplacement(
        dependency.code.span,
        dependency.specifier,
        newSpecifier,
      ));
    }

    // Add type import replacement
    if (dependency.type?.span) {
      replacements.push(createReplacement(
        dependency.type.span,
        dependency.specifier,
        newSpecifier,
      ));
    }
  }

  return { replacements, specifierReplacements };
}

/**
 * Creates a Replacement object from a span.
 */
function createReplacement(
  span: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  },
  specifier: string,
  newSpecifier: string,
): Replacement {
  return {
    startLine: span.start.line,
    startChar: span.start.character,
    endLine: span.end.line,
    endChar: span.end.character,
    specifier,
    newSpecifier,
  };
}

/**
 * Applies replacements to source code.
 */
function applyReplacements(
  sourceCode: string,
  replacements: Replacement[],
): string {
  const lines = sourceCode.split("\n");

  // Sort replacements in reverse order to avoid offset issues
  replacements.sort((a, b) =>
    a.startLine !== b.startLine
      ? b.startLine - a.startLine
      : b.startChar - a.startChar
  );

  for (const replacement of replacements) {
    const line = lines[replacement.startLine];
    lines[replacement.startLine] = line.substring(0, replacement.startChar) +
      `"${replacement.newSpecifier}"` +
      line.substring(replacement.endChar);
  }

  return lines.join("\n");
}

/**
 * Checks if the specifier is a remote URL.
 */
function isRemoteSpecifier(specifier: string): boolean {
  return /^(https?:|data:|npm:|jsr:)/i.test(specifier);
}
