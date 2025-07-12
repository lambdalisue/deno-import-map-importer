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

  // Pre-process existing replacements into a Set for O(1) lookup
  const existingReplacementKeys = new Set(
    existingReplacements.map((r) =>
      `${r.startLine}:${r.startChar}:${r.endChar}`
    ),
  );

  // Pre-calculate line offsets for efficient position conversion
  const lineOffsets = getLineOffsets(sourceCode);

  const additionalReplacements: Replacement[] = [];
  const importExportRegex = createImportExportRegex();

  let match;
  while ((match = importExportRegex.exec(sourceCode)) !== null) {
    const replacement = processMatch(
      match,
      specifierReplacements,
      lineOffsets,
      existingReplacementKeys,
    );

    if (replacement) {
      additionalReplacements.push(replacement);
    }
  }

  return additionalReplacements;
}

/**
 * Creates the regex for matching import/export statements.
 */
function createImportExportRegex(): RegExp {
  return /(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*|[\w$]+)(?:\s*,\s*(?:\{[^}]*\}|\*|[\w$]+))*\s+from\s+(['"])([^'"]+)\1/gs;
}

/**
 * Pre-calculates line offsets for efficient absolute-to-line/char conversion.
 */
function getLineOffsets(sourceCode: string): number[] {
  const offsets = [0];
  let currentOffset = 0;

  for (let i = 0; i < sourceCode.length; i++) {
    if (sourceCode[i] === "\n") {
      currentOffset = i + 1;
      offsets.push(currentOffset);
    }
  }

  return offsets;
}

/**
 * Processes a regex match and returns a replacement if needed.
 */
function processMatch(
  match: RegExpExecArray,
  specifierReplacements: Map<string, string>,
  lineOffsets: number[],
  existingReplacementKeys: Set<string>,
): Replacement | null {
  const fullMatch = match[0];
  const quote = match[1];
  const specifier = match[2];

  const newSpec = specifierReplacements.get(specifier);
  if (!newSpec) {
    return null;
  }

  // Find the position of the quoted specifier
  const quotedSpecifier = quote + specifier + quote;
  const specifierIndex = fullMatch.lastIndexOf(quotedSpecifier);
  if (specifierIndex === -1) {
    return null;
  }

  const absoluteStart = match.index + specifierIndex;
  const absoluteEnd = absoluteStart + quotedSpecifier.length;

  // Convert to line/char using pre-calculated offsets
  const position = absoluteToLineChar(absoluteStart, absoluteEnd, lineOffsets);

  if (!position) {
    return null;
  }

  const { startLine, startChar, endChar } = position;
  const key = `${startLine}:${startChar}:${endChar}`;

  if (existingReplacementKeys.has(key)) {
    return null;
  }

  return {
    startLine,
    startChar,
    endLine: startLine,
    endChar,
    specifier,
    newSpecifier: newSpec,
  };
}

/**
 * Converts absolute positions to line/char positions using pre-calculated offsets.
 */
function absoluteToLineChar(
  absoluteStart: number,
  absoluteEnd: number,
  lineOffsets: number[],
): { startLine: number; startChar: number; endChar: number } | null {
  // Binary search for the line containing absoluteStart
  let left = 0;
  let right = lineOffsets.length - 1;

  while (left < right) {
    const mid = Math.floor((left + right + 1) / 2);
    if (lineOffsets[mid] <= absoluteStart) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }

  const startLine = left;
  const startChar = absoluteStart - lineOffsets[startLine];
  const endChar = absoluteEnd - lineOffsets[startLine];

  return { startLine, startChar, endChar };
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
