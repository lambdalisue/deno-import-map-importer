import { fromFileUrl } from "@std/path/from-file-url";
import { dirname as pathDirname } from "@std/path/dirname";

/**
 * Replaces all occurrences of import.meta properties in source code with their original values.
 *
 * @param sourceCode - The source code to process
 * @param originalUrl - The original URL to replace import.meta.url with
 * @returns The source code with import.meta properties replaced
 */
export function replaceImportMeta(
  sourceCode: string,
  originalUrl: string,
): string {
  // Use JSON.stringify for robust escaping, then remove the quotes
  const escapedUrl = JSON.stringify(originalUrl).slice(1, -1);

  // Convert file URL to path for filename and dirname
  let filename = "";
  let dirname = "";

  if (originalUrl.startsWith("file://")) {
    // Use fromFileUrl to properly handle cross-platform paths
    filename = fromFileUrl(originalUrl);
    dirname = pathDirname(filename);

    // Use JSON.stringify for robust escaping, then remove the quotes
    filename = JSON.stringify(filename).slice(1, -1);
    dirname = JSON.stringify(dirname).slice(1, -1);
  }

  // Match import.meta.url with various whitespace patterns
  const importMetaUrlRegex = /\bimport\s*\.\s*meta\s*\.\s*url\b/g;

  // Match import.meta.filename
  const importMetaFilenameRegex = /\bimport\s*\.\s*meta\s*\.\s*filename\b/g;

  // Match import.meta.dirname
  const importMetaDirnameRegex = /\bimport\s*\.\s*meta\s*\.\s*dirname\b/g;

  // Match import.meta.resolve() - captures the argument
  const importMetaResolveRegex =
    /\bimport\s*\.\s*meta\s*\.\s*resolve\s*\(\s*([^)]+)\s*\)/g;

  // Replace all import.meta properties
  let result = sourceCode.replace(importMetaUrlRegex, `"${escapedUrl}"`);

  if (filename) {
    result = result.replace(importMetaFilenameRegex, `"${filename}"`);
  }

  if (dirname) {
    result = result.replace(importMetaDirnameRegex, `"${dirname}"`);
  }

  // Replace import.meta.resolve() with a new URL() expression
  result = result.replace(importMetaResolveRegex, (_match, arg) => {
    // Create a replacement that resolves the URL relative to the original module URL
    // Trim whitespace around the argument while preserving internal structure
    const trimmedArg = arg.trim();
    return `new URL(${trimmedArg}, "${escapedUrl}").href`;
  });

  return result;
}

/**
 * Creates a comment banner that indicates the original source file.
 * This helps developers understand where the cached file came from.
 *
 * @param originalUrl - The original URL of the source file
 * @returns A comment banner to prepend to the transformed code
 */
export function createOriginalUrlComment(originalUrl: string): string {
  return `// Original source: ${originalUrl}\n// This file has been transformed by ImportMapImporter\n// import.meta.url, import.meta.filename, import.meta.dirname, and import.meta.resolve() have been replaced\n\n`;
}
