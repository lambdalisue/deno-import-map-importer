import { getName } from "@example/circular-a";

export function getNameB() {
  return "circular-b";
}

export function getFullNameB() {
  return `${getNameB()}-${getName()}`;
}
