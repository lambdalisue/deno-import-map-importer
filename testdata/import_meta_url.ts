// Test file to verify import.meta.url handling
export const currentUrl = import.meta.url;
export const dirname = new URL(".", import.meta.url).pathname;

export function getRelativePath(path: string): string {
  return new URL(path, import.meta.url).href;
}

export const metadata = {
  url: import.meta.url,
  protocol: new URL(import.meta.url).protocol,
  pathname: new URL(import.meta.url).pathname,
};