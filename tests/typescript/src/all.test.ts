/**
 * Comprehensive tests covering all spec features across all example projects.
 */

import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { prompts as p01, templateOverrider as to01 } from "./gen/prompts-01.js";
import { prompts as p02, type Schema as Schema02 } from "./gen/prompts-02.js";
import {
  prompts as p03,
  type Schema as Schema03,
  type ToolExecutor as ToolExecutor03,
} from "./gen/prompts-03.js";
import { prompts as p04 } from "./gen/prompts-04.js";
import { prompts as p05 } from "./gen/prompts-05.js";
import { prompts as p06, type Schema as Schema06 } from "./gen/prompts-06.js";
import { prompts as p07 } from "./gen/prompts-07.js";
import {
  prompts as pe01,
  type Schema as SchemaE01,
} from "./gen/prompts-e01.js";

// ─── 01 Basics: text output, <enclosed>, examples ────────────────────────────

describe("01-basics / Translate", () => {
  const prompt = p01.translate.render({
    text: "Hello world",
    targetLanguage: "French",
  });

  it("has text output format", () => {
    expect(prompt.outputFormat).toMatch({ format: "text" });
  });

  it("sets templateId", () => {
    expect(prompt.templateId).toMatch("Main:Translate");
  });

  it("exposes validated templateInput", () => {
    expect(prompt.templateInput).toMatch({
      text: "Hello world",
      targetLanguage: "French",
    });
  });

  it("userMessage mentions target language", () => {
    expect(prompt.userMessage).toMatch(/French/);
  });

  it("<enclosed> renders correct tag in userMessage", () => {
    expect(prompt.userMessage).toMatch(/<Text>\s*Hello world\s*<\/Text>/);
  });

  it("systemMessage mentions translator role", () => {
    expect(prompt.systemMessage).toMatch(/professional translator/);
  });

  it("produces two examples", () => {
    expect(prompt.examples.length).toMatch(2);
  });

  it("first example response is translated string", () => {
    expect(prompt.examples[0]!.response).toMatch(/La réunion/);
  });

  it("example userMessage contains <enclosed> tag", () => {
    expect(prompt.examples[0]!.userMessage).toMatch(/<Text>/);
  });

  it("parseResponse returns the raw string for text format", () => {
    expect(prompt.parseResponse("Bonjour")).toMatch("Bonjour");
  });

  it("has no tools", () => {
    expect(Object.keys(prompt.tools).length).toMatch(0);
  });
});

// ─── 02 Complex Types: TriageTicket & GeneratePageTree ────────────────────────

describe("02-complex-types / TriageTicket", () => {
  const prompt = p02.triageTicket.render({
    subject: "App crashes on login",
    body: "It crashes every time.",
    customerTier: "pro",
    recentTickets: [],
  });

  it("has json output format", () => {
    expect(prompt.outputFormat).toMatch({ format: "json" });
    if (prompt.outputFormat.format === "json") {
      expect(prompt.outputFormat.jsonSchema).toMatch({
        type: "object",
        properties: {
          category: { $ref: "#/$defs/TicketCategory" },
          urgency: {
            enum: ["low", "medium", "high", "critical"],
          },
        },
        required: [
          "category",
          "urgency",
          "summary",
          "suggestedActions",
          "suggestedReply",
        ],
      });
    }
  });

  it("<c> content is rendered as plain text (XML tags stripped)", () => {
    expect(prompt.systemMessage).toMatch(/urgency/);
    expect(prompt.systemMessage).toMatch(/"critical"/);
    expect(prompt.systemMessage).toMatch(/^(?![\s\S]*<c>)/);
  });

  it("produces two examples", () => {
    expect(prompt.examples.length).toMatch(2);
  });

  it("first example response contains the JSON-encoded output category", () => {
    expect(prompt.examples[0]!.response).toMatch(/"technical-issue"/);
  });

  it("second example response contains the JSON-encoded output category", () => {
    expect(prompt.examples[1]!.response).toMatch(/"feature-request"/);
  });

  it("parseResponse parses JSON output", () => {
    const result = prompt.parseResponse(
      '{"category":"billing","urgency":"low","summary":"Invoice question","suggestedActions":[]}',
    );
    expect(result).toMatch({
      category: "billing",
      urgency: "low",
      summary: "Invoice question",
    });
  });

  it("parseResponse strips ```json code fences", () => {
    const result = prompt.parseResponse(
      '```json\n{"category":"other","urgency":"medium","summary":"test","suggestedActions":[]}\n```',
    );
    expect(result).toMatch({ category: "other" });
  });

  it("parseResponse strips ``` code fences", () => {
    const result = prompt.parseResponse(
      '```\n{"category":"other","urgency":"medium","summary":"test","suggestedActions":[]}\n```',
    );
    expect(result).toMatch({ category: "other" });
  });

  it("optional field suggestedReply is null when omitted from output", () => {
    const result = prompt.parseResponse(
      '{"category":"feature-request","urgency":"low","summary":"Dark mode","suggestedActions":["Log request"]}',
    );
    expect(result).toMatch({
      category: "feature-request",
      suggestedReply: null,
    });
  });

  it("userMessage contains the input rendered as YAML", () => {
    expect(prompt.userMessage).toMatch(/subject: App crashes on login/);
    expect(prompt.userMessage).toMatch(/customerTier: pro/);
  });

  it("userMessage contains YAML-rendered recentTickets", () => {
    const p = p02.triageTicket.render({
      subject: "Billing issue",
      body: "Overcharged",
      customerTier: "enterprise",
      recentTickets: [{ id: "T-1", summary: "Old issue", category: "billing" }],
    });
    expect(p.userMessage).toMatch(/id: T-1/);
    expect(p.userMessage).toMatch(/category: billing/);
  });

  it("meta contains the model and temperature declared in <meta>", () => {
    expect(prompt.meta).toMatch({
      model: "gpt-4o",
      temperature: 0.2,
    });
  });

  it("yaml: exact userMessage", () => {
    expect(prompt.userMessage).toMatch(
      "subject: App crashes on login\nbody: It crashes every time.\ncustomerTier: pro\nrecentTickets: []",
    );
  });
});

