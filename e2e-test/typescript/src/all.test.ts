/**
 * Comprehensive tests covering all spec features across all 8 example projects.
 *
 * KNOWN FAILING TESTS (bugs in generated code / runtime):
 *   Bug 1 — <enclosed> rendering: the `tag` attribute resolves to [object Object]
 *     instead of the tag string value.
 *   Bug 2 — `it` alias in conditional snippets: resolves to the entire input
 *     object instead of the expression passed to `if="..."`.
 *   Bug 3 — is="notNull" semantics: shows the <then> body when the value IS
 *     null/undefined; hides it when a value is present (counter-intuitive naming).
 *   Bug 4 — String literal casing: literals like "USD", "EUR" are silently
 *     lowercased in the generated Zod schema instead of raising a validation
 *     error at code-generation time.
 */

import { expect } from "buckwheat";
import { describe, it } from "mocha";

import { prompts as p01 } from "./gen/prompts-01.js";
import { prompts as p02 } from "./gen/prompts-02.js";
import {
  prompts as p03,
  type ToolExecutor as ToolExecutor03,
  type $ as $03,
} from "./gen/prompts-03.js";
import { prompts as p04 } from "./gen/prompts-04.js";
import { prompts as p05 } from "./gen/prompts-05.js";
import { prompts as p06, type $ as $06 } from "./gen/prompts-06.js";
import { prompts as p07, type $ as $07 } from "./gen/prompts-07.js";
import { prompts as p08 } from "./gen/prompts-08.js";

// ─── 01 Basics: text output, <enclosed>, examples ────────────────────────────

describe("01-basics / Translate", () => {
  const prompt = p01.translate.render({ text: "Hello world", targetLanguage: "French" });

  it("has text output format", () => {
    expect(prompt.outputFormat).toMatch({ kind: "text" });
  });

  it("sets templateId", () => {
    expect(prompt.templateId).toMatch("Main:Translate");
  });

  it("exposes validated templateInput", () => {
    expect(prompt.templateInput).toMatch({ text: "Hello world", targetLanguage: "French" });
  });

  it("systemMessage mentions the translator role", () => {
    expect(prompt.systemMessage.includes("professional translator")).toMatch(true);
  });

  it("userMessage mentions the target language", () => {
    expect(prompt.userMessage.includes("French")).toMatch(true);
  });

  // Bug 1: <enclosed tag="Text"> renders tag as [object Object]
  it("<enclosed> renders the correct tag name in userMessage", () => {
    expect(prompt.userMessage.includes("<Text>")).toMatch(true);
  });

  it("produces two examples", () => {
    expect(prompt.examples.length).toMatch(2);
  });

  it("first example response is the translated string", () => {
    expect(prompt.examples[0]!.response).toMatch("La réunion est prévue pour lundi à 15h.");
  });

  // Bug 1: same <enclosed> bug appears in example userMessages
  it("example userMessage contains the correct enclosed tag", () => {
    expect(prompt.examples[0]!.userMessage.includes("<Text>")).toMatch(true);
  });

  it("parseResponse returns the raw string for text format", () => {
    expect(prompt.parseResponse("Bonjour")).toMatch("Bonjour");
  });

  it("has no tools", () => {
    expect(Object.keys(prompt.tools).length).toMatch(0);
  });
});

// ─── 02 Structured output: JSON format, union types, optional fields ─────────

