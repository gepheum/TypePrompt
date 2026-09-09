package dev.typeprompt

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class Test01Basics_Translate {
    private val prompt = com.example.prompts01.prompts.renderTranslate(
        com.example.prompts01.Schema.Translate.Input(
            text = "Hello world",
            targetLanguage = "French",
        ),
    )

    @Test
    fun testTextOutputFormat() {
        assertIs<com.example.prompts01.TextOutputFormat>(prompt.outputFormat)
    }

    @Test
    fun testTemplateId() {
        assertEquals("Main:Translate", prompt.templateId.toString())
        assertEquals(com.example.prompts01.TemplateId.TRANSLATE, prompt.templateId)
    }

    @Test
    fun testSystemMessageMentionsTranslatorRole() {
        assertTrue(prompt.systemMessage.contains("professional translator"))
    }

    @Test
    fun testUserMessageMentionsTargetLanguage() {
        assertTrue(prompt.userMessage.contains("French"))
    }

    @Test
    fun testEnclosedRendersCorrectTagInUserMessage() {
        assertTrue(prompt.userMessage.contains("<Text>"))
    }

    @Test
    fun testProducesTwoExamples() {
        assertEquals(2, prompt.examples.size)
    }

    @Test
    fun testFirstExampleResponseIsTranslatedString() {
        assertEquals("La réunion est prévue pour lundi à 15h.", prompt.examples[0].response)
    }

    @Test
    fun testExampleUserMessageContainsEnclosedTag() {
        assertTrue(prompt.examples[0].userMessage.contains("<Text>"))
    }

    @Test
    fun testParseResponseReturnsRawString() {
        assertEquals("Bonjour", prompt.parseResponse("Bonjour"))
    }

    @Test
    fun testHasNoTools() {
        assertTrue(prompt.tools.isEmpty())
    }
}

class Test02StructuredOutput_TriageTicket {
    private val prompt = com.example.prompts02.prompts.renderTriageTicket(
        com.example.prompts02.Schema.TriageTicket.Input(
            subject = "App crashes on login",
            body = "It crashes every time.",
            customerTier = com.example.prompts02.Schema.TriageTicket.Input_CustomerTier.Pro,
            recentTickets = emptyList(),
        ),
    )

    @Test
    fun testJsonOutputFormat() {
        assertIs<com.example.prompts02.JsonOutputFormat>(prompt.outputFormat)
    }

    @Test
    fun testCContentStrippedToPlainText() {
        assertTrue(prompt.systemMessage.contains("urgency"))
        assertTrue(prompt.systemMessage.contains("\"critical\""))
        assertFalse(prompt.systemMessage.contains("<c>"))
    }

    @Test
    fun testProducesTwoExamples() {
        assertEquals(2, prompt.examples.size)
    }

    @Test
    fun testFirstExampleResponseContainsOutputCategory() {
        assertTrue(prompt.examples[0].response.contains("\"technical-issue\""))
    }

    @Test
    fun testSecondExampleResponseContainsOutputCategory() {
        assertTrue(prompt.examples[1].response.contains("\"feature-request\""))
    }

