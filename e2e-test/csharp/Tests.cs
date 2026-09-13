using System.Text.Json;
using System.Text.RegularExpressions;
using TypePrompt03;
using Xunit;

public class Test01Basics_Translate
{
    private readonly TypePrompt01.Prompt<string, TypePrompt01.NoTools> _prompt =
        TypePrompt01.Prompts.Default.RenderTranslate(new TypePrompt01.Schema.Translate.Input
        {
            Text = "Hello world",
            TargetLanguage = "French"
        });

    [Fact]
    public void TestTextOutputFormat()
    {
        Assert.IsType<TypePrompt01.TextOutputFormat>(_prompt.OutputFormat);
    }

    [Fact]
    public void TestTemplateId()
    {
        Assert.Equal("Main:Translate", TypePrompt01.TemplateIdExtensions.GetId(_prompt.TemplateId));
        Assert.Equal(TypePrompt01.TemplateId.Translate, _prompt.TemplateId);
    }

    [Fact]
    public void TestSystemMessageMentionsTranslatorRole()
    {
        Assert.Contains("professional translator", _prompt.SystemMessage);
    }

    [Fact]
    public void TestUserMessageMentionsTargetLanguage()
    {
        Assert.Contains("French", _prompt.UserMessage);
    }

    [Fact]
    public void TestEnclosedRendersCorrectTagInUserMessage()
    {
        Assert.Contains("<Text>", _prompt.UserMessage);
    }

    [Fact]
    public void TestProducesTwoExamples()
    {
        Assert.Equal(2, _prompt.Examples.Count);
    }

    [Fact]
    public void TestFirstExampleResponseIsTranslatedString()
    {
        Assert.Equal("La réunion est prévue pour lundi à 15h.", _prompt.Examples[0].Response);
    }

    [Fact]
    public void TestExampleUserMessageContainsEnclosedTag()
    {
        Assert.Contains("<Text>", _prompt.Examples[0].UserMessage);
    }

    [Fact]
    public void TestParseResponseReturnsRawString()
    {
        Assert.Equal("Bonjour", _prompt.ParseResponse("Bonjour"));
    }

    [Fact]
    public void TestHasNoTools()
    {
        Assert.Empty(_prompt.Tools);
    }
}

public class Test02StructuredOutput_TriageTicket
{
    private readonly TypePrompt02.Prompt<TypePrompt02.Schema.TriageTicket.Output, TypePrompt02.NoTools> _prompt =
        TypePrompt02.Prompts.Default.RenderTriageTicket(new TypePrompt02.Schema.TriageTicket.Input
        {
            Subject = "App crashes on login",
            Body = "It crashes every time.",
            CustomerTier = TypePrompt02.Schema.TriageTicket.Input_CustomerTier.Pro,
            RecentTickets = Array.Empty<TypePrompt02.Schema.TriageTicket.Input_RecentTickets>()
        });

    [Fact]
    public void TestJsonOutputFormat()
    {
        var format = Assert.IsType<TypePrompt02.JsonOutputFormat>(_prompt.OutputFormat);
        Assert.Equal(System.Text.Json.JsonValueKind.Object, format.JsonSchema.ValueKind);
        Assert.Equal("object", format.JsonSchema.GetProperty("type").GetString());
        Assert.True(format.JsonSchema.GetProperty("properties").TryGetProperty("category", out _));
        Assert.True(format.JsonSchema.GetProperty("properties").TryGetProperty("urgency", out _));
        Assert.Contains(format.JsonSchema.GetProperty("required").EnumerateArray(), e => e.GetString() == "category");
        Assert.Contains(format.JsonSchema.GetProperty("required").EnumerateArray(), e => e.GetString() == "urgency");
    }

    [Fact]
    public void TestCContentStrippedToPlainText()
    {
        Assert.Contains("urgency", _prompt.SystemMessage);
        Assert.Contains("\"critical\"", _prompt.SystemMessage);
        Assert.DoesNotContain("<c>", _prompt.SystemMessage);
    }

    [Fact]
    public void TestProducesTwoExamples()
    {
        Assert.Equal(2, _prompt.Examples.Count);
    }

    [Fact]
    public void TestFirstExampleResponseContainsOutputCategory()
    {
        Assert.Contains("\"technical-issue\"", _prompt.Examples[0].Response);
    }

    [Fact]
    public void TestSecondExampleResponseContainsOutputCategory()
    {
        Assert.Contains("\"feature-request\"", _prompt.Examples[1].Response);
    }

    [Fact]
    public void TestParseResponseParsesJson()
    {
        var result = _prompt.ParseResponse(
            "{\"category\":\"billing\",\"urgency\":\"low\",\"summary\":\"Invoice question\",\"suggestedActions\":[]}"
        );
        Assert.Equal(TypePrompt02.Schema.TriageTicket.TicketCategory.Billing, result.Category);
        Assert.Equal(TypePrompt02.Schema.TriageTicket.Output_Urgency.Low, result.Urgency);
        Assert.Equal("Invoice question", result.Summary);
    }

    [Fact]
    public void TestParseResponseStripsJsonCodeFences()
    {
        var result = _prompt.ParseResponse(
            "```json\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```"
        );
        Assert.Equal(TypePrompt02.Schema.TriageTicket.TicketCategory.Other, result.Category);
    }

