using System.Text.Json;
using System.Text.Json.Serialization;

namespace TypePromptE02.Schema.Meta
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
}  // namespace TypePromptE02.Schema.Meta

namespace TypePromptE02.Schema.TriageTicket
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum TicketCategory
    {
        [JsonStringEnumMemberName("billing")]
        Billing,
        [JsonStringEnumMemberName("technical-issue")]
        TechnicalIssue,
        [JsonStringEnumMemberName("feature-request")]
        FeatureRequest,
        [JsonStringEnumMemberName("other")]
        Other,
    }

    /// <summary>A support ticket to be triaged.</summary>
    public record Input
    {
        [JsonPropertyName("subject")]
        public required string Subject { get; init; }
        [JsonPropertyName("body")]
        public required string Body { get; init; }
        [JsonPropertyName("customerTier")]
        public required Input_CustomerTier CustomerTier { get; init; }
        /// <summary>Previous tickets from this customer, for context.</summary>
        [JsonPropertyName("recentTickets")]
        public required List<Input_RecentTickets> RecentTickets { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Input_CustomerTier
    {
        [JsonStringEnumMemberName("free")]
        Free,
        [JsonStringEnumMemberName("pro")]
        Pro,
        [JsonStringEnumMemberName("enterprise")]
        Enterprise,
    }

    public record Input_RecentTickets
    {
        [JsonPropertyName("id")]
        public required string Id { get; init; }
        [JsonPropertyName("summary")]
        public required string Summary { get; init; }
        [JsonPropertyName("category")]
        public required TicketCategory Category { get; init; }
    }

    public record Output
    {
        [JsonPropertyName("category")]
        public required TicketCategory Category { get; init; }
        /// <summary>How quickly this ticket needs attention.</summary>
        [JsonPropertyName("urgency")]
        public required Output_Urgency Urgency { get; init; }
        /// <summary>One-sentence summary of the issue.</summary>
        [JsonPropertyName("summary")]
        public required string Summary { get; init; }
        /// <summary>Concrete next steps to resolve the ticket.</summary>
        [JsonPropertyName("suggestedActions")]
        public required List<string> SuggestedActions { get; init; }
        /// <summary>Suggested first reply to the customer, if the issue is straightforward.</summary>
        [JsonPropertyName("suggestedReply")]
        public required string? SuggestedReply { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Output_Urgency
    {
        [JsonStringEnumMemberName("low")]
        Low,
        [JsonStringEnumMemberName("medium")]
        Medium,
        [JsonStringEnumMemberName("high")]
        High,
        [JsonStringEnumMemberName("critical")]
        Critical,
    }
}  // namespace TypePromptE02.Schema.TriageTicket