    @Test
    fun testParseResponseParsesJson() {
        val result = prompt.parseResponse(
            "{\"category\":\"billing\",\"urgency\":\"low\",\"summary\":\"Invoice question\",\"suggestedActions\":[]}",
        )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Billing, result.category)
        assertEquals(com.example.prompts02.Schema.TriageTicket.Output_Urgency.Low, result.urgency)
        assertEquals("Invoice question", result.summary)
    }

    @Test
    fun testParseResponseStripsJsonCodeFences() {
        val result = prompt.parseResponse(
            "```json\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```",
        )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, result.category)
    }

    @Test
    fun testParseResponseStripsPlainCodeFences() {
        val result = prompt.parseResponse(
            "```\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```",
        )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, result.category)
    }

    @Test
    fun testOptionalFieldAbsentWhenOmitted() {
        val result = prompt.parseResponse(
            "{\"category\":\"feature-request\",\"urgency\":\"low\",\"summary\":\"Dark mode\",\"suggestedActions\":[\"Log request\"]}",
        )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.FeatureRequest, result.category)
        assertNull(result.suggestedReply)
    }

    @Test
    fun testUserMessageContainsYamlRenderedRecentTickets() {
        val p = com.example.prompts02.prompts.renderTriageTicket(
            com.example.prompts02.Schema.TriageTicket.Input(
                subject = "X",
                body = "Y",
                customerTier = com.example.prompts02.Schema.TriageTicket.Input_CustomerTier.Pro,
                recentTickets = listOf(
                    com.example.prompts02.Schema.TriageTicket.Input_RecentTickets(
                        id = "T-1",
                        summary = "Login bug",
                        category = com.example.prompts02.Schema.TriageTicket.TicketCategory.TechnicalIssue,
                    ),
                ),
            ),
        )
        assertTrue(p.userMessage.contains("id: T-1"))
    }

    @Test
    fun testUserMessageContainsInputAsYaml() {
        assertTrue(prompt.userMessage.contains("subject:"))
        assertTrue(prompt.userMessage.contains("customerTier:"))
    }

    @Test
    fun testYamlExactUserMessage() {
        assertEquals(
            "subject: App crashes on login\nbody: It crashes every time.\ncustomerTier: pro\nrecentTickets: []",
            prompt.userMessage,
        )
    }

    @Test
    fun testMetaContainsDeclaredModelAndTemperature() {
        assertEquals(com.example.prompts02.Schema.Meta.Meta_Model.Gpt4o, prompt.meta.model)
        assertEquals(0.2, prompt.meta.temperature)
    }
}

class Test03Tools_ResearchQuestion {
    private val prompt = com.example.prompts03.prompts.renderResearchQuestion(
        com.example.prompts03.Schema.ResearchQuestion.Input(
            question = "Tokyo population?",
        ),
    )

    private class MockWebSearchExecutor : com.example.prompts03.ToolExecutor.WebSearch {
        override suspend fun webSearch(
            input: com.example.prompts03.Schema.WebSearch.Input,
        ): com.example.prompts03.Schema.WebSearch.Output {
            return com.example.prompts03.Schema.WebSearch.Output(
                results = listOf(
                    com.example.prompts03.Schema.WebSearch.Output_Results(
                        title = "Tokyo Population 2024",
                        url = "https://example.com/tokyo",
                        snippet = "14 million",
                    ),
                ),
            )
        }
    }

    @Test
    fun testRegistersWebSearchTool() {
        assertTrue(prompt.tools.containsKey("webSearch"))
    }

    @Test
    fun testWebSearchToolName() {
        assertEquals("webSearch", prompt.tools["webSearch"]?.name)
    }

    @Test
    fun testWebSearchToolDescription() {
        assertTrue(prompt.tools["webSearch"]?.description?.contains("Search the web") == true)
    }

    @Test
    fun testProducesOneExampleWithOneIntermediateStep() {
        assertEquals(1, prompt.examples.size)
        assertEquals(1, prompt.examples[0].intermediateSteps.size)
    }

    @Test
    fun testExampleToolCallIds() {
        val tc = prompt.examples[0].intermediateSteps[0].toolCalls[0]
        assertEquals("s1", tc.callId)
        assertEquals("webSearch", tc.toolName)
    }

    @Test
    fun testExampleToolCallStringifiedInput() {
        val tc = prompt.examples[0].intermediateSteps[0].toolCalls[0]
        assertTrue(tc.stringifiedInput.contains("Tokyo population 2024"))
    }

    @Test
    fun testExecuteToolsCallsExecutorAndReturnsOutput() = runTest {
        val toolCalls = listOf(
            com.example.prompts03.ToolCall("call_1", "webSearch", "{\"query\":\"Tokyo population\"}"),
        )
        val results = prompt.executeTools(toolCalls, MockWebSearchExecutor())
        assertEquals(1, results.size)
        assertEquals("call_1", results[0].callId)
        assertTrue(results[0].stringifiedOutput.contains("Tokyo Population 2024"))
    }

    @Test
    fun testExecuteToolsThrowsForUnknownTool() = runTest {
        val toolCalls = listOf(
            com.example.prompts03.ToolCall("c1", "noSuchTool", "{}"),
        )
        assertFailsWith<Throwable> {
            prompt.executeTools(toolCalls, MockWebSearchExecutor())
        }
    }
}

