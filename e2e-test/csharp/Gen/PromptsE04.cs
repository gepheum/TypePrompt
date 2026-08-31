using System.Text.Json;
using System.Text.Json.Serialization;

namespace TypePromptE04.Schema.Meta
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
}  // namespace TypePromptE04.Schema.Meta

namespace TypePromptE04.Schema.WriteProductDescription
{
    public record Input
    {
        [JsonPropertyName("productName")]
        public required string ProductName { get; init; }
        [JsonPropertyName("features")]
        public required List<string> Features { get; init; }
        [JsonPropertyName("variant")]
        public required Input_Variant Variant { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Input_Variant
    {
        [JsonStringEnumMemberName("marketing")]
        Marketing,
        [JsonStringEnumMemberName("technical")]
        Technical,
        [JsonStringEnumMemberName("brief")]
        Brief,
    }

    public record Output
    {
        [JsonPropertyName("description")]
        public required string Description { get; init; }
    }
}  // namespace TypePromptE04.Schema.WriteProductDescription
