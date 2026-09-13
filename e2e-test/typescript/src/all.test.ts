/**
 * Comprehensive tests covering all spec features across all example projects.
 */

import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { prompts as p01 } from "./gen/prompts-01.js";
import { prompts as p02 } from "./gen/prompts-02.js";
import {
  prompts as p03,
  type Schema as Schema03,
  type ToolExecutor as ToolExecutor03,
} from "./gen/prompts-03.js";
import { prompts as p04 } from "./gen/prompts-04.js";
import { prompts as p05 } from "./gen/prompts-05.js";
import { prompts as p06, type Schema as Schema06 } from "./gen/prompts-06.js";
import { prompts as p07, type Schema as Schema07 } from "./gen/prompts-07.js";
import { prompts as p08 } from "./gen/prompts-08.js";
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
    expect(prompt.outputFormat).toMatch({ kind: "text" });
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

  it("systemMessage mentions the translator role", () => {
    expect(prompt.systemMessage).toMatch(/professional translator/);
  });

  it("userMessage mentions the target language", () => {
    expect(prompt.userMessage).toMatch(/French/);
  });

  it("<enclosed> renders the correct tag name in userMessage", () => {
    expect(prompt.userMessage).toMatch(/<Text>/);
  });

  it("produces two examples", () => {
    expect(prompt.examples.length).toMatch(2);
  });

  it("first example response is the translated string", () => {
    expect(prompt.examples[0]!.response).toMatch(
      "La réunion est prévue pour lundi à 15h.",
    );
  });

  it("example userMessage contains the correct enclosed tag", () => {
    expect(prompt.examples[0]!.userMessage).toMatch(/<Text>/);
  });

  it("parseResponse returns the raw string for text format", () => {
    expect(prompt.parseResponse("Bonjour")).toMatch("Bonjour");
  });

  it("has no tools", () => {
    expect(Object.keys(prompt.tools).length).toMatch(0);
  });
});

// ─── 02 Structured output: named type alias, array field, format=yaml ────────