class Test04Snippets_SummarizeDocument {
    @Test
    fun testSwitchSnippetSelectsExecutiveInstruction() {
        val p = com.example.prompts05.prompts.renderSummarizeDocument(
            com.example.prompts05.Schema.SummarizeDocument.Input(
                title = "T",
                content = "C",
                audience = com.example.prompts05.Schema.SummarizeDocument.Input_Audience.Executive,
            ),
        )
        assertTrue(p.systemMessage.contains("non-technical executive audience"))
    }

    @Test
    fun testSwitchSnippetSelectsTechnicalInstruction() {
        val p = com.example.prompts05.prompts.renderSummarizeDocument(
            com.example.prompts05.Schema.SummarizeDocument.Input(
                title = "T",
                content = "C",
                audience = com.example.prompts05.Schema.SummarizeDocument.Input_Audience.Technical,
            ),
        )
        assertTrue(p.systemMessage.contains("technical audience"))
    }

    @Test
    fun testSwitchSnippetSelectsGeneralInstruction() {
        val p = com.example.prompts05.prompts.renderSummarizeDocument(
            com.example.prompts05.Schema.SummarizeDocument.Input(
                title = "T",
                content = "C",
                audience = com.example.prompts05.Schema.SummarizeDocument.Input_Audience.General,
            ),
        )
        assertTrue(p.systemMessage.contains("general audience"))
    }

    @Test
    fun testSwitchSnippetDoesNotBleedIntoOtherVariant() {
        val p = com.example.prompts05.prompts.renderSummarizeDocument(
            com.example.prompts05.Schema.SummarizeDocument.Input(
                title = "T",
                content = "C",
                audience = com.example.prompts05.Schema.SummarizeDocument.Input_Audience.Technical,
            ),
        )
        assertFalse(p.systemMessage.contains("business impact"))
    }

    @Test
    fun testConditionalSnippetFocusInstructionWhenFocusTopicSet() {
        val p = com.example.prompts05.prompts.renderSummarizeDocument(
            com.example.prompts05.Schema.SummarizeDocument.Input(
                title = "T",
                content = "C",
                focusTopic = "climate change",
                audience = com.example.prompts05.Schema.SummarizeDocument.Input_Audience.General,
            ),
        )
        assertTrue(p.systemMessage.contains("climate change"))
    }

    @Test
    fun testConditionalSnippetNoFocusInstructionWhenAbsent() {
        val p = com.example.prompts05.prompts.renderSummarizeDocument(
            com.example.prompts05.Schema.SummarizeDocument.Input(
                title = "T",
                content = "C",
                audience = com.example.prompts05.Schema.SummarizeDocument.Input_Audience.Executive,
            ),
        )
        assertFalse(p.systemMessage.contains("Focus the summary"))
    }

    @Test
    fun testUserMessageWrapsTitleInEnclosedTag() {
        val p = com.example.prompts05.prompts.renderSummarizeDocument(
            com.example.prompts05.Schema.SummarizeDocument.Input(
                title = "AI Report",
                content = "...",
                audience = com.example.prompts05.Schema.SummarizeDocument.Input_Audience.Technical,
            ),
        )
        assertTrue(p.userMessage.contains("<Title>"))
    }
}

class Test05Variants_WriteProductDescription {
    private val features = listOf("removes 99.9% of contaminants", "lasts 6 months")
    private val marketing = com.example.prompts04.prompts.renderWriteProductDescription(
        com.example.prompts04.Schema.WriteProductDescription.Input(
            productName = "AquaFilter Pro",
            features = features,
            variant = com.example.prompts04.Schema.WriteProductDescription.Input_Variant.Marketing,
        ),
    )
    private val technical = com.example.prompts04.prompts.renderWriteProductDescription(
        com.example.prompts04.Schema.WriteProductDescription.Input(
            productName = "AquaFilter Pro",
            features = features,
            variant = com.example.prompts04.Schema.WriteProductDescription.Input_Variant.Technical,
        ),
    )
    private val brief = com.example.prompts04.prompts.renderWriteProductDescription(
        com.example.prompts04.Schema.WriteProductDescription.Input(
            productName = "AquaFilter Pro",
            features = features,
            variant = com.example.prompts04.Schema.WriteProductDescription.Input_Variant.Brief,
        ),
    )

    @Test
    fun testMarketingSystemPrompt() {
        assertTrue(marketing.systemMessage.contains("benefit-focused"))
    }

    @Test
    fun testTechnicalSystemPrompt() {
        assertTrue(technical.systemMessage.contains("specification-driven"))
    }

