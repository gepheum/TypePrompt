using Xunit;
using TypePrompt03;
using TypePrompt03.ToolExecutor;
using WebSearch = TypePrompt03.Schema.WebSearch;

public class PromptTests
{
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

