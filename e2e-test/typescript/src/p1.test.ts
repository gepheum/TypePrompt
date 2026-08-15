import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { newPrompts, type $, type ToolImpls } from "./gen/prompts-p1.js";

const prompts = newPrompts();
const prompt = prompts.myTemplate.render({
  firstName: "John",
  lastName: "Doe",
});

describe("newPromptMaker", () => {
  describe("meta", () => {
    it("is populated from the template content", () => {
      expect(prompt.meta).toMatch({ temperature: 0.7, foobar: "bar" });
    });
  });

  describe("systemMessage", () => {
    it("resolves snippet references and concatenates text pieces", () => {
      expect(prompt.systemMessage).toMatch(
        "Hello,\n\n\nHow many characters are in your full name?",
      );
    });
  });

  describe("userMessage", () => {
    it("interpolates input properties into text pieces", () => {
      expect(prompt.userMessage).toMatch(
        [
          "Your firstName is: John",
          "Your lastName is: Doe",
          "",
          'For example {"firstName": "Bo", "lastName": "Zo"}',
        ].join("\n"),
      );
    });
  });

  describe("tools", () => {
    it("exposes myTool with the correct name and description", () => {
      expect(prompt.tools.myTool).toMatch({
        name: "myTool",
        description: "A tool that does something",
      });
    });
  });

  describe("isToolName", () => {
    it("returns true for a declared tool name", () => {
      expect(prompt.isToolName("myTool")).toMatch(true);
    });

    it("returns false for an undeclared name", () => {
      expect(prompt.isToolName("unknown")).toMatch(false);
    });
  });

  describe("outputFormat", () => {
    it("reflects the outputFormat declared in the template", () => {
      expect(prompt.outputFormat).toMatch({ kind: "json" });
    });
  });

  describe("parseResponse", () => {
    it("returns the raw string when output format is json", () => {
      expect(prompt.parseResponse('{ "x" : 42 }')).toMatch({ x: 42 });
      expect(prompt.parseResponse('```\n{ "x" : 42 }\n```')).toMatch({ x: 42 });
      expect(prompt.parseResponse('```json\n{ "x" : 42 }\n```')).toMatch({
        x: 42,
      });
    });
  });

  describe("examples", () => {
    it("produces one example per entry in the template data", () => {
      expect(prompt.examples.length).toMatch(2);
    });

    it("resolves each example's user message from the input", () => {
      expect(prompt.examples[0]!.userMessage).toMatch(
        [
          "Your firstName is: John",
          "Your lastName is: Doe",
          "",
          'For example {"firstName": "Bo", "lastName": "Zo"}',
        ].join("\n"),
      );
      expect(prompt.examples[1]!.userMessage).toMatch(
        [
          "Your firstName is: Jane",
          "Your lastName is: Smith",
          "",
          'For example {"firstName": "Bo", "lastName": "Zo"}',
        ].join("\n"),
      );
    });

    it("resolves intermediate tool call steps with stringified i/o", () => {
      expect(prompt.examples[0]!.intermediateSteps).toMatch([
        {
          toolCalls: [
            {
              callId: "myCall",
              toolName: "myTool",
              stringifiedInput: '{"foo":"hello"}',
              stringifiedOutput: '{"bar":"world"}',
            },
          ],
        },
      ]);
    });

    it("produces an empty intermediateSteps array when there are none", () => {
      expect(prompt.examples[1]!.intermediateSteps).toMatch([]);
    });
  });

  describe("callTools", () => {
    const impls = {
      myTool: async ({ foo }: $.Main.MyTool.Input) => ({
        bar: foo.toUpperCase(),
      }),
    } as unknown as ToolImpls<"Main:MyTemplate">;

    it("calls the impl and returns stringified output", async () => {
      const result = await prompt.callTools(
        [
          {
            callId: "c1",
            toolName: "myTool",
            stringifiedInput: '{"foo":"hello"}',
          },
        ],
        impls,
      );
      expect(result).toMatch([
        { callId: "c1", stringifiedOutput: '{"bar":"HELLO"}' },
      ]);
    });

    it("throws when the tool input fails schema validation", async () => {
      let threw = false;
      try {
        await prompt.callTools(
          // foo must be a string, not a number
          [
            {
              callId: "c1",
              toolName: "myTool",
              stringifiedInput: '{"foo":42}',
            },
          ],
          impls,
        );
      } catch {
        threw = true;
      }
      expect(threw).toMatch(true);
    });

    it("throws when the tool name is not registered", async () => {
      let threw = false;
      try {
        await prompt.callTools(
          [{ callId: "c1", toolName: "noSuchTool", stringifiedInput: "{}" }],
          impls,
        );
      } catch {
        threw = true;
      }
      expect(threw).toMatch(true);
    });
  });
});