    @Test
    fun testBriefSystemPrompt() {
        assertTrue(brief.systemMessage.contains("single punchy sentence"))
    }

    @Test
    fun testAllVariantsShareSameUserMessage() {
        assertEquals(marketing.userMessage, technical.userMessage)
        assertEquals(technical.userMessage, brief.userMessage)
    }

    @Test
    fun testUserMessageContainsProductName() {
        assertTrue(marketing.userMessage.contains("AquaFilter Pro"))
    }

    @Test
    fun testUserMessageContainsFeaturesAsJson() {
        assertTrue(marketing.userMessage.contains("removes 99.9% of contaminants"))
    }

    @Test
    fun testMarketingHasOneExample() {
        assertEquals(1, marketing.examples.size)
    }

    @Test
    fun testMarketingExampleResponseContainsDescriptionKey() {
        assertTrue(marketing.examples[0].response.contains("\"description\""))
        assertTrue(marketing.examples[0].response.contains("Tired of worrying"))
    }

    @Test
    fun testBriefHasOneExample() {
        assertEquals(1, brief.examples.size)
    }

    @Test
    fun testTemplateIdSameAcrossVariants() {
        assertEquals("Main:WriteProductDescription", marketing.templateId.toString())
        assertEquals("Main:WriteProductDescription", technical.templateId.toString())
        assertEquals("Main:WriteProductDescription", brief.templateId.toString())
    }

    @Test
    fun testVariantsHaveDifferentSystemMessages() {
        assertNotEquals(marketing.systemMessage, technical.systemMessage)
        assertNotEquals(technical.systemMessage, brief.systemMessage)
    }
}

class Test06ToonFormat_WriteComparisonArticle {
    private val provider = com.example.prompts06.Schema.WriteComparisonArticle.Provider(
        name = "CloudX",
        region = "us-east",
        category = com.example.prompts06.Schema.WriteComparisonArticle.ProductCategory.Compute,
        pricing = com.example.prompts06.Schema.WriteComparisonArticle.Pricing(
            model = com.example.prompts06.Schema.WriteComparisonArticle.Pricing_Model.PerHour,
            basePrice = 0.1,
        ),
        benchmarks = listOf(
            com.example.prompts06.Schema.WriteComparisonArticle.Benchmark(
                name = "throughput",
                score = 1000.0,
                unit = "rps",
            ),
        ),
        pros = listOf("fast", "reliable"),
        cons = listOf("pricey"),
    )

    private val prompt = com.example.prompts06.prompts.renderWriteComparisonArticle(
        com.example.prompts06.Schema.WriteComparisonArticle.Input(
            providers = listOf(provider),
            useCase = "serving ML inference workloads",
            audience = com.example.prompts06.Schema.WriteComparisonArticle.Input_Audience.Architect,
        ),
    )

    @Test
    fun testJsonOutputFormat() {
        assertIs<com.example.prompts06.JsonOutputFormat>(prompt.outputFormat)
    }

    @Test
    fun testTemplateId() {
        assertEquals("Main:WriteComparisonArticle", prompt.templateId.toString())
    }

    @Test
    fun testUserMessageContainsUseCase() {
        assertTrue(prompt.userMessage.contains("serving ML inference workloads"))
    }

    @Test
    fun testUserMessageContainsProviderNameFromToonData() {
        assertTrue(prompt.userMessage.contains("CloudX"))
    }

    @Test
    fun testUserMessageMentionsAudience() {
        assertTrue(prompt.userMessage.contains("architect"))
    }

    @Test
    fun testHasNoTools() {
        assertTrue(prompt.tools.isEmpty())
    }

    @Test
    fun testToonExactUserMessage() {
        assertTrue(prompt.userMessage.contains("Write a comparison article framed around this use case: serving ML inference workloads"))
        assertTrue(prompt.userMessage.contains("name: CloudX"))
        assertTrue(prompt.userMessage.contains("Target audience: architect"))
    }
}

class Test07SharedTypes {
    private val address = com.example.prompts07.Schema.Shared.Address(
        street = "1 Main St",
        city = "Paris",
        country = "France",
    )

    private val contact = com.example.prompts07.Schema.Shared.ContactInfo(
        name = "Alice Dupont",
        email = "alice@example.com",
        address = address,
    )