describe("02-complex-types / GeneratePageTree", () => {
  const provider: Schema02.GeneratePageTree.Provider = {
    name: "CloudX",
    region: "us-east",
    category: "compute",
    pricing: { model: "perHour", basePrice: 0.1, overage: null },
    benchmarks: [{ name: "throughput", score: 1000, unit: "rps" }],
    pros: ["fast", "reliable"],
    cons: ["pricey"],
  };

  const prompt = p02.generatePageTree.render({
    providers: [provider],
    useCase: "serving ML inference workloads",
    audience: "architect",
  });

  it("has json output format", () => {
    expect(prompt.outputFormat).toMatch({ format: "json" });
  });

  it("templateId is Main:GeneratePageTree", () => {
    expect(prompt.templateId).toMatch("Main:GeneratePageTree");
  });

  it("userMessage contains the use case (plain <insert val>)", () => {
    expect(prompt.userMessage).toMatch(/serving ML inference workloads/);
  });

  it("userMessage contains the provider name from toon-encoded data", () => {
    expect(prompt.userMessage).toMatch(/CloudX/);
  });

  it("userMessage mentions the target audience", () => {
    expect(prompt.userMessage).toMatch(/architect/);
  });

  it("has no tools", () => {
    expect(Object.keys(prompt.tools).length).toMatch(0);
  });

  it("toon: exact userMessage", () => {
    expect(prompt.userMessage).toMatch(
      "Generate a comparison page layout framed around this use case: serving ML inference workloads\n\nTarget audience: architect\n\nHere is the data for each provider:\n\n[1]:\n  - name: CloudX\n    region: us-east\n    category: compute\n    pricing:\n      model: perHour\n      basePrice: 0.1\n      overage: null\n    benchmarks[1]{name,score,unit}:\n      throughput,1000,rps\n    pros[2]: fast,reliable\n    cons[1]: pricey",
    );
  });

  it("parseResponse parses PageNode recursive tree", () => {
    const result = prompt.parseResponse(
      JSON.stringify({
        root: {
          kind: "section",
          title: "Overview",
          children: [
            { kind: "heading", level: "h1", text: "CloudX" },
            { kind: "paragraph", text: "Fast compute provider." },
            {
              kind: "button",
              label: "Sign Up",
              url: "https://cloudx.example.com",
            },
          ],
        },
      }),
    );
    expect(result).toMatch({
      root: {
        kind: "section",
        title: "Overview",
        children: [
          { kind: "heading", level: "h1", text: "CloudX" },
          { kind: "paragraph", text: "Fast compute provider." },
          {
            kind: "button",
            label: "Sign Up",
            url: "https://cloudx.example.com",
          },
        ],
      },
    });
  });
});

// ─── 03 Tools: tool definitions, registration, few-shot tool calls ───────────

describe("03-tools / ResearchQuestion", () => {
  const prompt = p03.researchQuestion.render({
    question: "What is the population of Tokyo?",
  });

  it("registers webSearch tool with correct name", () => {
    expect(prompt.tools["webSearch"]).toMatch({
      name: "webSearch",
    });
  });

  it("webSearch tool description mentions searching the web", () => {
    expect(prompt.tools["webSearch"]!.description).toMatch(/Search the web/);
  });

  it("webSearch tool has inputJsonSchema", () => {
    const schema = prompt.tools["webSearch"]!.inputJsonSchema;
    expect(schema).toMatch({
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    });
  });

  it("registers webSearch tool", () => {
    expect(Boolean(prompt.tools["webSearch"])).toMatch(true);
    expect(
      Boolean((prompt.tools as Record<string, unknown>)["calculator"]),
    ).toMatch(false);
  });

  it("produces one example with one step", () => {
    expect(prompt.examples.length).toMatch(1);
    expect(prompt.examples[0]!.steps.length).toMatch(1);
  });

  it("example tool call has the correct callId and toolName", () => {
    const call = prompt.examples[0]!.steps[0]!.toolCalls[0]!;
    expect(call.callId).toMatch("s1");
    expect(call.toolName).toMatch("webSearch");
  });

  it("example tool call stringifiedInput contains the query", () => {
    const call = prompt.examples[0]!.steps[0]!.toolCalls[0]!;
    expect(call.stringifiedInput).toMatch(/Tokyo population 2024/);
  });

  const mockExecutor: ToolExecutor03<"Main:ResearchQuestion"> = {
    webSearch: async (input: Schema03.WebSearch.Input) => ({
      results: [
        {
          title: `Result for ${input.query}`,
          url: "https://example.com",
          snippet: "Found info",
        },
      ],
    }),
  };

  it("executeTools calls the executor and returns stringified output", async () => {
    const responses = await prompt.executeTools(
      [
        {
          callId: "call_abc",
          toolName: "webSearch",
          stringifiedInput: JSON.stringify({
            query: "quantum supremacy",
          }),
        },
      ],
      mockExecutor,
    );
    expect(responses.length).toMatch(1);
    expect(responses[0]!.callId).toMatch("call_abc");
    expect(responses[0]!.stringifiedOutput).toMatch(
      /Result for quantum supremacy/,
    );
  });

  it("executeTools accepts Set (Iterable)", async () => {
    const responses = await prompt.executeTools(
      new Set([
        {
          callId: "call_set",
          toolName: "webSearch",
          stringifiedInput: JSON.stringify({ query: "qubits" }),
        },
      ]),
      mockExecutor,
    );
    expect(responses.length).toMatch(1);
    expect(responses[0]!.callId).toMatch("call_set");
  });

  it("executeTools returns error for an unknown tool name", async () => {
    const responses = await prompt.executeTools(
      [
        {
          callId: "call_bad",
          toolName: "nonExistentTool",
          stringifiedInput: "{}",
        },
      ],
      mockExecutor,
    );
    expect(responses.length).toMatch(1);
    expect(responses[0]!.callId).toMatch("call_bad");
    expect(responses[0]!.error).toMatch("Tool not found: nonExistentTool");
    expect(responses[0]!.stringifiedOutput).toMatch(
      /"error":\s*"Tool not found: nonExistentTool"/,
    );
  });

  it("executeTools returns error when executor throws", async () => {
    const throwingExecutor = {
      webSearch: async () => {
        throw new Error("Search service failure");
      },
    };
    const responses = await prompt.executeTools(
      [
        {
          callId: "call_err",
          toolName: "webSearch",
          stringifiedInput: JSON.stringify({ query: "fail" }),
        },
      ],
      throwingExecutor,
    );
    expect(responses.length).toMatch(1);
    expect(responses[0]!.callId).toMatch("call_err");
    expect(responses[0]!.error).toMatch("Search service failure");
    expect(responses[0]!.stringifiedOutput).toMatch(
      /"error":\s*"Search service failure"/,
    );
  });
});

