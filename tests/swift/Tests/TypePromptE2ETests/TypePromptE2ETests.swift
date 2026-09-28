import Foundation
import Testing

@testable import TypePromptE2E

private struct MockWebSearchExecutor: TypePrompt03.ToolExecutor.WebSearch {
  func webSearch(
    input: TypePrompt03.Schema.WebSearch.Input
  ) async throws -> TypePrompt03.Schema.WebSearch.Output {
    TypePrompt03.Schema.WebSearch.Output(
      results: [
        TypePrompt03.Schema.WebSearch.Output_Results(
          title: "Tokyo Population 2024",
          url: "https://example.com/tokyo",
          snippet: "14 million"
        )
      ]
    )
  }
}

@Suite("01 Basics: Translate")
struct BasicsTranslateTests {
  let prompt = TypePrompt01.prompts.renderTranslate(
    TypePrompt01.Schema.Translate.Input(
      text: "Hello world",
      targetLanguage: "French"
    )
  )

  @Test func textOutputFormat() {
    #expect(prompt.outputFormat == .text)
  }

  @Test func templateId() {
    #expect(prompt.templateId.description == "Main:Translate")
    #expect(prompt.templateId == .translate)
  }

  @Test func systemMessageMentionsTranslatorRole() {
    #expect(prompt.systemMessage.contains("professional translator"))
  }

  @Test func userMessageMentionsTargetLanguage() {
    #expect(prompt.userMessage.contains("French"))
  }

  @Test func enclosedRendersCorrectTagInUserMessage() {
    #expect(prompt.userMessage.contains("<Text>"))
  }

  @Test func producesTwoExamples() {
    #expect(prompt.examples.count == 2)
  }

  @Test func firstExampleResponseIsTranslatedString() {
    #expect(prompt.examples[0].response == "La réunion est prévue pour lundi à 15h.")
  }

  @Test func exampleUserMessageContainsEnclosedTag() {
    #expect(prompt.examples[0].userMessage.contains("<Text>"))
  }

  @Test func parseResponseReturnsRawString() throws {
    #expect(try prompt.parseResponse("Bonjour") == "Bonjour")
  }

  @Test func hasNoTools() {
    #expect(prompt.tools.isEmpty)
  }
}

@Suite("02 Structured Output: TriageTicket")
struct StructuredOutputTests {
  let prompt = TypePrompt02.prompts.renderTriageTicket(
    TypePrompt02.Schema.TriageTicket.Input(
      subject: "App crashes on login",
      body: "It crashes every time.",
      customerTier: .pro,
      recentTickets: []
    )
  )

  @Test func jsonOutputFormat() {
    #expect(prompt.outputFormat.isJson)
    if case .json(let format) = prompt.outputFormat {
      if case .object(let dict, _) = format.jsonSchema {
        #expect(dict["type"] == .string("object"))
        #expect(dict["properties"] != nil)
        #expect(dict["required"] != nil)
      } else {
        #expect(Bool(false), "Expected JsonElement.object")
      }
    }
  }

  @Test func cContentStrippedToPlainText() {
    #expect(prompt.systemMessage.contains("urgency"))
    #expect(prompt.systemMessage.contains("\"critical\""))
    #expect(!prompt.systemMessage.contains("<c>"))
  }

  @Test func producesTwoExamples() {
    #expect(prompt.examples.count == 2)
  }

  @Test func firstExampleResponseContainsOutputCategory() {
    #expect(prompt.examples[0].response.contains("\"technical-issue\""))
  }

  @Test func secondExampleResponseContainsOutputCategory() {
    #expect(prompt.examples[1].response.contains("\"feature-request\""))
  }

  @Test func parseResponseParsesJson() throws {
    let result = try prompt.parseResponse(
      "{\"category\":\"billing\",\"urgency\":\"low\",\"summary\":\"Invoice question\",\"suggestedActions\":[]}"
    )
    #expect(result.category == .billing)
    #expect(result.urgency == .low)
    #expect(result.summary == "Invoice question")
  }

