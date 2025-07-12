import { createGraph, init } from "@deno/graph";
import {
  findMissingImports,
  type Replacement,
} from "./find_missing_imports.ts";

let denoGraphInitialized = false;

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
  // Wait for initialization to complete
  if (!denoGraphInitialized) {
    await init();
    denoGraphInitialized = true;
  }

  // Create a graph for the given specifier/content module.
  // We override the `load` function to return the content for the specified module only
  // and ignore other modules to avoid unnecessary loading.
  const graph = await createGraph(specifier, {
    load: (requestedSpecifier) => {
      if (requestedSpecifier === specifier) {
        return Promise.resolve({
          kind: "module",
          specifier,
          content: new TextEncoder().encode(sourceCode),
        });
      }
      // We don't need to load other modules for this operation,
      return Promise.resolve(undefined);
    },
  });

  const replacements: Replacement[] = [];
  const dependencies =
    graph.modules.find((module) => module.specifier === specifier)
      ?.dependencies ?? [];

  // Build a map of specifiers to their replacements
  const specifierReplacements = new Map<string, string>();

  for (const dependency of dependencies) {
    // Skip remote specifiers as we don't process them
    if (isRemoteSpecifier(dependency.specifier)) {
      continue;
    }

    const newSpecifier = replacer(dependency.specifier);
    if (dependency.specifier !== newSpecifier) {
      specifierReplacements.set(dependency.specifier, newSpecifier);

      if (dependency.code?.span) {
        replacements.push({
          startLine: dependency.code.span.start.line,
          startChar: dependency.code.span.start.character,
          endLine: dependency.code.span.end.line,
          endChar: dependency.code.span.end.character,
          specifier: dependency.specifier,
          newSpecifier,
        });
      }

      if (dependency.type?.span) {
        replacements.push({
          startLine: dependency.type.span.start.line,
          startChar: dependency.type.span.start.character,
          endLine: dependency.type.span.end.line,
          endChar: dependency.type.span.end.character,
          specifier: dependency.specifier,
          newSpecifier,
        });
      }
    }
  }

  // Find and replace any additional occurrences that deno graph might have missed
  // This handles cases where the same import specifier appears multiple times
  // Note: This only processes local specifiers, not remote URLs
  const missingImports = findMissingImports(
    sourceCode,
    specifierReplacements,
    replacements,
  );
  replacements.push(...missingImports);

  if (replacements.length === 0) {
    return sourceCode;
  }

  const lines = sourceCode.split("\n");

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

// Check if the specifier is a URL or starts with a protocol
function isRemoteSpecifier(specifier: string): boolean {
  return /^(https?:|data:|npm:|jsr:)/i.test(specifier);
}