    [Fact]
    public void TestParseResponseStripsPlainCodeFences()
    {
        var result = _prompt.ParseResponse(
            "```\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```"
        );
        Assert.Equal(TypePrompt02.Schema.TriageTicket.TicketCategory.Other, result.Category);
    }

    [Fact]
    public void TestOptionalFieldAbsentWhenOmitted()
    {
        var result = _prompt.ParseResponse(
            "{\"category\":\"feature-request\",\"urgency\":\"low\",\"summary\":\"Dark mode\",\"suggestedActions\":[\"Log request\"]}"
        );
        Assert.Equal(TypePrompt02.Schema.TriageTicket.TicketCategory.FeatureRequest, result.Category);
        Assert.Null(result.SuggestedReply);
    }

    [Fact]
    public void TestUserMessageContainsYamlRenderedRecentTickets()
    {
        var p = TypePrompt02.Prompts.Default.RenderTriageTicket(new TypePrompt02.Schema.TriageTicket.Input
        {
            Subject = "X",
            Body = "Y",
            CustomerTier = TypePrompt02.Schema.TriageTicket.Input_CustomerTier.Pro,
            RecentTickets = new[]
            {
                new TypePrompt02.Schema.TriageTicket.Input_RecentTickets
                {
                    Id = "T-1",
                    Summary = "Login bug",
                    Category = TypePrompt02.Schema.TriageTicket.TicketCategory.TechnicalIssue
                }
            }
        });
        Assert.Contains("id: T-1", p.UserMessage);
    }

    [Fact]
    public void TestUserMessageContainsInputAsYaml()
    {
        Assert.Contains("subject:", _prompt.UserMessage);
        Assert.Contains("customerTier:", _prompt.UserMessage);
    }

    [Fact]
    public void TestYamlExactUserMessage()
    {
        Assert.Equal(
            "subject: App crashes on login\nbody: It crashes every time.\ncustomerTier: pro\nrecentTickets: []",
            _prompt.UserMessage
        );
    }

    [Fact]
    public void TestMetaContainsDeclaredModelAndTemperature()
    {
        Assert.Equal(TypePrompt02.Schema.Meta_Model.Gpt4o, _prompt.Meta.Model);
        Assert.Equal(0.2, _prompt.Meta.Temperature);
    }
}

public class Test03Tools_ResearchQuestion
{
    private readonly TypePrompt03.Prompt<TypePrompt03.Schema.ResearchQuestion.Output, TypePrompt03.ToolExecutor.IWebSearch> _prompt =
        TypePrompt03.Prompts.Default.RenderResearchQuestion(new TypePrompt03.Schema.ResearchQuestion.Input
        {
            Question = "Tokyo population?"
        });

    private class MockWebSearchExecutor : TypePrompt03.ToolExecutor.IWebSearch
    {
        public Task<TypePrompt03.Schema.WebSearch.Output> WebSearch(
            TypePrompt03.Schema.WebSearch.Input input,
            CancellationToken cancellationToken = default
        )
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(new TypePrompt03.Schema.WebSearch.Output
            {
                Results = new List<TypePrompt03.Schema.WebSearch.Output_Results>
                {
                    new()
                    {
                        Title = "Tokyo Population 2024",
                        Url = "https://example.com/tokyo",
                        Snippet = "14 million"
                    }
                }
            });
        }
    }

    [Fact]
    public void TestRegistersWebSearchTool()
    {
        Assert.True(_prompt.Tools.ContainsKey("webSearch"));
    }

    [Fact]
    public void TestWebSearchToolName()
    {
        Assert.Equal("webSearch", _prompt.Tools["webSearch"].Name);
    }

    [Fact]
    public void TestWebSearchToolDescription()
    {
        Assert.Contains("Search the web", _prompt.Tools["webSearch"].Description);
    }

    [Fact]
    public void TestWebSearchToolInputJsonSchema()
    {
        var schema = _prompt.Tools["webSearch"].InputJsonSchema;
        Assert.Equal(System.Text.Json.JsonValueKind.Object, schema.ValueKind);
        Assert.Equal("object", schema.GetProperty("type").GetString());
        Assert.Equal("string", schema.GetProperty("properties").GetProperty("query").GetProperty("type").GetString());
        Assert.Contains(schema.GetProperty("required").EnumerateArray(), e => e.GetString() == "query");
    }

    [Fact]
    public void TestPromptToolsEnum()
    {
        Assert.Equal("webSearch", TypePrompt03.PromptTools.ResearchQuestion.WebSearch.GetToolName());
    }

    [Fact]
    public void TestProducesOneExampleWithOneIntermediateStep()
    {
        Assert.Single(_prompt.Examples);
        Assert.Single(_prompt.Examples[0].IntermediateSteps);
    }

    [Fact]
    public void TestExampleToolCallIds()
    {
        var tc = _prompt.Examples[0].IntermediateSteps[0].ToolCalls[0];
        Assert.Equal("s1", tc.CallId);
        Assert.Equal("webSearch", tc.ToolName);
    }

    [Fact]
    public void TestExampleToolCallStringifiedInput()
    {
        var tc = _prompt.Examples[0].IntermediateSteps[0].ToolCalls[0];
        Assert.Contains("Tokyo population 2024", tc.StringifiedInput);
    }

    [Fact]
    public async Task TestExecuteToolsCallsExecutorAndReturnsOutput()
    {
        var toolCalls = new[]
        {
            new TypePrompt03.ToolCall("call_1", "webSearch", "{\"query\":\"Tokyo population\"}")
        };

        var results = await _prompt.ExecuteTools(toolCalls, new MockWebSearchExecutor());

        Assert.Single(results);
        Assert.Equal("call_1", results[0].CallId);
        Assert.Contains("Tokyo Population 2024", results[0].StringifiedOutput);
    }

    [Fact]
    public async Task TestExecuteToolsThrowsForUnknownTool()
    {
        var toolCalls = new[]
        {
            new TypePrompt03.ToolCall("c1", "noSuchTool", "{}")
        };

        await Assert.ThrowsAnyAsync<Exception>(async () =>
        {
            await _prompt.ExecuteTools(toolCalls, new MockWebSearchExecutor());
        });
    }

    [Fact]
    public async Task TestExecuteToolsWithCancellationToken()
    {
        var toolCalls = new[]
        {
            new TypePrompt03.ToolCall("call_1", "webSearch", "{\"query\":\"Tokyo population\"}")
        };

        using var cts = new CancellationTokenSource();
        var results = await _prompt.ExecuteTools(toolCalls, new MockWebSearchExecutor(), cts.Token);
        Assert.Single(results);

        cts.Cancel();
        await Assert.ThrowsAnyAsync<Exception>(async () =>
        {
            await _prompt.ExecuteTools(toolCalls, new MockWebSearchExecutor(), cts.Token);
        });
    }
}