  @Test func parseResponseStripsJsonCodeFences() throws {
    let result = try prompt.parseResponse(
      "```json\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```"
    )
    #expect(result.category == .other)
  }

  @Test func parseResponseStripsPlainCodeFences() throws {
    let result = try prompt.parseResponse(
      "```\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```"
    )
    #expect(result.category == .other)
  }

  @Test func optionalFieldAbsentWhenOmitted() throws {
    let result = try prompt.parseResponse(
      "{\"category\":\"feature-request\",\"urgency\":\"low\",\"summary\":\"Dark mode\",\"suggestedActions\":[\"Log request\"]}"
    )
    #expect(result.category == .featureRequest)
    #expect(result.suggestedReply == nil)
  }

  @Test func userMessageContainsYamlRenderedRecentTickets() {
    let p = TypePrompt02.prompts.renderTriageTicket(
      TypePrompt02.Schema.TriageTicket.Input(
        subject: "X",
        body: "Y",
        customerTier: .pro,
        recentTickets: [
          TypePrompt02.Schema.TriageTicket.Input_RecentTickets(
            id: "T-1",
            summary: "Login bug",
            category: .technicalIssue
          )
        ]
      )
    )
    #expect(p.userMessage.contains("T-1"))
  }

  @Test func userMessageContainsInputAsYaml() {
    #expect(prompt.userMessage.contains("subject:"))
    #expect(prompt.userMessage.contains("customerTier:"))
  }

  @Test func metaContainsDeclaredModelAndTemperature() {
    #expect(prompt.meta.model == .gpt4o)
    #expect(prompt.meta.temperature == 0.2)
  }
}

@Suite("02 Complex Schemas: GeneratePageTree")
struct GeneratePageTreeTests {
  static let provider = TypePrompt02.Schema.GeneratePageTree.Provider(
    name: "CloudX",
    region: "us-east",
    category: .compute,
    pricing: TypePrompt02.Schema.GeneratePageTree.Pricing(
      model: .perHour,
      basePrice: 0.1
    ),
    benchmarks: [
      TypePrompt02.Schema.GeneratePageTree.Benchmark(
        name: "throughput",
        score: 1000.0,
        unit: "rps"
      )
    ],
    pros: ["fast", "reliable"],
    cons: ["pricey"]
  )

  let prompt = TypePrompt02.prompts.renderGeneratePageTree(
    TypePrompt02.Schema.GeneratePageTree.Input(
      providers: [provider],
      useCase: "serving ML inference workloads",
      audience: .architect
    )
  )

  @Test func jsonOutputFormat() {
    #expect(prompt.outputFormat.isJson)
  }

  @Test func templateId() {
    #expect(prompt.templateId.description == "Main:GeneratePageTree")
  }

  @Test func userMessageContainsUseCase() {
    #expect(prompt.userMessage.contains("serving ML inference workloads"))
  }

  @Test func userMessageContainsProviderNameFromToonData() {
    #expect(prompt.userMessage.contains("CloudX"))
  }

  @Test func userMessageMentionsAudience() {
    #expect(prompt.userMessage.contains("architect"))
  }

  @Test func hasNoTools() {
    #expect(prompt.tools.isEmpty)
  }

  @Test func parseResponse() throws {
    let result = try prompt.parseResponse(
      #"{"kind":"section","title":"Overview","children":[{"kind":"heading","level":"h1","text":"CloudX"},{"kind":"paragraph","text":"Fast compute provider."},{"kind":"button","label":"Sign Up","url":"https://cloudx.example.com"}]}"#
    )
    if case .kindSection(let s) = result {
      #expect(s.title == "Overview")
      #expect(s.children.count == 3)
    } else {
      #expect(Bool(false), "Expected section")
    }
  }
}

@Suite("03 Tools: ResearchQuestion")
struct ToolsResearchQuestionTests {
  let prompt = TypePrompt03.prompts.renderResearchQuestion(
    TypePrompt03.Schema.ResearchQuestion.Input(
      question: "Tokyo population?"
    )
  )

