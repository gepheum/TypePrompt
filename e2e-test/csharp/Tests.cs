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
}