public class Test04Snippets_SummarizeDocument
{
    [Fact]
    public void TestSwitchSnippetSelectsExecutiveInstruction()
    {
        var p = TypePrompt05.Prompts.Default.RenderSummarizeDocument(new TypePrompt05.Schema.SummarizeDocument.Input
        {
            Title = "T",
            Content = "C",
            Audience = TypePrompt05.Schema.SummarizeDocument.Input_Audience.Executive
        });
        Assert.Contains("non-technical executive audience", p.SystemMessage);
    }

    [Fact]
    public void TestSwitchSnippetSelectsTechnicalInstruction()
    {
        var p = TypePrompt05.Prompts.Default.RenderSummarizeDocument(new TypePrompt05.Schema.SummarizeDocument.Input
        {
            Title = "T",
            Content = "C",
            Audience = TypePrompt05.Schema.SummarizeDocument.Input_Audience.Technical
        });
        Assert.Contains("technical audience", p.SystemMessage);
    }

    [Fact]
    public void TestSwitchSnippetSelectsGeneralInstruction()
    {
        var p = TypePrompt05.Prompts.Default.RenderSummarizeDocument(new TypePrompt05.Schema.SummarizeDocument.Input
        {
            Title = "T",
            Content = "C",
            Audience = TypePrompt05.Schema.SummarizeDocument.Input_Audience.General
        });
        Assert.Contains("general audience", p.SystemMessage);
    }

    [Fact]
    public void TestSwitchSnippetDoesNotBleedIntoOtherVariant()
    {
        var p = TypePrompt05.Prompts.Default.RenderSummarizeDocument(new TypePrompt05.Schema.SummarizeDocument.Input
        {
            Title = "T",
            Content = "C",
            Audience = TypePrompt05.Schema.SummarizeDocument.Input_Audience.Technical
        });
        Assert.DoesNotContain("business impact", p.SystemMessage);
    }

    [Fact]
    public void TestConditionalSnippetFocusInstructionWhenFocusTopicSet()
    {
        var p = TypePrompt05.Prompts.Default.RenderSummarizeDocument(new TypePrompt05.Schema.SummarizeDocument.Input
        {
            Title = "T",
            Content = "C",
            FocusTopic = "climate change",
            Audience = TypePrompt05.Schema.SummarizeDocument.Input_Audience.General
        });
        Assert.Contains("climate change", p.SystemMessage);
    }

    [Fact]
    public void TestConditionalSnippetNoFocusInstructionWhenAbsent()
    {
        var p = TypePrompt05.Prompts.Default.RenderSummarizeDocument(new TypePrompt05.Schema.SummarizeDocument.Input
        {
            Title = "T",
            Content = "C",
            Audience = TypePrompt05.Schema.SummarizeDocument.Input_Audience.Executive
        });
        Assert.DoesNotContain("Focus the summary", p.SystemMessage);
    }

    [Fact]
    public void TestUserMessageWrapsTitleInEnclosedTag()
    {
        var p = TypePrompt05.Prompts.Default.RenderSummarizeDocument(new TypePrompt05.Schema.SummarizeDocument.Input
        {
            Title = "AI Report",
            Content = "...",
            Audience = TypePrompt05.Schema.SummarizeDocument.Input_Audience.Technical
        });
        Assert.Contains("<Title>", p.UserMessage);
    }
}

public class Test05Variants_WriteProductDescription
{
    private readonly TypePrompt04.Prompt<TypePrompt04.Schema.WriteProductDescription.Output, TypePrompt04.NoTools> _marketing;
    private readonly TypePrompt04.Prompt<TypePrompt04.Schema.WriteProductDescription.Output, TypePrompt04.NoTools> _technical;
    private readonly TypePrompt04.Prompt<TypePrompt04.Schema.WriteProductDescription.Output, TypePrompt04.NoTools> _brief;

