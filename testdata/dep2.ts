import { sharedValue } from "@example/shared";

export function dep2Value() {
  return `dep2-${sharedValue}`;
}