describe("02-structured-output / TriageTicket", () => {
  const prompt = p02.triageTicket.render({ subject: "App crashes on login", body: "It crashes every time." });

  it("has json output format", () => {
    expect(prompt.outputFormat).toMatch({ kind: "json" });
  });

  it("<c> content is rendered as plain text (XML tags stripped)", () => {
    expect(prompt.systemMessage.includes("urgency")).toMatch(true);
    expect(prompt.systemMessage.includes('"critical"')).toMatch(true);
    expect(prompt.systemMessage.includes("<c>")).toMatch(false);
  });

  it("produces two examples", () => {
    expect(prompt.examples.length).toMatch(2);
  });

  it("first example response contains the JSON-encoded output category", () => {
    expect(prompt.examples[0]!.response.includes('"technicalIssue"')).toMatch(true);
  });

  it("second example response contains the JSON-encoded output category", () => {
    expect(prompt.examples[1]!.response.includes('"featureRequest"')).toMatch(true);
  });

  it("parseResponse parses JSON output", () => {
    const result = prompt.parseResponse(
      '{"category":"billing","urgency":"low","summary":"Invoice question"}',
    );
    expect(result).toMatch({ category: "billing", urgency: "low", summary: "Invoice question" });
  });

  it("parseResponse strips ```json code fences", () => {
    const result = prompt.parseResponse(
      '```json\n{"category":"other","urgency":"medium","summary":"test"}\n```',
    );
    expect(result).toMatch({ category: "other" });
  });

  it("parseResponse strips ``` code fences", () => {
    const result = prompt.parseResponse(
      '```\n{"category":"other","urgency":"medium","summary":"test"}\n```',
    );
    expect(result).toMatch({ category: "other" });
  });

  it("optional field suggestedReply is absent when omitted from output", () => {
    const result = prompt.parseResponse(
      '{"category":"featureRequest","urgency":"low","summary":"Dark mode"}',
    );
    expect(result).toMatch({ category: "featureRequest", suggestedReply: undefined });
  });

  // Bug 1: <enclosed> renders tag as [object Object]
  it("userMessage wraps subject in <Subject> tag via <enclosed>", () => {
    expect(prompt.userMessage.includes("<Subject>")).toMatch(true);
  });
});

// ─── 03 Tools: tool registration, executeTools, example with intermediateSteps

describe("03-tools / ResearchQuestion", () => {
  const prompt = p03.researchQuestion.render({ question: "What is the population of Tokyo?" });

  it("registers webSearch tool with correct name", () => {
    expect(prompt.tools.webSearch.name).toMatch("webSearch");
  });

  it("webSearch tool description mentions searching the web", () => {
    expect(prompt.tools.webSearch.description.includes("Search the web")).toMatch(true);
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
      webSearch: async (_input: $03.WebSearch.Input) => ({
        results: [{ title: "T", url: "http://example.com", snippet: "42M" }],
      }),
    } satisfies ToolExecutor03<"Main:ResearchQuestion">;

    const result = await prompt.executeTools(
      [{ callId: "c1", toolName: "webSearch", stringifiedInput: '{"query":"test"}' }],
      executor,
    );
    expect(result.length).toMatch(1);
    expect(result[0]!.callId).toMatch("c1");
    expect(result[0]!.stringifiedOutput.includes('"T"')).toMatch(true);
  });

  it("executeTools throws for an unknown tool name", async () => {
    let threw = false;
    try {
      await prompt.executeTools(
        [{ callId: "c1", toolName: "noSuchTool", stringifiedInput: "{}" }],
        { webSearch: async () => ({ results: [] }) },
      );
    } catch { threw = true; }
    expect(threw).toMatch(true);
  });
});

// ─── 04 Snippets: switch snippet, conditional snippet ────────────────────────

describe("04-snippets / SummarizeDocument", () => {
  it("switch snippet: executive audience instruction is selected", () => {
    const p = p04.summarizeDocument.render({ title: "T", content: "C", audience: "executive" });
    expect(p.systemMessage.includes("non-technical executive audience")).toMatch(true);
  });

  it("switch snippet: technical audience instruction is selected", () => {
    const p = p04.summarizeDocument.render({ title: "T", content: "C", audience: "technical" });
    expect(p.systemMessage.includes("technical audience")).toMatch(true);
  });

  it("switch snippet: general audience instruction is selected", () => {
    const p = p04.summarizeDocument.render({ title: "T", content: "C", audience: "general" });
    expect(p.systemMessage.includes("general audience")).toMatch(true);
  });

  it("switch snippet: executive instruction does not bleed into technical render", () => {
    const p = p04.summarizeDocument.render({ title: "T", content: "C", audience: "technical" });
    expect(p.systemMessage.includes("business impact")).toMatch(false);
  });

  // Bug 2 + 3: `it` alias resolves to entire input object; is="notNull" shows
  // then-body when value IS null/undefined, hiding it when a value is present.
  // Expected: when focusTopic is set the focus instruction appears.
  it("conditional snippet: focus instruction appears when focusTopic is set", () => {
    const p = p04.summarizeDocument.render({
      title: "T", content: "C", focusTopic: "climate change", audience: "general",
    });
    expect(p.systemMessage.includes("climate change")).toMatch(true);
  });

  // Bug 2 + 3: focus instruction wrongly appears (with [object Object]) when
  // focusTopic is absent, because is="notNull" triggers on undefined.
  it("conditional snippet: focus instruction is absent when focusTopic is not provided", () => {
    const p = p04.summarizeDocument.render({ title: "T", content: "C", audience: "executive" });
    expect(p.systemMessage.includes("Focus the summary")).toMatch(false);
  });

  // Bug 1: <enclosed> renders tag as [object Object]
  it("userMessage wraps document title in <Title> via <enclosed>", () => {
    const p = p04.summarizeDocument.render({ title: "AI Report", content: "...", audience: "technical" });
    expect(p.userMessage.includes("<Title>")).toMatch(true);
  });
});