  @Test func registersWebSearchTool() {
    #expect(prompt.tools["webSearch"] != nil)
  }

  @Test func webSearchToolName() {
    #expect(prompt.tools["webSearch"]?.name == "webSearch")
  }

  @Test func webSearchToolDescription() {
    #expect(prompt.tools["webSearch"]?.description.contains("Search the web") == true)
  }

  @Test func webSearchToolInputJsonSchema() {
    if let schema = prompt.tools["webSearch"]?.inputJsonSchema, case .object(let dict, _) = schema {
      #expect(dict["type"] == .string("object"))
      #expect(dict["required"] == .array([.string("query")]))
      if case .object(let propDict, _) = dict["properties"] {
        #expect(propDict["query"] == .object(["type": .string("string")], ["type"]))
      } else {
        #expect(Bool(false), "Expected properties object")
      }
    } else {
      #expect(Bool(false), "Expected webSearch inputJsonSchema object")
    }
  }

  @Test func promptToolsEnum() {
    #expect(TypePrompt03.PromptTools.ResearchQuestion.webSearch.toolName == "webSearch")
    #expect(TypePrompt03.PromptTools.ResearchQuestion.webSearch.description == "webSearch")
    #expect(String(describing: TypePrompt03.PromptTools.ResearchQuestion.webSearch) == "webSearch")
    #expect(TypePrompt03.PromptTools.ResearchQuestion.allCases == [.webSearch])
  }

  @Test func producesOneExampleWithOneIntermediateStep() {
    #expect(prompt.examples.count == 1)
    #expect(prompt.examples[0].intermediateSteps.count == 1)
  }

  @Test func exampleToolCallIds() {
    let tc = prompt.examples[0].intermediateSteps[0].toolCalls[0]
    #expect(tc.callId == "s1")
    #expect(tc.toolName == "webSearch")
  }

  @Test func exampleToolCallStringifiedInput() {
    let tc = prompt.examples[0].intermediateSteps[0].toolCalls[0]
    #expect(tc.stringifiedInput.contains("Tokyo population 2024"))
  }

  @Test func executeToolsCallsExecutorAndReturnsOutput() async throws {
    let toolCalls = [
      TypePrompt03.ToolCall(
        callId: "call_1",
        toolName: "webSearch",
        stringifiedInput: "{\"query\":\"Tokyo population\"}"
      )
    ]
    let results = try await prompt.executeTools(
      toolCalls,
      toolExecutor: MockWebSearchExecutor()
    )
    #expect(results.count == 1)
    #expect(results[0].callId == "call_1")
    #expect(results[0].stringifiedOutput.contains("Tokyo Population 2024"))
  }

  @Test func executeToolsAcceptsSequence() async throws {
    let toolCalls = [
      TypePrompt03.ToolCall(
        callId: "call_1",
        toolName: "webSearch",
        stringifiedInput: "{\"query\":\"Tokyo population\"}"
      )
    ]
    let results = try await prompt.executeTools(
      toolCalls.dropFirst(0),
      toolExecutor: MockWebSearchExecutor()
    )
    #expect(results.count == 1)
    #expect(results[0].callId == "call_1")
  }

  @Test func executeToolsThrowsForUnknownTool() async throws {
    let toolCalls = [
      TypePrompt03.ToolCall(
        callId: "c1",
        toolName: "noSuchTool",
        stringifiedInput: "{}"
      )
    ]
    await #expect(throws: Error.self) {
      try await prompt.executeTools(toolCalls, toolExecutor: MockWebSearchExecutor())
    }
  }
}

@Suite("04 Variants: WriteProductDescription")
struct VariantsProductDescriptionTests {
  static let features = ["removes 99.9% of contaminants", "lasts 6 months"]

  let marketing = TypePrompt04.prompts.renderWriteProductDescription(
    TypePrompt04.Schema.WriteProductDescription.Input(
      productName: "AquaFilter Pro",
      features: features,
      variant: .marketing
    )
  )
  let technical = TypePrompt04.prompts.renderWriteProductDescription(
    TypePrompt04.Schema.WriteProductDescription.Input(
      productName: "AquaFilter Pro",
      features: features,
      variant: .technical
    )
  )
  let brief = TypePrompt04.prompts.renderWriteProductDescription(
    TypePrompt04.Schema.WriteProductDescription.Input(
      productName: "AquaFilter Pro",
      features: features,
      variant: .brief
    )
  )

