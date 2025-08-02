// Test file that uses all import.meta properties
export const metaUrl = import.meta.url;
export const metaFilename = import.meta.filename;
export const metaDirname = import.meta.dirname;

export function getFileInfo() {
  return {
    url: import.meta.url,
    filename: import.meta.filename,
    dirname: import.meta.dirname,
    basename: import.meta.filename.split(/[/\\]/).pop(),
  };
}

// Use in expressions
export const isTypeScript = import.meta.filename.endsWith(".ts");
export const parentDir = import.meta.dirname.split(/[/\\]/).pop();

// Use in path construction
export const dataPath = import.meta.dirname + "/data";
export const configPath = `${import.meta.dirname}/config.json`;