// ─── 05 Variants: per-variant system messages, shared user message ────────────

describe("05-variants / WriteProductDescription", () => {
  const base = {
    productName: "AquaFilter Pro",
    features: ["removes 99.9% of contaminants", "lasts 6 months"],
  };
  const marketing = p05.writeProductDescription.render({ ...base, variant: "marketing" });
  const technical = p05.writeProductDescription.render({ ...base, variant: "technical" });
  const brief = p05.writeProductDescription.render({ ...base, variant: "brief" });

  it("marketing variant system prompt mentions benefit-focused writing", () => {
    expect(marketing.systemMessage.includes("benefit-focused")).toMatch(true);
  });

  it("technical variant system prompt mentions specification-driven writing", () => {
    expect(technical.systemMessage.includes("specification-driven")).toMatch(true);
  });

  it("brief variant system prompt mentions a single punchy sentence", () => {
    expect(brief.systemMessage.includes("single punchy sentence")).toMatch(true);
  });

  it("all variants share the exact same user message", () => {
    expect(marketing.userMessage).toMatch(technical.userMessage);
    expect(technical.userMessage).toMatch(brief.userMessage);
  });

  it("user message contains productName", () => {
    expect(marketing.userMessage.includes("AquaFilter Pro")).toMatch(true);
  });

  it("user message contains features as a JSON array", () => {
    expect(marketing.userMessage.includes('"removes 99.9% of contaminants"')).toMatch(true);
  });

  it("marketing variant has one example", () => {
    expect(marketing.examples.length).toMatch(1);
  });

  it("marketing example response includes expected output text", () => {
    expect(marketing.examples[0]!.response.includes('"description"')).toMatch(true);
    expect(marketing.examples[0]!.response.includes("Tired of worrying")).toMatch(true);
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
  const provider: $06.WriteComparisonArticle.Provider = {
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
    expect(prompt.userMessage.includes("serving ML inference workloads")).toMatch(true);
  });

  it("userMessage contains the provider name from toon-encoded data", () => {
    expect(prompt.userMessage.includes("CloudX")).toMatch(true);
  });

  it("userMessage mentions the target audience", () => {
    expect(prompt.userMessage.includes("architect")).toMatch(true);
  });

  it("has no tools", () => {
    expect(Object.keys(prompt.tools).length).toMatch(0);
  });
});

// ─── 07 Shared types: two templates sharing Main namespace types ───────────────

describe("07-shared-types", () => {
  const address: $07.Shared.Address = { street: "1 Main St", city: "Paris", country: "France" };
  const contact: $07.Shared.ContactInfo = {
    name: "Alice Dupont", email: "alice@example.com", address,
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
      expect(prompt.userMessage.includes("Alice Dupont")).toMatch(true);
    });

    it("userMessage contains the order number", () => {
      expect(prompt.userMessage.includes("ORD-1234")).toMatch(true);
    });

    it("systemMessage mentions shipping confirmation", () => {
      expect(prompt.systemMessage.includes("shipping confirmation")).toMatch(true);
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
      expect(prompt.userMessage.includes("Alice Dupont")).toMatch(true);
    });

    it("userMessage contains the return reason", () => {
      expect(prompt.userMessage.includes("defective")).toMatch(true);
    });
  });
});

// ─── 08 Namespaces: two named namespaces, four templates ─────────────────────