    @Test
    fun testShippingConfirmation() {
        val prompt = com.example.prompts07.prompts.renderShippingConfirmation(
            com.example.prompts07.Schema.ShippingConfirmation.Input(
                recipient = contact,
                orderNumber = "ORD-1234",
                estimatedDelivery = "2026-08-20",
                items = listOf(
                    com.example.prompts07.Schema.ShippingConfirmation.Input_Items(name = "Laptop", quantity = 1),
                ),
            ),
        )

        assertIs<com.example.prompts07.TextOutputFormat>(prompt.outputFormat)
        assertEquals("Main:ShippingConfirmation", prompt.templateId.toString())
        assertTrue(prompt.userMessage.contains("Alice Dupont"))
        assertTrue(prompt.userMessage.contains("ORD-1234"))
        assertTrue(prompt.systemMessage.contains("confirmation email"))
    }

    @Test
    fun testReturnSlip() {
        val prompt = com.example.prompts07.prompts.renderReturnSlip(
            com.example.prompts07.Schema.ReturnSlip.Input(
                customer = contact,
                returnReason = com.example.prompts07.Schema.ReturnSlip.Input_ReturnReason.Defective,
                orderNumber = "ORD-1234",
            ),
        )

        assertIs<com.example.prompts07.TextOutputFormat>(prompt.outputFormat)
        assertEquals("Main:ReturnSlip", prompt.templateId.toString())
        assertTrue(prompt.userMessage.contains("Alice Dupont"))
        assertTrue(prompt.userMessage.contains("defective"))
    }
}

class Test08Namespaces {
    @Test
    fun testFinanceSummarizeTransaction() {
        val prompt = com.example.prompts08.prompts.finance.renderSummarizeTransaction(
            com.example.prompts08.Schema.Finance.SummarizeTransaction.Input(
                description = "AWS monthly bill",
                amount = com.example.prompts08.Schema.Finance.Shared.MoneyAmount(
                    value = 450.0,
                    currency = com.example.prompts08.Schema.Finance.Shared.Currency.Usd,
                ),
                category = com.example.prompts08.Schema.Finance.SummarizeTransaction.Input_Category.Expense,
                date = "2026-08-01",
            ),
        )

        assertEquals("Finance:SummarizeTransaction", prompt.templateId.toString())
        assertNotNull(com.example.prompts08.prompts.finance)
        assertIs<com.example.prompts08.JsonOutputFormat>(prompt.outputFormat)
        assertTrue(prompt.userMessage.contains("AWS monthly bill"))
    }

    @Test
    fun testFinanceDetectAnomaly() {
        val prompt = com.example.prompts08.prompts.finance.renderDetectAnomaly(
            com.example.prompts08.Schema.Finance.DetectAnomaly.Input(
                recentTransactions = emptyList(),
                newTransaction = com.example.prompts08.Schema.Finance.DetectAnomaly.Input_NewTransaction(
                    description = "Casino chips",
                    amount = com.example.prompts08.Schema.Finance.Shared.MoneyAmount(
                        value = 5000.0,
                        currency = com.example.prompts08.Schema.Finance.Shared.Currency.Usd,
                    ),
                    date = "2026-08-17",
                ),
            ),
        )

        assertEquals("Finance:DetectAnomaly", prompt.templateId.toString())
        assertTrue(prompt.userMessage.contains("Casino chips"))
        assertTrue(prompt.tools.isEmpty())
    }

    @Test
    fun testLegalDraftNda() {
        val prompt = com.example.prompts08.prompts.legal.renderDraftNda(
            com.example.prompts08.Schema.Legal.DraftNda.Input(
                disclosingParty = com.example.prompts08.Schema.Legal.Shared.Party(
                    name = "Acme Corp",
                    role = com.example.prompts08.Schema.Legal.Shared.Party_Role.Client,
                    jurisdiction = "California",
                ),
                receivingParty = com.example.prompts08.Schema.Legal.Shared.Party(
                    name = "Beta LLC",
                    role = com.example.prompts08.Schema.Legal.Shared.Party_Role.Counterparty,
                    jurisdiction = "Delaware",
                ),
                purposeOfDisclosure = "Evaluating a potential acquisition",
                durationYears = 3,
            ),
        )

        assertEquals("Legal:DraftNda", prompt.templateId.toString())
        assertIs<com.example.prompts08.TextOutputFormat>(prompt.outputFormat)
        assertNotNull(com.example.prompts08.prompts.legal)
        assertTrue(prompt.userMessage.contains("Acme Corp"))
        assertTrue(prompt.userMessage.contains("Beta LLC"))
        assertTrue(prompt.systemMessage.contains("non-disclosure agreement"))
    }

