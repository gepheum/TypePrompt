using Xunit;
using System.Text.Json;
using ToonFormat;
using YamlDotNet.Serialization;
using TypePrompt03;
using TypePrompt03.ToolExecutor;
using WebSearch = TypePrompt03.Schema.WebSearch;

public class PromptTests
{
    [Fact]
    public void TestRender01Basics()
    {
        var prompts = TypePrompt01.Prompts.Default;
        var prompt = prompts.RenderTranslate(new TypePrompt01.Schema.Translate.Input
        {
            Text = "The meeting is scheduled for Monday at 3 PM.",
            TargetLanguage = "French"
        });

        Assert.Equal(TypePrompt01.TemplateId.Translate, prompt.TemplateId);
        Assert.IsType<TypePrompt01.TextOutputFormat>(prompt.OutputFormat);
        Assert.Contains("You are a professional translator", prompt.SystemMessage);
        Assert.Contains("Translate the following text into French", prompt.UserMessage);
        Assert.Contains("<Text>\nThe meeting is scheduled for Monday at 3 PM.\n</Text>", prompt.UserMessage);
        Assert.Equal(2, prompt.Examples.Count);
        Assert.Equal("La réunion est prévue pour lundi à 15h.", prompt.Examples[0].Response);
    }

    [Fact]
    public void TestRender03Tools()
    {
        var prompts = TypePrompt03.Prompts.Default;
        var prompt = prompts.RenderResearchQuestion(new TypePrompt03.Schema.ResearchQuestion.Input
        {
            Question = "What are the latest discoveries in quantum computing?"
        });

        Assert.Equal(TypePrompt03.TemplateId.ResearchQuestion, prompt.TemplateId);
        Assert.IsType<TypePrompt03.JsonOutputFormat>(prompt.OutputFormat);
        Assert.NotNull(prompt.Meta);
        Assert.Equal(0.2, prompt.Meta.Temperature);
        Assert.True(prompt.Tools.ContainsKey("webSearch"));
        Assert.Contains("quantum computing", prompt.UserMessage);
    }

    [Fact]
    public void TestRender06ToonFormat()
    {
        var prompts = TypePrompt06.Prompts.Default;
        var prompt = prompts.RenderWriteComparisonArticle(new TypePrompt06.Schema.WriteComparisonArticle.Input
        {
            Providers = new List<TypePrompt06.Schema.WriteComparisonArticle.Provider>
            {
                new()
                {
                    Name = "CloudX",
                    Region = "us-east",
                    Category = TypePrompt06.Schema.WriteComparisonArticle.ProductCategory.Compute,
                    Pricing = new TypePrompt06.Schema.WriteComparisonArticle.Pricing
                    {
                        Model = TypePrompt06.Schema.WriteComparisonArticle.Pricing_Model.PerHour,
                        BasePrice = 0.1
                    },
                    Benchmarks = new List<TypePrompt06.Schema.WriteComparisonArticle.Benchmark>
                    {
                        new() { Name = "throughput", Score = 1000, Unit = "rps" }
                    },
                    Pros = new List<string> { "fast", "reliable" },
                    Cons = new List<string> { "pricey" }
                }
            },
            UseCase = "serving ML inference workloads",
            Audience = TypePrompt06.Schema.WriteComparisonArticle.Input_Audience.Architect
        });

        Assert.Equal(TypePrompt06.TemplateId.WriteComparisonArticle, prompt.TemplateId);
        Assert.IsType<TypePrompt06.JsonOutputFormat>(prompt.OutputFormat);
        Assert.Contains("serving ML inference workloads", prompt.UserMessage);
        Assert.Contains("CloudX", prompt.UserMessage);
        Assert.Contains("architect", prompt.UserMessage);
    }

    [Fact]
    public void TestRender08MultiNamespace()
    {
        var prompts = TypePrompt08.Prompts.Default;
        var party = new TypePrompt08.Schema.Legal.Shared.Party
        {
            Name = "Acme Corp",
            Role = TypePrompt08.Schema.Legal.Shared.Party_Role.Client,
            Jurisdiction = "Delaware"
        };
        var prompt = prompts.Legal.RenderDraftNda(new TypePrompt08.Schema.Legal.DraftNda.Input
        {
            DisclosingParty = party,
            ReceivingParty = party,
            PurposeOfDisclosure = "Project Phoenix evaluation",
            DurationYears = 3
        });

        Assert.Equal(TypePrompt08.TemplateId.Legal_DraftNda, prompt.TemplateId);
        Assert.Contains("Acme Corp", prompt.UserMessage);
        Assert.Contains("Project Phoenix evaluation", prompt.UserMessage);
    }