  @Test func marketingSystemPrompt() {
    #expect(marketing.systemMessage.contains("benefit-focused"))
  }

  @Test func technicalSystemPrompt() {
    #expect(technical.systemMessage.contains("specification-driven"))
  }

  @Test func briefSystemPrompt() {
    #expect(brief.systemMessage.contains("single punchy sentence"))
  }

  @Test func allVariantsShareSameUserMessage() {
    #expect(marketing.userMessage == technical.userMessage)
    #expect(technical.userMessage == brief.userMessage)
  }

  @Test func userMessageContainsProductName() {
    #expect(marketing.userMessage.contains("AquaFilter Pro"))
  }

  @Test func userMessageContainsFeaturesAsJson() {
    #expect(marketing.userMessage.contains("removes 99.9% of contaminants"))
  }

  @Test func marketingHasOneExample() {
    #expect(marketing.examples.count == 1)
  }

  @Test func templateIdSameAcrossVariants() {
    #expect(marketing.templateId.description == "Main:WriteProductDescription")
    #expect(technical.templateId.description == "Main:WriteProductDescription")
    #expect(brief.templateId.description == "Main:WriteProductDescription")
  }

  @Test func variantsHaveDifferentSystemMessages() {
    #expect(marketing.systemMessage != technical.systemMessage)
    #expect(technical.systemMessage != brief.systemMessage)
  }
}

@Suite("05 Snippets: SummarizeDocument")
struct SnippetsSummarizeDocumentTests {
  @Test func switchSnippetSelectsExecutiveInstruction() {
    let p = TypePrompt05.prompts.renderSummarizeDocument(
      TypePrompt05.Schema.SummarizeDocument.Input(
        title: "T",
        content: "C",
        audience: .executive
      )
    )
    #expect(p.systemMessage.contains("non-technical executive audience"))
  }

  @Test func switchSnippetSelectsTechnicalInstruction() {
    let p = TypePrompt05.prompts.renderSummarizeDocument(
      TypePrompt05.Schema.SummarizeDocument.Input(
        title: "T",
        content: "C",
        audience: .technical
      )
    )
    #expect(p.systemMessage.contains("technical audience"))
  }

  @Test func switchSnippetSelectsGeneralInstruction() {
    let p = TypePrompt05.prompts.renderSummarizeDocument(
      TypePrompt05.Schema.SummarizeDocument.Input(
        title: "T",
        content: "C",
        audience: .general
      )
    )
    #expect(p.systemMessage.contains("general audience"))
  }

  @Test func conditionalSnippetFocusInstructionWhenFocusTopicSet() {
    let p = TypePrompt05.prompts.renderSummarizeDocument(
      TypePrompt05.Schema.SummarizeDocument.Input(
        title: "T",
        content: "C",
        focusTopic: "climate change",
        audience: .general
      )
    )
    #expect(p.systemMessage.contains("climate change"))
  }

  @Test func conditionalSnippetNoFocusInstructionWhenAbsent() {
    let p = TypePrompt05.prompts.renderSummarizeDocument(
      TypePrompt05.Schema.SummarizeDocument.Input(
        title: "T",
        content: "C",
        audience: .executive
      )
    )
    #expect(!p.systemMessage.contains("Focus the summary"))
  }
}

@Suite("06 Shared Types: ShippingConfirmation & ReturnSlip")
struct SharedTypesTests {
  static let address = TypePrompt06.Schema.Shared.Address(
    street: "1 Main St",
    city: "Paris",
    country: "France"
  )

  static let contact = TypePrompt06.Schema.Shared.ContactInfo(
    name: "Alice Dupont",
    email: "alice@example.com",
    address: address
  )