    @Test
    fun testLegalSummarizeClause() {
        val prompt = com.example.prompts08.prompts.legal.renderSummarizeClause(
            com.example.prompts08.Schema.Legal.SummarizeClause.Input(
                clauseText = "The party shall indemnify and hold harmless...",
                reviewingParty = com.example.prompts08.Schema.Legal.Shared.Party(
                    name = "Alice",
                    role = com.example.prompts08.Schema.Legal.Shared.Party_Role.Client,
                    jurisdiction = "NY",
                ),
            ),
        )

        assertEquals("Legal:SummarizeClause", prompt.templateId.toString())
        assertIs<com.example.prompts08.JsonOutputFormat>(prompt.outputFormat)
        assertTrue(prompt.userMessage.contains("Alice"))
        assertTrue(prompt.userMessage.contains("indemnify"))
        assertTrue(prompt.userMessage.contains("<Clause>"))
    }
}

class TestE01_AnalyzeSalesData {
    private val rows = listOf(
        com.example.prompts_e01.Schema.AnalyzeSalesData.SalesRow(
            product = "Widget A",
            units = 120,
            revenueCents = 240000,
            region = "north",
        ),
        com.example.prompts_e01.Schema.AnalyzeSalesData.SalesRow(
            product = "Widget B",
            units = 85,
            revenueCents = 340000,
            region = "south",
        ),
    )

    private val csv = com.example.prompts_e01.prompts.renderAnalyzeSalesData(
        com.example.prompts_e01.Schema.AnalyzeSalesData.Input(
            rows = rows,
            question = "Top product?",
            variant = com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.Csv,
        ),
    )

    private val tsv = com.example.prompts_e01.prompts.renderAnalyzeSalesData(
        com.example.prompts_e01.Schema.AnalyzeSalesData.Input(
            rows = rows,
            question = "Top product?",
            variant = com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.Tsv,
        ),
    )

    @Test
    fun testCsvUserMessageHasCommaSeparatedHeader() {
        assertTrue(csv.userMessage.contains("product,units,revenueCents,region"))
    }

    @Test
    fun testCsvUserMessageHasCommaSeparatedRows() {
        assertTrue(csv.userMessage.contains("Widget A,120,240000,north"))
        assertTrue(csv.userMessage.contains("Widget B,85,340000,south"))
    }

    @Test
    fun testTsvUserMessageHasTabSeparatedHeader() {
        assertTrue(tsv.userMessage.contains("product\tunits\trevenueCents\tregion"))
    }

    @Test
    fun testTsvUserMessageHasTabSeparatedRows() {
        assertTrue(tsv.userMessage.contains("Widget A\t120\t240000\tnorth"))
        assertTrue(tsv.userMessage.contains("Widget B\t85\t340000\tsouth"))
    }

    @Test
    fun testCsvAndTsvProduceDifferentUserMessages() {
        assertNotEquals(csv.userMessage, tsv.userMessage)
    }

    @Test
    fun testEmptyRowsRendersNoTableContent() {
        val empty = com.example.prompts_e01.prompts.renderAnalyzeSalesData(
            com.example.prompts_e01.Schema.AnalyzeSalesData.Input(
                rows = emptyList(),
                question = "Any data?",
                variant = com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.Csv,
            ),
        )
        assertFalse(empty.userMessage.contains("product,units"))
    }

    @Test
    fun testCsvVariantHasOneExampleWithCsvData() {
        assertEquals(1, csv.examples.size)
        assertTrue(csv.examples[0].userMessage.contains("product,units,revenueCents,region"))
    }

    @Test
    fun testTsvVariantHasOneExampleWithTsvData() {
        assertEquals(1, tsv.examples.size)
        assertTrue(tsv.examples[0].userMessage.contains("product\tunits\trevenueCents\tregion"))
    }

    @Test
    fun testCsvSystemMessageMentionsCsv() {
        assertTrue(csv.systemMessage.contains("comma-separated"))
    }

    @Test
    fun testTsvSystemMessageMentionsTsv() {
        assertTrue(tsv.systemMessage.contains("tab-separated"))
    }