// ─── 04 Variants: multiple prompt variants, common schema ────────────────────

describe("04-variants / WriteProductDescription", () => {
  const baseInput = {
    productName: "CloudWatch Pro",
    features: ["real-time alerting", "log analytics", "custom dashboards"],
  };

  const marketing = p04.writeProductDescription.render({
    ...baseInput,
    variant: "marketing",
  });
  const technical = p04.writeProductDescription.render({
    ...baseInput,
    variant: "technical",
  });
  const brief = p04.writeProductDescription.render({
    ...baseInput,
    variant: "brief",
  });

  it("marketing variant system prompt mentions benefit-focused writing", () => {
    expect(marketing.systemMessage).toMatch(/benefit-focused/);
  });

  it("technical variant system prompt mentions specification-driven writing", () => {
    expect(technical.systemMessage).toMatch(/specification-driven/);
  });

  it("brief variant system prompt mentions a single punchy sentence", () => {
    expect(brief.systemMessage).toMatch(/single punchy sentence/);
  });

  it("all variants share the exact same user message", () => {
    expect(marketing.userMessage).toMatch(technical.userMessage);
    expect(technical.userMessage).toMatch(brief.userMessage);
  });

  it("user message contains productName", () => {
    expect(marketing.userMessage).toMatch(/CloudWatch Pro/);
  });

  it("user message contains features as a JSON array", () => {
    expect(marketing.userMessage).toMatch(/"real-time alerting"/);
  });

  it("marketing variant has one example", () => {
    expect(marketing.examples.length).toMatch(1);
  });

  it("marketing example response includes expected output text", () => {
    expect(marketing.examples[0]!.response).toMatch(/AquaFilter Pro/);
  });

  it("brief variant has one example", () => {
    expect(brief.examples.length).toMatch(1);
  });

  it("templateId is the same across all variants", () => {
    expect(marketing.templateId).toMatch("Main:WriteProductDescription");
    expect(technical.templateId).toMatch("Main:WriteProductDescription");
    expect(brief.templateId).toMatch("Main:WriteProductDescription");
  });

  it("different variants produce different system messages", () => {
    expect(marketing.systemMessage === technical.systemMessage).toMatch(false);
    expect(technical.systemMessage === brief.systemMessage).toMatch(false);
  });
});

// ─── 05 Conditional Logic: reusable, conditional, switch ────────────────────────

describe("05-conditional-logic / SummarizeDocument", () => {
  it("switch snippet: executive audience instruction is selected", () => {
    const p = p05.summarizeDocument.render({
      title: "Q3 Report",
      content: "Revenue was up 15%.",
      audience: "executive",
    });
    expect(p.systemMessage).toMatch(/non-technical executive audience/);
  });

  it("switch snippet: technical audience instruction is selected", () => {
    const p = p05.summarizeDocument.render({
      title: "Architecture Overview",
      content: "System uses event sourcing.",
      audience: "technical",
    });
    expect(p.systemMessage).toMatch(/technical audience/);
  });

  it("switch snippet: general audience instruction is selected", () => {
    const p = p05.summarizeDocument.render({
      title: "Company Update",
      content: "New office opened.",
      audience: "general",
    });
    expect(p.systemMessage).toMatch(/general audience/);
  });

  it("switch snippet: executive instruction does not bleed into technical render", () => {
    const p = p05.summarizeDocument.render({
      title: "Tech Doc",
      content: "Details here.",
      audience: "technical",
    });
    expect(p.systemMessage.includes("executive audience")).toMatch(false);
  });

  it("conditional snippet: focus instruction appears when focusTopic is set", () => {
    const p = p05.summarizeDocument.render({
      title: "Annual Report",
      content: "All about the year.",
      audience: "executive",
      focusTopic: "cloud migration",
    });
    expect(p.systemMessage).toMatch(
      /Focus the summary specifically on the topic: cloud migration/,
    );
  });

  it("conditional snippet: focus instruction is absent when focusTopic is not provided", () => {
    const p = p05.summarizeDocument.render({
      title: "Annual Report",
      content: "All about the year.",
      audience: "executive",
    });
    expect(p.systemMessage.includes("Focus the summary specifically")).toMatch(
      false,
    );
  });

  it("userMessage wraps document title in <Title> via <enclosed>", () => {
    const p = p05.summarizeDocument.render({
      title: "My Document",
      content: "Body text.",
      audience: "general",
    });
    expect(p.userMessage).toMatch(/<Title>\s*My Document\s*<\/Title>/);
  });
});