    public Test05Variants_WriteProductDescription()
    {
        var features = new[] { "removes 99.9% of contaminants", "lasts 6 months" };
        _marketing = TypePrompt04.Prompts.Default.RenderWriteProductDescription(new TypePrompt04.Schema.WriteProductDescription.Input
        {
            ProductName = "AquaFilter Pro",
            Features = features,
            Variant = TypePrompt04.Schema.WriteProductDescription.Input_Variant.Marketing
        });
        _technical = TypePrompt04.Prompts.Default.RenderWriteProductDescription(new TypePrompt04.Schema.WriteProductDescription.Input
        {
            ProductName = "AquaFilter Pro",
            Features = features,
            Variant = TypePrompt04.Schema.WriteProductDescription.Input_Variant.Technical
        });
        _brief = TypePrompt04.Prompts.Default.RenderWriteProductDescription(new TypePrompt04.Schema.WriteProductDescription.Input
        {
            ProductName = "AquaFilter Pro",
            Features = features,
            Variant = TypePrompt04.Schema.WriteProductDescription.Input_Variant.Brief
        });
    }

    [Fact]
    public void TestMarketingSystemPrompt()
    {
        Assert.Contains("benefit-focused", _marketing.SystemMessage);
    }

    [Fact]
    public void TestTechnicalSystemPrompt()
    {
        Assert.Contains("specification-driven", _technical.SystemMessage);
    }

    [Fact]
    public void TestBriefSystemPrompt()
    {
        Assert.Contains("single punchy sentence", _brief.SystemMessage);
    }

    [Fact]
    public void TestAllVariantsShareSameUserMessage()
    {
        Assert.Equal(_marketing.UserMessage, _technical.UserMessage);
        Assert.Equal(_technical.UserMessage, _brief.UserMessage);
    }

    [Fact]
    public void TestUserMessageContainsProductName()
    {
        Assert.Contains("AquaFilter Pro", _marketing.UserMessage);
    }

    [Fact]
    public void TestUserMessageContainsFeaturesAsJson()
    {
        Assert.Contains("removes 99.9% of contaminants", _marketing.UserMessage);
    }

    [Fact]
    public void TestMarketingHasOneExample()
    {
        Assert.Single(_marketing.Examples);
    }

    [Fact]
    public void TestMarketingExampleResponseContainsDescriptionKey()
    {
        Assert.Contains("\"description\"", _marketing.Examples[0].Response);
        Assert.Contains("Tired of worrying", _marketing.Examples[0].Response);
    }

    [Fact]
    public void TestBriefHasOneExample()
    {
        Assert.Single(_brief.Examples);
    }

    [Fact]
    public void TestTemplateIdSameAcrossVariants()
    {
        Assert.Equal("Main:WriteProductDescription", TypePrompt04.TemplateIdExtensions.GetId(_marketing.TemplateId));
        Assert.Equal("Main:WriteProductDescription", TypePrompt04.TemplateIdExtensions.GetId(_technical.TemplateId));
        Assert.Equal("Main:WriteProductDescription", TypePrompt04.TemplateIdExtensions.GetId(_brief.TemplateId));
    }

    [Fact]
    public void TestVariantsHaveDifferentSystemMessages()
    {
        Assert.NotEqual(_marketing.SystemMessage, _technical.SystemMessage);
        Assert.NotEqual(_technical.SystemMessage, _brief.SystemMessage);
    }
}

public class Test06ToonFormat_WriteComparisonArticle
{
    private readonly TypePrompt06.Prompt<TypePrompt06.Schema.WriteComparisonArticle.Output, TypePrompt06.NoTools> _prompt;

    public Test06ToonFormat_WriteComparisonArticle()
    {
        var provider = new TypePrompt06.Schema.WriteComparisonArticle.Provider
        {
            Name = "CloudX",
            Region = "us-east",
            Category = TypePrompt06.Schema.WriteComparisonArticle.ProductCategory.Compute,
            Pricing = new TypePrompt06.Schema.WriteComparisonArticle.Pricing
            {
                Model = TypePrompt06.Schema.WriteComparisonArticle.Pricing_Model.PerHour,
                BasePrice = 0.1
            },
            Benchmarks = new[]
            {
                new TypePrompt06.Schema.WriteComparisonArticle.Benchmark
                {
                    Name = "throughput",
                    Score = 1000,
                    Unit = "rps"
                }
            },
            Pros = new[] { "fast", "reliable" },
            Cons = new[] { "pricey" }
        };

        _prompt = TypePrompt06.Prompts.Default.RenderWriteComparisonArticle(new TypePrompt06.Schema.WriteComparisonArticle.Input
        {
            Providers = new[] { provider },
            UseCase = "serving ML inference workloads",
            Audience = TypePrompt06.Schema.WriteComparisonArticle.Input_Audience.Architect
        });
    }

    [Fact]
    public void TestJsonOutputFormat()
    {
        Assert.IsType<TypePrompt06.JsonOutputFormat>(_prompt.OutputFormat);
    }

    [Fact]
    public void TestTemplateId()
    {
        Assert.Equal("Main:WriteComparisonArticle", TypePrompt06.TemplateIdExtensions.GetId(_prompt.TemplateId));
    }

