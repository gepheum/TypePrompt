@file:Suppress("ktlint:standard:class-naming", "ktlint:standard:max-line-length")

package dev.typeprompt

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class Test01Basics_Translate {
    private val prompt =
        com.example.prompts01.prompts.renderTranslate(
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
        assertEquals(0, prompt.tools.size)
    }
}

class Test02StructuredOutput_TriageTicket {
    private val prompt =
        com.example.prompts02.prompts.renderTriageTicket(
            com.example.prompts02.Schema.TriageTicket.Input(
                subject = "App crashes on login",
                body = "It crashes every time.",
                customerTier = com.example.prompts02.Schema.TriageTicket.Input_CustomerTier.Pro,
                recentTickets = emptyList(),
            ),
        )

    @Test
    fun testJsonOutputFormat() {
        val format = assertIs<com.example.prompts02.JsonOutputFormat>(prompt.outputFormat)
        val schema = format.jsonSchema
        assertEquals("object", schema["type"]?.jsonPrimitive?.content)
        assertTrue(schema["properties"]?.jsonObject?.containsKey("category") == true)
        assertTrue(schema["properties"]?.jsonObject?.containsKey("urgency") == true)
        val required = schema["required"]?.jsonArray?.map { it.jsonPrimitive.content }
        assertTrue(required?.contains("category") == true)
        assertTrue(required?.contains("urgency") == true)
    }