describe("02-structured-output / TriageTicket", () => {
  const prompt = p02.triageTicket.render({
    subject: "App crashes on login",
    body: "It crashes every time.",
    customerTier: "pro",
    recentTickets: [],
  });

  it("has json output format", () => {
    expect(prompt.outputFormat).toMatch({ kind: "json" });
    if (prompt.outputFormat.kind === "json") {
      expect(prompt.outputFormat.jsonSchema).toMatch({
        type: "object",
        properties: {
          category: { $ref: "#/$defs/TicketCategory" },
          urgency: {
            enum: ["low", "medium", "high", "critical"],
          },
        },
        required: ["category", "urgency", "summary", "suggestedActions"],
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

  it("optional field suggestedReply is absent when omitted from output", () => {
    const result = prompt.parseResponse(
      '{"category":"feature-request","urgency":"low","summary":"Dark mode","suggestedActions":["Log request"]}',
    );
    expect(result).toMatch({
      category: "feature-request",
      suggestedReply: undefined,
    });
  });

  it("userMessage contains YAML-rendered recentTickets", () => {
    const p = p02.triageTicket.render({
      subject: "X",
      body: "Y",
      customerTier: "pro",
      recentTickets: [
        { id: "T-1", summary: "Login bug", category: "technical-issue" },
      ],
    });
    expect(p.userMessage).toMatch(/id: T-1/);
  });

  it("userMessage contains the input rendered as YAML", () => {
    expect(prompt.userMessage).toMatch(/subject:/);
    expect(prompt.userMessage).toMatch(/customerTier:/);
  });

  // Python strips the trailing newline emitted by the YAML serializer; TypeScript does not.
  it("yaml: exact userMessage", () => {
    expect(prompt.userMessage).toMatch(
      "subject: App crashes on login\nbody: It crashes every time.\ncustomerTier: pro\nrecentTickets: []",
    );
  });

  it("meta contains the model and temperature declared in <meta>", () => {
    expect(prompt.meta).toMatch({ model: "gpt-4o", temperature: 0.2 });
  });
});

// ─── 03 Tools: tool registration, executeTools, example with intermediateSteps

describe("03-tools / ResearchQuestion", () => {
  const prompt = p03.researchQuestion.render({
    question: "What is the population of Tokyo?",
  });

  it("registers webSearch tool with correct name", () => {
    expect(prompt.tools.webSearch.name).toMatch("webSearch");
  });

  it("webSearch tool description mentions searching the web", () => {
    expect(prompt.tools.webSearch.description).toMatch(/Search the web/);
  });

  it("webSearch tool has inputJsonSchema", () => {
    expect(prompt.tools.webSearch.inputJsonSchema).toMatch({
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    });
  });

  it("isToolName returns true for a registered tool", () => {
    expect(prompt.isToolName("webSearch")).toMatch(true);
  });

  it("isToolName returns false for an unregistered name", () => {
    expect(prompt.isToolName("unknownTool")).toMatch(false);
  });

  it("produces one example with one intermediate step", () => {
    expect(prompt.examples.length).toMatch(1);
    expect(prompt.examples[0]!.intermediateSteps.length).toMatch(1);
  });

  it("example tool call has the correct callId and toolName", () => {
    const tc = prompt.examples[0]!.intermediateSteps[0]!.toolCalls[0]!;
    expect(tc.callId).toMatch("s1");
    expect(tc.toolName).toMatch("webSearch");
  });

  it("example tool call stringifiedInput contains the query", () => {
    const tc = prompt.examples[0]!.intermediateSteps[0]!.toolCalls[0]!;
    expect(tc.stringifiedInput).toMatch('{"query":"Tokyo population 2024"}');
  });

  it("executeTools calls the executor and returns stringified output", async () => {
    const executor = {
      webSearch: async (_input: Schema03.WebSearch.Input) => ({
        results: [{ title: "T", url: "http://example.com", snippet: "42M" }],
      }),
    } satisfies ToolExecutor03<"Main:ResearchQuestion">;

    const result = await prompt.executeTools(
      [
        {
          callId: "c1",
          toolName: "webSearch",
          stringifiedInput: '{"query":"test"}',
        },
      ],
      executor,
    );
    expect(result.length).toMatch(1);
    expect(result[0]!.callId).toMatch("c1");
    expect(result[0]!.stringifiedOutput).toMatch(/"T"/);
  });

  it("executeTools accepts Set (Iterable)", async () => {
    const executor = {
      webSearch: async (_input: Schema03.WebSearch.Input) => ({
        results: [{ title: "T", url: "http://example.com", snippet: "42M" }],
      }),
    } satisfies ToolExecutor03<"Main:ResearchQuestion">;

    const result = await prompt.executeTools(
      new Set([
        {
          callId: "c1",
          toolName: "webSearch",
          stringifiedInput: '{"query":"test"}',
        },
      ]),
      executor,
    );
    expect(result.length).toMatch(1);
    expect(result[0]!.callId).toMatch("c1");
  });

  it("executeTools throws for an unknown tool name", async () => {
    let threw = false;
    try {
      await prompt.executeTools(
        [{ callId: "c1", toolName: "noSuchTool", stringifiedInput: "{}" }],
        { webSearch: async () => ({ results: [] }) },
      );
    } catch {
      threw = true;
    }
    expect(threw).toMatch(true);
  });
});

// ─── 04 Snippets: switch snippet, conditional snippet ────────────────────────

describe("04-snippets / SummarizeDocument", () => {
  it("switch snippet: executive audience instruction is selected", () => {
    const p = p05.summarizeDocument.render({
      title: "T",
      content: "C",
      audience: "executive",
    });
    expect(p.systemMessage).toMatch(/non-technical executive audience/);
  });

  it("switch snippet: technical audience instruction is selected", () => {
    const p = p05.summarizeDocument.render({
      title: "T",
      content: "C",
      audience: "technical",
    });
    expect(p.systemMessage).toMatch(/technical audience/);
  });

  it("switch snippet: general audience instruction is selected", () => {
    const p = p05.summarizeDocument.render({
      title: "T",
      content: "C",
      audience: "general",
    });
    expect(p.systemMessage).toMatch(/general audience/);
  });

  it("switch snippet: executive instruction does not bleed into technical render", () => {
    const p = p05.summarizeDocument.render({
      title: "T",
      content: "C",
      audience: "technical",
    });
    expect(p.systemMessage).toMatch(/^(?![\s\S]*business impact)/);
  });

  it("conditional snippet: focus instruction appears when focusTopic is set", () => {
    const p = p05.summarizeDocument.render({
      title: "T",
      content: "C",
      focusTopic: "climate change",
      audience: "general",
    });
    expect(p.systemMessage).toMatch(/climate change/);
  });

  it("conditional snippet: focus instruction is absent when focusTopic is not provided", () => {
    const p = p05.summarizeDocument.render({
      title: "T",
      content: "C",
      audience: "executive",
    });
    expect(p.systemMessage).toMatch(/^(?![\s\S]*Focus the summary)/);
  });

  it("userMessage wraps document title in <Title> via <enclosed>", () => {
    const p = p05.summarizeDocument.render({
      title: "AI Report",
      content: "...",
      audience: "technical",
    });
    expect(p.userMessage).toMatch(/<Title>/);
  });
});

// ─── 05 Variants: per-variant system messages, shared user message ────────────

describe("05-variants / WriteProductDescription", () => {
  const base = {
    productName: "AquaFilter Pro",
    features: ["removes 99.9% of contaminants", "lasts 6 months"],
  };
  const marketing = p04.writeProductDescription.render({
    ...base,
    variant: "marketing",
  });
  const technical = p04.writeProductDescription.render({
    ...base,
    variant: "technical",
  });
  const brief = p04.writeProductDescription.render({
    ...base,
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
    expect(marketing.userMessage).toMatch(/AquaFilter Pro/);
  });

  it("user message contains features as a JSON array", () => {
    expect(marketing.userMessage).toMatch(/removes 99\.9% of contaminants/);
  });

  it("marketing variant has one example", () => {
    expect(marketing.examples.length).toMatch(1);
  });

  it("marketing example response includes expected output text", () => {
    expect(marketing.examples[0]!.response).toMatch(/"description"/);
    expect(marketing.examples[0]!.response).toMatch(/Tired of worrying/);
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

// ─── 06 Toon format: complex nested input types, format="toon" ───────────────

describe("06-toon-format / WriteComparisonArticle", () => {
  const provider: Schema06.WriteComparisonArticle.Provider = {
    name: "CloudX",
    region: "us-east",
    category: "compute",
    pricing: { model: "perHour", basePrice: 0.1 },
    benchmarks: [{ name: "throughput", score: 1000, unit: "rps" }],
    pros: ["fast", "reliable"],
    cons: ["pricey"],
  };

  const prompt = p06.writeComparisonArticle.render({
    providers: [provider],
    useCase: "serving ML inference workloads",
    audience: "architect",
  });

  it("has json output format", () => {
    expect(prompt.outputFormat).toMatch({ kind: "json" });
  });

  it("templateId is Main:WriteComparisonArticle", () => {
    expect(prompt.templateId).toMatch("Main:WriteComparisonArticle");
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

  // Python renders integer scores as floats (1000.0) and emits null optional fields (e.g. overage: null).
  it("toon: exact userMessage", () => {
    expect(prompt.userMessage).toMatch(
      "Write a comparison article framed around this use case: serving ML inference workloads\n\nHere is the data for each provider:\n\n[1]:\n  - name: CloudX\n    region: us-east\n    category: compute\n    pricing:\n      model: perHour\n      basePrice: 0.1\n    benchmarks[1]{name,score,unit}:\n      throughput,1000,rps\n    pros[2]: fast,reliable\n    cons[1]: pricey\n\nTarget audience: architect",
    );
  });
});

// ─── 07 Shared types: two templates sharing Main namespace types ───────────────

describe("07-shared-types", () => {
  const address: Schema07.Shared.Address = {
    street: "1 Main St",
    city: "Paris",
    country: "France",
  };
  const contact: Schema07.Shared.ContactInfo = {
    name: "Alice Dupont",
    email: "alice@example.com",
    address,
  };

  describe("ShippingConfirmation", () => {
    const prompt = p07.shippingConfirmation.render({
      recipient: contact,
      orderNumber: "ORD-1234",
      estimatedDelivery: "2026-08-20",
      items: [{ name: "Laptop", quantity: 1 }],
    });

    it("has text output format", () => {
      expect(prompt.outputFormat).toMatch({ kind: "text" });
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
    const prompt = p07.returnSlip.render({
      customer: contact,
      returnReason: "defective",
      orderNumber: "ORD-1234",
    });

    it("has text output format", () => {
      expect(prompt.outputFormat).toMatch({ kind: "text" });
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

// ─── 08 Namespaces: two named namespaces, four templates ─────────────────────

describe("08-namespaces", () => {
  describe("Finance:SummarizeTransaction", () => {
    const prompt = p08.finance.summarizeTransaction.render({
      description: "AWS monthly bill",
      amount: { value: 450, currency: "USD" },
      category: "expense",
      date: "2026-08-01",
    });

    it("templateId is Finance:SummarizeTransaction", () => {
      expect(prompt.templateId).toMatch("Finance:SummarizeTransaction");
    });

    it("is accessible via prompts.finance.summarizeTransaction", () => {
      expect(typeof p08.finance.summarizeTransaction.render).toMatch(
        "function",
      );
    });

    it("has json output format", () => {
      expect(prompt.outputFormat).toMatch({ kind: "json" });
    });

    it("userMessage contains the transaction description", () => {
      expect(prompt.userMessage).toMatch(/AWS monthly bill/);
    });
  });

  describe("Finance:DetectAnomaly", () => {
    const prompt = p08.finance.detectAnomaly.render({
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
    const prompt = p08.legal.draftNda.render({
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
      expect(prompt.outputFormat).toMatch({ kind: "text" });
    });

    it("is accessible via prompts.legal.draftNda", () => {
      expect(typeof p08.legal.draftNda.render).toMatch("function");
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
    const prompt = p08.legal.summarizeClause.render({
      clauseText: "The party shall indemnify and hold harmless...",
      reviewingParty: { name: "Alice", role: "client", jurisdiction: "NY" },
    });

    it("templateId is Legal:SummarizeClause", () => {
      expect(prompt.templateId).toMatch("Legal:SummarizeClause");
    });

    it("has json output format", () => {
      expect(prompt.outputFormat).toMatch({ kind: "json" });
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
});
