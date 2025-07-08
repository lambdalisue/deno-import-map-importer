import { createGraph, init } from "@deno/graph";

let denoGraphInitialized = false;

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

type Replacement = {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
  specifier: string;
  newSpecifier: string;
};