    @Test
    fun testCsvExactSystemMessage() {
        assertEquals(
            "You are a sales analyst. The data below is comma-separated (CSV).\nAnalyze it and answer the question concisely.",
            csv.systemMessage,
        )
    }

    @Test
    fun testCsvExactUserMessage() {
        assertEquals(
            "Top product?\n\nData:\nproduct,units,revenueCents,region\nWidget A,120,240000,north\nWidget B,85,340000,south",
            csv.userMessage,
        )
    }

    @Test
    fun testCsvExactExample0UserMessage() {
        assertEquals(
            "Which product generated the most revenue?\n\nData:\nproduct,units,revenueCents,region\nWidget A,120,240000,north\nWidget B,85,340000,south\nWidget C,200,180000,east",
            csv.examples[0].userMessage,
        )
    }

    @Test
    fun testTsvExactSystemMessage() {
        assertEquals(
            "You are a sales analyst. The data below is tab-separated (TSV).\nAnalyze it and answer the question concisely.",
            tsv.systemMessage,
        )
    }

    @Test
    fun testTsvExactUserMessage() {
        assertEquals(
            "Top product?\n\nData:\nproduct\tunits\trevenueCents\tregion\nWidget A\t120\t240000\tnorth\nWidget B\t85\t340000\tsouth",
            tsv.userMessage,
        )
    }

    @Test
    fun testTsvExactExample0UserMessage() {
        assertEquals(
            "Which product generated the most revenue?\n\nData:\nproduct\tunits\trevenueCents\tregion\nWidget A\t120\t240000\tnorth\nWidget B\t85\t340000\tsouth\nWidget C\t200\t180000\teast",
            tsv.examples[0].userMessage,
        )
    }
}

class TestCrossCutting_ParseResponse {
    private fun p02Render() = com.example.prompts02.prompts.renderTriageTicket(
        com.example.prompts02.Schema.TriageTicket.Input(
            subject = "X",
            body = "Y",
            customerTier = com.example.prompts02.Schema.TriageTicket.Input_CustomerTier.Pro,
            recentTickets = emptyList(),
        ),
    )

    @Test
    fun testParsesPlainJsonWithoutFences() {
        val res = p02Render().parseResponse(
            "{\"category\":\"other\",\"urgency\":\"low\",\"summary\":\"x\",\"suggestedActions\":[]}",
        )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, res.category)
    }

    @Test
    fun testStripsPlainCodeFences() {
        val res = p02Render().parseResponse(
            "```\n{\"category\":\"other\",\"urgency\":\"low\",\"summary\":\"x\",\"suggestedActions\":[]}\n```",
        )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, res.category)
    }

    @Test
    fun testStripsJsonCodeFences() {
        val res = p02Render().parseResponse(
            "```json\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```",
        )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, res.category)
    }

    @Test
    fun testReturnsRawStringForTextOutputFormat() {
        val prompt = com.example.prompts01.prompts.renderTranslate(
            com.example.prompts01.Schema.Translate.Input(
                text = "hi",
                targetLanguage = "Spanish",
            ),
        )
        assertEquals("Hola", prompt.parseResponse("Hola"))
    }
}

class TestE01_JsonSerialization {
    @Test
    fun testExprSerializationAndDeserialization() {
        val num: com.example.prompts_e01.Schema.Shared.Expr =
            com.example.prompts_e01.Schema.Shared.Expr_KindNumber(value = 42.0)
        val jsonNum = Json.encodeToString(com.example.prompts_e01.Schema.Shared.Expr.serializer(), num)
        val parsedNum = Json.decodeFromString(com.example.prompts_e01.Schema.Shared.Expr.serializer(), jsonNum)
        val numTyped = assertIs<com.example.prompts_e01.Schema.Shared.Expr_KindNumber>(parsedNum)
        assertEquals(42.0, numTyped.value)

        val add: com.example.prompts_e01.Schema.Shared.Expr =
            com.example.prompts_e01.Schema.Shared.Expr_KindAdd(
                left = com.example.prompts_e01.Schema.Shared.Expr_KindNumber(value = 1.0),
                right = com.example.prompts_e01.Schema.Shared.Expr_KindNumber(value = 2.0),
            )
        val jsonAdd = Json.encodeToString(com.example.prompts_e01.Schema.Shared.Expr.serializer(), add)
        val parsedAdd = Json.decodeFromString(com.example.prompts_e01.Schema.Shared.Expr.serializer(), jsonAdd)
        val addTyped = assertIs<com.example.prompts_e01.Schema.Shared.Expr_KindAdd>(parsedAdd)
        val leftTyped = assertIs<com.example.prompts_e01.Schema.Shared.Expr_KindNumber>(addTyped.left)
        val rightTyped = assertIs<com.example.prompts_e01.Schema.Shared.Expr_KindNumber>(addTyped.right)
        assertEquals(1.0, leftTyped.value)
        assertEquals(2.0, rightTyped.value)
    }

