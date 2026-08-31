using System.Text.Json;
using System.Text.Json.Serialization;

namespace TypePromptE08.Schema.Meta
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
}  // namespace TypePromptE08.Schema.Meta

namespace TypePromptE08.Schema.Legal.Shared
{
    public record Party
    {
        [JsonPropertyName("name")]
        public required string Name { get; init; }
        [JsonPropertyName("role")]
        public required Party_Role Role { get; init; }
        [JsonPropertyName("jurisdiction")]
        public required string Jurisdiction { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Party_Role
    {
        [JsonStringEnumMemberName("client")]
        Client,
        [JsonStringEnumMemberName("counterparty")]
        Counterparty,
        [JsonStringEnumMemberName("witness")]
        Witness,
        [JsonStringEnumMemberName("arbitrator")]
        Arbitrator,
    }
}  // namespace TypePromptE08.Schema.Legal.Shared

namespace TypePromptE08.Schema.Legal.SummarizeClause
{
    public record Input
    {
        [JsonPropertyName("clauseText")]
        public required string ClauseText { get; init; }
        /// <summary>Who is asking — affects what risks to highlight.</summary>
        [JsonPropertyName("reviewingParty")]
        public required global::TypePromptE08.Schema.Legal.Shared.Party ReviewingParty { get; init; }
    }

    public record Output
    {
        [JsonPropertyName("plainEnglishSummary")]
        public required string PlainEnglishSummary { get; init; }
        [JsonPropertyName("potentialRisks")]
        public required List<string> PotentialRisks { get; init; }
        /// <summary>Whether the clause is standard or unusual.</summary>
        [JsonPropertyName("assessment")]
        public required Output_Assessment Assessment { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Output_Assessment
    {
        [JsonStringEnumMemberName("standard")]
        Standard,
        [JsonStringEnumMemberName("unusual")]
        Unusual,
        [JsonStringEnumMemberName("redFlag")]
        RedFlag,
    }
}  // namespace TypePromptE08.Schema.Legal.SummarizeClause

namespace TypePromptE08.Schema.Legal.DraftNda
{
    public record Input
    {
        [JsonPropertyName("disclosingParty")]
        public required global::TypePromptE08.Schema.Legal.Shared.Party DisclosingParty { get; init; }
        [JsonPropertyName("receivingParty")]
        public required global::TypePromptE08.Schema.Legal.Shared.Party ReceivingParty { get; init; }
        [JsonPropertyName("purposeOfDisclosure")]
        public required string PurposeOfDisclosure { get; init; }
        [JsonPropertyName("durationYears")]
        public required int DurationYears { get; init; }
    }
}  // namespace TypePromptE08.Schema.Legal.DraftNda

namespace TypePromptE08.Schema.Finance.Shared
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Currency
    {
        [JsonStringEnumMemberName("USD")]
        Usd,
        [JsonStringEnumMemberName("EUR")]
        Eur,
        [JsonStringEnumMemberName("GBP")]
        Gbp,
        [JsonStringEnumMemberName("JPY")]
        Jpy,
    }

    public record MoneyAmount
    {
        [JsonPropertyName("value")]
        public required double Value { get; init; }
        [JsonPropertyName("currency")]
        public required Currency Currency { get; init; }
    }
}  // namespace TypePromptE08.Schema.Finance.Shared

namespace TypePromptE08.Schema.Finance.SummarizeTransaction
{
    public record Input
    {
        [JsonPropertyName("description")]
        public required string Description { get; init; }
        [JsonPropertyName("amount")]
        public required global::TypePromptE08.Schema.Finance.Shared.MoneyAmount Amount { get; init; }
        [JsonPropertyName("category")]
        public required Input_Category Category { get; init; }
        [JsonPropertyName("date")]
        public required string Date { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Input_Category
    {
        [JsonStringEnumMemberName("income")]
        Income,
        [JsonStringEnumMemberName("expense")]
        Expense,
        [JsonStringEnumMemberName("transfer")]
        Transfer,
    }

    public record Output
    {
        [JsonPropertyName("summary")]
        public required string Summary { get; init; }
        /// <summary>Suggested label for bookkeeping.</summary>
        [JsonPropertyName("bookkeepingLabel")]
        public required string BookkeepingLabel { get; init; }
    }
}  // namespace TypePromptE08.Schema.Finance.SummarizeTransaction

namespace TypePromptE08.Schema.Finance.DetectAnomaly
{
    public record Input
    {
        [JsonPropertyName("recentTransactions")]
        public required List<Input_RecentTransactions> RecentTransactions { get; init; }
        [JsonPropertyName("newTransaction")]
        public required Input_NewTransaction NewTransaction { get; init; }
    }

    public record Input_RecentTransactions
    {
        [JsonPropertyName("description")]
        public required string Description { get; init; }
        [JsonPropertyName("amount")]
        public required global::TypePromptE08.Schema.Finance.Shared.MoneyAmount Amount { get; init; }
        [JsonPropertyName("date")]
        public required string Date { get; init; }
    }

    public record Input_NewTransaction
    {
        [JsonPropertyName("description")]
        public required string Description { get; init; }
        [JsonPropertyName("amount")]
        public required global::TypePromptE08.Schema.Finance.Shared.MoneyAmount Amount { get; init; }
        [JsonPropertyName("date")]
        public required string Date { get; init; }
    }

    public record Output
    {
        [JsonPropertyName("isAnomaly")]
        public required bool IsAnomaly { get; init; }
        [JsonPropertyName("reason")]
        public required string? Reason { get; init; }
    }
}  // namespace TypePromptE08.Schema.Finance.DetectAnomaly
