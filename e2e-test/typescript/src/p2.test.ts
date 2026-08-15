import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { newPrompts, type $, type ToolExecutor } from "./gen/prompts-p2.js";

const prompts = newPrompts();
const mainPrompt = prompts.main.myTemplate.render(42);
const geoPrompt = prompts.geo.myTemplate.render("hello");

describe("newPrompts (p2)", () => {
  describe("namespace structure", () => {
    it("exposes templates nested under their namespace", () => {
      expect(typeof prompts.main.myTemplate.render).toMatch("function");
      expect(typeof prompts.geo.myTemplate.render).toMatch("function");
    });
  });

  describe("Main:MyTemplate", () => {
    describe("meta", () => {
      it("is undefined when not declared in the template", () => {
        expect(mainPrompt.meta as unknown).toMatch(undefined);
      });
    });

    describe("systemMessage", () => {
      it("resolves text pieces", () => {
        expect(mainPrompt.systemMessage).toMatch("Hello");
      });
    });

    describe("userMessage", () => {
      it("resolves text pieces", () => {
        expect(mainPrompt.userMessage).toMatch("workd");
      });
    });

    describe("tools", () => {
      it("exposes myTool with the correct name and description", () => {
        expect(mainPrompt.tools.myTool).toMatch({
          name: "myTool",
          description: "A tool that does something",
        });
      });
    });

    describe("isToolName", () => {
      it("returns true for a declared tool name", () => {
        expect(mainPrompt.isToolName("myTool")).toMatch(true);
      });

      it("returns false for an undeclared name", () => {
        expect(mainPrompt.isToolName("unknown")).toMatch(false);
      });
    });

    describe("outputFormat", () => {
      it("is json", () => {
        expect(mainPrompt.outputFormat).toMatch({ kind: "json" });
      });
    });

    describe("parseResponse", () => {
      it("parses a json object", () => {
        expect(mainPrompt.parseResponse('{"foo":"bar"}')).toMatch({
          foo: "bar",
        });
      });

      it("strips plain code fences", () => {
        expect(mainPrompt.parseResponse('```\n{"foo":"bar"}\n```')).toMatch({
          foo: "bar",
        });
      });
    });

    describe("examples", () => {
      it("produces no examples (none defined in the template)", () => {
        expect(mainPrompt.examples.length).toMatch(0);
      });
    });

    describe("templateId", () => {
      it("is Main:MyTemplate", () => {
        expect(mainPrompt.templateId).toMatch("Main:MyTemplate");
      });
    });

    describe("templateInput", () => {
      it("reflects the validated input", () => {
        expect(mainPrompt.templateInput).toMatch(42);
      });
    });

    describe("executeTools", () => {
      const executor = {
        myTool: async (_input: $.Main.MyTool.Input) => 99,
      } satisfies ToolExecutor<"Main:MyTemplate">;

      it("calls the executor and returns stringified output", async () => {
        const result = await mainPrompt.executeTools(
          [
            {
              callId: "c1",
              toolName: "myTool",
              stringifiedInput: '{"foo":"bar"}',
            },
          ],
          executor,
        );
        expect(result).toMatch([{ callId: "c1", stringifiedOutput: "99" }]);
      });

      it("throws when the tool name is not registered", async () => {
        let threw = false;
        try {
          await mainPrompt.executeTools(
            [{ callId: "c1", toolName: "noSuchTool", stringifiedInput: "{}" }],
            executor,
          );
        } catch {
          threw = true;
        }
        expect(threw).toMatch(true);
      });

      it("throws when the tool output fails schema validation", async () => {
        const badExecutor = {
          myTool: async (_input: $.Main.MyTool.Input) =>
            3.14 as unknown as number, // int32 required
        } satisfies ToolExecutor<"Main:MyTemplate">;
        let threw = false;
        try {
          await mainPrompt.executeTools(
            [
              {
                callId: "c1",
                toolName: "myTool",
                stringifiedInput: "{}",
              },
            ],
            badExecutor,
          );
        } catch {
          threw = true;
        }
        expect(threw).toMatch(true);
      });
    });
  });

  describe("Geo:MyTemplate", () => {
    describe("meta", () => {
      it("is undefined when not declared in the template", () => {
        expect(geoPrompt.meta as unknown).toMatch(undefined);
      });
    });

    describe("systemMessage", () => {
      it("resolves text pieces", () => {
        expect(geoPrompt.systemMessage).toMatch("Hello");
      });
    });

    describe("userMessage", () => {
      it("resolves text pieces", () => {
        expect(geoPrompt.userMessage).toMatch("workd");
      });
    });

    describe("tools", () => {
      it("has no tools", () => {
        expect(Object.keys(geoPrompt.tools).length).toMatch(0);
      });
    });

    describe("outputFormat", () => {
      it("is json", () => {
        expect(geoPrompt.outputFormat).toMatch({ kind: "json" });
      });
    });

    describe("parseResponse", () => {
      it("parses a json object", () => {
        expect(geoPrompt.parseResponse('{"x":1}')).toMatch({ x: 1 });
      });
    });

    describe("examples", () => {
      it("produces no examples", () => {
        expect(geoPrompt.examples.length).toMatch(0);
      });
    });

    describe("templateId", () => {
      it("is Geo:MyTemplate", () => {
        expect(geoPrompt.templateId).toMatch("Geo:MyTemplate");
      });
    });

    describe("templateInput", () => {
      it("reflects the validated input", () => {
        expect(geoPrompt.templateInput).toMatch("hello");
      });
    });

    describe("executeTools", () => {
      it("returns an empty array when called with no tool calls", async () => {
        const result = await geoPrompt.executeTools([], {});
        expect(result).toMatch([]);
      });
    });
  });

  describe("input validation", () => {
    it("Main:MyTemplate rejects non-integer input", () => {
      let threw = false;
      try {
        prompts.main.myTemplate.render(3.14 as unknown as number);
      } catch {
        threw = true;
      }
      expect(threw).toMatch(true);
    });

    it("Geo:MyTemplate rejects non-string input", () => {
      let threw = false;
      try {
        prompts.geo.myTemplate.render(42 as unknown as string);
      } catch {
        threw = true;
      }
      expect(threw).toMatch(true);
    });
  });
});
