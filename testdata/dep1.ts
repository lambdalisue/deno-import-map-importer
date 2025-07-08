import { sharedValue } from "@example/shared";

export function dep1Value() {
  return `dep1-${sharedValue}`;
}