    [Fact]
    public void TestRender02TriageTicket()
    {
        var prompts = TypePrompt02.Prompts.Default;
        var prompt = prompts.RenderTriageTicket(new TypePrompt02.Schema.TriageTicket.Input
        {
            Subject = "App crashes",
            Body = "Every time.",
            CustomerTier = TypePrompt02.Schema.TriageTicket.Input_CustomerTier.Pro,
            RecentTickets = Array.Empty<TypePrompt02.Schema.TriageTicket.Input_RecentTickets>()
        });

        Assert.Equal(TypePrompt02.TemplateId.TriageTicket, prompt.TemplateId);
        Assert.IsType<TypePrompt02.JsonOutputFormat>(prompt.OutputFormat);
        Assert.Contains("subject: App crashes", prompt.UserMessage);
        Assert.Contains("body: Every time.", prompt.UserMessage);
        Assert.Contains("customerTier: pro", prompt.UserMessage);
        Assert.Equal(2, prompt.Examples.Count);
    }

    [Fact]
    public void TestRenderE01SalesData()
    {
        var prompts = TypePrompt.Prompts.Default;
        var rows = new List<TypePrompt.Schema.AnalyzeSalesData.SalesRow>
        {
            new() { Product = "Widget A", Units = 120, RevenueCents = 240000, Region = "north" },
            new() { Product = "Widget B", Units = 85, RevenueCents = 340000, Region = "south" }
        };

        var csvPrompt = prompts.RenderAnalyzeSalesData(new TypePrompt.Schema.AnalyzeSalesData.Input
        {
            Rows = rows,
            Question = "Top product?",
            Variant = TypePrompt.Schema.AnalyzeSalesData.Input_Variant.Csv
        });

        Assert.Contains("product,units,revenueCents,region", csvPrompt.UserMessage);
        Assert.Contains("Widget A,120,240000,north", csvPrompt.UserMessage);
        Assert.Contains("Widget B,85,340000,south", csvPrompt.UserMessage);
        Assert.Equal(
            "You are a sales analyst. The data below is comma-separated (CSV).\nAnalyze it and answer the question concisely.",
            csvPrompt.SystemMessage
        );

        var tsvPrompt = prompts.RenderAnalyzeSalesData(new TypePrompt.Schema.AnalyzeSalesData.Input
        {
            Rows = rows,
            Question = "Top product?",
            Variant = TypePrompt.Schema.AnalyzeSalesData.Input_Variant.Tsv
        });

        Assert.Contains("product\tunits\trevenueCents\tregion", tsvPrompt.UserMessage);
        Assert.Contains("Widget A\t120\t240000\tnorth", tsvPrompt.UserMessage);
        Assert.NotEqual(csvPrompt.UserMessage, tsvPrompt.UserMessage);
    }