    [Fact]
    public void TestUserMessageContainsUseCase()
    {
        Assert.Contains("serving ML inference workloads", _prompt.UserMessage);
    }

    [Fact]
    public void TestUserMessageContainsProviderNameFromToonData()
    {
        Assert.Contains("CloudX", _prompt.UserMessage);
    }

    [Fact]
    public void TestUserMessageMentionsAudience()
    {
        Assert.Contains("architect", _prompt.UserMessage);
    }

    [Fact]
    public void TestHasNoTools()
    {
        Assert.Empty(_prompt.Tools);
    }

    [Fact]
    public void TestToonExactUserMessage()
    {
        Assert.Equal(
            "Write a comparison article framed around this use case: serving ML inference workloads\n\nHere is the data for each provider:\n\n[1]:\n  - name: CloudX\n    region: us-east\n    category: compute\n    pricing:\n      model: perHour\n      basePrice: 0.10000000000000001\n      overage: null\n    benchmarks[1]{name,score,unit}:\n      throughput,1000,rps\n    pros[2]: fast,reliable\n    cons[1]: pricey\n\nTarget audience: architect",
            _prompt.UserMessage
        );
    }
}

public class Test07SharedTypes
{
    private static readonly TypePrompt07.Schema.Shared.Address Address = new()
    {
        Street = "1 Main St",
        City = "Paris",
        Country = "France"
    };

    private static readonly TypePrompt07.Schema.Shared.ContactInfo Contact = new()
    {
        Name = "Alice Dupont",
        Email = "alice@example.com",
        Address = Address
    };

    [Fact]
    public void TestShippingConfirmation()
    {
        var prompt = TypePrompt07.Prompts.Default.RenderShippingConfirmation(new TypePrompt07.Schema.ShippingConfirmation.Input
        {
            Recipient = Contact,
            OrderNumber = "ORD-1234",
            EstimatedDelivery = "2026-08-20",
            Items = new[]
            {
                new TypePrompt07.Schema.ShippingConfirmation.Input_Items { Name = "Laptop", Quantity = 1 }
            }
        });

        Assert.IsType<TypePrompt07.TextOutputFormat>(prompt.OutputFormat);
        Assert.Equal("Main:ShippingConfirmation", TypePrompt07.TemplateIdExtensions.GetId(prompt.TemplateId));
        Assert.Contains("Alice Dupont", prompt.UserMessage);
        Assert.Contains("ORD-1234", prompt.UserMessage);
        Assert.Contains("confirmation email", prompt.SystemMessage);
    }

    [Fact]
    public void TestReturnSlip()
    {
        var prompt = TypePrompt07.Prompts.Default.RenderReturnSlip(new TypePrompt07.Schema.ReturnSlip.Input
        {
            Customer = Contact,
            ReturnReason = TypePrompt07.Schema.ReturnSlip.Input_ReturnReason.Defective,
            OrderNumber = "ORD-1234"
        });

        Assert.IsType<TypePrompt07.TextOutputFormat>(prompt.OutputFormat);
        Assert.Equal("Main:ReturnSlip", TypePrompt07.TemplateIdExtensions.GetId(prompt.TemplateId));
        Assert.Contains("Alice Dupont", prompt.UserMessage);
        Assert.Contains("defective", prompt.UserMessage);
    }
}

public class Test08Namespaces
{
    [Fact]
    public void TestFinanceSummarizeTransaction()
    {
        var prompt = TypePrompt08.Prompts.Default.Finance.RenderSummarizeTransaction(new TypePrompt08.Schema.Finance.SummarizeTransaction.Input
        {
            Description = "AWS monthly bill",
            Amount = new TypePrompt08.Schema.Finance.Shared.MoneyAmount
            {
                Value = 450,
                Currency = TypePrompt08.Schema.Finance.Shared.Currency.Usd
            },
            Category = TypePrompt08.Schema.Finance.SummarizeTransaction.Input_Category.Expense,
            Date = "2026-08-01"
        });

        Assert.Equal("Finance:SummarizeTransaction", TypePrompt08.TemplateIdExtensions.GetId(prompt.TemplateId));
        Assert.NotNull(TypePrompt08.Prompts.Default.Finance);
        Assert.IsType<TypePrompt08.JsonOutputFormat>(prompt.OutputFormat);
        Assert.Contains("AWS monthly bill", prompt.UserMessage);
    }

    [Fact]
    public void TestFinanceDetectAnomaly()
    {
        var prompt = TypePrompt08.Prompts.Default.Finance.RenderDetectAnomaly(new TypePrompt08.Schema.Finance.DetectAnomaly.Input
        {
            RecentTransactions = Array.Empty<TypePrompt08.Schema.Finance.DetectAnomaly.Input_RecentTransactions>(),
            NewTransaction = new TypePrompt08.Schema.Finance.DetectAnomaly.Input_NewTransaction
            {
                Description = "Casino chips",
                Amount = new TypePrompt08.Schema.Finance.Shared.MoneyAmount
                {
                    Value = 5000,
                    Currency = TypePrompt08.Schema.Finance.Shared.Currency.Usd
                },
                Date = "2026-08-17"
            }
        });

        Assert.Equal("Finance:DetectAnomaly", TypePrompt08.TemplateIdExtensions.GetId(prompt.TemplateId));
        Assert.Contains("Casino chips", prompt.UserMessage);
        Assert.Empty(prompt.Tools);
    }

