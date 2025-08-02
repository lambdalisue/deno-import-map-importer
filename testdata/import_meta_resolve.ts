// Test file to understand import.meta.resolve() behavior
export const resolvedUrl = import.meta.resolve("./dep1.ts");
export const resolvedRelative = import.meta.resolve("../testdata/dep2.ts");
export const resolvedBare = import.meta.resolve("@std/path");

export function resolveCustom(path: string) {
  return import.meta.resolve(path);
}

// Use in various contexts
export const resolvedInExpression = new URL(import.meta.resolve("./data.json"));
export const resolvedArray = [
  import.meta.resolve("./file1.ts"),
  import.meta.resolve("./file2.ts"),
];

// Dynamic resolution
export async function resolveDynamic(moduleName: string) {
  const url = import.meta.resolve(moduleName);
  return url;
}