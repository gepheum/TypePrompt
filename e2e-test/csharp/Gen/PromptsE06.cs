using System.Text.Json;
using System.Text.Json.Serialization;

namespace TypePromptE06.Schema.Meta
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
}  // namespace TypePromptE06.Schema.Meta

namespace TypePromptE06.Schema.WriteComparisonArticle
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum ProductCategory
    {
        [JsonStringEnumMemberName("storage")]
        Storage,
        [JsonStringEnumMemberName("compute")]
        Compute,
        [JsonStringEnumMemberName("database")]
        Database,
        [JsonStringEnumMemberName("networking")]
        Networking,
    }

    public record Pricing
    {
        [JsonPropertyName("model")]
        public required Pricing_Model Model { get; init; }
        [JsonPropertyName("basePrice")]
        public required double BasePrice { get; init; }
        /// <summary>Price per additional unit beyond the base tier, if applicable.</summary>
        [JsonPropertyName("overage")]
        public required double? Overage { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Pricing_Model
    {
        [JsonStringEnumMemberName("perHour")]
        PerHour,
        [JsonStringEnumMemberName("perMonth")]
        PerMonth,
        [JsonStringEnumMemberName("perRequest")]
        PerRequest,
    }

    public record Benchmark
    {
        [JsonPropertyName("name")]
        public required string Name { get; init; }
        [JsonPropertyName("score")]
        public required double Score { get; init; }
        [JsonPropertyName("unit")]
        public required string Unit { get; init; }
    }

    public record Provider
    {
        [JsonPropertyName("name")]
        public required string Name { get; init; }
        [JsonPropertyName("region")]
        public required string Region { get; init; }
        [JsonPropertyName("category")]
        public required ProductCategory Category { get; init; }
        [JsonPropertyName("pricing")]
        public required Pricing Pricing { get; init; }
        [JsonPropertyName("benchmarks")]
        public required List<Benchmark> Benchmarks { get; init; }
        [JsonPropertyName("pros")]
        public required List<string> Pros { get; init; }
        [JsonPropertyName("cons")]
        public required List<string> Cons { get; init; }
    }

    public record Input
    {
        [JsonPropertyName("providers")]
        public required List<Provider> Providers { get; init; }
        /// <summary>The use case this comparison should be framed around.</summary>
        [JsonPropertyName("useCase")]
        public required string UseCase { get; init; }
        /// <summary>Target audience for the article.</summary>
        [JsonPropertyName("audience")]
        public required Input_Audience Audience { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Input_Audience
    {
        [JsonStringEnumMemberName("developer")]
        Developer,
        [JsonStringEnumMemberName("architect")]
        Architect,
        [JsonStringEnumMemberName("businessDecisionMaker")]
        BusinessDecisionMaker,
    }

    public record Output
    {
        [JsonPropertyName("title")]
        public required string Title { get; init; }
        [JsonPropertyName("introduction")]
        public required string Introduction { get; init; }
        /// <summary>One section per provider.</summary>
        [JsonPropertyName("sections")]
        public required List<Output_Sections> Sections { get; init; }
        [JsonPropertyName("conclusion")]
        public required string Conclusion { get; init; }
        [JsonPropertyName("recommendation")]
        public required string Recommendation { get; init; }
    }

    public record Output_Sections
    {
        [JsonPropertyName("providerName")]
        public required string ProviderName { get; init; }
        [JsonPropertyName("body")]
        public required string Body { get; init; }
    }
}  // namespace TypePromptE06.Schema.WriteComparisonArticle
