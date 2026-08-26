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

  object SummarizeDocument {
    // Exported as 'Schema.SummarizeDocument.Input'
    @Serializable
    data class Input(
      val title: String
      val content: String
      /** If provided, the summary should focus on this topic. */
      val focusTopic: String?
      val audience:
    ) {}

    // Exported as 'Schema.SummarizeDocument.Input_Audience'
    @Serializable
    enum class Input_Audience {
      @SerialName("executive")
      Executive
      @SerialName("technical")
      Technical
      @SerialName("general")
      General
    }

    // Exported as 'Schema.SummarizeDocument.Output'
    @Serializable
    data class Output(
      val summary: String
      val keyPoints: readonly String[]
    ) {}
  }
}

