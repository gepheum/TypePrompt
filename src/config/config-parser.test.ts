// import { expect } from "buckwheat";
// import { describe, it } from "mocha";

// import { type ConfigParseResult, parseConfigYaml } from "./config-parser.js";

// function expectConfigParseError(
//   result: ConfigParseResult,
//   messagePattern: RegExp,
// ): void {
//   if (result.ok) {
//     throw new Error("Expected parse error but got success");
//   }
//   expect(result.messages.join("\n")).toMatch(messagePattern);
// }

// describe("parseConfigYaml", () => {
//   it("parses a minimal config with enabled typescript codegen", () => {
//     const result = parseConfigYaml({
//       content: [
//         "gen:",
//         "  typescript:",
//         "    enabled: true",
//         "    file: out/prompts.ts",
//       ].join("\n"),
//       path: "config.yml",
//     });

//     if (!result.ok) throw new Error(result.messages.join("\n"));
//     expect(result.config).toMatch({
//       gen: { typescript: { enabled: true, file: "out/prompts.ts" } },
//     });
//   });

//   it("parses all fields", () => {
//     const result = parseConfigYaml({
//       content: [
//         "input: prompts/*.tp",
//         "gen:",
//         "  typescript:",
//         "    enabled: true",
//         "    file: out/prompts.ts",
//         "  python:",
//         "    enabled: true",
//         "    file: out/prompts.py",
//       ].join("\n"),
//       path: "config.yml",
//     });

//     if (!result.ok) throw new Error(result.messages.join("\n"));
//     expect(result.config).toMatch({
//       input: "prompts/*.tp",
//       gen: {
//         typescript: { enabled: true, file: "out/prompts.ts" },
//         python: { enabled: true, file: "out/prompts.py" },
//       },
//     });
//   });

//   it("accepts enabled: false without a file", () => {
//     const result = parseConfigYaml({
//       content: ["gen:", "  typescript:", "    enabled: false"].join("\n"),
//       path: "config.yml",
//     });
//     if (!result.ok) throw new Error(result.messages.join("\n"));
//     expect(result.config).toMatch({ gen: { typescript: { enabled: false } } });
//   });

//   it("fails with line number on invalid YAML syntax", () => {
//     expectConfigParseError(
//       parseConfigYaml({ content: "input: [unclosed", path: "config.yml" }),
//       /config\.yml:\d+:\d+:/,
//     );
//   });

//   it("fails with line number on unknown fields", () => {
//     expectConfigParseError(
//       parseConfigYaml({ content: "outputPath: x", path: "config.yml" }),
//       /config\.yml:\d+:\d+:.*unknown config field\(s\): 'outputPath'/,
//     );
//   });

//   it("fails with line number on wrong field type", () => {
//     expectConfigParseError(
//       parseConfigYaml({ content: "input: 123", path: "config.yml" }),
//       /config\.yml:\d+:\d+:.*invalid value for 'input'/,
//     );
//   });
// });
