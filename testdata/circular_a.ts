import { getNameB } from "@example/circular-b";

export function getName() {
  return "circular-a";
}

export function getFullName() {
  return `${getName()}-${getNameB()}`;
}