    [Fact]
    public void TestTemplateOverrider()
    {
        var data = TypePrompt01.TemplateOverrider.Instance.TemplatesData();
        Assert.True(data.TryGetProperty("signature", out var sig));
        var signature = sig.GetString();
        Assert.False(string.IsNullOrEmpty(signature));

        // Test signature mismatch
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
    private class TestWebSearchExecutor : IWebSearch
    {
        public Task<WebSearch.Output> WebSearch(WebSearch.Input input)
        {
            return Task.FromResult(new WebSearch.Output
            {
                Results = new List<WebSearch.Output_Results>
                {
                    new()
                    {
                        Title = "Test Title",
                        Url = "https://example.com",
                        Snippet = $"Result for: {input.Query}"
                    }
                }
            });
        }
    }

    [Fact]
    public async Task TestExecuteToolsCallsExecutorAndReturnsOutput()
    {
        var prompt = new Prompt<string, IWebSearch>(
            Meta: null,
            SystemMessage: "System",
            UserMessage: "User",
            Examples: Array.Empty<FewShotExample>(),
            Tools: new Dictionary<string, Tool>(),
            OutputFormat: new TextOutputFormat(),
            TemplateId: TemplateId.ResearchQuestion
        );

        var toolCalls = new[]
        {
            new ToolCall("call_1", "webSearch", "{\"query\":\"test query\"}")
        };

        var result = await prompt.ExecuteTools(toolCalls, new TestWebSearchExecutor());

        Assert.Single(result);
        Assert.Equal("call_1", result[0].CallId);
        Assert.Contains("Test Title", result[0].StringifiedOutput);
        Assert.Contains("Result for: test query", result[0].StringifiedOutput);
    }

    [Fact]
    public async Task TestExecuteToolsThrowsForUnknownTool()
    {
        var prompt = new Prompt<string, IWebSearch>(
            Meta: null,
            SystemMessage: "System",
            UserMessage: "User",
            Examples: Array.Empty<FewShotExample>(),
            Tools: new Dictionary<string, Tool>(),
            OutputFormat: new TextOutputFormat(),
            TemplateId: TemplateId.ResearchQuestion
        );

        var toolCalls = new[]
        {
            new ToolCall("call_1", "unknownTool", "{}")
        };

        await Assert.ThrowsAsync<ArgumentException>(async () =>
        {
            await prompt.ExecuteTools(toolCalls, new TestWebSearchExecutor());
        });
    }

    private class MockRenderer : IRenderer, TypePrompt08.IRenderer
    {
        public string? LastTemplateId { get; private set; }
        public object? LastInput { get; private set; }

        public Prompt<Output, ToolExecutor> Render<Input, Output, ToolExecutor>(string templateId, Input input)
        {
            LastTemplateId = templateId;
            LastInput = input;
            return new Prompt<Output, ToolExecutor>(
                Meta: null,
                SystemMessage: "MockSystem",
                UserMessage: "MockUser",
                Examples: Array.Empty<FewShotExample>(),
                Tools: new Dictionary<string, Tool>(),
                OutputFormat: new TextOutputFormat(),
                TemplateId: TemplateId.ResearchQuestion
            );
        }

        TypePrompt08.Prompt<Output, ToolExecutor> TypePrompt08.IRenderer.Render<Input, Output, ToolExecutor>(string templateId, Input input)
        {
            LastTemplateId = templateId;
            LastInput = input;
            return new TypePrompt08.Prompt<Output, ToolExecutor>(
                Meta: null!,
                SystemMessage: "MockSystem08",
                UserMessage: "MockUser08",
                Examples: Array.Empty<TypePrompt08.FewShotExample>(),
                Tools: new Dictionary<string, TypePrompt08.Tool>(),
                OutputFormat: new TypePrompt08.TextOutputFormat(),
                TemplateId: TypePrompt08.TemplateId.Legal_DraftNda
            );
        }
    }

    [Fact]
    public void TestSingleNamespacePromptsRendersTemplate()
    {
        var mock = new MockRenderer();
        var prompts = new Prompts(mock);
        var input = new TypePrompt03.Schema.ResearchQuestion.Input { Question = "test query" };
        var prompt = prompts.RenderResearchQuestion(input);

        Assert.Equal("Main:ResearchQuestion", mock.LastTemplateId);
        Assert.Same(input, mock.LastInput);
        Assert.Equal("MockSystem", prompt.SystemMessage);
    }

    [Fact]
    public void TestMultiNamespacePromptsRendersTemplate()
    {
        var mock = new MockRenderer();
        var prompts = new TypePrompt08.Prompts(mock);

        Assert.NotNull(prompts.Legal);
        Assert.NotNull(prompts.Finance);

        var party = new TypePrompt08.Schema.Legal.Shared.Party
        {
            Name = "Acme",
            Role = TypePrompt08.Schema.Legal.Shared.Party_Role.Client,
            Jurisdiction = "CA"
        };
        var input = new TypePrompt08.Schema.Legal.DraftNda.Input
        {
            DisclosingParty = party,
            ReceivingParty = party,
            PurposeOfDisclosure = "Testing",
            DurationYears = 1
        };
        var prompt = prompts.Legal.RenderDraftNda(input);

        Assert.Equal("Legal:DraftNda", mock.LastTemplateId);
        Assert.Same(input, mock.LastInput);
        Assert.Equal("MockSystem08", prompt.SystemMessage);
    }
}

