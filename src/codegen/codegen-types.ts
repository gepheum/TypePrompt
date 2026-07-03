import type { Config } from "../config/config-parser.js";
import type { Templates } from "../template/template-types.js";

export type OutputFile = {
  readonly path: string;
  readonly content: string;
}

export type CodeGenerator = (templates: Templates, config: Config) => readonly OutputFile[];
