import { CompilationResult, Template } from "../compiler/compiler-types.js";
import * as Spec from "./runtime-types.js";

export function makeTemplates(input: CompilationResult): Spec.Templates {
  
}

function makeTemplate(input: Template): Spec.Template {
  return {
    name: input.name.text,
    namespace: input.namespace?.text ?? "Default",
    
  };
}