    [Fact]
    public void TestLegalDraftNda()
    {
        var prompt = TypePrompt08.Prompts.Default.Legal.RenderDraftNda(new TypePrompt08.Schema.Legal.DraftNda.Input
        {
            DisclosingParty = new TypePrompt08.Schema.Legal.Shared.Party
            {
                Name = "Acme Corp",
                Role = TypePrompt08.Schema.Legal.Shared.Party_Role.Client,
                Jurisdiction = "California"
            },
            ReceivingParty = new TypePrompt08.Schema.Legal.Shared.Party
            {
                Name = "Beta LLC",
                Role = TypePrompt08.Schema.Legal.Shared.Party_Role.Counterparty,
                Jurisdiction = "Delaware"
            },
            PurposeOfDisclosure = "Evaluating a potential acquisition",
            DurationYears = 3
        });

        Assert.Equal("Legal:DraftNda", TypePrompt08.TemplateIdExtensions.GetId(prompt.TemplateId));
        Assert.IsType<TypePrompt08.TextOutputFormat>(prompt.OutputFormat);
        Assert.NotNull(TypePrompt08.Prompts.Default.Legal);
        Assert.Contains("Acme Corp", prompt.UserMessage);
        Assert.Contains("Beta LLC", prompt.UserMessage);
        Assert.Contains("non-disclosure agreement", prompt.SystemMessage);
    }

    [Fact]
    public void TestLegalSummarizeClause()
    {
        var prompt = TypePrompt08.Prompts.Default.Legal.RenderSummarizeClause(new TypePrompt08.Schema.Legal.SummarizeClause.Input
        {
            ClauseText = "The party shall indemnify and hold harmless...",
            ReviewingParty = new TypePrompt08.Schema.Legal.Shared.Party
            {
                Name = "Alice",
                Role = TypePrompt08.Schema.Legal.Shared.Party_Role.Client,
                Jurisdiction = "NY"
            }
        });

        Assert.Equal("Legal:SummarizeClause", TypePrompt08.TemplateIdExtensions.GetId(prompt.TemplateId));
        Assert.IsType<TypePrompt08.JsonOutputFormat>(prompt.OutputFormat);
        Assert.Contains("Alice", prompt.UserMessage);
        Assert.Contains("indemnify", prompt.UserMessage);
        Assert.Contains("<Clause>", prompt.UserMessage);
    }
}

public class TestE01_AnalyzeSalesData
{
    private static readonly List<TypePrompt.Schema.AnalyzeSalesData.SalesRow> Rows = new()
    {
        new() { Product = "Widget A", Units = 120, RevenueCents = 240000, Region = "north" },
        new() { Product = "Widget B", Units = 85, RevenueCents = 340000, Region = "south" }
    };

    private readonly TypePrompt.Prompt<TypePrompt.Schema.AnalyzeSalesData.Output, TypePrompt.NoTools> _csv =
        TypePrompt.Prompts.Default.RenderAnalyzeSalesData(new TypePrompt.Schema.AnalyzeSalesData.Input
        {
            Rows = Rows,
            Question = "Top product?",
            Variant = TypePrompt.Schema.AnalyzeSalesData.Input_Variant.Csv
        });

    private readonly TypePrompt.Prompt<TypePrompt.Schema.AnalyzeSalesData.Output, TypePrompt.NoTools> _tsv =
        TypePrompt.Prompts.Default.RenderAnalyzeSalesData(new TypePrompt.Schema.AnalyzeSalesData.Input
        {
            Rows = Rows,
            Question = "Top product?",
            Variant = TypePrompt.Schema.AnalyzeSalesData.Input_Variant.Tsv
        });

    [Fact]
    public void TestCsvUserMessageHasCommaSeparatedHeader()
    {
        Assert.Contains("product,units,revenueCents,region", _csv.UserMessage);
    }

    [Fact]
    public void TestCsvUserMessageHasCommaSeparatedRows()
    {
        Assert.Contains("Widget A,120,240000,north", _csv.UserMessage);
        Assert.Contains("Widget B,85,340000,south", _csv.UserMessage);
    }

    [Fact]
    public void TestTsvUserMessageHasTabSeparatedHeader()
    {
        Assert.Contains("product\tunits\trevenueCents\tregion", _tsv.UserMessage);
    }

    [Fact]
    public void TestTsvUserMessageHasTabSeparatedRows()
    {
        Assert.Contains("Widget A\t120\t240000\tnorth", _tsv.UserMessage);
        Assert.Contains("Widget B\t85\t340000\tsouth", _tsv.UserMessage);
    }

    [Fact]
    public void TestCsvAndTsvProduceDifferentUserMessages()
    {
        Assert.NotEqual(_csv.UserMessage, _tsv.UserMessage);
    }

    [Fact]
    public void TestEmptyRowsRendersNoTableContent()
    {
        var empty = TypePrompt.Prompts.Default.RenderAnalyzeSalesData(new TypePrompt.Schema.AnalyzeSalesData.Input
        {
            Rows = Array.Empty<TypePrompt.Schema.AnalyzeSalesData.SalesRow>(),
            Question = "Any data?",
            Variant = TypePrompt.Schema.AnalyzeSalesData.Input_Variant.Csv
        });
        Assert.DoesNotContain("product,units", empty.UserMessage);
    }

