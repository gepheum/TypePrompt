using System.Text.Json;
using System.Text.Json.Serialization;

namespace TypePromptE05.Schema.Meta
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
}  // namespace TypePromptE05.Schema.Meta

namespace TypePromptE05.Schema.SummarizeDocument
{
    public record Input
    {
        [JsonPropertyName("title")]
        public required string Title { get; init; }
        [JsonPropertyName("content")]
        public required string Content { get; init; }
        /// <summary>If provided, the summary should focus on this topic.</summary>
        [JsonPropertyName("focusTopic")]
        public required string? FocusTopic { get; init; }
        [JsonPropertyName("audience")]
        public required Input_Audience Audience { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Input_Audience
    {
        [JsonStringEnumMemberName("executive")]
        Executive,
        [JsonStringEnumMemberName("technical")]
        Technical,
        [JsonStringEnumMemberName("general")]
        General,
    }

    public record Output
    {
        [JsonPropertyName("summary")]
        public required string Summary { get; init; }
        [JsonPropertyName("keyPoints")]
        public required List<string> KeyPoints { get; init; }
    }
}  // namespace TypePromptE05.Schema.SummarizeDocument
