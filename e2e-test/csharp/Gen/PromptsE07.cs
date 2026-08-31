using System.Text.Json;
using System.Text.Json.Serialization;

namespace TypePromptE07.Schema.Meta
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
}  // namespace TypePromptE07.Schema.Meta

namespace TypePromptE07.Schema.Shared
{
    public record Address
    {
        [JsonPropertyName("street")]
        public required string Street { get; init; }
        [JsonPropertyName("city")]
        public required string City { get; init; }
        [JsonPropertyName("country")]
        public required string Country { get; init; }
        [JsonPropertyName("postalCode")]
        public required string? PostalCode { get; init; }
    }

    public record ContactInfo
    {
        [JsonPropertyName("name")]
        public required string Name { get; init; }
        [JsonPropertyName("email")]
        public required string Email { get; init; }
        [JsonPropertyName("address")]
        public required Address Address { get; init; }
    }
}  // namespace TypePromptE07.Schema.Shared

namespace TypePromptE07.Schema.ShippingConfirmation
{
    public record Input
    {
        [JsonPropertyName("recipient")]
        public required global::TypePromptE07.Schema.Shared.ContactInfo Recipient { get; init; }
        [JsonPropertyName("orderNumber")]
        public required string OrderNumber { get; init; }
        [JsonPropertyName("estimatedDelivery")]
        public required string EstimatedDelivery { get; init; }
        [JsonPropertyName("items")]
        public required List<Input_Items> Items { get; init; }
    }

    public record Input_Items
    {
        [JsonPropertyName("name")]
        public required string Name { get; init; }
        [JsonPropertyName("quantity")]
        public required int Quantity { get; init; }
    }
}  // namespace TypePromptE07.Schema.ShippingConfirmation

namespace TypePromptE07.Schema.ReturnSlip
{
    public record Input
    {
        [JsonPropertyName("customer")]
        public required global::TypePromptE07.Schema.Shared.ContactInfo Customer { get; init; }
        [JsonPropertyName("returnReason")]
        public required Input_ReturnReason ReturnReason { get; init; }
        [JsonPropertyName("orderNumber")]
        public required string OrderNumber { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Input_ReturnReason
    {
        [JsonStringEnumMemberName("defective")]
        Defective,
        [JsonStringEnumMemberName("wrongItem")]
        WrongItem,
        [JsonStringEnumMemberName("changedMind")]
        ChangedMind,
        [JsonStringEnumMemberName("other")]
        Other,
    }
}  // namespace TypePromptE07.Schema.ReturnSlip
