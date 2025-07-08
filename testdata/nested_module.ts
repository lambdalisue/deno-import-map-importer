import { dep1Value } from "@example/dep1";
import { dep2Value } from "@example/dep2";

export function getValue() {
  return `nested-${dep1Value()}-${dep2Value()}`;
}