    [Fact]
    public void TestCsvVariantHasOneExampleWithCsvData()
    {
        Assert.Single(_csv.Examples);
        Assert.Contains("product,units,revenueCents,region", _csv.Examples[0].UserMessage);
    }

    [Fact]
    public void TestTsvVariantHasOneExampleWithTsvData()
    {
        Assert.Single(_tsv.Examples);
        Assert.Contains("product\tunits\trevenueCents\tregion", _tsv.Examples[0].UserMessage);
    }

    [Fact]
    public void TestCsvSystemMessageMentionsCsv()
    {
        Assert.Contains("comma-separated", _csv.SystemMessage);
    }

    [Fact]
    public void TestTsvSystemMessageMentionsTsv()
    {
        Assert.Contains("tab-separated", _tsv.SystemMessage);
    }

    [Fact]
    public void TestCsvExactSystemMessage()
    {
        Assert.Equal(
            "You are a sales analyst. The data below is comma-separated (CSV).\nAnalyze it and answer the question concisely.",
            _csv.SystemMessage
        );
    }

    [Fact]
    public void TestCsvExactUserMessage()
    {
        Assert.Equal(
            "Top product?\n\nData:\nproduct,units,revenueCents,region\nWidget A,120,240000,north\nWidget B,85,340000,south",
            _csv.UserMessage
        );
    }

    [Fact]
    public void TestCsvExactExample0UserMessage()
    {
        Assert.Equal(
            "Which product generated the most revenue?\n\nData:\nproduct,units,revenueCents,region\nWidget A,120,240000,north\nWidget B,85,340000,south\nWidget C,200,180000,east",
            _csv.Examples[0].UserMessage
        );
    }

    [Fact]
    public void TestTsvExactSystemMessage()
    {
        Assert.Equal(
            "You are a sales analyst. The data below is tab-separated (TSV).\nAnalyze it and answer the question concisely.",
            _tsv.SystemMessage
        );
    }

    [Fact]
    public void TestTsvExactUserMessage()
    {
        Assert.Equal(
            "Top product?\n\nData:\nproduct\tunits\trevenueCents\tregion\nWidget A\t120\t240000\tnorth\nWidget B\t85\t340000\tsouth",
            _tsv.UserMessage
        );
    }

    [Fact]
    public void TestTsvExactExample0UserMessage()
    {
        Assert.Equal(
            "Which product generated the most revenue?\n\nData:\nproduct\tunits\trevenueCents\tregion\nWidget A\t120\t240000\tnorth\nWidget B\t85\t340000\tsouth\nWidget C\t200\t180000\teast",
            _tsv.Examples[0].UserMessage
        );
    }
}

public class TestCrossCutting_ParseResponse
{
    private static TypePrompt02.Prompt<TypePrompt02.Schema.TriageTicket.Output, TypePrompt02.NoTools> P02Render() =>
        TypePrompt02.Prompts.Default.RenderTriageTicket(new TypePrompt02.Schema.TriageTicket.Input
        {
            Subject = "X",
            Body = "Y",
            CustomerTier = TypePrompt02.Schema.TriageTicket.Input_CustomerTier.Pro,
            RecentTickets = Array.Empty<TypePrompt02.Schema.TriageTicket.Input_RecentTickets>()
        });

    [Fact]
    public void TestParsesPlainJsonWithoutFences()
    {
        var res = P02Render().ParseResponse(
            "{\"category\":\"other\",\"urgency\":\"low\",\"summary\":\"x\",\"suggestedActions\":[]}"
        );
        Assert.Equal(TypePrompt02.Schema.TriageTicket.TicketCategory.Other, res.Category);
    }

    [Fact]
    public void TestStripsPlainCodeFences()
    {
        var res = P02Render().ParseResponse(
            "```\n{\"category\":\"other\",\"urgency\":\"low\",\"summary\":\"x\",\"suggestedActions\":[]}\n```"
        );
        Assert.Equal(TypePrompt02.Schema.TriageTicket.TicketCategory.Other, res.Category);
    }

    [Fact]
    public void TestStripsJsonCodeFences()
    {
        var res = P02Render().ParseResponse(
            "```json\n{\"category\":\"other\",\"urgency\":\"low\",\"summary\":\"x\",\"suggestedActions\":[]}\n```"
        );
        Assert.Equal(TypePrompt02.Schema.TriageTicket.TicketCategory.Other, res.Category);
    }

    [Fact]
    public void TestReturnsRawStringForTextOutputFormat()
    {
        var prompt = TypePrompt01.Prompts.Default.RenderTranslate(new TypePrompt01.Schema.Translate.Input
        {
            Text = "hi",
            TargetLanguage = "Spanish"
        });
        Assert.Equal("Hola", prompt.ParseResponse("Hola"));
    }
}