    @Test
    fun testEnumWithCommonFieldsSerialization() {
        val notSuccess: com.example.prompts_e01.Schema.Shared.EnumWithCommonFields =
            com.example.prompts_e01.Schema.Shared.EnumWithCommonFields_NotSuccess(
                x = 10,
                y = 20.5,
                z = "error",
            )
        val jsonNotSuccess = Json.encodeToString(
            com.example.prompts_e01.Schema.Shared.EnumWithCommonFields.serializer(),
            notSuccess,
        )
        val parsedNotSuccess = Json.decodeFromString(
            com.example.prompts_e01.Schema.Shared.EnumWithCommonFields.serializer(),
            jsonNotSuccess,
        )
        val notSuccessTyped =
            assertIs<com.example.prompts_e01.Schema.Shared.EnumWithCommonFields_NotSuccess>(parsedNotSuccess)
        assertEquals(10, notSuccessTyped.x)
        assertEquals(20.5, notSuccessTyped.y)
        assertEquals("error", notSuccessTyped.z)

        val success: com.example.prompts_e01.Schema.Shared.EnumWithCommonFields =
            com.example.prompts_e01.Schema.Shared.EnumWithCommonFields_Success(
                x = 42,
                y = 84.0,
                z = 99,
            )
        val jsonSuccess = Json.encodeToString(
            com.example.prompts_e01.Schema.Shared.EnumWithCommonFields.serializer(),
            success,
        )
        val parsedSuccess = Json.decodeFromString(
            com.example.prompts_e01.Schema.Shared.EnumWithCommonFields.serializer(),
            jsonSuccess,
        )
        val successTyped = assertIs<com.example.prompts_e01.Schema.Shared.EnumWithCommonFields_Success>(parsedSuccess)
        assertEquals(42, successTyped.x)
        assertEquals(84.0, successTyped.y)
        assertEquals(99, successTyped.z)
    }

    @Test
    fun testStringEnumVariantSerialization() {
        val variant = com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.Csv
        val jsonVariant = Json.encodeToString(
            com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.serializer(),
            variant,
        )
        assertEquals("\"csv\"", jsonVariant)
        val parsedVariant = Json.decodeFromString(
            com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.serializer(),
            jsonVariant,
        )
        assertEquals(com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.Csv, parsedVariant)
    }

    @Test
    fun testMatrixWithOmittedOptionalFields() {
        val matrix = com.example.prompts_e01.Schema.Shared.Matrix(
            matrix = emptyList(),
            ints = listOf(1, 2, 3),
            init = true,
            encode = false,
        )
        assertNull(matrix.otherMatrix)
        assertNull(matrix.foo)
    }
}

class TestTemplateOverrider {
    @Test
    fun testSignatureCheckAndOverrides() {
        val data = com.example.prompts01.TemplateOverrider.templatesData()
        val sig = data.jsonObject["signature"]?.jsonPrimitive?.content
        assertNotNull(sig)
        assertTrue(sig.isNotEmpty())

        // Test signature mismatch throws IllegalArgumentException
        val wrongDoc =
            Json.parseToJsonElement("{\"signature\":\"wrong_sig\",\"edition\":0,\"templates\":{},\"tools\":{}}")
        assertFailsWith<IllegalArgumentException> {
            com.example.prompts01.TemplateOverrider.applyOverrides(wrongDoc)
        }

        // Test valid overrides
        val prompts = com.example.prompts01.TemplateOverrider.applyOverrides(data)
        assertNotNull(prompts)
        val prompt = prompts.renderTranslate(
            com.example.prompts01.Schema.Translate.Input(
                text = "Hello",
                targetLanguage = "French",
            ),
        )
        assertTrue(prompt.userMessage.contains("French"))
    }
}
