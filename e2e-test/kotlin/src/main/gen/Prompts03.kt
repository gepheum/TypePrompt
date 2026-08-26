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

  object ResearchQuestion {
    // Exported as 'Schema.ResearchQuestion.Input'
    @Serializable
    data class Input(
      val question: String
    ) {}

    // Exported as 'Schema.ResearchQuestion.Output'
    @Serializable
    data class Output(
      val answer: String
      /** URLs of sources used. */
      val sources: readonly String[]
    ) {}
  }

  export namespace WebSearch {
    // Exported as 'Schema.WebSearch.Input'
    @Serializable
    data class Input(
      val query: String
    ) {}

    // Exported as 'Schema.WebSearch.Output'
    @Serializable
    data class Output(
      val results: readonly {}[]
    ) {}

    // Exported as 'Schema.WebSearch.Output_Results'
    @Serializable
    data class Output_Results(
      val title: String
      val url: String
      val snippet: String
    ) {}
  }
}