describe("08-namespaces", () => {
  // Bug 4: Currency literals "USD" are silently lowercased to "usd" in the
  // generated Zod schema. "USD" as declared in the schema should be accepted
  // but the generated code rejects it.
  it("Finance: currency literal 'USD' as written in the schema is accepted", () => {
    let threw = false;
    try {
      p08.finance.summarizeTransaction.render({
        description: "Coffee",
        amount: { value: 5, currency: "USD" as never },
        category: "expense",
        date: "2026-08-17",
      });
    } catch { threw = true; }
    expect(threw).toMatch(false);  // FAILS due to Bug 4
  });

  describe("Finance:SummarizeTransaction", () => {
    // workaround for Bug 4: use lowercased "usd"
    const prompt = p08.finance.summarizeTransaction.render({
      description: "AWS monthly bill",
      amount: { value: 450, currency: "usd" as never },
      category: "expense",
      date: "2026-08-01",
    });

    it("templateId is Finance:SummarizeTransaction", () => {
      expect(prompt.templateId).toMatch("Finance:SummarizeTransaction");
    });

    it("is accessible via prompts.finance.summarizeTransaction", () => {
      expect(typeof p08.finance.summarizeTransaction.render).toMatch("function");
    });

    it("has json output format", () => {
      expect(prompt.outputFormat).toMatch({ kind: "json" });
    });

    it("userMessage contains the transaction description", () => {
      expect(prompt.userMessage.includes("AWS monthly bill")).toMatch(true);
    });
  });

  describe("Finance:DetectAnomaly", () => {
    const prompt = p08.finance.detectAnomaly.render({
      recentTransactions: [],
      newTransaction: {
        description: "Casino chips",
        amount: { value: 5000, currency: "usd" as never },
        date: "2026-08-17",
      },
    });

    it("templateId is Finance:DetectAnomaly", () => {
      expect(prompt.templateId).toMatch("Finance:DetectAnomaly");
    });

    it("userMessage contains the new transaction description", () => {
      expect(prompt.userMessage.includes("Casino chips")).toMatch(true);
    });

    it("has no tools", () => {
      expect(Object.keys(prompt.tools).length).toMatch(0);
    });
  });

  describe("Legal:DraftNda", () => {
    const prompt = p08.legal.draftNda.render({
      disclosingParty: { name: "Acme Corp", role: "client", jurisdiction: "California" },
      receivingParty: { name: "Beta LLC", role: "counterparty", jurisdiction: "Delaware" },
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
      expect(prompt.userMessage.includes("Acme Corp")).toMatch(true);
      expect(prompt.userMessage.includes("Beta LLC")).toMatch(true);
    });

    it("systemMessage mentions non-disclosure agreement", () => {
      expect(prompt.systemMessage.includes("non-disclosure agreement")).toMatch(true);
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
      expect(prompt.userMessage.includes("Alice")).toMatch(true);
    });

    it("userMessage contains the clause text", () => {
      expect(prompt.userMessage.includes("indemnify")).toMatch(true);
    });

    // Bug 1: <enclosed> renders [object Object] instead of <Clause>
    it("userMessage wraps clause text in <Clause> tag via <enclosed>", () => {
      expect(prompt.userMessage.includes("<Clause>")).toMatch(true);
    });
  });
});

// ─── Cross-cutting: parseResponse code fence stripping ───────────────────────

describe("parseResponse", () => {
  it("parses plain JSON without fences", () => {
    const prompt = p02.triageTicket.render({ subject: "X", body: "Y" });
    expect(prompt.parseResponse('{"category":"other","urgency":"low","summary":"x"}')).toMatch({ category: "other" });
  });

  it("strips ``` plain fences", () => {
    const prompt = p02.triageTicket.render({ subject: "X", body: "Y" });
    expect(prompt.parseResponse('```\n{"category":"other","urgency":"low","summary":"x"}\n```')).toMatch({ category: "other" });
  });

  it("strips ```json fences", () => {
    const prompt = p02.triageTicket.render({ subject: "X", body: "Y" });
    expect(prompt.parseResponse('```json\n{"category":"other","urgency":"low","summary":"x"}\n```')).toMatch({ category: "other" });
  });

  it("returns raw string for text output format", () => {
    const prompt = p01.translate.render({ text: "hi", targetLanguage: "Spanish" });
    expect(prompt.parseResponse("Hola")).toMatch("Hola");
  });
});

