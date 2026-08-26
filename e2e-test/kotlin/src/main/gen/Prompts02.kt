typealias Meta = Schema.Meta.Meta;

/** Namespace containing the user-defined datatypes. */
object Schema {
  object Meta {
    // Exported as 'Schema.Meta.Meta'
    @Serializable
    data class Meta(
      val model:
      /** Sampling temperature (0-2). */
      val temperature: Double?
    ) {}

    // Exported as 'Schema.Meta.Meta_Model'
    @Serializable
    enum class Meta_Model {
      @SerialName("gpt-4o")
      Gpt4o
      @SerialName("gpt-4o-mini")
      Gpt4oMini
    }
  }

  object TriageTicket {
    // Exported as 'Schema.TriageTicket.TicketCategory'
    @Serializable
    enum class TicketCategory {
      @SerialName("billing")
      Billing
      @SerialName("technical-issue")
      TechnicalIssue
      @SerialName("feature-request")
      FeatureRequest
      @SerialName("other")
      Other
    }

    // Exported as 'Schema.TriageTicket.Input'
    /** A support ticket to be triaged. */
    @Serializable
    data class Input(
      val subject: String
      val body: String
      val customerTier:
      /** Previous tickets from this customer, for context. */
      val recentTickets: readonly {}[]
    ) {}

    // Exported as 'Schema.TriageTicket.Input_CustomerTier'
    @Serializable
    enum class Input_CustomerTier {
      @SerialName("free")
      Free
      @SerialName("pro")
      Pro
      @SerialName("enterprise")
      Enterprise
    }

    // Exported as 'Schema.TriageTicket.Input_RecentTickets'
    @Serializable
    data class Input_RecentTickets(
      val id: String
      val summary: String
      val category:
    ) {}

    // Exported as 'Schema.TriageTicket.Output'
    @Serializable
    data class Output(
      val category:
      /** How quickly this ticket needs attention. */
      val urgency:
      /** One-sentence summary of the issue. */
      val summary: String
      /** Concrete next steps to resolve the ticket. */
      val suggestedActions: readonly String[]
      /** Suggested first reply to the customer, if the issue is straightforward. */
      val suggestedReply: String?
    ) {}

    // Exported as 'Schema.TriageTicket.Output_Urgency'
    @Serializable
    enum class Output_Urgency {
      @SerialName("low")
      Low
      @SerialName("medium")
      Medium
      @SerialName("high")
      High
      @SerialName("critical")
      Critical
    }
  }
}

