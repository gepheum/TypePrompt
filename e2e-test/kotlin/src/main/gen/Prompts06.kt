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

  object WriteComparisonArticle {
    // Exported as 'Schema.WriteComparisonArticle.ProductCategory'
    @Serializable
    enum class ProductCategory {
      @SerialName("storage")
      Storage
      @SerialName("compute")
      Compute
      @SerialName("database")
      Database
      @SerialName("networking")
      Networking
    }

    // Exported as 'Schema.WriteComparisonArticle.Pricing'
    @Serializable
    data class Pricing(
      val model:
      val basePrice: Double
      /** Price per additional unit beyond the base tier, if applicable. */
      val overage: Double?
    ) {}

    // Exported as 'Schema.WriteComparisonArticle.Pricing_Model'
    @Serializable
    enum class Pricing_Model {
      @SerialName("perHour")
      PerHour
      @SerialName("perMonth")
      PerMonth
      @SerialName("perRequest")
      PerRequest
    }

    // Exported as 'Schema.WriteComparisonArticle.Benchmark'
    @Serializable
    data class Benchmark(
      val name: String
      val score: Double
      val unit: String
    ) {}

    // Exported as 'Schema.WriteComparisonArticle.Provider'
    @Serializable
    data class Provider(
      val name: String
      val region: String
      val category:
      val pricing: {}
      val benchmarks: readonly Benchmark[]
      val pros: readonly String[]
      val cons: readonly String[]
    ) {}

    // Exported as 'Schema.WriteComparisonArticle.Input'
    @Serializable
    data class Input(
      val providers: readonly Provider[]
      /** The use case this comparison should be framed around. */
      val useCase: String
      /** Target audience for the article. */
      val audience:
    ) {}

    // Exported as 'Schema.WriteComparisonArticle.Input_Audience'
    @Serializable
    enum class Input_Audience {
      @SerialName("developer")
      Developer
      @SerialName("architect")
      Architect
      @SerialName("businessDecisionMaker")
      BusinessDecisionMaker
    }

    // Exported as 'Schema.WriteComparisonArticle.Output'
    @Serializable
    data class Output(
      val title: String
      val introduction: String
      /** One section per provider. */
      val sections: readonly {}[]
      val conclusion: String
      val recommendation: String
    ) {}

    // Exported as 'Schema.WriteComparisonArticle.Output_Sections'
    @Serializable
    data class Output_Sections(
      val providerName: String
      val body: String
    ) {}
  }
}