  @Test func shippingConfirmation() {
    let prompt = TypePrompt06.prompts.renderShippingConfirmation(
      TypePrompt06.Schema.ShippingConfirmation.Input(
        recipient: Self.contact,
        orderNumber: "ORD-1234",
        estimatedDelivery: "2026-08-20",
        items: [
          TypePrompt06.Schema.ShippingConfirmation.Input_Items(
            name: "Laptop",
            quantity: 1
          )
        ]
      )
    )

    #expect(prompt.outputFormat == .text)
    #expect(prompt.templateId.description == "Main:ShippingConfirmation")
    #expect(prompt.userMessage.contains("Alice Dupont"))
    #expect(prompt.userMessage.contains("ORD-1234"))
    #expect(prompt.systemMessage.contains("confirmation email"))
  }

  @Test func returnSlip() {
    let prompt = TypePrompt06.prompts.renderReturnSlip(
      TypePrompt06.Schema.ReturnSlip.Input(
        customer: Self.contact,
        returnReason: .defective,
        orderNumber: "ORD-1234"
      )
    )

    #expect(prompt.outputFormat == .text)
    #expect(prompt.templateId.description == "Main:ReturnSlip")
    #expect(prompt.userMessage.contains("Alice Dupont"))
    #expect(prompt.userMessage.contains("defective"))
  }
}

@Suite("07 Namespaces: Finance & Legal")
struct NamespacesTests {
  @Test func financeSummarizeTransaction() {
    let prompt = TypePrompt07.prompts.finance.renderSummarizeTransaction(
      TypePrompt07.Schema.Finance.SummarizeTransaction.Input(
        description: "AWS monthly bill",
        amount: TypePrompt07.Schema.Finance.Shared.MoneyAmount(
          value: 450.0,
          currency: .usd
        ),
        category: .expense,
        date: "2026-08-01"
      )
    )

    #expect(prompt.templateId.description == "Finance:SummarizeTransaction")
    #expect(prompt.outputFormat.isJson)
    #expect(prompt.userMessage.contains("AWS monthly bill"))
  }

  @Test func financeDetectAnomaly() {
    let prompt = TypePrompt07.prompts.finance.renderDetectAnomaly(
      TypePrompt07.Schema.Finance.DetectAnomaly.Input(
        recentTransactions: [],
        newTransaction: TypePrompt07.Schema.Finance.DetectAnomaly.Input_NewTransaction(
          description: "Casino chips",
          amount: TypePrompt07.Schema.Finance.Shared.MoneyAmount(
            value: 5000.0,
            currency: .usd
          ),
          date: "2026-08-17"
        )
      )
    )

    #expect(prompt.templateId.description == "Finance:DetectAnomaly")
    #expect(prompt.userMessage.contains("Casino chips"))
    #expect(prompt.tools.isEmpty)
  }

  @Test func legalDraftNda() {
    let prompt = TypePrompt07.prompts.legal.renderDraftNda(
      TypePrompt07.Schema.Legal.DraftNda.Input(
        disclosingParty: TypePrompt07.Schema.Legal.Shared.Party(
          name: "Acme Corp",
          role: .client,
          jurisdiction: "California"
        ),
        receivingParty: TypePrompt07.Schema.Legal.Shared.Party(
          name: "Beta LLC",
          role: .counterparty,
          jurisdiction: "Delaware"
        ),
        purposeOfDisclosure: "Evaluating a potential acquisition",
        durationYears: 3
      )
    )

    #expect(prompt.templateId.description == "Legal:DraftNda")
    #expect(prompt.outputFormat == .text)
    #expect(prompt.userMessage.contains("Acme Corp"))
    #expect(prompt.userMessage.contains("Beta LLC"))
    #expect(prompt.systemMessage.contains("non-disclosure agreement"))
  }

