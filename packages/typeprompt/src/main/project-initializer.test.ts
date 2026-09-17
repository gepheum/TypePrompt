import { describe, it } from "mocha";

import { compile } from "@typeprompt/core/compiler/compiler.js";
import { parseConfigYaml } from "@typeprompt/core/config/config-parser.js";
import {
  DEFAULT_CONFIG_YAML,
  HELLO_WORLD_TEMPLATE,
} from "./project-initializer.js";

describe("DEFAULT_CONFIG_YAML", () => {
  it("parses as a valid config", () => {
    const result = parseConfigYaml(DEFAULT_CONFIG_YAML);
    if (result.kind !== "success") {
      throw new Error(result.errors.map((e) => e.message).join("\n"));
    }
  });
});

describe("HELLO_WORLD_TEMPLATE", () => {
  it("compiles without errors", () => {
    const result = compile(
      { "hello-world.xml": HELLO_WORLD_TEMPLATE },
      { cache: null },
    );
    if (result.anyErrors) {
      const messages = Object.values(result.finalErrors)
        .flat()
        .map((e) => e.message)
        .join("\n");
      throw new Error(messages);
    }
  });
});
