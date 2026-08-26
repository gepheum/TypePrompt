typealias Meta = Schema.Meta.Meta;

/** Namespace containing the user-defined datatypes. */
object Schema {
  object Meta {
    export type Meta = Nothing?;
  }

  object Translate {
    // Exported as 'Schema.Translate.Input'
    @Serializable
    data class Input(
      val text: String
      val targetLanguage: String
    ) {}

    typealias Output = String
  }
}

