import 'package:test/test.dart';
import 'package:typeprompt_e2e_test/gen/prompts_01.dart' as p01;
import 'package:typeprompt_e2e_test/gen/prompts_02.dart' as p02;
import 'package:typeprompt_e2e_test/gen/prompts_03.dart' as p03;
import 'package:typeprompt_e2e_test/gen/prompts_04.dart' as p04;
import 'package:typeprompt_e2e_test/gen/prompts_05.dart' as p05;
import 'package:typeprompt_e2e_test/gen/prompts_06.dart' as p06;
import 'package:typeprompt_e2e_test/gen/prompts_07.dart' as p07;
import 'package:typeprompt_e2e_test/gen/prompts_08.dart' as p08;
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

    test('produces one example with one intermediate step', () {
      expect(prompt.examples.length, equals(1));
      expect(prompt.examples[0].intermediateSteps.length, equals(1));
    });

    test('example tool call ids', () {
      final tc = prompt.examples[0].intermediateSteps[0].toolCalls[0];
      expect(tc.callId, equals("s1"));
      expect(tc.toolName, equals("webSearch"));
    });

    test('example tool call stringifiedInput', () {
      final tc = prompt.examples[0].intermediateSteps[0].toolCalls[0];
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

    test('executeTools throws for unknown tool', () async {
      final toolCalls = [
        p03.ToolCall(
          callId: "c1",
          toolName: "noSuchTool",
          stringifiedInput: "{}",
        ),
      ];
      expect(
        () => prompt.executeTools(toolCalls, MockWebSearchExecutor()),
        throwsA(isA<ArgumentError>()),
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

  group('06 TOON Format: WriteComparisonArticle', () {
    final provider = p06.WriteComparisonArticle_Provider(
      name: "CloudX",
      region: "us-east",
      category: p06.WriteComparisonArticle_ProductCategory.compute,
      pricing: p06.WriteComparisonArticle_Pricing(
        model: p06.WriteComparisonArticle_Pricing_Model.perHour,
        basePrice: 0.1,
      ),
      benchmarks: [
        p06.WriteComparisonArticle_Benchmark(
          name: "throughput",
          score: 1000.0,
          unit: "rps",
        ),
      ],
      pros: ["fast", "reliable"],
      cons: ["pricey"],
    );

    final prompt = p06.prompts.renderWriteComparisonArticle(
      p06.WriteComparisonArticle_Input(
        providers: [provider],
        useCase: "serving ML inference workloads",
        audience: p06.WriteComparisonArticle_Input_Audience.architect,
      ),
    );

    test('json output format', () {
      expect(prompt.outputFormat, isA<p06.JsonOutputFormat>());
    });

    test('templateId', () {
      expect(
        prompt.templateId.toString(),
        equals("Main:WriteComparisonArticle"),
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
  });

  group('07 Shared Types: ShippingConfirmation & ReturnSlip', () {
    final address = p07.Shared_Address(
      street: "1 Main St",
      city: "Paris",
      country: "France",
    );

    final contact = p07.Shared_ContactInfo(
      name: "Alice Dupont",
      email: "alice@example.com",
      address: address,
    );

    test('shipping confirmation', () {
      final prompt = p07.prompts.renderShippingConfirmation(
        p07.ShippingConfirmation_Input(
          recipient: contact,
          orderNumber: "ORD-1234",
          estimatedDelivery: "2026-08-20",
          items: [
            p07.ShippingConfirmation_Input_Items(name: "Laptop", quantity: 1),
          ],
        ),
      );

      expect(prompt.outputFormat, isA<p07.TextOutputFormat>());
      expect(prompt.templateId.toString(), equals("Main:ShippingConfirmation"));
      expect(prompt.userMessage, contains("Alice Dupont"));
      expect(prompt.userMessage, contains("ORD-1234"));
      expect(prompt.systemMessage, contains("confirmation email"));
    });

    test('return slip', () {
      final prompt = p07.prompts.renderReturnSlip(
        p07.ReturnSlip_Input(
          customer: contact,
          returnReason: p07.ReturnSlip_Input_ReturnReason.defective,
          orderNumber: "ORD-1234",
        ),
      );

      expect(prompt.outputFormat, isA<p07.TextOutputFormat>());
      expect(prompt.templateId.toString(), equals("Main:ReturnSlip"));
      expect(prompt.userMessage, contains("Alice Dupont"));
      expect(prompt.userMessage, contains("defective"));
    });
  });

  group('08 Namespaces: Finance & Legal', () {
    test('finance summarize transaction', () {
      final prompt = p08.prompts.finance.renderSummarizeTransaction(
        p08.Finance_SummarizeTransaction_Input(
          description: "AWS monthly bill",
          amount: p08.Finance_Shared_MoneyAmount(
            value: 450.0,
            currency: p08.Finance_Shared_Currency.usd,
          ),
          category: p08.Finance_SummarizeTransaction_Input_Category.expense,
          date: "2026-08-01",
        ),
      );

      expect(
        prompt.templateId.toString(),
        equals("Finance:SummarizeTransaction"),
      );
      expect(prompt.outputFormat, isA<p08.JsonOutputFormat>());
      expect(prompt.userMessage, contains("AWS monthly bill"));
    });

    test('finance detect anomaly', () {
      final prompt = p08.prompts.finance.renderDetectAnomaly(
        p08.Finance_DetectAnomaly_Input(
          recentTransactions: const [],
          newTransaction: p08.Finance_DetectAnomaly_Input_NewTransaction(
            description: "Casino chips",
            amount: p08.Finance_Shared_MoneyAmount(
              value: 5000.0,
              currency: p08.Finance_Shared_Currency.usd,
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
      final prompt = p08.prompts.legal.renderDraftNda(
        p08.Legal_DraftNda_Input(
          disclosingParty: p08.Legal_Shared_Party(
            name: "Acme Corp",
            role: p08.Legal_Shared_Party_Role.client,
            jurisdiction: "California",
          ),
          receivingParty: p08.Legal_Shared_Party(
            name: "Beta LLC",
            role: p08.Legal_Shared_Party_Role.counterparty,
            jurisdiction: "Delaware",
          ),
          purposeOfDisclosure: "Evaluating a potential acquisition",
          durationYears: 3,
        ),
      );

      expect(prompt.templateId.toString(), equals("Legal:DraftNda"));
      expect(prompt.outputFormat, isA<p08.TextOutputFormat>());
      expect(prompt.userMessage, contains("Acme Corp"));
      expect(prompt.userMessage, contains("Beta LLC"));
      expect(prompt.systemMessage, contains("non-disclosure agreement"));
    });

    test('legal summarize clause', () {
      final prompt = p08.prompts.legal.renderSummarizeClause(
        p08.Legal_SummarizeClause_Input(
          clauseText: "The party shall indemnify and hold harmless...",
          reviewingParty: p08.Legal_Shared_Party(
            name: "Alice",
            role: p08.Legal_Shared_Party_Role.client,
            jurisdiction: "NY",
          ),
        ),
      );

      expect(prompt.templateId.toString(), equals("Legal:SummarizeClause"));
      expect(prompt.outputFormat, isA<p08.JsonOutputFormat>());
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
      expect(matrix.foo, isNull);
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
  });

  group('TemplateOverrider', () {
    test('signature check and overrides', () {
      final data = p01.TemplateOverrider.templatesData();
      final sig = data["signature"];
      expect(sig, isNotNull);
      expect((sig as String).isNotEmpty, isTrue);

      final wrongDoc = {
        "signature": "wrong_sig",
        "edition": 0,
        "templates": <String, dynamic>{},
        "tools": <String, dynamic>{},
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
    });
  });
}
