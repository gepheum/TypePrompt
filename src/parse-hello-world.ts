// Run with: node --import tsx src/parse-hello-world.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseTemplateFile } from "./template/template-parser.js";

const path = resolve(import.meta.dirname, "../e2e-test/prompts/hello_world.xml");
const content = readFileSync(path, "utf8");
const result = parseTemplateFile({ path, content });
console.log(JSON.stringify(result, null, 2));
