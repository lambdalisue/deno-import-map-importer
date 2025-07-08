import { createGraph, init } from "@deno/graph";

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

  for (const dependency of dependencies) {
    const newSpecifier = replacer(dependency.specifier);

    if (dependency.specifier !== newSpecifier) {
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

/**
 * Represents a text replacement operation for an import specifier.
 *
 * Contains the location information and the original/new specifier values
 * for performing precise text replacements in source code.
 */
type Replacement = {
  /** Zero-based line number where the import specifier starts */
  startLine: number;
  /** Zero-based character position where the import specifier starts */
  startChar: number;
  /** Zero-based line number where the import specifier ends */
  endLine: number;
  /** Zero-based character position where the import specifier ends */
  endChar: number;
  /** The original import specifier to be replaced */
  specifier: string;
  /** The new import specifier to replace with */
  newSpecifier: string;
};