  @Test func legalSummarizeClause() {
    let prompt = TypePrompt07.prompts.legal.renderSummarizeClause(
      TypePrompt07.Schema.Legal.SummarizeClause.Input(
        clauseText: "The party shall indemnify and hold harmless...",
        reviewingParty: TypePrompt07.Schema.Legal.Shared.Party(
          name: "Alice",
          role: .client,
          jurisdiction: "NY"
        )
      )
    )

    #expect(prompt.templateId.description == "Legal:SummarizeClause")
    #expect(prompt.outputFormat.isJson)
    #expect(prompt.userMessage.contains("Alice"))
    #expect(prompt.userMessage.contains("indemnify"))
    #expect(prompt.userMessage.contains("<Clause>"))
  }
}

@Suite("E01 AnalyzeSalesData: CSV & TSV formatting")
struct E01AnalyzeSalesDataTests {
  static let rows = [
    TypePrompt.Schema.AnalyzeSalesData.SalesRow(
      product: "Widget A",
      units: 120,
      revenueCents: 240000,
      region: "north"
    ),
    TypePrompt.Schema.AnalyzeSalesData.SalesRow(
      product: "Widget B",
      units: 85,
      revenueCents: 340000,
      region: "south"
    ),
  ]

  let csv = TypePrompt.prompts.renderAnalyzeSalesData(
    TypePrompt.Schema.AnalyzeSalesData.Input(
      rows: rows,
      question: "Top product?",
      variant: .csv
    )
  )

  let tsv = TypePrompt.prompts.renderAnalyzeSalesData(
    TypePrompt.Schema.AnalyzeSalesData.Input(
      rows: rows,
      question: "Top product?",
      variant: .tsv
    )
  )

  @Test func csvUserMessageHasCommaSeparatedHeader() {
    #expect(csv.userMessage.contains("product,units,revenueCents,region"))
  }

  @Test func csvUserMessageHasCommaSeparatedRows() {
    #expect(csv.userMessage.contains("Widget A,120,240000,north"))
    #expect(csv.userMessage.contains("Widget B,85,340000,south"))
  }

  @Test func tsvUserMessageHasTabSeparatedHeader() {
    #expect(tsv.userMessage.contains("product\tunits\trevenueCents\tregion"))
  }

  @Test func tsvUserMessageHasTabSeparatedRows() {
    #expect(tsv.userMessage.contains("Widget A\t120\t240000\tnorth"))
    #expect(tsv.userMessage.contains("Widget B\t85\t340000\tsouth"))
  }

  @Test func csvAndTsvProduceDifferentUserMessages() {
    #expect(csv.userMessage != tsv.userMessage)
  }

  @Test func csvVariantHasOneExampleWithCsvData() {
    #expect(csv.examples.count == 1)
    #expect(csv.examples[0].userMessage.contains("product,units,revenueCents,region"))
  }

  @Test func tsvVariantHasOneExampleWithTsvData() {
    #expect(tsv.examples.count == 1)
    #expect(tsv.examples[0].userMessage.contains("product\tunits\trevenueCents\tregion"))
  }

  @Test func csvSystemMessageMentionsCsv() {
    #expect(csv.systemMessage.contains("comma-separated"))
  }

  @Test func tsvSystemMessageMentionsTsv() {
    #expect(tsv.systemMessage.contains("tab-separated"))
  }
}

@Suite("E01 Spec Serialization")
struct E01SpecSerializationTests {
  @Test func exprSerializationAndDeserialization() throws {
    let num = TypePrompt.Schema.Shared.Expr.kindNumber(
      TypePrompt.Schema.Shared.Expr_KindNumber(value: 42.0)
    )
    let encoder = JSONEncoder()
    let decoder = JSONDecoder()

    let jsonNum = try encoder.encode(num)
    let parsedNum = try decoder.decode(TypePrompt.Schema.Shared.Expr.self, from: jsonNum)
    if case .kindNumber(let n) = parsedNum {
      #expect(n.value == 42.0)
    } else {
      Issue.record("Expected .kindNumber")
    }

    let add = TypePrompt.Schema.Shared.Expr.kindAdd(
      TypePrompt.Schema.Shared.Expr_KindAdd(
        left: .kindNumber(TypePrompt.Schema.Shared.Expr_KindNumber(value: 1.0)),
        right: .kindNumber(TypePrompt.Schema.Shared.Expr_KindNumber(value: 2.0))
      )
    )
    let jsonAdd = try encoder.encode(add)
    let parsedAdd = try decoder.decode(TypePrompt.Schema.Shared.Expr.self, from: jsonAdd)
    if case .kindAdd(let a) = parsedAdd {
      if case .kindNumber(let l) = a.left {
        #expect(l.value == 1.0)
      } else {
        Issue.record("Expected left to be .kindNumber")
      }
      if case .kindNumber(let r) = a.right {
        #expect(r.value == 2.0)
      } else {
        Issue.record("Expected right to be .kindNumber")
      }
    } else {
      Issue.record("Expected .kindAdd")
    }
  }

