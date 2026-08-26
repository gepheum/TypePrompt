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

  object WriteProductDescription {
    // Exported as 'Schema.WriteProductDescription.Input'
    @Serializable
    data class Input(
      val productName: String
      val features: readonly String[]
      val variant:
    ) {}

    // Exported as 'Schema.WriteProductDescription.Input_Variant'
    @Serializable
    enum class Input_Variant {
      @SerialName("marketing")
      Marketing
      @SerialName("technical")
      Technical
      @SerialName("brief")
      Brief
    }

    // Exported as 'Schema.WriteProductDescription.Output'
    @Serializable
    data class Output(
      val description: String
    ) {}
  }
}