// ─── 06 Shared types: two templates sharing Main namespace types ───────────────

describe("06-shared-types", () => {
  const address: Schema06.Shared.Address = {
    street: "1 Main St",
    city: "Paris",
    country: "France",
  };
  const contact: Schema06.Shared.ContactInfo = {
    name: "Alice Dupont",
    email: "alice@example.com",
    address,
  };

  describe("ShippingConfirmation", () => {
    const prompt = p06.shippingConfirmation.render({
      recipient: contact,
      orderNumber: "ORD-1234",
      estimatedDelivery: "2026-08-20",
      items: [{ name: "Laptop", quantity: 1 }],
    });

    it("has text output format", () => {
      expect(prompt.outputFormat).toMatch({ format: "text" });
    });

    it("templateId is Main:ShippingConfirmation", () => {
      expect(prompt.templateId).toMatch("Main:ShippingConfirmation");
    });

    it("userMessage contains recipient name from shared.ContactInfo", () => {
      expect(prompt.userMessage).toMatch(/Alice Dupont/);
    });

    it("userMessage contains the order number", () => {
      expect(prompt.userMessage).toMatch(/ORD-1234/);
    });

    it("systemMessage mentions writing a confirmation email", () => {
      expect(prompt.systemMessage).toMatch(/confirmation email/);
    });
  });

  describe("ReturnSlip", () => {
    const prompt = p06.returnSlip.render({
      customer: contact,
      returnReason: "defective",
      orderNumber: "ORD-1234",
    });

    it("has text output format", () => {
      expect(prompt.outputFormat).toMatch({ format: "text" });
    });

    it("templateId is Main:ReturnSlip", () => {
      expect(prompt.templateId).toMatch("Main:ReturnSlip");
    });

    it("userMessage contains customer name from shared.ContactInfo", () => {
      expect(prompt.userMessage).toMatch(/Alice Dupont/);
    });

    it("userMessage contains the return reason", () => {
      expect(prompt.userMessage).toMatch(/defective/);
    });
  });
});

// ─── 07 Namespaces: two named namespaces, four templates ─────────────────────

describe("07-namespaces", () => {
  describe("Finance:SummarizeTransaction", () => {
    const prompt = p07.finance.summarizeTransaction.render({
      description: "AWS monthly bill",
      amount: { value: 450, currency: "USD" },
      category: "expense",
      date: "2026-08-01",
    });

    it("templateId is Finance:SummarizeTransaction", () => {
      expect(prompt.templateId).toMatch("Finance:SummarizeTransaction");
    });

    it("is accessible via prompts.finance.summarizeTransaction", () => {
      expect(typeof p07.finance.summarizeTransaction.render).toMatch(
        "function",
      );
    });

    it("has json output format", () => {
      expect(prompt.outputFormat).toMatch({ format: "json" });
    });

    it("userMessage contains the transaction description", () => {
      expect(prompt.userMessage).toMatch(/AWS monthly bill/);
    });
  });

  describe("Finance:DetectAnomaly", () => {
    const prompt = p07.finance.detectAnomaly.render({
      recentTransactions: [],
      newTransaction: {
        description: "Casino chips",
        amount: { value: 5000, currency: "USD" as never },
        date: "2026-08-17",
      },
    });

    it("templateId is Finance:DetectAnomaly", () => {
      expect(prompt.templateId).toMatch("Finance:DetectAnomaly");
    });

    it("userMessage contains the new transaction description", () => {
      expect(prompt.userMessage).toMatch(/Casino chips/);
    });

    it("has no tools", () => {
      expect(Object.keys(prompt.tools).length).toMatch(0);
    });
  });

  describe("Legal:DraftNda", () => {
    const prompt = p07.legal.draftNda.render({
      disclosingParty: {
        name: "Acme Corp",
        role: "client",
        jurisdiction: "California",
      },
      receivingParty: {
        name: "Beta LLC",
        role: "counterparty",
        jurisdiction: "Delaware",
      },
      purposeOfDisclosure: "Evaluating a potential acquisition",
      durationYears: 3,
    });

    it("templateId is Legal:DraftNda", () => {
      expect(prompt.templateId).toMatch("Legal:DraftNda");
    });

    it("has text output format", () => {
      expect(prompt.outputFormat).toMatch({ format: "text" });
    });

    it("is accessible via prompts.legal.draftNda", () => {
      expect(typeof p07.legal.draftNda.render).toMatch("function");
    });

    it("userMessage contains both party names", () => {
      expect(prompt.userMessage).toMatch(/Acme Corp/);
      expect(prompt.userMessage).toMatch(/Beta LLC/);
    });

    it("systemMessage mentions non-disclosure agreement", () => {
      expect(prompt.systemMessage).toMatch(/non-disclosure agreement/);
    });
  });

  describe("Legal:SummarizeClause", () => {
    const prompt = p07.legal.summarizeClause.render({
      clauseText: "The party shall indemnify and hold harmless...",
      reviewingParty: { name: "Alice", role: "client", jurisdiction: "NY" },
    });

    it("templateId is Legal:SummarizeClause", () => {
      expect(prompt.templateId).toMatch("Legal:SummarizeClause");
    });

    it("has json output format", () => {
      expect(prompt.outputFormat).toMatch({ format: "json" });
    });

    it("userMessage contains the reviewing party name", () => {
      expect(prompt.userMessage).toMatch(/Alice/);
    });

    it("userMessage contains the clause text", () => {
      expect(prompt.userMessage).toMatch(/indemnify/);
    });

    it("userMessage wraps clause text in <Clause> tag via <enclosed>", () => {
      expect(prompt.userMessage).toMatch(/<Clause>/);
    });
  });
});

