import type { Inferences, Lsp } from "@typeprompt/core";

export const mockValidProjectWithKeys: Lsp.WireProject = {
  folderUri: "file:///workspace",
  compilationResult: {
    edition: 1,
    signature: undefined,
    warnings: {},
    timestampMillis: Date.now(),
    sourceFiles: {
      "prompts/SummarizeDocument.play.tp": {
        path: "prompts/SummarizeDocument.play.tp",
        hasErrors: false,
        entity: {
          kind: "playground",
          namespace: "Main",
          forTemplate: "SummarizeDocument",
        },
      },
    },
    templates: {
      "Main:SummarizeDocument": {
        id: "Main:SummarizeDocument",
        name: "SummarizeDocument",
        namespace: "Main",
        isValid: true,
        sourcePath: "prompts/SummarizeDocument.tp",
      },
    },
    tools: {},
    playgrounds: {
      "Main:SummarizeDocument": {
        id: "Main:SummarizeDocument",
        namespace: "Main",
        forTemplate: "SummarizeDocument",
        isValid: true,
        model: {
          model: "openai/gpt-4o",
          temperature: 0.2,
          maxTokens: 1024,
        },
        samples: [
          {
            name: "Quarterly Cloud Report",
            note: "Testing with real financial and engineering cloud cost breakdown",
            request: {
              systemMessage:
                "You are an expert document summarizer. Tailor your tone to the specified audience.",
              outputFormat: { format: "json", jsonSchema: {} },
              tools: [],
              messages: [
                {
                  role: "user",
                  input: {
                    title: "Q3 Cloud Infrastructure Review",
                    content:
                      "By rightsizing idle Kubernetes nodes and migrating cold analytics tables to tiered object storage, engineering reduced monthly cloud spend by $140,000 (22%) without impacting SLA targets.",
                    audience: "executive",
                  },
                  rendered:
                    'Please summarize the following document:\n{\n  "title": "Q3 Cloud Infrastructure Review",\n  "content": "By rightsizing idle Kubernetes nodes and migrating cold analytics tables to tiered object storage, engineering reduced monthly cloud spend by $140,000 (22%) without impacting SLA targets.",\n  "audience": "executive"\n}',
                },
              ],
            },
          },
          {
            name: "Security Audit Findings",
            request: {
              systemMessage:
                "You are an expert document summarizer. Tailor your tone to the specified audience.",
              outputFormat: { format: "text" },
              tools: [
                {
                  id: "lookupCVE",
                  name: "lookupCVE",
                  description: "Lookup Common Vulnerabilities and Exposures",
                  inputJsonSchema: {},
                },
              ],
              messages: [
                {
                  role: "user",
                  input: {
                    title: "Penetration Test Report",
                    content:
                      "A high-severity SSRF was discovered on the internal webhook proxy.",
                    audience: "technical",
                  },
                  rendered:
                    'Please summarize the following document:\n{\n  "title": "Penetration Test Report",\n  "content": "A high-severity SSRF was discovered on the internal webhook proxy.",\n  "audience": "technical"\n}',
                },
                {
                  role: "assistant",
                  rendered: "",
                  toolCalls: [
                    {
                      toolName: "lookupCVE",
                      callId: "call_981",
                      input: { query: "SSRF webhook proxy" },
                    },
                  ],
                },
                {
                  role: "tool",
                  rendered: "",
                  toolResults: [
                    {
                      toolName: "lookupCVE",
                      callId: "call_981",
                      output: {
                        cveId: "CVE-2026-3199",
                        severity: "High",
                        score: 8.6,
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
    anyErrors: false,
    finalErrors: {},
  },
  secrets: {
    kind: "success",
    secrets: {
      apiKeys: {
        openai: "sk-proj-...",
      },
    },
  },
};

export const mockProjectWithoutKeys: Lsp.WireProject = {
  ...mockValidProjectWithKeys,
  secrets: {
    kind: "success",
    secrets: {
      apiKeys: {},
    },
  },
};

export const mockProjectWithErrors: Lsp.WireProject = {
  ...mockValidProjectWithKeys,
  compilationResult: {
    ...mockValidProjectWithKeys.compilationResult,
    anyErrors: true,
  },
};

export const mockInferenceRun: Inferences.InferenceRun<Inferences.Pending> = {
  kind: "playground-inference-run",
  id: "x9K2p7mL",
  templateId: "Main:SummarizeDocument",
  isoTimestamp: new Date().toISOString(),
  model: {
    model: "openai/gpt-4o",
    temperature: 0.2,
    maxTokens: 1024,
  },
  templateFiles: {
    "prompts/SummarizeDocument.tp": `<template name="SummarizeDocument">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>
  <system>
    You are an expert document summarizer.
  </system>
</template>`,
  },
  inferences: [
    {
      sampleIndex: 0,
      sample: {
        name: "Quarterly Cloud Report",
        note: "Testing with real financial and engineering cloud cost breakdown",
        input: { title: "Q3 Report" },
      },
      request: {
        systemMessage: "You are an expert document summarizer.",
        outputFormat: { format: "json", jsonSchema: {} },
        tools: [],
        messages: [
          {
            role: "user",
            input: { title: "Q3 Report" },
            rendered: 'Please summarize: {"title":"Q3 Report"}',
          },
        ],
      },
      result: {
        kind: "success",
        response: {
          kind: "output",
          rawText:
            '{"summary":"Engineering reduced monthly spend by $140k (22%) by rightsizing nodes.","keyPoints":["Node rightsizing","Cold analytics tiered storage"],"readingTimeMinutes":1}',
          output: {
            summary:
              "Engineering reduced monthly spend by $140k (22%) by rightsizing nodes.",
            keyPoints: ["Node rightsizing", "Cold analytics tiered storage"],
            readingTimeMinutes: 1,
          },
        },
        reasoning:
          "Analyzing document content. Key metrics identified: $140,000 savings, 22% reduction, no SLA impact. Formulating concise executive summary.",
        telemetry: {
          latencyMs: 1420,
          usage: {
            inputTokens: 245,
            outputTokens: 78,
            totalTokens: 323,
            reasoningTokens: 42,
          },
        },
      },
    },
    {
      sampleIndex: 1,
      sample: {
        name: "Security Audit Findings",
        input: { title: "Security report" },
      },
      request: {
        systemMessage: "You are an expert document summarizer.",
        outputFormat: { format: "text" },
        tools: [],
        messages: [
          {
            role: "user",
            input: { title: "Security report" },
            rendered: "Please summarize security report.",
          },
        ],
      },
      result: {
        kind: "pending",
      },
    },
  ],
};
