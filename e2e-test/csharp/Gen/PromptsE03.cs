using System.Text.Json;
using System.Text.Json.Serialization;

namespace TypePromptE03.Schema.Meta
{
    public record Meta
    {
        [JsonPropertyName("model")]
        public required Meta_Model Model { get; init; }
        /// <summary>Sampling temperature (0-2).</summary>
        [JsonPropertyName("temperature")]
        public required double? Temperature { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Meta_Model
    {
        [JsonStringEnumMemberName("gpt-4o")]
        Gpt4o,
        [JsonStringEnumMemberName("gpt-4o-mini")]
        Gpt4oMini,
    }
}  // namespace TypePromptE03.Schema.Meta

namespace TypePromptE03.Schema.ResearchQuestion
{
    public record Input
    {
        [JsonPropertyName("question")]
        public required string Question { get; init; }
    }

    public record Output
    {
        [JsonPropertyName("answer")]
        public required string Answer { get; init; }
        /// <summary>URLs of sources used.</summary>
        [JsonPropertyName("sources")]
        public required List<string> Sources { get; init; }
    }
}  // namespace TypePromptE03.Schema.ResearchQuestion

namespace TypePromptE03.Schema.WebSearch
{
    public record Input
    {
        [JsonPropertyName("query")]
        public required string Query { get; init; }
    }

    public record Output
    {
        [JsonPropertyName("results")]
        public required List<Output_Results> Results { get; init; }
    }

    public record Output_Results
    {
        [JsonPropertyName("title")]
        public required string Title { get; init; }
        [JsonPropertyName("url")]
        public required string Url { get; init; }
        [JsonPropertyName("snippet")]
        public required string Snippet { get; init; }
    }
}  // namespace TypePromptE03.Schema.WebSearch