// ─── e01 CSV/TSV format: tabular data serialization ─────────────────────────

describe("e01 / AnalyzeSalesData", () => {
  const rows = [
    { product: "Widget A", units: 120, revenueCents: 240000, region: "north" },
    { product: "Widget B", units: 85, revenueCents: 340000, region: "south" },
  ];

  const csv = pe01.analyzeSalesData.render({
    rows,
    question: "Top product?",
    variant: "csv",
  });
  const tsv = pe01.analyzeSalesData.render({
    rows,
    question: "Top product?",
    variant: "tsv",
  });

  it("csv variant: userMessage contains a comma-separated header row", () => {
    expect(csv.userMessage).toMatch(/product,units,revenueCents,region/);
  });

  it("csv variant: userMessage contains comma-separated data rows", () => {
    expect(csv.userMessage).toMatch(/Widget A,120,240000,north/);
    expect(csv.userMessage).toMatch(/Widget B,85,340000,south/);
  });

  it("tsv variant: userMessage contains a tab-separated header row", () => {
    expect(tsv.userMessage).toMatch(/product\tunits\trevenueCents\tregion/);
  });

  it("tsv variant: userMessage contains tab-separated data rows", () => {
    expect(tsv.userMessage).toMatch(/Widget A\t120\t240000\tnorth/);
    expect(tsv.userMessage).toMatch(/Widget B\t85\t340000\tsouth/);
  });

  it("csv and tsv variants produce different userMessages", () => {
    expect(csv.userMessage === tsv.userMessage).toMatch(false);
  });

  it("empty rows list renders no table content", () => {
    const empty = pe01.analyzeSalesData.render({
      rows: [],
      question: "Any data?",
      variant: "csv",
    });
    expect(empty.userMessage).toMatch(/^(?![\s\S]*product,units)/); // no header row
  });

  it("csv variant has one example with csv-formatted data", () => {
    expect(csv.examples.length).toMatch(1);
    expect(csv.examples[0]!.userMessage).toMatch(
      /product,units,revenueCents,region/,
    );
  });

  it("tsv variant has one example with tsv-formatted data", () => {
    expect(tsv.examples.length).toMatch(1);
    expect(tsv.examples[0]!.userMessage).toMatch(
      /product\tunits\trevenueCents\tregion/,
    );
  });

  it("csv system message mentions CSV", () => {
    expect(csv.systemMessage).toMatch(/comma-separated/);
  });

  it("tsv system message mentions TSV", () => {
    expect(tsv.systemMessage).toMatch(/tab-separated/);
  });

  it("csv: exact systemMessage", () => {
    expect(csv.systemMessage).toMatch(
      "You are a sales analyst. The data below is comma-separated (CSV).\nAnalyze it and answer the question concisely.",
    );
  });

  it("csv: exact userMessage", () => {
    expect(csv.userMessage).toMatch(
      "Top product?\n\nData:\nproduct,units,revenueCents,region\nWidget A,120,240000,north\nWidget B,85,340000,south",
    );
  });

  it("csv: exact example[0] userMessage", () => {
    expect(csv.examples[0]!.userMessage).toMatch(
      "Which product generated the most revenue?\n\nData:\nproduct,units,revenueCents,region\nWidget A,120,240000,north\nWidget B,85,340000,south\nWidget C,200,180000,east",
    );
  });

  it("tsv: exact systemMessage", () => {
    expect(tsv.systemMessage).toMatch(
      "You are a sales analyst. The data below is tab-separated (TSV).\nAnalyze it and answer the question concisely.",
    );
  });

  it("tsv: exact userMessage", () => {
    expect(tsv.userMessage).toMatch(
      "Top product?\n\nData:\nproduct\tunits\trevenueCents\tregion\nWidget A\t120\t240000\tnorth\nWidget B\t85\t340000\tsouth",
    );
  });

  it("tsv: exact example[0] userMessage", () => {
    expect(tsv.examples[0]!.userMessage).toMatch(
      "Which product generated the most revenue?\n\nData:\nproduct\tunits\trevenueCents\tregion\nWidget A\t120\t240000\tnorth\nWidget B\t85\t340000\tsouth\nWidget C\t200\t180000\teast",
    );
  });
});

// ─── Cross-cutting: parseResponse code fence stripping ───────────────────────

describe("parseResponse", () => {
  const p02Render = () =>
    p02.triageTicket.render({
      subject: "X",
      body: "Y",
      customerTier: "pro",
      recentTickets: [],
    });

  it("parses plain JSON without fences", () => {
    expect(
      p02Render().parseResponse(
        '{"category":"other","urgency":"low","summary":"x","suggestedActions":[]}',
      ),
    ).toMatch({ category: "other" });
  });

  it("strips ``` plain fences", () => {
    expect(
      p02Render().parseResponse(
        '```\n{"category":"other","urgency":"low","summary":"x","suggestedActions":[]}\n```',
      ),
    ).toMatch({ category: "other" });
  });

  it("strips ```json fences", () => {
    expect(
      p02Render().parseResponse(
        '```json\n{"category":"other","urgency":"low","summary":"x","suggestedActions":[]}\n```',
      ),
    ).toMatch({ category: "other" });
  });

  it("returns raw string for text output format", () => {
    const prompt = p01.translate.render({
      text: "hi",
      targetLanguage: "Spanish",
    });
    expect(prompt.parseResponse("Hola")).toMatch("Hola");
  });
});

// ─── e01 JSON serialization & deserialization ───────────────────────────────