  @Test func constructWithoutOptionalFields() {
    let matrix = TypePrompt.Schema.Shared.Matrix(
      matrix: [],
      ints: [1, 2, 3],
      init: true,
      encode: false
    )
    #expect(matrix.otherMatrix == nil)
    #expect(matrix.foo == nil)
  }

  @Test func enumWithCommonFieldsSerialization() throws {
    let notSuccess = TypePrompt.Schema.Shared.EnumWithCommonFields.notSuccess(
      TypePrompt.Schema.Shared.EnumWithCommonFields_NotSuccess(
        x: 10,
        y: 20.5,
        z: "error"
      )
    )
    #expect(notSuccess.x == 10)
    #expect(notSuccess.y == 20.5)

    let encoder = JSONEncoder()
    let decoder = JSONDecoder()

    let jsonNotSuccess = try encoder.encode(notSuccess)
    let decodedNotSuccess = try decoder.decode(
      TypePrompt.Schema.Shared.EnumWithCommonFields.self,
      from: jsonNotSuccess
    )
    #expect(decodedNotSuccess.x == 10)
    #expect(decodedNotSuccess.y == 20.5)

    let success = TypePrompt.Schema.Shared.EnumWithCommonFields.success(
      TypePrompt.Schema.Shared.EnumWithCommonFields_Success(
        x: 42,
        y: 84.0,
        z: 99
      )
    )
    #expect(success.x == 42)
    #expect(success.y == 84.0)

    let jsonSuccess = try encoder.encode(success)
    let decodedSuccess = try decoder.decode(
      TypePrompt.Schema.Shared.EnumWithCommonFields.self,
      from: jsonSuccess
    )
    #expect(decodedSuccess.x == 42)
    #expect(decodedSuccess.y == 84.0)
  }

  @Test func stringEnumSerialization() throws {
    let variant = TypePrompt.Schema.AnalyzeSalesData.Input_Variant.csv
    let encoder = JSONEncoder()
    let decoder = JSONDecoder()

    let data = try encoder.encode(variant)
    #expect(String(decoding: data, as: UTF8.self) == "\"csv\"")

    let decoded = try decoder.decode(
      TypePrompt.Schema.AnalyzeSalesData.Input_Variant.self,
      from: data
    )
    #expect(decoded == .csv)
  }
}

@Suite("TemplateOverrider")
struct TemplateOverriderTests {
  @Test func signatureCheckAndOverrides() throws {
    let data = try TypePrompt01.TemplateOverrider.templatesData()
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let sig = json?["signature"] as? String
    #expect(sig != nil)
    #expect(!sig!.isEmpty)

    let wrongDoc = try JSONSerialization.data(
      withJSONObject: [
        "signature": "wrong_sig",
        "edition": 0,
        "singleNamespace": true,
        "templates": [String: Any](),
        "tools": [String: Any](),
        "sourceFiles": [String: Any](),
      ]
    )
    #expect(throws: Error.self) {
      try TypePrompt01.TemplateOverrider.applyOverrides(wrongDoc)
    }

    let prompts = try TypePrompt01.TemplateOverrider.applyOverrides(data)
    let prompt = prompts.renderTranslate(
      TypePrompt01.Schema.Translate.Input(
        text: "Hello",
        targetLanguage: "French"
      )
    )
    #expect(prompt.userMessage.contains("French"))
  }
}