    @Test
    fun testHasNoRecursiveType() {
        val format = assertIs<com.example.prompts02.JsonOutputFormat>(prompt.outputFormat)
        assertFalse(format.hasRecursiveType)
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
        val result =
            prompt.parseResponse(
                "{\"category\":\"billing\",\"urgency\":\"low\",\"summary\":\"Invoice question\",\"suggestedActions\":[]}",
            )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Billing, result.category)
        assertEquals("billing", result.category.value)
        assertEquals("billing", result.category.toString())
        assertEquals(com.example.prompts02.Schema.TriageTicket.Output_Urgency.Low, result.urgency)
        assertEquals("low", result.urgency.value)
        assertEquals("Invoice question", result.summary)
    }

    @Test
    fun testParseResponseStripsJsonCodeFences() {
        val result =
            prompt.parseResponse(
                "```json\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```",
            )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, result.category)
    }

    @Test
    fun testParseResponseStripsPlainCodeFences() {
        val result =
            prompt.parseResponse(
                "```\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```",
            )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, result.category)
    }

    @Test
    fun testOptionalFieldAbsentWhenOmitted() {
        val result =
            prompt.parseResponse(
                "{\"category\":\"feature-request\",\"urgency\":\"low\",\"summary\":\"Dark mode\",\"suggestedActions\":[\"Log request\"]}",
            )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.FeatureRequest, result.category)
        assertNull(result.suggestedReply)
    }

    @Test
    fun testUserMessageContainsYamlRenderedRecentTickets() {
        val p =
            com.example.prompts02.prompts.renderTriageTicket(
                com.example.prompts02.Schema.TriageTicket.Input(
                    subject = "X",
                    body = "Y",
                    customerTier = com.example.prompts02.Schema.TriageTicket.Input_CustomerTier.Pro,
                    recentTickets =
                        listOf(
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

class Test02_GeneratePageTree {
    private val provider =
        com.example.prompts02.Schema.GeneratePageTree.Provider(
            name = "CloudX",
            region = "us-east",
            category = com.example.prompts02.Schema.GeneratePageTree.ProductCategory.Compute,
            pricing =
                com.example.prompts02.Schema.GeneratePageTree.Pricing(
                    model = com.example.prompts02.Schema.GeneratePageTree.Pricing_Model.PerHour,
                    basePrice = 0.1,
                ),
            benchmarks =
                listOf(
                    com.example.prompts02.Schema.GeneratePageTree.Benchmark(
                        name = "throughput",
                        score = 1000.0,
                        unit = "rps",
                    ),
                ),
            pros = listOf("fast", "reliable"),
            cons = listOf("pricey"),
        )

    private val prompt =
        com.example.prompts02.prompts.renderGeneratePageTree(
            com.example.prompts02.Schema.GeneratePageTree.Input(
                providers = listOf(provider),
                useCase = "serving ML inference workloads",
                audience = com.example.prompts02.Schema.GeneratePageTree.Input_Audience.Architect,
            ),
        )

    @Test
    fun testJsonOutputFormat() {
        assertIs<com.example.prompts02.JsonOutputFormat>(prompt.outputFormat)
    }

    @Test
    fun testHasRecursiveType() {
        val format = assertIs<com.example.prompts02.JsonOutputFormat>(prompt.outputFormat)
        assertTrue(format.hasRecursiveType)
    }

    @Test
    fun testTemplateId() {
        assertEquals("Main:GeneratePageTree", prompt.templateId.toString())
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
        assertTrue(
            prompt.userMessage.contains("Generate a comparison page layout framed around this use case: serving ML inference workloads"),
        )
        assertTrue(prompt.userMessage.contains("name: CloudX"))
        assertTrue(prompt.userMessage.contains("Target audience: architect"))
    }

    @Test
    fun testParseResponse() {
        val result =
            prompt.parseResponse(
                """{"root":{"kind":"section","title":"Overview","children":[{"kind":"heading","level":"h1","text":"CloudX"},{"kind":"paragraph","text":"Fast compute provider."},{"kind":"button","label":"Sign Up","url":"https://cloudx.example.com"}]}}""",
            )
        val section = assertIs<com.example.prompts02.Schema.GeneratePageTree.PageNode_KindSection>(result.root)
        assertEquals("Overview", section.title)
        assertEquals(3, section.children.size)
        val heading = assertIs<com.example.prompts02.Schema.GeneratePageTree.PageNode_KindHeading>(section.children[0])
        assertEquals("CloudX", heading.text)
    }
}

class Test03Tools_ResearchQuestion {
    private val prompt =
        com.example.prompts03.prompts.renderResearchQuestion(
            com.example.prompts03.Schema.ResearchQuestion.Input(
                question = "Tokyo population?",
            ),
        )

    private class MockWebSearchExecutor : com.example.prompts03.ToolExecutor.WebSearch {
        override suspend fun webSearch(
            input: com.example.prompts03.Schema.WebSearch.Input,
        ): com.example.prompts03.Schema.WebSearch.Output {
            return com.example.prompts03.Schema.WebSearch.Output(
                results =
                    listOf(
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
    fun testWebSearchToolInputJsonSchema() {
        val schema = prompt.tools["webSearch"]?.inputJsonSchema
        assertNotNull(schema)
        assertEquals("object", schema["type"]?.jsonPrimitive?.content)
        assertEquals(listOf("query"), schema["required"]?.jsonArray?.map { it.jsonPrimitive.content })
        assertEquals(
            "string",
            schema["properties"]?.jsonObject?.get("query")?.jsonObject?.get("type")?.jsonPrimitive?.content,
        )
    }

    @Test
    fun testPromptToolsEnum() {
        assertEquals("webSearch", com.example.prompts03.PromptTools.ResearchQuestion.webSearch.toolName)
        assertEquals("webSearch", com.example.prompts03.PromptTools.ResearchQuestion.webSearch.toString())
    }

    @Test
    fun testProducesOneExampleWithOneStep() {
        assertEquals(1, prompt.examples.size)
        assertEquals(1, prompt.examples[0].steps.size)
    }

    @Test
    fun testExampleToolCallIds() {
        val tc = prompt.examples[0].steps[0].toolCalls[0]
        assertEquals("s1", tc.callId)
        assertEquals("webSearch", tc.toolName)
    }

    @Test
    fun testExampleToolCallStringifiedInput() {
        val tc = prompt.examples[0].steps[0].toolCalls[0]
        assertTrue(tc.stringifiedInput.contains("Tokyo population 2024"))
    }

    @Test
    fun testExecuteToolsCallsExecutorAndReturnsOutput() =
        runTest {
            val toolCalls =
                listOf(
                    com.example.prompts03.ToolCall("call_1", "webSearch", "{\"query\":\"Tokyo population\"}"),
                )
            val results = prompt.executeTools(toolCalls, MockWebSearchExecutor())
            assertEquals(1, results.size)
            assertEquals("call_1", results[0].callId)
            assertTrue(results[0].stringifiedOutput.contains("Tokyo Population 2024"))
        }

    @Test
    fun testExecuteToolsAcceptsSet() =
        runTest {
            val toolCalls =
                setOf(
                    com.example.prompts03.ToolCall("call_1", "webSearch", "{\"query\":\"Tokyo population\"}"),
                )
            val results = prompt.executeTools(toolCalls, MockWebSearchExecutor())
            assertEquals(1, results.size)
            assertEquals("call_1", results[0].callId)
        }

    @Test
    fun testExecuteToolsUnknownToolReturnsError() =
        runTest {
            val toolCalls =
                listOf(
                    com.example.prompts03.ToolCall("c1", "noSuchTool", "{}"),
                )
            val results = prompt.executeTools(toolCalls, MockWebSearchExecutor())
            assertEquals(1, results.size)
            assertEquals("c1", results[0].callId)
            assertEquals("Tool not found: noSuchTool", results[0].error)
            assertTrue(results[0].stringifiedOutput.contains("\"error\":\"Tool not found: noSuchTool\""))
        }

    @Test
    fun testExecuteToolsExecutorThrowsReturnsError() =
        runTest {
            val failingExecutor =
                object : com.example.prompts03.ToolExecutor.WebSearch {
                    override suspend fun webSearch(
                        input: com.example.prompts03.Schema.WebSearch.Input,
                    ): com.example.prompts03.Schema.WebSearch.Output {
                        throw RuntimeException("Search service failure")
                    }
                }
            val toolCalls =
                listOf(
                    com.example.prompts03.ToolCall("call_err", "webSearch", "{\"query\":\"fail\"}"),
                )
            val results = prompt.executeTools(toolCalls, failingExecutor)
            assertEquals(1, results.size)
            assertEquals("call_err", results[0].callId)
            assertEquals("Search service failure", results[0].error)
            assertTrue(results[0].stringifiedOutput.contains("\"error\":\"Search service failure\""))
        }
}

class Test04Snippets_SummarizeDocument {
    @Test
    fun testSwitchSnippetSelectsExecutiveInstruction() {
        val p =
            com.example.prompts05.prompts.renderSummarizeDocument(
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
        val p =
            com.example.prompts05.prompts.renderSummarizeDocument(
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
        val p =
            com.example.prompts05.prompts.renderSummarizeDocument(
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
        val p =
            com.example.prompts05.prompts.renderSummarizeDocument(
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
        val p =
            com.example.prompts05.prompts.renderSummarizeDocument(
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
        val p =
            com.example.prompts05.prompts.renderSummarizeDocument(
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
        val p =
            com.example.prompts05.prompts.renderSummarizeDocument(
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
    private val marketing =
        com.example.prompts04.prompts.renderWriteProductDescription(
            com.example.prompts04.Schema.WriteProductDescription.Input(
                productName = "AquaFilter Pro",
                features = features,
                variant = com.example.prompts04.Schema.WriteProductDescription.Input_Variant.Marketing,
            ),
        )
    private val technical =
        com.example.prompts04.prompts.renderWriteProductDescription(
            com.example.prompts04.Schema.WriteProductDescription.Input(
                productName = "AquaFilter Pro",
                features = features,
                variant = com.example.prompts04.Schema.WriteProductDescription.Input_Variant.Technical,
            ),
        )
    private val brief =
        com.example.prompts04.prompts.renderWriteProductDescription(
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

class Test06SharedTypes {
    private val address =
        com.example.prompts06.Schema.Shared.Address(
            street = "1 Main St",
            city = "Paris",
            country = "France",
        )

    private val contact =
        com.example.prompts06.Schema.Shared.ContactInfo(
            name = "Alice Dupont",
            email = "alice@example.com",
            address = address,
        )

    @Test
    fun testShippingConfirmation() {
        val prompt =
            com.example.prompts06.prompts.renderShippingConfirmation(
                com.example.prompts06.Schema.ShippingConfirmation.Input(
                    recipient = contact,
                    orderNumber = "ORD-1234",
                    estimatedDelivery = "2026-08-20",
                    items =
                        listOf(
                            com.example.prompts06.Schema.ShippingConfirmation.Input_Items(
                                name = "Laptop",
                                quantity = 1,
                            ),
                        ),
                ),
            )

        assertIs<com.example.prompts06.TextOutputFormat>(prompt.outputFormat)
        assertEquals("Main:ShippingConfirmation", prompt.templateId.toString())
        assertTrue(prompt.userMessage.contains("Alice Dupont"))
        assertTrue(prompt.userMessage.contains("ORD-1234"))
        assertTrue(prompt.systemMessage.contains("confirmation email"))
    }

    @Test
    fun testReturnSlip() {
        val prompt =
            com.example.prompts06.prompts.renderReturnSlip(
                com.example.prompts06.Schema.ReturnSlip.Input(
                    customer = contact,
                    returnReason = com.example.prompts06.Schema.ReturnSlip.Input_ReturnReason.Defective,
                    orderNumber = "ORD-1234",
                ),
            )

        assertIs<com.example.prompts06.TextOutputFormat>(prompt.outputFormat)
        assertEquals("Main:ReturnSlip", prompt.templateId.toString())
        assertTrue(prompt.userMessage.contains("Alice Dupont"))
        assertTrue(prompt.userMessage.contains("defective"))
    }
}

class Test07Namespaces {
    @Test
    fun testFinanceSummarizeTransaction() {
        val prompt =
            com.example.prompts07.prompts.finance.renderSummarizeTransaction(
                com.example.prompts07.Schema.Finance.SummarizeTransaction.Input(
                    description = "AWS monthly bill",
                    amount =
                        com.example.prompts07.Schema.Finance.Shared.MoneyAmount(
                            value = 450.0,
                            currency = com.example.prompts07.Schema.Finance.Shared.Currency.Usd,
                        ),
                    category = com.example.prompts07.Schema.Finance.SummarizeTransaction.Input_Category.Expense,
                    date = "2026-08-01",
                ),
            )

        assertEquals("Finance:SummarizeTransaction", prompt.templateId.toString())
        assertNotNull(com.example.prompts07.prompts.finance)
        assertIs<com.example.prompts07.JsonOutputFormat>(prompt.outputFormat)
        assertFalse((prompt.outputFormat as com.example.prompts07.JsonOutputFormat).hasRecursiveType)
        assertTrue(prompt.userMessage.contains("AWS monthly bill"))
    }

    @Test
    fun testFinanceDetectAnomaly() {
        val prompt =
            com.example.prompts07.prompts.finance.renderDetectAnomaly(
                com.example.prompts07.Schema.Finance.DetectAnomaly.Input(
                    recentTransactions = emptyList(),
                    newTransaction =
                        com.example.prompts07.Schema.Finance.DetectAnomaly.Input_NewTransaction(
                            description = "Casino chips",
                            amount =
                                com.example.prompts07.Schema.Finance.Shared.MoneyAmount(
                                    value = 5000.0,
                                    currency = com.example.prompts07.Schema.Finance.Shared.Currency.Usd,
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
        val prompt =
            com.example.prompts07.prompts.legal.renderDraftNda(
                com.example.prompts07.Schema.Legal.DraftNda.Input(
                    disclosingParty =
                        com.example.prompts07.Schema.Legal.Shared.Party(
                            name = "Acme Corp",
                            role = com.example.prompts07.Schema.Legal.Shared.Party_Role.Client,
                            jurisdiction = "California",
                        ),
                    receivingParty =
                        com.example.prompts07.Schema.Legal.Shared.Party(
                            name = "Beta LLC",
                            role = com.example.prompts07.Schema.Legal.Shared.Party_Role.Counterparty,
                            jurisdiction = "Delaware",
                        ),
                    purposeOfDisclosure = "Evaluating a potential acquisition",
                    durationYears = 3,
                ),
            )

        assertEquals("Legal:DraftNda", prompt.templateId.toString())
        assertIs<com.example.prompts07.TextOutputFormat>(prompt.outputFormat)
        assertNotNull(com.example.prompts07.prompts.legal)
        assertTrue(prompt.userMessage.contains("Acme Corp"))
        assertTrue(prompt.userMessage.contains("Beta LLC"))
        assertTrue(prompt.systemMessage.contains("non-disclosure agreement"))
    }

    @Test
    fun testLegalSummarizeClause() {
        val prompt =
            com.example.prompts07.prompts.legal.renderSummarizeClause(
                com.example.prompts07.Schema.Legal.SummarizeClause.Input(
                    clauseText = "The party shall indemnify and hold harmless...",
                    reviewingParty =
                        com.example.prompts07.Schema.Legal.Shared.Party(
                            name = "Alice",
                            role = com.example.prompts07.Schema.Legal.Shared.Party_Role.Client,
                            jurisdiction = "NY",
                        ),
                ),
            )

        assertEquals("Legal:SummarizeClause", prompt.templateId.toString())
        assertIs<com.example.prompts07.JsonOutputFormat>(prompt.outputFormat)
        assertFalse((prompt.outputFormat as com.example.prompts07.JsonOutputFormat).hasRecursiveType)
        assertTrue(prompt.userMessage.contains("Alice"))
        assertTrue(prompt.userMessage.contains("indemnify"))
        assertTrue(prompt.userMessage.contains("<Clause>"))
    }
}

class TestE01_AnalyzeSalesData {
    private val rows =
        listOf(
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

    private val csv =
        com.example.prompts_e01.prompts.renderAnalyzeSalesData(
            com.example.prompts_e01.Schema.AnalyzeSalesData.Input(
                rows = rows,
                question = "Top product?",
                variant = com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.Csv,
            ),
        )

    private val tsv =
        com.example.prompts_e01.prompts.renderAnalyzeSalesData(
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
        val empty =
            com.example.prompts_e01.prompts.renderAnalyzeSalesData(
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

class TestE01_InsertOutputSchema {
    private val prompt =
        com.example.prompts_e01.prompts.renderInsertOutputSchema(
            com.example.prompts_e01.Schema.InsertOutputSchema.Input(
                topic = "AI Safety",
            ),
        )

    @Test
    fun testUserMessageContainsTypeScriptSchema() {
        assertTrue(prompt.userMessage.contains("Topic: AI Safety"))
        assertTrue(prompt.userMessage.contains("interface Output {"))
        assertTrue(prompt.userMessage.contains("title: string"))
        assertTrue(prompt.userMessage.contains("score?: number"))
    }
}

class TestCrossCutting_ParseResponse {
    private fun p02Render() =
        com.example.prompts02.prompts.renderTriageTicket(
            com.example.prompts02.Schema.TriageTicket.Input(
                subject = "X",
                body = "Y",
                customerTier = com.example.prompts02.Schema.TriageTicket.Input_CustomerTier.Pro,
                recentTickets = emptyList(),
            ),
        )

    @Test
    fun testParsesPlainJsonWithoutFences() {
        val res =
            p02Render().parseResponse(
                "{\"category\":\"other\",\"urgency\":\"low\",\"summary\":\"x\",\"suggestedActions\":[]}",
            )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, res.category)
    }

    @Test
    fun testStripsPlainCodeFences() {
        val res =
            p02Render().parseResponse(
                "```\n{\"category\":\"other\",\"urgency\":\"low\",\"summary\":\"x\",\"suggestedActions\":[]}\n```",
            )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, res.category)
    }

    @Test
    fun testStripsJsonCodeFences() {
        val res =
            p02Render().parseResponse(
                "```json\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```",
            )
        assertEquals(com.example.prompts02.Schema.TriageTicket.TicketCategory.Other, res.category)
    }

    @Test
    fun testReturnsRawStringForTextOutputFormat() {
        val prompt =
            com.example.prompts01.prompts.renderTranslate(
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
        val jsonNotSuccess =
            Json.encodeToString(
                com.example.prompts_e01.Schema.Shared.EnumWithCommonFields.serializer(),
                notSuccess,
            )
        val parsedNotSuccess =
            Json.decodeFromString(
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
        val jsonSuccess =
            Json.encodeToString(
                com.example.prompts_e01.Schema.Shared.EnumWithCommonFields.serializer(),
                success,
            )
        val parsedSuccess =
            Json.decodeFromString(
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
        val jsonVariant =
            Json.encodeToString(
                com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.serializer(),
                variant,
            )
        assertEquals("\"csv\"", jsonVariant)
        val parsedVariant =
            Json.decodeFromString(
                com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.serializer(),
                jsonVariant,
            )
        assertEquals(com.example.prompts_e01.Schema.AnalyzeSalesData.Input_Variant.Csv, parsedVariant)
    }

    @Test
    fun testMatrixWithOmittedOptionalFields() {
        val matrix =
            com.example.prompts_e01.Schema.Shared.Matrix(
                matrix = emptyList(),
                ints = listOf(1, 2, 3),
                init = true,
                encode = false,
            )
        assertNull(matrix.otherMatrix)
    }

    @Test
    fun testComplexTypeSerializationAndDeserialization() {
        val sq = com.example.prompts_e01.Schema.Shared.Square(size = 10.0, fromJson = "fj", self = "sf")
        val sq2 = com.example.prompts_e01.Schema.Shared.Square(size = 20.0, fromJson = "fj2", self = "sf2")
        val sq3 = com.example.prompts_e01.Schema.Shared.Square(size = 30.0, fromJson = "fj3", self = "sf3")
        val sq4 = com.example.prompts_e01.Schema.Shared.Square(size = 40.0, fromJson = "fj4", self = "sf4")

        val full =
            com.example.prompts_e01.Schema.Shared.ComplexType(
                stringField = "hello",
                intField = 42,
                numField = 3.14,
                boolField = true,
                enumField = com.example.prompts_e01.Schema.Shared.E.FooBar,
                stringUnion = com.example.prompts_e01.Schema.Shared.ComplexType_StringUnion.FooBar,
                unionField = com.example.prompts_e01.Schema.Shared.Expr_KindNumber(value = 100.0),
                structField = sq,
                stringList = listOf("a", "b"),
                structList = listOf(sq2),
                matrix = listOf(listOf(1, 2), listOf(3, 4)),
                optString = "optional hello",
                optInt = 99,
                optNum = 2.718,
                optBool = false,
                optEnum = com.example.prompts_e01.Schema.Shared.E.If,
                optStringUnion = com.example.prompts_e01.Schema.Shared.ComplexType_OptStringUnion.ZooKar,
                optUnion = com.example.prompts_e01.Schema.Shared.Expr_KindNumber(value = 200.0),
                optStruct = sq3,
                optStringList = listOf("x", "y"),
                optStructList = listOf(sq4),
                optMatrix = listOf(listOf(5, 6), listOf(7, 8)),
            )

        val fullJson = Json.encodeToString(com.example.prompts_e01.Schema.Shared.ComplexType.serializer(), full)
        val parsedFull = Json.decodeFromString(com.example.prompts_e01.Schema.Shared.ComplexType.serializer(), fullJson)
        assertEquals("hello", parsedFull.stringField)
        assertEquals(42, parsedFull.intField)
        assertEquals(3.14, parsedFull.numField)
        assertTrue(parsedFull.boolField)
        assertEquals(com.example.prompts_e01.Schema.Shared.E.FooBar, parsedFull.enumField)
        assertEquals(com.example.prompts_e01.Schema.Shared.ComplexType_StringUnion.FooBar, parsedFull.stringUnion)
        assertEquals("foo-bar", parsedFull.stringUnion.value)
        val numTyped = assertIs<com.example.prompts_e01.Schema.Shared.Expr_KindNumber>(parsedFull.unionField)
        assertEquals(100.0, numTyped.value)
        assertEquals(10.0, parsedFull.structField.size)
        assertEquals(listOf("a", "b"), parsedFull.stringList)
        assertEquals(1, parsedFull.structList.size)
        assertEquals(20.0, parsedFull.structList[0].size)
        assertEquals(2, parsedFull.matrix.size)
        assertEquals(2, parsedFull.matrix[0][1])

        assertEquals("optional hello", parsedFull.optString)
        assertEquals(99, parsedFull.optInt)
        assertEquals(2.718, parsedFull.optNum)
        assertFalse(parsedFull.optBool!!)
        assertEquals(com.example.prompts_e01.Schema.Shared.E.If, parsedFull.optEnum)
        assertEquals(com.example.prompts_e01.Schema.Shared.ComplexType_OptStringUnion.ZooKar, parsedFull.optStringUnion)
        assertEquals("zooKar", parsedFull.optStringUnion?.value)
        val optNumTyped = assertIs<com.example.prompts_e01.Schema.Shared.Expr_KindNumber>(parsedFull.optUnion)
        assertEquals(200.0, optNumTyped.value)
        assertNotNull(parsedFull.optStruct)
        assertEquals(30.0, parsedFull.optStruct?.size)
        assertEquals(listOf("x", "y"), parsedFull.optStringList)
        assertNotNull(parsedFull.optStructList)
        assertEquals(1, parsedFull.optStructList?.size)
        assertEquals(40.0, parsedFull.optStructList?.get(0)?.size)
        assertEquals(7, parsedFull.optMatrix?.get(1)?.get(0))

        // Omitted optional fields
        val omitted =
            com.example.prompts_e01.Schema.Shared.ComplexType(
                stringField = "hello",
                intField = 42,
                numField = 3.14,
                boolField = true,
                enumField = com.example.prompts_e01.Schema.Shared.E.FooBar,
                stringUnion = com.example.prompts_e01.Schema.Shared.ComplexType_StringUnion.FooBar,
                unionField = com.example.prompts_e01.Schema.Shared.Expr_KindNumber(value = 100.0),
                structField = sq,
                stringList = listOf("a", "b"),
                structList = listOf(sq2),
                matrix = listOf(listOf(1, 2), listOf(3, 4)),
            )

        val omittedJson = Json.encodeToString(com.example.prompts_e01.Schema.Shared.ComplexType.serializer(), omitted)
        assertTrue(omittedJson.contains("\"optString\":null"))
        assertTrue(omittedJson.contains("\"optInt\":null"))
        assertTrue(omittedJson.contains("\"optNum\":null"))
        assertTrue(omittedJson.contains("\"optBool\":null"))
        assertTrue(omittedJson.contains("\"optEnum\":null"))
        assertTrue(omittedJson.contains("\"optStringUnion\":null"))
        assertTrue(omittedJson.contains("\"optUnion\":null"))
        assertTrue(omittedJson.contains("\"optStruct\":null"))
        assertTrue(omittedJson.contains("\"optStringList\":null"))
        assertTrue(omittedJson.contains("\"optStructList\":null"))
        assertTrue(omittedJson.contains("\"optMatrix\":null"))

        val parsedOmitted =
            Json.decodeFromString(com.example.prompts_e01.Schema.Shared.ComplexType.serializer(), omittedJson)
        assertEquals("hello", parsedOmitted.stringField)
        assertNull(parsedOmitted.optString)
        assertNull(parsedOmitted.optInt)
        assertNull(parsedOmitted.optNum)
        assertNull(parsedOmitted.optBool)
        assertNull(parsedOmitted.optEnum)
        assertNull(parsedOmitted.optStringUnion)
        assertNull(parsedOmitted.optUnion)
        assertNull(parsedOmitted.optStruct)
        assertNull(parsedOmitted.optStringList)
        assertNull(parsedOmitted.optStructList)
        assertNull(parsedOmitted.optMatrix)
    }

    @Test
    fun testOmitDefaultSerializationAndDeserialization() {
        val omitted =
            com.example.prompts_e01.Schema.Shared.OmitDefaultType(
                stringList = emptyList(),
                stringField = "",
                intField = 0,
                numField = 0.0,
                boolField = false,
                plainOpt = null,
                plainString = "test",
                plainInt = 123,
                plainBool = true,
                plainList = listOf("item"),
            )
        val omittedJson = Json.encodeToString(com.example.prompts_e01.Schema.Shared.OmitDefaultType.serializer(), omitted)

        assertFalse(omittedJson.contains("\"optString\""))
        assertFalse(omittedJson.contains("\"optInt\""))
        assertFalse(omittedJson.contains("\"optNum\""))
        assertFalse(omittedJson.contains("\"optBool\""))
        assertFalse(omittedJson.contains("\"stringList\""))
        assertFalse(omittedJson.contains("\"stringField\""))
        assertFalse(omittedJson.contains("\"intField\""))
        assertFalse(omittedJson.contains("\"numField\""))
        assertFalse(omittedJson.contains("\"boolField\""))

        assertTrue(omittedJson.contains("\"plainOpt\":null"))
        assertTrue(omittedJson.contains("\"plainString\":\"test\""))
        assertTrue(omittedJson.contains("\"plainInt\":123"))
        assertTrue(omittedJson.contains("\"plainBool\":true"))
        assertTrue(omittedJson.contains("\"plainList\":[\"item\"]"))

        val decodedOmitted =
            Json.decodeFromString(com.example.prompts_e01.Schema.Shared.OmitDefaultType.serializer(), omittedJson)
        assertNull(decodedOmitted.optString)
        assertNull(decodedOmitted.optInt)
        assertNull(decodedOmitted.optNum)
        assertNull(decodedOmitted.optBool)
        assertEquals(emptyList<String>(), decodedOmitted.stringList)
        assertEquals("", decodedOmitted.stringField)
        assertEquals(0, decodedOmitted.intField)
        assertEquals(0.0, decodedOmitted.numField, 0.0)
        assertFalse(decodedOmitted.boolField)
        assertNull(decodedOmitted.plainOpt)
        assertEquals("test", decodedOmitted.plainString)
        assertEquals(123, decodedOmitted.plainInt)
        assertTrue(decodedOmitted.plainBool)
        assertEquals(listOf("item"), decodedOmitted.plainList)

        // Missing required plain* fields in JSON must fail
        assertFailsWith<kotlinx.serialization.SerializationException> {
            Json.decodeFromString(com.example.prompts_e01.Schema.Shared.OmitDefaultType.serializer(), "{}")
        }

        // 2. Instance with explicitly assigned default values
        val explicitDefaults =
            com.example.prompts_e01.Schema.Shared.OmitDefaultType(
                optString = null,
                optInt = null,
                optNum = null,
                optBool = null,
                stringList = emptyList(),
                stringField = "",
                intField = 0,
                numField = 0.0,
                boolField = false,
                plainOpt = null,
                plainString = "test2",
                plainInt = 456,
                plainBool = false,
                plainList = emptyList(),
            )
        val explicitJson = Json.encodeToString(com.example.prompts_e01.Schema.Shared.OmitDefaultType.serializer(), explicitDefaults)
        assertFalse(explicitJson.contains("\"optString\""))
        assertFalse(explicitJson.contains("\"optInt\""))
        assertFalse(explicitJson.contains("\"optNum\""))
        assertFalse(explicitJson.contains("\"optBool\""))
        assertFalse(explicitJson.contains("\"stringList\""))
        assertFalse(explicitJson.contains("\"stringField\""))
        assertFalse(explicitJson.contains("\"intField\""))
        assertFalse(explicitJson.contains("\"numField\""))
        assertFalse(explicitJson.contains("\"boolField\""))
        assertTrue(explicitJson.contains("\"plainOpt\":null"))
        assertTrue(explicitJson.contains("\"plainString\":\"test2\""))
        assertTrue(explicitJson.contains("\"plainInt\":456"))
        assertTrue(explicitJson.contains("\"plainBool\":false"))
        assertTrue(explicitJson.contains("\"plainList\":[]"))

        // 3. Instance with non-default values
        val populated =
            com.example.prompts_e01.Schema.Shared.OmitDefaultType(
                optString = "hello",
                optInt = 42,
                optNum = 3.14,
                optBool = true,
                stringList = listOf("a", "b"),
                stringField = "world",
                intField = 7,
                numField = 2.5,
                boolField = true,
                plainOpt = "plain",
                plainString = "test3",
                plainInt = 789,
                plainBool = true,
                plainList = listOf("x"),
            )
        val populatedJson = Json.encodeToString(com.example.prompts_e01.Schema.Shared.OmitDefaultType.serializer(), populated)
        assertTrue(populatedJson.contains("\"optString\":\"hello\""))
        assertTrue(populatedJson.contains("\"optInt\":42"))
        assertTrue(populatedJson.contains("\"optNum\":3.14"))
        assertTrue(populatedJson.contains("\"optBool\":true"))
        assertTrue(populatedJson.contains("\"stringList\":[\"a\",\"b\"]"))
        assertTrue(populatedJson.contains("\"stringField\":\"world\""))
        assertTrue(populatedJson.contains("\"intField\":7"))
        assertTrue(populatedJson.contains("\"numField\":2.5"))
        assertTrue(populatedJson.contains("\"boolField\":true"))
        assertTrue(populatedJson.contains("\"plainOpt\":\"plain\""))
        assertTrue(populatedJson.contains("\"plainString\":\"test3\""))
        assertTrue(populatedJson.contains("\"plainInt\":789"))
        assertTrue(populatedJson.contains("\"plainBool\":true"))
        assertTrue(populatedJson.contains("\"plainList\":[\"x\"]"))

        val decodedPopulated =
            Json.decodeFromString(com.example.prompts_e01.Schema.Shared.OmitDefaultType.serializer(), populatedJson)
        assertEquals("hello", decodedPopulated.optString)
        assertEquals(42, decodedPopulated.optInt)
        assertEquals(3.14, decodedPopulated.optNum!!, 0.0)
        assertTrue(decodedPopulated.optBool == true)
        assertEquals(listOf("a", "b"), decodedPopulated.stringList)
        assertEquals("world", decodedPopulated.stringField)
        assertEquals(7, decodedPopulated.intField)
        assertEquals(2.5, decodedPopulated.numField, 0.0)
        assertTrue(decodedPopulated.boolField)
        assertEquals("plain", decodedPopulated.plainOpt)
        assertEquals("test3", decodedPopulated.plainString)
        assertEquals(789, decodedPopulated.plainInt)
        assertTrue(decodedPopulated.plainBool)
        assertEquals(listOf("x"), decodedPopulated.plainList)
    }
}

class TestTemplateOverrider {
    @Test
    fun testSignatureCheckAndOverrides() {
        val data = com.example.prompts01.TemplateOverrider.templatesData
        val sig = data.jsonObject["signature"]?.jsonPrimitive?.content
        assertNotNull(sig)
        assertTrue(sig.isNotEmpty())

        // Test signature mismatch throws IllegalArgumentException
        val wrongDoc =
            Json.parseToJsonElement(
                "{\"signature\":\"wrong_sig\",\"edition\":0,\"templates\":{},\"tools\":{},\"sourceFiles\":{}}",
            )
        assertFailsWith<IllegalArgumentException> {
            com.example.prompts01.TemplateOverrider.applyOverrides(wrongDoc)
        }

        // Test valid overrides
        val prompts = com.example.prompts01.TemplateOverrider.applyOverrides(data)
        assertNotNull(prompts)
        val prompt =
            prompts.renderTranslate(
                com.example.prompts01.Schema.Translate.Input(
                    text = "Hello",
                    targetLanguage = "French",
                ),
            )
        assertTrue(prompt.userMessage.contains("French"))

        val defaultFromNull = com.example.prompts01.TemplateOverrider.applyOverrides(null)
        assertSame(com.example.prompts01.prompts, defaultFromNull)

        val defaultFromJsonNull = com.example.prompts01.TemplateOverrider.applyOverrides(JsonNull)
        assertSame(com.example.prompts01.prompts, defaultFromJsonNull)
    }
}
