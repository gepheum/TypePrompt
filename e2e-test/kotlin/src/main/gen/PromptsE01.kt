typealias Meta = Schema.Meta.Meta;

/** Namespace containing the user-defined datatypes. */
object Schema {
  object Meta {
    export type Meta = Nothing?;
  }

  object Shared {
    // Exported as 'Schema.Shared.Expr'
    sealed interface Expr {}

    // Exported as 'Schema.Shared.Expr_KindNumber'
    @Serializable
    data class Expr_KindNumber(
      val value: Double
    ): Schema.Shared.Expr {
      val kind: String get() = "number"
    }

    // Exported as 'Schema.Shared.Expr_KindAdd'
    @Serializable
    data class Expr_KindAdd(
      val left:
      val right:
    ): Schema.Shared.Expr {
      val kind: String get() = "add"
    }

    // Exported as 'Schema.Shared.Expr_KindIf'
    @Serializable
    data class Expr_KindIf(
      val condition:
      val then:
      val `else`:
    ): Schema.Shared.Expr {
      val kind: String get() = "if"
    }
  }

  object AnalyzeSalesData {
    // Exported as 'Schema.AnalyzeSalesData.SalesRow'
    @Serializable
    data class SalesRow(
      val product: String
      val units: Int
      val revenueCents: Int
      val region: String
    ) {}

    // Exported as 'Schema.AnalyzeSalesData.Input'
    @Serializable
    data class Input(
      val rows: readonly SalesRow[]
      val question: String
      val variant:
    ) {}

    // Exported as 'Schema.AnalyzeSalesData.Input_Variant'
    @Serializable
    enum class Input_Variant {
      @SerialName("csv")
      Csv
      @SerialName("tsv")
      Tsv
    }

    // Exported as 'Schema.AnalyzeSalesData.Output'
    @Serializable
    data class Output(
      val analysis: String
      val topProduct: String
      val totalRevenue: Double
    ) {}
  }
}