public class TestE01_JsonSerialization
{
    [Fact]
    public void TestExprSerializationAndDeserialization()
    {
        TypePrompt.Schema.Shared.Expr num = new TypePrompt.Schema.Shared.Expr_KindNumber { Value = 42.0 };
        var jsonNum = JsonSerializer.Serialize<TypePrompt.Schema.Shared.Expr>(num);
        var parsedNum = JsonSerializer.Deserialize<TypePrompt.Schema.Shared.Expr>(jsonNum);
        var numTyped = Assert.IsType<TypePrompt.Schema.Shared.Expr_KindNumber>(parsedNum);
        Assert.Equal(42.0, numTyped.Value);

        TypePrompt.Schema.Shared.Expr add = new TypePrompt.Schema.Shared.Expr_KindAdd
        {
            Left = new TypePrompt.Schema.Shared.Expr_KindNumber { Value = 1.0 },
            Right = new TypePrompt.Schema.Shared.Expr_KindNumber { Value = 2.0 }
        };
        var jsonAdd = JsonSerializer.Serialize<TypePrompt.Schema.Shared.Expr>(add);
        var parsedAdd = JsonSerializer.Deserialize<TypePrompt.Schema.Shared.Expr>(jsonAdd);
        var addTyped = Assert.IsType<TypePrompt.Schema.Shared.Expr_KindAdd>(parsedAdd);
        var leftTyped = Assert.IsType<TypePrompt.Schema.Shared.Expr_KindNumber>(addTyped.Left);
        var rightTyped = Assert.IsType<TypePrompt.Schema.Shared.Expr_KindNumber>(addTyped.Right);
        Assert.Equal(1.0, leftTyped.Value);
        Assert.Equal(2.0, rightTyped.Value);
    }

    [Fact]
    public void TestEnumWithCommonFieldsSerialization()
    {
        TypePrompt.Schema.Shared.EnumWithCommonFields notSuccess = new TypePrompt.Schema.Shared.EnumWithCommonFields_NotSuccess
        {
            X = 10,
            Y = 20.5,
            Z = "error"
        };
        var jsonNotSuccess = JsonSerializer.Serialize<TypePrompt.Schema.Shared.EnumWithCommonFields>(notSuccess);
        var parsedNotSuccess = JsonSerializer.Deserialize<TypePrompt.Schema.Shared.EnumWithCommonFields>(jsonNotSuccess);
        var notSuccessTyped = Assert.IsType<TypePrompt.Schema.Shared.EnumWithCommonFields_NotSuccess>(parsedNotSuccess);
        Assert.Equal(10, notSuccessTyped.X);
        Assert.Equal(20.5, notSuccessTyped.Y);
        Assert.Equal("error", notSuccessTyped.Z);

        TypePrompt.Schema.Shared.EnumWithCommonFields success = new TypePrompt.Schema.Shared.EnumWithCommonFields_Success
        {
            X = 42,
            Y = 84.0,
            Z = 99
        };
        var jsonSuccess = JsonSerializer.Serialize<TypePrompt.Schema.Shared.EnumWithCommonFields>(success);
        var parsedSuccess = JsonSerializer.Deserialize<TypePrompt.Schema.Shared.EnumWithCommonFields>(jsonSuccess);
        var successTyped = Assert.IsType<TypePrompt.Schema.Shared.EnumWithCommonFields_Success>(parsedSuccess);
        Assert.Equal(42, successTyped.X);
        Assert.Equal(84.0, successTyped.Y);
        Assert.Equal(99, successTyped.Z);
    }

    [Fact]
    public void TestStringEnumVariantSerialization()
    {
        var variant = TypePrompt.Schema.AnalyzeSalesData.Input_Variant.Csv;
        var jsonVariant = JsonSerializer.Serialize(variant);
        Assert.Equal("\"csv\"", jsonVariant);
        var parsedVariant = JsonSerializer.Deserialize<TypePrompt.Schema.AnalyzeSalesData.Input_Variant>(jsonVariant);
        Assert.Equal(TypePrompt.Schema.AnalyzeSalesData.Input_Variant.Csv, parsedVariant);
    }

    [Fact]
    public void TestMatrixWithOmittedOptionalFields()
    {
        var matrix = new TypePrompt.Schema.Shared.Matrix
        {
            matrix = Array.Empty<IReadOnlyList<TypePrompt.Schema.Shared.Square>>(),
            Ints = new[] { 1, 2, 3 },
            Init = true,
            Encode = false
        };
        Assert.Null(matrix.OtherMatrix);
        Assert.Null(matrix.Foo);
    }
}

public class TestTemplateOverrider
{
    [Fact]
    public void TestSignatureCheckAndOverrides()
    {
        var data = TypePrompt01.TemplateOverrider.Instance.TemplatesData();
        Assert.True(data.TryGetProperty("signature", out var sig));
        var signature = sig.GetString();
        Assert.False(string.IsNullOrEmpty(signature));

        // Test signature mismatch throws ArgumentException
        using var wrongDoc = JsonDocument.Parse("{\"signature\":\"wrong_sig\",\"edition\":0,\"templates\":{},\"tools\":{}}");
        Assert.Throws<ArgumentException>(() =>
        {
            TypePrompt01.TemplateOverrider.Instance.ApplyOverrides(wrongDoc.RootElement);
        });

        // Test valid overrides
        var prompts = TypePrompt01.TemplateOverrider.Instance.ApplyOverrides(data);
        Assert.NotNull(prompts);
        var prompt = prompts.RenderTranslate(new TypePrompt01.Schema.Translate.Input
        {
            Text = "Hello",
            TargetLanguage = "French"
        });
        Assert.Contains("French", prompt.UserMessage);
    }
}
