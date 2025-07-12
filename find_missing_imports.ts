/**
 * Finds import/export occurrences that were missed by deno graph.
 *
 * Deno graph consolidates multiple imports of the same specifier, tracking at most
 * one "code" import and one "type" import. This function finds additional occurrences
 * that need to be replaced, particularly:
 * - Multiple type imports of the same module
 * - Export statements (export {...} from, export * from)
 * - Duplicate imports that deno graph consolidated
 *
 * @param sourceCode - The source code to search
 * @param specifierReplacements - Map of original specifiers to their replacements
 * @param existingReplacements - Replacements already found by deno graph
 * @returns Additional replacements that need to be made
 */
export function findMissingImports(
  sourceCode: string,
  specifierReplacements: Map<string, string>,
  existingReplacements: Replacement[],
): Replacement[] {
  if (specifierReplacements.size === 0) {
    return [];
  }

  const additionalReplacements: Replacement[] = [];

  // Use regex to find all import/export statements, including multiline ones
  const importExportRegex =
    /(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*|[\w$]+)(?:\s*,\s*(?:\{[^}]*\}|\*|[\w$]+))*\s+from\s+(['"])([^'"]+)\1/gs;

  let match;
  while ((match = importExportRegex.exec(sourceCode)) !== null) {
    const fullMatch = match[0];
    const quote = match[1];
    const specifier = match[2];

    // Check if we have a replacement for this specifier
    const newSpec = specifierReplacements.get(specifier);
    if (!newSpec) {
      continue;
    }

    // Find the position of the quoted specifier within the match
    const quotedSpecifier = quote + specifier + quote;
    const specifierIndex = fullMatch.lastIndexOf(quotedSpecifier);
    if (specifierIndex === -1) {
      continue;
    }

    // Calculate the absolute position in the source code
    const absoluteStart = match.index + specifierIndex;
    const absoluteEnd = absoluteStart + quotedSpecifier.length;

    // Convert absolute positions to line and character positions
    let currentPos = 0;
    const lines = sourceCode.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length + 1; // +1 for newline

      if (currentPos + lineLength > absoluteStart) {
        // Found the line containing the start
        const startChar = absoluteStart - currentPos;
        const endChar = absoluteEnd - currentPos;

        // Check if this replacement already exists
        const exists = existingReplacements.some((r) =>
          r.startLine === i &&
          r.startChar === startChar &&
          r.endChar === endChar
        );

        if (!exists) {
          additionalReplacements.push({
            startLine: i,
            startChar,
            endLine: i,
            endChar,
            specifier,
            newSpecifier: newSpec,
          });
        }
        break;
      }

      currentPos += lineLength;
    }
  }

  return additionalReplacements;
}

/**
 * Represents a text replacement operation for an import specifier.
 */
export type Replacement = {
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