describe("e01 / JSON serialization & deserialization", () => {
  it("serializes and deserializes Expr (number, add, if)", () => {
    const num: SchemaE01.Shared.Expr = { kind: "number", value: 42.0 };
    const jsonNum = JSON.stringify(num);
    expect(jsonNum).toMatch('{"kind":"number","value":42}');
    const parsedNum: SchemaE01.Shared.Expr = JSON.parse(jsonNum);
    expect(parsedNum).toMatch({ kind: "number", value: 42 });

    const add: SchemaE01.Shared.Expr = {
      kind: "add",
      left: { kind: "number", value: 1.0 },
      right: { kind: "number", value: 2.0 },
    };
    const jsonAdd = JSON.stringify(add);
    const parsedAdd: SchemaE01.Shared.Expr = JSON.parse(jsonAdd);
    expect(parsedAdd).toMatch(add);
  });

  it("serializes and deserializes EnumWithCommonFields (boolean discriminant)", () => {
    const notSuccess: SchemaE01.Shared.EnumWithCommonFields = {
      success: false,
      x: 10,
      y: 20.5,
      z: "error",
    };
    const jsonNotSuccess = JSON.stringify(notSuccess);
    const parsedNotSuccess: SchemaE01.Shared.EnumWithCommonFields =
      JSON.parse(jsonNotSuccess);
    expect(parsedNotSuccess).toMatch(notSuccess);

    const success: SchemaE01.Shared.EnumWithCommonFields = {
      success: true,
      x: 42,
      y: 84.0,
      z: 99,
    };
    const jsonSuccess = JSON.stringify(success);
    const parsedSuccess: SchemaE01.Shared.EnumWithCommonFields =
      JSON.parse(jsonSuccess);
    expect(parsedSuccess).toMatch(success);
  });

  it("serializes and deserializes string enum variant", () => {
    const variant: SchemaE01.AnalyzeSalesData.Input["variant"] = "csv";
    const jsonVariant = JSON.stringify(variant);
    expect(jsonVariant).toMatch('"csv"');
    const parsedVariant: SchemaE01.AnalyzeSalesData.Input["variant"] =
      JSON.parse(jsonVariant);
    expect(parsedVariant).toMatch("csv");
  });

  it("allows omitting optional fields in Matrix", () => {
    const matrix: SchemaE01.Shared.Matrix = {
      kind: "matrix",
      matrix: [],
      ints: [1, 2, 3],
      init: true,
      encode: false,
    };
    expect(matrix.otherMatrix).toMatch(undefined);
    expect(matrix.foo).toMatch(undefined);
  });

  it("serializes and deserializes ComplexType with all types and optional fields", () => {
    const sq: SchemaE01.Shared.Square = {
      kind: "square",
      size: 10.0,
      fromJson: "fj",
      self: "sf",
      foo: "foo",
    };
    const sq2: SchemaE01.Shared.Square = {
      kind: "square",
      size: 20.0,
      fromJson: "fj2",
      self: "sf2",
      foo: "foo",
    };
    const sq3: SchemaE01.Shared.Square = {
      kind: "square",
      size: 30.0,
      fromJson: "fj3",
      self: "sf3",
      foo: "foo",
    };
    const sq4: SchemaE01.Shared.Square = {
      kind: "square",
      size: 40.0,
      fromJson: "fj4",
      self: "sf4",
      foo: "foo",
    };

    const full: SchemaE01.Shared.ComplexType = {
      stringField: "hello",
      intField: 42,
      numField: 3.14,
      boolField: true,
      literalField: "constant",
      enumField: "foo-BAR",
      stringUnion: "foo-bar",
      unionField: { kind: "number", value: 100.0 },
      structField: sq,
      stringList: ["a", "b"],
      structList: [sq2],
      matrix: [
        [1, 2],
        [3, 4],
      ],
      mapField: { key1: 10, key2: 20 },
      optString: "optional hello",
      optInt: 99,
      optNum: 2.718,
      optBool: false,
      optEnum: "if",
      optStringUnion: "zooKar",
      optUnion: { kind: "number", value: 200.0 },
      optStruct: sq3,
      optStringList: ["x", "y"],
      optStructList: [sq4],
      optMatrix: [
        [5, 6],
        [7, 8],
      ],
      optMap: { optKey: 30 },
    };

    const fullJson = JSON.stringify(full);
    const parsedFull: SchemaE01.Shared.ComplexType = JSON.parse(fullJson);
    expect(parsedFull).toMatch(full);

    // Omitted optional fields (explicitly null)
    const omitted: SchemaE01.Shared.ComplexType = {
      stringField: "hello",
      intField: 42,
      numField: 3.14,
      boolField: true,
      literalField: "constant",
      enumField: "foo-BAR",
      stringUnion: "foo-bar",
      unionField: { kind: "number", value: 100.0 },
      structField: sq,
      stringList: ["a", "b"],
      structList: [sq2],
      matrix: [
        [1, 2],
        [3, 4],
      ],
      mapField: { key1: 10, key2: 20 },
      optString: null,
      optInt: null,
      optNum: null,
      optBool: null,
      optEnum: null,
      optStringUnion: null,
      optUnion: null,
      optStruct: null,
      optStringList: null,
      optStructList: null,
      optMatrix: null,
      optMap: null,
    };

    const omittedJson = JSON.stringify(omitted);
    expect(omittedJson.includes('"optString":null')).toMatch(true);
    expect(omittedJson.includes('"optInt":null')).toMatch(true);
    expect(omittedJson.includes('"optNum":null')).toMatch(true);
    expect(omittedJson.includes('"optBool":null')).toMatch(true);
    expect(omittedJson.includes('"optEnum":null')).toMatch(true);
    expect(omittedJson.includes('"optStringUnion":null')).toMatch(true);
    expect(omittedJson.includes('"optUnion":null')).toMatch(true);
    expect(omittedJson.includes('"optStruct":null')).toMatch(true);
    expect(omittedJson.includes('"optStringList":null')).toMatch(true);
    expect(omittedJson.includes('"optStructList":null')).toMatch(true);
    expect(omittedJson.includes('"optMatrix":null')).toMatch(true);
    expect(omittedJson.includes('"optMap":null')).toMatch(true);

    const parsedOmitted: SchemaE01.Shared.ComplexType = JSON.parse(omittedJson);
    expect(parsedOmitted).toMatch(omitted);
    expect(parsedOmitted.optString).toMatch(null);
    expect(parsedOmitted.optInt).toMatch(null);
    expect(parsedOmitted.optNum).toMatch(null);
    expect(parsedOmitted.optBool).toMatch(null);
    expect(parsedOmitted.optEnum).toMatch(null);
    expect(parsedOmitted.optStringUnion).toMatch(null);
    expect(parsedOmitted.optUnion).toMatch(null);
    expect(parsedOmitted.optStruct).toMatch(null);
    expect(parsedOmitted.optStringList).toMatch(null);
    expect(parsedOmitted.optStructList).toMatch(null);
    expect(parsedOmitted.optMatrix).toMatch(null);
    expect(parsedOmitted.optMap).toMatch(null);
  });

  it("serializes and deserializes OmitDefaultType with omitted and non-default values", () => {
    // 1. Instance with default/omitted values
    const omitted: SchemaE01.Shared.OmitDefaultType = {
      plainOpt: null,
      plainString: "test",
      plainInt: 123,
      plainBool: true,
      plainList: ["item"],
      literal: "Literal",
    };
    const omittedJson = JSON.stringify(omitted);

    expect(omittedJson.includes('"optString"')).toMatch(false);
    expect(omittedJson.includes('"optInt"')).toMatch(false);
    expect(omittedJson.includes('"optNum"')).toMatch(false);
    expect(omittedJson.includes('"optBool"')).toMatch(false);
    expect(omittedJson.includes('"stringList"')).toMatch(false);
    expect(omittedJson.includes('"stringField"')).toMatch(false);
    expect(omittedJson.includes('"intField"')).toMatch(false);
    expect(omittedJson.includes('"numField"')).toMatch(false);
    expect(omittedJson.includes('"boolField"')).toMatch(false);

    expect(omittedJson.includes('"plainOpt":null')).toMatch(true);
    expect(omittedJson.includes('"plainString":"test"')).toMatch(true);
    expect(omittedJson.includes('"plainInt":123')).toMatch(true);
    expect(omittedJson.includes('"plainBool":true')).toMatch(true);
    expect(omittedJson.includes('"plainList":["item"]')).toMatch(true);

    const parsedOmitted: SchemaE01.Shared.OmitDefaultType =
      JSON.parse(omittedJson);
    expect(parsedOmitted.plainOpt).toMatch(null);
    expect(parsedOmitted.plainString).toMatch("test");
    expect(parsedOmitted.plainInt).toMatch(123);
    expect(parsedOmitted.plainBool).toMatch(true);
    expect(parsedOmitted.plainList).toMatch(["item"]);

    // 2. Instance with non-default values
    const populated: SchemaE01.Shared.OmitDefaultType = {
      optString: "hello",
      optInt: 42,
      optNum: 3.14,
      optBool: true,
      stringList: ["a", "b"],
      stringField: "world",
      intField: 7,
      numField: 2.5,
      boolField: true,
      plainOpt: "plain",
      plainString: "test3",
      plainInt: 789,
      plainBool: true,
      plainList: ["x"],
      literal: "Literal",
    };
    const populatedJson = JSON.stringify(populated);
    expect(populatedJson.includes('"optString":"hello"')).toMatch(true);
    expect(populatedJson.includes('"optInt":42')).toMatch(true);
    expect(populatedJson.includes('"optNum":3.14')).toMatch(true);
    expect(populatedJson.includes('"optBool":true')).toMatch(true);
    expect(populatedJson.includes('"stringList":["a","b"]')).toMatch(true);
    expect(populatedJson.includes('"stringField":"world"')).toMatch(true);
    expect(populatedJson.includes('"intField":7')).toMatch(true);
    expect(populatedJson.includes('"numField":2.5')).toMatch(true);
    expect(populatedJson.includes('"boolField":true')).toMatch(true);
    expect(populatedJson.includes('"plainOpt":"plain"')).toMatch(true);
    expect(populatedJson.includes('"plainString":"test3"')).toMatch(true);
    expect(populatedJson.includes('"plainInt":789')).toMatch(true);
    expect(populatedJson.includes('"plainBool":true')).toMatch(true);
    expect(populatedJson.includes('"plainList":["x"]')).toMatch(true);

    const parsedPopulated: SchemaE01.Shared.OmitDefaultType =
      JSON.parse(populatedJson);
    expect(parsedPopulated).toMatch(populated);

    // 3. Schema validation and serialization with explicit default values
    const explicitDefaults: SchemaE01.Shared.OmitDefaultType = {
      optString: null,
      optInt: null,
      optNum: null,
      optBool: null,
      stringList: [],
      stringField: "",
      intField: 0,
      numField: 0,
      boolField: false,
      plainOpt: null,
      plainString: "test",
      plainInt: 123,
      plainBool: true,
      plainList: ["item"],
      literal: "Literal",
    };

    const prompt = pe01.myTemplate.render({
      text: "hello",
      omitDefault: explicitDefaults,
    });
    const serializedRendered = JSON.stringify(prompt.templateInput.omitDefault);

    expect(serializedRendered.includes('"optString"')).toMatch(false);
    expect(serializedRendered.includes('"optInt"')).toMatch(false);
    expect(serializedRendered.includes('"optNum"')).toMatch(false);
    expect(serializedRendered.includes('"optBool"')).toMatch(false);
    expect(serializedRendered.includes('"stringList"')).toMatch(false);
    expect(serializedRendered.includes('"stringField"')).toMatch(false);
    expect(serializedRendered.includes('"intField"')).toMatch(false);
    expect(serializedRendered.includes('"numField"')).toMatch(false);
    expect(serializedRendered.includes('"boolField"')).toMatch(false);

    expect(serializedRendered.includes('"plainOpt":null')).toMatch(true);
    expect(serializedRendered.includes('"plainString":"test"')).toMatch(true);
    expect(serializedRendered.includes('"plainInt":123')).toMatch(true);
    expect(serializedRendered.includes('"plainBool":true')).toMatch(true);
    expect(serializedRendered.includes('"plainList":["item"]')).toMatch(true);

    // 4. Output schema validation and serialization
    const outputFormat = prompt.outputFormat;
    if (outputFormat.format === "json") {
      const parsedOutput = outputFormat.schema.parse({
        reversedText: "olleh",
        shape: {
          kind: "square",
          size: 10,
          fromJson: "a",
          self: "b",
          foo: "foo",
        },
        omitDefault: explicitDefaults,
      });
      const serializedOutput = JSON.stringify(parsedOutput.omitDefault);
      expect(serializedOutput.includes('"optString"')).toMatch(false);
      expect(serializedOutput.includes('"stringField"')).toMatch(false);
      expect(serializedOutput.includes('"intField"')).toMatch(false);
      expect(serializedOutput.includes('"numField"')).toMatch(false);
      expect(serializedOutput.includes('"boolField"')).toMatch(false);
      expect(serializedOutput.includes('"stringList"')).toMatch(false);
      expect(serializedOutput.includes('"plainOpt":null')).toMatch(true);
      expect(serializedOutput.includes('"plainString":"test"')).toMatch(true);

      const parsedOmitDefaultWithRequired = outputFormat.schema.parse({
        reversedText: "olleh",
        shape: {
          kind: "square",
          size: 10,
          fromJson: "a",
          self: "b",
          foo: "foo",
        },
        omitDefault: {
          plainOpt: null,
          plainString: "test",
          plainInt: 123,
          plainBool: true,
          plainList: ["item"],
          literal: "Literal",
        },
      });
      expect(parsedOmitDefaultWithRequired.omitDefault?.stringField).toMatch(
        undefined,
      );
      expect(parsedOmitDefaultWithRequired.omitDefault?.intField).toMatch(
        undefined,
      );
      expect(parsedOmitDefaultWithRequired.omitDefault?.numField).toMatch(
        undefined,
      );
      expect(parsedOmitDefaultWithRequired.omitDefault?.boolField).toMatch(
        undefined,
      );
      expect(parsedOmitDefaultWithRequired.omitDefault?.stringList).toMatch(
        undefined,
      );
      expect(parsedOmitDefaultWithRequired.omitDefault?.plainString).toMatch(
        "test",
      );
      expect(parsedOmitDefaultWithRequired.omitDefault?.plainInt).toMatch(123);
      expect(parsedOmitDefaultWithRequired.omitDefault?.plainBool).toMatch(
        true,
      );
      expect(parsedOmitDefaultWithRequired.omitDefault?.plainList).toMatch([
        "item",
      ]);

      // Missing required plain* fields in omitDefault causes validation failure
      let omitDefaultError: Error | null = null;
      try {
        outputFormat.schema.parse({
          reversedText: "olleh",
          shape: {
            kind: "square",
            size: 10,
            fromJson: "a",
            self: "b",
            foo: "foo",
          },
          omitDefault: {},
        });
      } catch (e) {
        omitDefaultError = e as Error;
      }
      expect(omitDefaultError !== null).toBe(true);

      // Missing required fields causes validation failure
      let allOmittedError: Error | null = null;
      try {
        outputFormat.schema.parse({});
      } catch (e) {
        allOmittedError = e as Error;
      }
      expect(allOmittedError !== null).toBe(true);

      const parsedPopulatedOutput = outputFormat.schema.parse({
        reversedText: "olleh",
        shape: {
          kind: "square",
          size: 10,
          fromJson: "a",
          self: "b",
          foo: "foo",
        },
        omitDefault: populated,
      });
      const serializedPopOutput = JSON.stringify(
        parsedPopulatedOutput.omitDefault,
      );
      expect(serializedPopOutput.includes('"optString":"hello"')).toMatch(true);
      expect(serializedPopOutput.includes('"stringField":"world"')).toMatch(
        true,
      );
      expect(serializedPopOutput.includes('"intField":7')).toMatch(true);
      expect(serializedPopOutput.includes('"numField":2.5')).toMatch(true);
      expect(serializedPopOutput.includes('"boolField":true')).toMatch(true);
      expect(serializedPopOutput.includes('"stringList":["a","b"]')).toMatch(
        true,
      );
      expect(serializedPopOutput.includes('"plainOpt":"plain"')).toMatch(true);
    }
  });
});

describe("templateOverrider", () => {
  it("exports templatesData with signature", () => {
    const data = to01.templatesData as { signature?: string };
    expect(typeof data.signature).toMatch("string");
    expect(data.signature!.length > 0).toMatch(true);
  });

  it("throws on signature mismatch", () => {
    let error: Error | null = null;
    try {
      to01.applyOverrides({ signature: "wrong_sig" });
    } catch (e) {
      error = e as Error;
    }
    expect(error !== null).toBe(true);
  });

  it("applies valid overrides", () => {
    const overridden = to01.applyOverrides(to01.templatesData);
    const prompt = overridden.translate.render({
      text: "Hello",
      targetLanguage: "French",
    });
    expect(prompt.userMessage).toMatch(/French/);
  });

  it("returns default prompts when overrides is null or undefined", () => {
    expect(to01.applyOverrides(null)).toBe(p01);
    expect(to01.applyOverrides(undefined)).toBe(p01);
  });
});
