import 'package:test/test.dart';
import 'package:typeprompt_e2e_test/gen/prompts_01.dart' as p01;
import 'package:typeprompt_e2e_test/gen/prompts_02.dart' as p02;
import 'package:typeprompt_e2e_test/gen/prompts_03.dart' as p03;
import 'package:typeprompt_e2e_test/gen/prompts_04.dart' as p04;
import 'package:typeprompt_e2e_test/gen/prompts_05.dart' as p05;
import 'package:typeprompt_e2e_test/gen/prompts_06.dart' as p06;
import 'package:typeprompt_e2e_test/gen/prompts_07.dart' as p07;
import 'package:typeprompt_e2e_test/gen/prompts_e01.dart' as pe01;
import 'package:typeprompt_e2e_test/gen/prompts_e02.dart' as pe02;
import 'package:typeprompt_e2e_test/gen/prompts_e03.dart' as pe03;

class MockWebSearchExecutor implements p03.ToolExecutor_WebSearch {
  @override
  Future<p03.WebSearch_Output> webSearch(p03.WebSearch_Input input) async {
    return p03.WebSearch_Output(
      results: [
        p03.WebSearch_Output_Results(
          title: "Tokyo Population 2024",
          url: "https://example.com/tokyo",
          snippet: "14 million",
        ),
      ],
    );
  }
}

class ThrowingWebSearchExecutor implements p03.ToolExecutor_WebSearch {
  @override
  Future<p03.WebSearch_Output> webSearch(p03.WebSearch_Input input) async {
    throw Exception("Search service failure");
  }
}

