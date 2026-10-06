import type { Template, Tool } from "./compiler-types.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";

export function getId(input: Template | Tool): string {
  return [input.namespace?.text ?? DEFAULT_NAMESPACE, input.name.text].join(
    ":",
  );
}