void main() {
  // To disable unused imports warning
  [pe02.noTools, pe03.noTools];

  group('01 Basics: Translate', () {
    final prompt = p01.prompts.renderTranslate(
      p01.Translate_Input(
        text: "Hello world",
        targetLanguage: "French",
      ),
    );

    test('text output format', () {
      expect(prompt.outputFormat, isA<p01.TextOutputFormat>());
    });

    test('templateId', () {
      expect(prompt.templateId.toString(), equals("Main:Translate"));
      expect(prompt.templateId, equals(p01.TemplateId.translate));
    });

    test('systemMessage mentions translator role', () {
      expect(prompt.systemMessage, contains("professional translator"));
    });

    test('userMessage mentions target language', () {
      expect(prompt.userMessage, contains("French"));
    });

    test('enclosed renders correct tag in userMessage', () {
      expect(prompt.userMessage, contains("<Text>"));
    });

    test('produces two examples', () {
      expect(prompt.examples.length, equals(2));
    });

    test('first example response is translated string', () {
      expect(
        prompt.examples[0].response,
        equals("La réunion est prévue pour lundi à 15h."),
      );
    });

    test('example userMessage contains enclosed tag', () {
      expect(prompt.examples[0].userMessage, contains("<Text>"));
    });

    test('parseResponse returns raw string', () {
      expect(prompt.parseResponse("Bonjour"), equals("Bonjour"));
    });

    test('has no tools', () {
      expect(prompt.tools.isEmpty, isTrue);
    });
  });

  group('02 Structured Output: TriageTicket', () {
    final prompt = p02.prompts.renderTriageTicket(
      p02.TriageTicket_Input(
        subject: "App crashes on login",
        body: "It crashes every time.",
        customerTier: p02.TriageTicket_Input_CustomerTier.pro,
        recentTickets: const [],
      ),
    );

    test('json output format', () {
      expect(prompt.outputFormat, isA<p02.JsonOutputFormat>());
      final format = prompt.outputFormat as p02.JsonOutputFormat;
      expect(format.jsonSchema['type'], equals('object'));
      expect(format.jsonSchema['required'], contains('category'));
      expect(format.jsonSchema['required'], contains('urgency'));
      expect(format.jsonSchema['properties'], isA<Map>());
      expect((format.jsonSchema['properties'] as Map)['category'], isNotNull);
    });

    test('has no recursive type', () {
      final format = prompt.outputFormat as p02.JsonOutputFormat;
      expect(format.hasRecursiveType, isFalse);
    });

    test('c content stripped to plain text', () {
      expect(prompt.systemMessage, contains("urgency"));
      expect(prompt.systemMessage, contains('"critical"'));
      expect(prompt.systemMessage, isNot(contains("<c>")));
    });

    test('produces two examples', () {
      expect(prompt.examples.length, equals(2));
    });

    test('first example response contains output category', () {
      expect(prompt.examples[0].response, contains('"technical-issue"'));
    });

    test('second example response contains output category', () {
      expect(prompt.examples[1].response, contains('"feature-request"'));
    });

    test('parseResponse parses JSON', () {
      final result = prompt.parseResponse(
        '{"category":"billing","urgency":"low","summary":"Invoice question","suggestedActions":[]}',
      );
      expect(result.category, equals(p02.TriageTicket_TicketCategory.billing));
      expect(result.urgency, equals(p02.TriageTicket_Output_Urgency.low));
      expect(result.summary, equals("Invoice question"));
    });

    test('parseResponse strips json code fences', () {
      final result = prompt.parseResponse(
        '```json\n{"category":"other","urgency":"medium","summary":"test","suggestedActions":[]}\n```',
      );
      expect(result.category, equals(p02.TriageTicket_TicketCategory.other));
    });

    test('parseResponse strips plain code fences', () {
      final result = prompt.parseResponse(
        '```\n{"category":"other","urgency":"medium","summary":"test","suggestedActions":[]}\n```',
      );
      expect(result.category, equals(p02.TriageTicket_TicketCategory.other));
    });

    test('optional field absent when omitted', () {
      final result = prompt.parseResponse(
        '{"category":"feature-request","urgency":"low","summary":"Dark mode","suggestedActions":["Log request"]}',
      );
      expect(
        result.category,
        equals(p02.TriageTicket_TicketCategory.featureRequest),
      );
      expect(result.suggestedReply, isNull);
    });

    test('userMessage contains YAML rendered recentTickets', () {
      final p = p02.prompts.renderTriageTicket(
        p02.TriageTicket_Input(
          subject: "X",
          body: "Y",
          customerTier: p02.TriageTicket_Input_CustomerTier.pro,
          recentTickets: [
            p02.TriageTicket_Input_RecentTickets(
              id: "T-1",
              summary: "Login bug",
              category: p02.TriageTicket_TicketCategory.technicalIssue,
            ),
          ],
        ),
      );
      expect(p.userMessage, matches(RegExp(r'id:\s*"?T-1"?')));
    });

    test('userMessage contains input as YAML', () {
      expect(prompt.userMessage, contains("subject:"));
      expect(prompt.userMessage, contains("customerTier:"));
    });

    test('meta contains declared model and temperature', () {
      expect(prompt.meta.model, equals(p02.Meta_Meta_Model.gpt4o));
      expect(prompt.meta.temperature, equals(0.2));
    });
  });

  group('02 Complex Types: GeneratePageTree', () {
    final provider = p02.GeneratePageTree_Provider(
      name: "CloudX",
      region: "us-east",
      category: p02.GeneratePageTree_ProductCategory.compute,
      pricing: p02.GeneratePageTree_Pricing(
        model: p02.GeneratePageTree_Pricing_Model.perHour,
        basePrice: 0.1,
      ),
      benchmarks: [
        p02.GeneratePageTree_Benchmark(
          name: "throughput",
          score: 1000.0,
          unit: "rps",
        ),
      ],
      pros: ["fast", "reliable"],
      cons: ["pricey"],
    );

    final prompt = p02.prompts.renderGeneratePageTree(
      p02.GeneratePageTree_Input(
        providers: [provider],
        useCase: "serving ML inference workloads",
        audience: p02.GeneratePageTree_Input_Audience.architect,
      ),
    );

    test('json output format', () {
      expect(prompt.outputFormat, isA<p02.JsonOutputFormat>());
    });

    test('has recursive type', () {
      final format = prompt.outputFormat as p02.JsonOutputFormat;
      expect(format.hasRecursiveType, isTrue);
    });

    test('templateId', () {
      expect(
        prompt.templateId.toString(),
        equals("Main:GeneratePageTree"),
      );
    });

    test('userMessage contains useCase', () {
      expect(prompt.userMessage, contains("serving ML inference workloads"));
    });

    test('userMessage contains provider name from TOON data', () {
      expect(prompt.userMessage, contains("CloudX"));
    });

    test('userMessage mentions audience', () {
      expect(prompt.userMessage, contains("architect"));
    });

    test('has no tools', () {
      expect(prompt.tools.isEmpty, isTrue);
    });

    test('parseResponse parses PageNode', () {
      final result = prompt.parseResponse(
        '{"root":{"kind":"section","title":"Overview","children":[{"kind":"heading","level":"h1","text":"CloudX"},{"kind":"paragraph","text":"Fast compute provider."},{"kind":"button","label":"Sign Up","url":"https://cloudx.example.com"}]}}',
      );
      expect(result.root, isA<p02.GeneratePageTree_PageNode_KindSection>());
      final section = result.root as p02.GeneratePageTree_PageNode_KindSection;
      expect(section.title, equals("Overview"));
      expect(section.children.length, equals(3));
    });
  });

  group('03 Tools: ResearchQuestion', () {
    final prompt = p03.prompts.renderResearchQuestion(
      p03.ResearchQuestion_Input(
        question: "Tokyo population?",
      ),
    );

    test('registers webSearch tool', () {
      expect(prompt.tools.containsKey("webSearch"), isTrue);
    });

    test('webSearch tool name', () {
      expect(prompt.tools["webSearch"]?.name, equals("webSearch"));
    });

    test('webSearch tool description', () {
      expect(
        prompt.tools["webSearch"]?.description,
        contains("Search the web"),
      );
    });

    test('webSearch tool inputJsonSchema', () {
      final schema = prompt.tools["webSearch"]?.inputJsonSchema;
      expect(schema, isNotNull);
      expect(schema?['type'], equals('object'));
      expect(schema?['required'], equals(['query']));
      expect(
          (schema?['properties'] as Map?)?['query']?['type'], equals('string'));
    });

    test('PromptTools enum', () {
      expect(p03.PromptTools_ResearchQuestion.webSearch.toolName,
          equals('webSearch'));
      expect(p03.PromptTools_ResearchQuestion.webSearch.toString(),
          equals('webSearch'));
    });

    test('produces one example with one step', () {
      expect(prompt.examples.length, equals(1));
      expect(prompt.examples[0].steps.length, equals(1));
    });

    test('example tool call ids', () {
      final tc = prompt.examples[0].steps[0].toolCalls[0];
      expect(tc.callId, equals("s1"));
      expect(tc.toolName, equals("webSearch"));
    });

    test('example tool call stringifiedInput', () {
      final tc = prompt.examples[0].steps[0].toolCalls[0];
      expect(tc.stringifiedInput, contains("Tokyo population 2024"));
    });

    test('executeTools calls executor and returns output', () async {
      final toolCalls = [
        p03.ToolCall(
          callId: "call_1",
          toolName: "webSearch",
          stringifiedInput: '{"query":"Tokyo population"}',
        ),
      ];
      final results = await prompt.executeTools(
        toolCalls,
        MockWebSearchExecutor(),
      );
      expect(results.length, equals(1));
      expect(results[0].callId, equals("call_1"));
      expect(results[0].stringifiedOutput, contains("Tokyo Population 2024"));
    });

    test('executeTools accepts Set (Iterable)', () async {
      final toolCalls = {
        p03.ToolCall(
          callId: "call_1",
          toolName: "webSearch",
          stringifiedInput: '{"query":"Tokyo population"}',
        ),
      };
      final results = await prompt.executeTools(
        toolCalls,
        MockWebSearchExecutor(),
      );
      expect(results.length, equals(1));
      expect(results[0].callId, equals("call_1"));
    });

    test('executeTools returns error for unknown tool', () async {
      final toolCalls = [
        p03.ToolCall(
          callId: "c1",
          toolName: "noSuchTool",
          stringifiedInput: "{}",
        ),
      ];
      final results = await prompt.executeTools(
        toolCalls,
        MockWebSearchExecutor(),
      );
      expect(results.length, equals(1));
      expect(results[0].callId, equals("c1"));
      expect(results[0].error, equals("Tool not found: noSuchTool"));
      expect(
        results[0].stringifiedOutput,
        contains('"error":"Tool not found: noSuchTool"'),
      );
    });

    test('executeTools returns error when executor throws', () async {
      final toolCalls = [
        p03.ToolCall(
          callId: "call_err",
          toolName: "webSearch",
          stringifiedInput: '{"query":"Tokyo population"}',
        ),
      ];
      final results = await prompt.executeTools(
        toolCalls,
        ThrowingWebSearchExecutor(),
      );
      expect(results.length, equals(1));
      expect(results[0].callId, equals("call_err"));
      expect(results[0].error, contains("Search service failure"));
      expect(
        results[0].stringifiedOutput,
        contains("Search service failure"),
      );
    });
  });

  group('04 Variants: WriteProductDescription', () {
    const features = ["removes 99.9% of contaminants", "lasts 6 months"];
    final marketing = p04.prompts.renderWriteProductDescription(
      p04.WriteProductDescription_Input(
        productName: "AquaFilter Pro",
        features: features,
        variant: p04.WriteProductDescription_Input_Variant.marketing,
      ),
    );
    final technical = p04.prompts.renderWriteProductDescription(
      p04.WriteProductDescription_Input(
        productName: "AquaFilter Pro",
        features: features,
        variant: p04.WriteProductDescription_Input_Variant.technical,
      ),
    );
    final brief = p04.prompts.renderWriteProductDescription(
      p04.WriteProductDescription_Input(
        productName: "AquaFilter Pro",
        features: features,
        variant: p04.WriteProductDescription_Input_Variant.brief,
      ),
    );

    test('marketing system prompt', () {
      expect(marketing.systemMessage, contains("benefit-focused"));
    });

    test('technical system prompt', () {
      expect(technical.systemMessage, contains("specification-driven"));
    });

    test('brief system prompt', () {
      expect(brief.systemMessage, contains("single punchy sentence"));
    });

    test('all variants share same userMessage', () {
      expect(marketing.userMessage, equals(technical.userMessage));
      expect(technical.userMessage, equals(brief.userMessage));
    });

    test('userMessage contains product name', () {
      expect(marketing.userMessage, contains("AquaFilter Pro"));
    });

    test('userMessage contains features as json', () {
      expect(marketing.userMessage, contains("removes 99.9% of contaminants"));
    });

    test('marketing has one example', () {
      expect(marketing.examples.length, equals(1));
    });

    test('templateId same across variants', () {
      expect(
        marketing.templateId.toString(),
        equals("Main:WriteProductDescription"),
      );
      expect(
        technical.templateId.toString(),
        equals("Main:WriteProductDescription"),
      );
      expect(
        brief.templateId.toString(),
        equals("Main:WriteProductDescription"),
      );
    });

    test('variants have different system messages', () {
      expect(marketing.systemMessage, isNot(equals(technical.systemMessage)));
      expect(technical.systemMessage, isNot(equals(brief.systemMessage)));
    });
  });

  group('05 Snippets: SummarizeDocument', () {
    test('switch snippet selects executive instruction', () {
      final p = p05.prompts.renderSummarizeDocument(
        p05.SummarizeDocument_Input(
          title: "T",
          content: "C",
          audience: p05.SummarizeDocument_Input_Audience.executive,
        ),
      );
      expect(p.systemMessage, contains("non-technical executive audience"));
    });

    test('switch snippet selects technical instruction', () {
      final p = p05.prompts.renderSummarizeDocument(
        p05.SummarizeDocument_Input(
          title: "T",
          content: "C",
          audience: p05.SummarizeDocument_Input_Audience.technical,
        ),
      );
      expect(p.systemMessage, contains("technical audience"));
    });

    test('switch snippet selects general instruction', () {
      final p = p05.prompts.renderSummarizeDocument(
        p05.SummarizeDocument_Input(
          title: "T",
          content: "C",
          audience: p05.SummarizeDocument_Input_Audience.general,
        ),
      );
      expect(p.systemMessage, contains("general audience"));
    });

    test('conditional snippet focus instruction when focusTopic set', () {
      final p = p05.prompts.renderSummarizeDocument(
        p05.SummarizeDocument_Input(
          title: "T",
          content: "C",
          focusTopic: "climate change",
          audience: p05.SummarizeDocument_Input_Audience.general,
        ),
      );
      expect(p.systemMessage, contains("climate change"));
    });

    test('conditional snippet no focus instruction when absent', () {
      final p = p05.prompts.renderSummarizeDocument(
        p05.SummarizeDocument_Input(
          title: "T",
          content: "C",
          audience: p05.SummarizeDocument_Input_Audience.executive,
        ),
      );
      expect(p.systemMessage, isNot(contains("Focus the summary")));
    });
  });

  group('06 Shared Types: ShippingConfirmation & ReturnSlip', () {
    final address = p06.Shared_Address(
      street: "1 Main St",
      city: "Paris",
      country: "France",
    );

    final contact = p06.Shared_ContactInfo(
      name: "Alice Dupont",
      email: "alice@example.com",
      address: address,
    );

    test('shipping confirmation', () {
      final prompt = p06.prompts.renderShippingConfirmation(
        p06.ShippingConfirmation_Input(
          recipient: contact,
          orderNumber: "ORD-1234",
          estimatedDelivery: "2026-08-20",
          items: [
            p06.ShippingConfirmation_Input_Items(name: "Laptop", quantity: 1),
          ],
        ),
      );

      expect(prompt.outputFormat, isA<p06.TextOutputFormat>());
      expect(prompt.templateId.toString(), equals("Main:ShippingConfirmation"));
      expect(prompt.userMessage, contains("Alice Dupont"));
      expect(prompt.userMessage, contains("ORD-1234"));
      expect(prompt.systemMessage, contains("confirmation email"));
    });

    test('return slip', () {
      final prompt = p06.prompts.renderReturnSlip(
        p06.ReturnSlip_Input(
          customer: contact,
          returnReason: p06.ReturnSlip_Input_ReturnReason.defective,
          orderNumber: "ORD-1234",
        ),
      );

      expect(prompt.outputFormat, isA<p06.TextOutputFormat>());
      expect(prompt.templateId.toString(), equals("Main:ReturnSlip"));
      expect(prompt.userMessage, contains("Alice Dupont"));
      expect(prompt.userMessage, contains("defective"));
    });
  });

  group('07 Namespaces: Finance & Legal', () {
    test('finance summarize transaction', () {
      final prompt = p07.prompts.finance.renderSummarizeTransaction(
        p07.Finance_SummarizeTransaction_Input(
          description: "AWS monthly bill",
          amount: p07.Finance_Shared_MoneyAmount(
            value: 450.0,
            currency: p07.Finance_Shared_Currency.usd,
          ),
          category: p07.Finance_SummarizeTransaction_Input_Category.expense,
          date: "2026-08-01",
        ),
      );

      expect(
        prompt.templateId.toString(),
        equals("Finance:SummarizeTransaction"),
      );
      expect(prompt.outputFormat, isA<p07.JsonOutputFormat>());
      expect(
        (prompt.outputFormat as p07.JsonOutputFormat).hasRecursiveType,
        isFalse,
      );
      expect(prompt.userMessage, contains("AWS monthly bill"));
    });

    test('finance detect anomaly', () {
      final prompt = p07.prompts.finance.renderDetectAnomaly(
        p07.Finance_DetectAnomaly_Input(
          recentTransactions: const [],
          newTransaction: p07.Finance_DetectAnomaly_Input_NewTransaction(
            description: "Casino chips",
            amount: p07.Finance_Shared_MoneyAmount(
              value: 5000.0,
              currency: p07.Finance_Shared_Currency.usd,
            ),
            date: "2026-08-17",
          ),
        ),
      );

      expect(prompt.templateId.toString(), equals("Finance:DetectAnomaly"));
      expect(prompt.userMessage, contains("Casino chips"));
      expect(prompt.tools.isEmpty, isTrue);
    });

    test('legal draft NDA', () {
      final prompt = p07.prompts.legal.renderDraftNda(
        p07.Legal_DraftNda_Input(
          disclosingParty: p07.Legal_Shared_Party(
            name: "Acme Corp",
            role: p07.Legal_Shared_Party_Role.client,
            jurisdiction: "California",
          ),
          receivingParty: p07.Legal_Shared_Party(
            name: "Beta LLC",
            role: p07.Legal_Shared_Party_Role.counterparty,
            jurisdiction: "Delaware",
          ),
          purposeOfDisclosure: "Evaluating a potential acquisition",
          durationYears: 3,
        ),
      );

      expect(prompt.templateId.toString(), equals("Legal:DraftNda"));
      expect(prompt.outputFormat, isA<p07.TextOutputFormat>());
      expect(prompt.userMessage, contains("Acme Corp"));
      expect(prompt.userMessage, contains("Beta LLC"));
      expect(prompt.systemMessage, contains("non-disclosure agreement"));
    });

    test('legal summarize clause', () {
      final prompt = p07.prompts.legal.renderSummarizeClause(
        p07.Legal_SummarizeClause_Input(
          clauseText: "The party shall indemnify and hold harmless...",
          reviewingParty: p07.Legal_Shared_Party(
            name: "Alice",
            role: p07.Legal_Shared_Party_Role.client,
            jurisdiction: "NY",
          ),
        ),
      );

      expect(prompt.templateId.toString(), equals("Legal:SummarizeClause"));
      expect(prompt.outputFormat, isA<p07.JsonOutputFormat>());
      expect(
        (prompt.outputFormat as p07.JsonOutputFormat).hasRecursiveType,
        isFalse,
      );
      expect(prompt.userMessage, contains("Alice"));
      expect(prompt.userMessage, contains("indemnify"));
      expect(prompt.userMessage, contains("<Clause>"));
    });
  });

  group('E01 AnalyzeSalesData: CSV & TSV formatting', () {
    final rows = [
      pe01.AnalyzeSalesData_SalesRow(
        product: "Widget A",
        units: 120,
        revenueCents: 240000,
        region: "north",
      ),
      pe01.AnalyzeSalesData_SalesRow(
        product: "Widget B",
        units: 85,
        revenueCents: 340000,
        region: "south",
      ),
    ];

    final csv = pe01.prompts.renderAnalyzeSalesData(
      pe01.AnalyzeSalesData_Input(
        rows: rows,
        question: "Top product?",
        variant: pe01.AnalyzeSalesData_Input_Variant.csv,
      ),
    );

    final tsv = pe01.prompts.renderAnalyzeSalesData(
      pe01.AnalyzeSalesData_Input(
        rows: rows,
        question: "Top product?",
        variant: pe01.AnalyzeSalesData_Input_Variant.tsv,
      ),
    );

    test('CSV userMessage has comma separated header', () {
      expect(csv.userMessage, contains("product,units,revenueCents,region"));
    });

    test('CSV userMessage has comma separated rows', () {
      expect(csv.userMessage, contains("Widget A,120,240000,north"));
      expect(csv.userMessage, contains("Widget B,85,340000,south"));
    });

    test('TSV userMessage has tab separated header', () {
      expect(
        tsv.userMessage,
        contains("product\tunits\trevenueCents\tregion"),
      );
    });

    test('TSV userMessage has tab separated rows', () {
      expect(tsv.userMessage, contains("Widget A\t120\t240000\tnorth"));
      expect(tsv.userMessage, contains("Widget B\t85\t340000\tsouth"));
    });

    test('CSV and TSV produce different user messages', () {
      expect(csv.userMessage, isNot(equals(tsv.userMessage)));
    });

    test('CSV variant has one example with CSV data', () {
      expect(csv.examples.length, equals(1));
      expect(
        csv.examples[0].userMessage,
        contains("product,units,revenueCents,region"),
      );
    });

    test('TSV variant has one example with TSV data', () {
      expect(tsv.examples.length, equals(1));
      expect(
        tsv.examples[0].userMessage,
        contains("product\tunits\trevenueCents\tregion"),
      );
    });

    test('CSV systemMessage mentions CSV', () {
      expect(csv.systemMessage, contains("comma-separated"));
    });

    test('TSV systemMessage mentions TSV', () {
      expect(tsv.systemMessage, contains("tab-separated"));
    });
  });

  group('E01 Spec Serialization', () {
    test('Expr serialization & deserialization', () {
      final num = pe01.Shared_Expr_KindNumber(value: 42.0);
      final jsonNum = num.toJson();
      final parsedNum = pe01.Shared_Expr.fromJson(jsonNum);
      expect(parsedNum, isA<pe01.Shared_Expr_KindNumber>());
      expect((parsedNum as pe01.Shared_Expr_KindNumber).value, equals(42.0));

      final add = pe01.Shared_Expr_KindAdd(
        left: pe01.Shared_Expr_KindNumber(value: 1.0),
        right: pe01.Shared_Expr_KindNumber(value: 2.0),
      );
      final jsonAdd = add.toJson();
      final parsedAdd = pe01.Shared_Expr.fromJson(jsonAdd);
      expect(parsedAdd, isA<pe01.Shared_Expr_KindAdd>());
      final typedAdd = parsedAdd as pe01.Shared_Expr_KindAdd;
      expect((typedAdd.left as pe01.Shared_Expr_KindNumber).value, equals(1.0));
      expect(
        (typedAdd.right as pe01.Shared_Expr_KindNumber).value,
        equals(2.0),
      );
    });

    test('construct without optional fields', () {
      final matrix = pe01.Shared_Matrix(
        matrix: const [],
        ints: const [1, 2, 3],
        init: true,
        encode: false,
      );
      expect(matrix.otherMatrix, isNull);
    });

    test('EnumWithCommonFields serialization & deserialization', () {
      final notSuccess = pe01.Shared_EnumWithCommonFields_NotSuccess(
        x: 10,
        y: 20.5,
        z: "error",
      );
      expect(notSuccess.x, equals(10));
      expect(notSuccess.y, equals(20.5));
      expect(notSuccess.z, equals("error"));
      final jsonNotSuccess = notSuccess.toJson();
      expect(jsonNotSuccess["success"], isFalse);
      expect(jsonNotSuccess["x"], equals(10));
      expect(jsonNotSuccess["y"], equals(20.5));
      expect(jsonNotSuccess["z"], equals("error"));
      final decodedNotSuccess =
          pe01.Shared_EnumWithCommonFields.fromJson(jsonNotSuccess);
      expect(decodedNotSuccess.x, equals(10));
      expect(decodedNotSuccess.y, equals(20.5));

      final success = pe01.Shared_EnumWithCommonFields_Success(
        x: 42,
        y: 84.0,
        z: 99,
      );
      expect(success.x, equals(42));
      expect(success.y, equals(84.0));
      expect(success.z, equals(99));
      final jsonSuccess = success.toJson();
      expect(jsonSuccess["success"], isTrue);
      expect(jsonSuccess["x"], equals(42));
      expect(jsonSuccess["y"], equals(84.0));
      expect(jsonSuccess["z"], equals(99));
      final decodedSuccess =
          pe01.Shared_EnumWithCommonFields.fromJson(jsonSuccess);
      expect(decodedSuccess.x, equals(42));
      expect(decodedSuccess.y, equals(84.0));
    });

    test('string enum serialization & deserialization', () {
      final variant = pe01.AnalyzeSalesData_Input_Variant.csv;
      expect(variant.toJson(), equals("csv"));
      expect(
        pe01.AnalyzeSalesData_Input_Variant.fromJson("csv"),
        equals(pe01.AnalyzeSalesData_Input_Variant.csv),
      );
    });

    test('ComplexType serialization & deserialization', () {
      final sq = pe01.Shared_Square(size: 10.0, fromJson: "fj", self: "sf");
      final sq2 = pe01.Shared_Square(size: 20.0, fromJson: "fj2", self: "sf2");
      final sq3 = pe01.Shared_Square(size: 30.0, fromJson: "fj3", self: "sf3");
      final sq4 = pe01.Shared_Square(size: 40.0, fromJson: "fj4", self: "sf4");

      final full = pe01.Shared_ComplexType(
        stringField: "hello",
        intField: 42,
        numField: 3.14,
        boolField: true,
        enumField: pe01.Shared_E.fooBar,
        stringUnion: pe01.Shared_ComplexType_StringUnion.fooBar,
        unionField: pe01.Shared_Expr_KindNumber(value: 100.0),
        structField: sq,
        stringList: ["a", "b"],
        structList: [sq2],
        matrix: [
          [1, 2],
          [3, 4],
        ],
        optString: "optional hello",
        optInt: 99,
        optNum: 2.718,
        optBool: false,
        optEnum: pe01.Shared_E.if_,
        optStringUnion: pe01.Shared_ComplexType_OptStringUnion.zooKar,
        optUnion: pe01.Shared_Expr_KindNumber(value: 200.0),
        optStruct: sq3,
        optStringList: ["x", "y"],
        optStructList: [sq4],
        optMatrix: [
          [5, 6],
          [7, 8],
        ],
      );

      final fullJson = full.toJson();
      final parsedFull = pe01.Shared_ComplexType.fromJson(fullJson);
      expect(parsedFull.stringField, equals("hello"));
      expect(parsedFull.intField, equals(42));
      expect(parsedFull.numField, equals(3.14));
      expect(parsedFull.boolField, isTrue);
      expect(parsedFull.enumField, equals(pe01.Shared_E.fooBar));
      expect(parsedFull.stringUnion,
          equals(pe01.Shared_ComplexType_StringUnion.fooBar));
      expect(parsedFull.stringUnion.toJson(), equals("foo-bar"));
      expect(parsedFull.unionField, isA<pe01.Shared_Expr_KindNumber>());
      expect((parsedFull.unionField as pe01.Shared_Expr_KindNumber).value,
          equals(100.0));
      expect(parsedFull.structField.size, equals(10.0));
      expect(parsedFull.stringList, equals(["a", "b"]));
      expect(parsedFull.structList.length, equals(1));
      expect(parsedFull.structList[0].size, equals(20.0));
      expect(
          parsedFull.matrix,
          equals([
            [1, 2],
            [3, 4]
          ]));

      expect(parsedFull.optString, equals("optional hello"));
      expect(parsedFull.optInt, equals(99));
      expect(parsedFull.optNum, equals(2.718));
      expect(parsedFull.optBool, isFalse);
      expect(parsedFull.optEnum, equals(pe01.Shared_E.if_));
      expect(parsedFull.optStringUnion,
          equals(pe01.Shared_ComplexType_OptStringUnion.zooKar));
      expect(parsedFull.optStringUnion?.toJson(), equals("zooKar"));
      expect(parsedFull.optUnion, isA<pe01.Shared_Expr_KindNumber>());
      expect((parsedFull.optUnion as pe01.Shared_Expr_KindNumber).value,
          equals(200.0));
      expect(parsedFull.optStruct?.size, equals(30.0));
      expect(parsedFull.optStringList, equals(["x", "y"]));
      expect(parsedFull.optStructList?.length, equals(1));
      expect(parsedFull.optStructList?[0].size, equals(40.0));
      expect(
          parsedFull.optMatrix,
          equals([
            [5, 6],
            [7, 8]
          ]));

      // Omitted optional fields
      final omitted = pe01.Shared_ComplexType(
        stringField: "hello",
        intField: 42,
        numField: 3.14,
        boolField: true,
        enumField: pe01.Shared_E.fooBar,
        stringUnion: pe01.Shared_ComplexType_StringUnion.fooBar,
        unionField: pe01.Shared_Expr_KindNumber(value: 100.0),
        structField: sq,
        stringList: ["a", "b"],
        structList: [sq2],
        matrix: [
          [1, 2],
          [3, 4],
        ],
      );

      final omittedJson = omitted.toJson();
      expect(omittedJson.containsKey("optString"), isTrue);
      expect(omittedJson["optString"], isNull);
      expect(omittedJson.containsKey("optInt"), isTrue);
      expect(omittedJson["optInt"], isNull);
      expect(omittedJson.containsKey("optNum"), isTrue);
      expect(omittedJson["optNum"], isNull);
      expect(omittedJson.containsKey("optBool"), isTrue);
      expect(omittedJson["optBool"], isNull);
      expect(omittedJson.containsKey("optEnum"), isTrue);
      expect(omittedJson["optEnum"], isNull);
      expect(omittedJson.containsKey("optStringUnion"), isTrue);
      expect(omittedJson["optStringUnion"], isNull);
      expect(omittedJson.containsKey("optUnion"), isTrue);
      expect(omittedJson["optUnion"], isNull);
      expect(omittedJson.containsKey("optStruct"), isTrue);
      expect(omittedJson["optStruct"], isNull);
      expect(omittedJson.containsKey("optStringList"), isTrue);
      expect(omittedJson["optStringList"], isNull);
      expect(omittedJson.containsKey("optStructList"), isTrue);
      expect(omittedJson["optStructList"], isNull);
      expect(omittedJson.containsKey("optMatrix"), isTrue);
      expect(omittedJson["optMatrix"], isNull);

      final parsedOmitted = pe01.Shared_ComplexType.fromJson(omittedJson);
      expect(parsedOmitted.stringField, equals("hello"));
      expect(parsedOmitted.optString, isNull);
      expect(parsedOmitted.optInt, isNull);
      expect(parsedOmitted.optNum, isNull);
      expect(parsedOmitted.optBool, isNull);
      expect(parsedOmitted.optEnum, isNull);
      expect(parsedOmitted.optStringUnion, isNull);
      expect(parsedOmitted.optUnion, isNull);
      expect(parsedOmitted.optStruct, isNull);
      expect(parsedOmitted.optStringList, isNull);
      expect(parsedOmitted.optStructList, isNull);
      expect(parsedOmitted.optMatrix, isNull);
    });

    test('OmitDefaultType serialization & deserialization', () {
      // 1. Instance with default/omitted values
      final omitted = pe01.Shared_OmitDefaultType(
        stringList: [],
        stringField: "",
        intField: 0,
        numField: 0.0,
        boolField: false,
        plainOpt: null,
        plainString: "test",
        plainInt: 123,
        plainBool: true,
        plainList: ["item"],
      );
      final omittedJson = omitted.toJson();

      expect(omittedJson.containsKey("optString"), isFalse);
      expect(omittedJson.containsKey("optInt"), isFalse);
      expect(omittedJson.containsKey("optNum"), isFalse);
      expect(omittedJson.containsKey("optBool"), isFalse);
      expect(omittedJson.containsKey("stringList"), isFalse);
      expect(omittedJson.containsKey("stringField"), isFalse);
      expect(omittedJson.containsKey("intField"), isFalse);
      expect(omittedJson.containsKey("numField"), isFalse);
      expect(omittedJson.containsKey("boolField"), isFalse);

      expect(omittedJson.containsKey("plainOpt"), isTrue);
      expect(omittedJson["plainOpt"], isNull);
      expect(omittedJson["plainString"], equals("test"));
      expect(omittedJson["plainInt"], equals(123));
      expect(omittedJson["plainBool"], isTrue);
      expect(omittedJson["plainList"], equals(["item"]));

      final decodedOmitted = pe01.Shared_OmitDefaultType.fromJson(omittedJson);
      expect(decodedOmitted.optString, isNull);
      expect(decodedOmitted.optInt, isNull);
      expect(decodedOmitted.optNum, isNull);
      expect(decodedOmitted.optBool, isNull);
      expect(decodedOmitted.stringList, equals([]));
      expect(decodedOmitted.stringField, equals(""));
      expect(decodedOmitted.intField, equals(0));
      expect(decodedOmitted.numField, equals(0.0));
      expect(decodedOmitted.boolField, isFalse);
      expect(decodedOmitted.plainOpt, isNull);
      expect(decodedOmitted.plainString, equals("test"));
      expect(decodedOmitted.plainInt, equals(123));
      expect(decodedOmitted.plainBool, isTrue);
      expect(decodedOmitted.plainList, equals(["item"]));

      // Missing required plain* fields in JSON must fail
      expect(() => pe01.Shared_OmitDefaultType.fromJson({}),
          throwsA(isA<TypeError>()));

      // 2. Instance with explicitly assigned default values
      final explicitDefaults = pe01.Shared_OmitDefaultType(
        optString: null,
        optInt: null,
        optNum: null,
        optBool: null,
        stringList: [],
        stringField: "",
        intField: 0,
        numField: 0.0,
        boolField: false,
        plainOpt: null,
        plainString: "test2",
        plainInt: 456,
        plainBool: false,
        plainList: [],
      );
      final explicitJson = explicitDefaults.toJson();
      expect(explicitJson.containsKey("optString"), isFalse);
      expect(explicitJson.containsKey("optInt"), isFalse);
      expect(explicitJson.containsKey("optNum"), isFalse);
      expect(explicitJson.containsKey("optBool"), isFalse);
      expect(explicitJson.containsKey("stringList"), isFalse);
      expect(explicitJson.containsKey("stringField"), isFalse);
      expect(explicitJson.containsKey("intField"), isFalse);
      expect(explicitJson.containsKey("numField"), isFalse);
      expect(explicitJson.containsKey("boolField"), isFalse);
      expect(explicitJson.containsKey("plainOpt"), isTrue);
      expect(explicitJson["plainOpt"], isNull);
      expect(explicitJson["plainString"], equals("test2"));
      expect(explicitJson["plainInt"], equals(456));
      expect(explicitJson["plainBool"], isFalse);
      expect(explicitJson["plainList"], equals([]));

      // 3. Instance with non-default values
      final populated = pe01.Shared_OmitDefaultType(
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
      );
      final populatedJson = populated.toJson();
      expect(populatedJson["optString"], equals("hello"));
      expect(populatedJson["optInt"], equals(42));
      expect(populatedJson["optNum"], equals(3.14));
      expect(populatedJson["optBool"], isTrue);
      expect(populatedJson["stringList"], equals(["a", "b"]));
      expect(populatedJson["stringField"], equals("world"));
      expect(populatedJson["intField"], equals(7));
      expect(populatedJson["numField"], equals(2.5));
      expect(populatedJson["boolField"], isTrue);
      expect(populatedJson["plainOpt"], equals("plain"));
      expect(populatedJson["plainString"], equals("test3"));
      expect(populatedJson["plainInt"], equals(789));
      expect(populatedJson["plainBool"], isTrue);
      expect(populatedJson["plainList"], equals(["x"]));

      final decodedPopulated =
          pe01.Shared_OmitDefaultType.fromJson(populatedJson);
      expect(decodedPopulated.optString, equals("hello"));
      expect(decodedPopulated.optInt, equals(42));
      expect(decodedPopulated.optNum, equals(3.14));
      expect(decodedPopulated.optBool, isTrue);
      expect(decodedPopulated.stringList, equals(["a", "b"]));
      expect(decodedPopulated.stringField, equals("world"));
      expect(decodedPopulated.intField, equals(7));
      expect(decodedPopulated.numField, equals(2.5));
      expect(decodedPopulated.boolField, isTrue);
      expect(decodedPopulated.plainOpt, equals("plain"));
      expect(decodedPopulated.plainString, equals("test3"));
      expect(decodedPopulated.plainInt, equals(789));
      expect(decodedPopulated.plainBool, isTrue);
      expect(decodedPopulated.plainList, equals(["x"]));
    });
  });

  group('TemplateOverrider', () {
    test('signature check and overrides', () {
      final data = p01.TemplateOverrider.templatesData;
      final sig = data["signature"];
      expect(sig, isNotNull);
      expect((sig as String).isNotEmpty, isTrue);

      final wrongDoc = {
        "signature": "wrong_sig",
        "edition": 0,
        "templates": <String, dynamic>{},
        "tools": <String, dynamic>{},
        "sourceFiles": <String, dynamic>{},
      };
      expect(
        () => p01.TemplateOverrider.applyOverrides(wrongDoc),
        throwsA(isA<ArgumentError>()),
      );

      final prompts = p01.TemplateOverrider.applyOverrides(data);
      expect(prompts, isNotNull);
      final prompt = prompts.renderTranslate(
        p01.Translate_Input(
          text: "Hello",
          targetLanguage: "French",
        ),
      );
      expect(prompt.userMessage, contains("French"));

      final defaultPrompts = p01.TemplateOverrider.applyOverrides(null);
      expect(identical(defaultPrompts, p01.prompts), isTrue);
    });
  });
}
