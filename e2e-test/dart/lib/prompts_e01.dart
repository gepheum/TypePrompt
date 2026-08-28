typedef Meta = never?

/** Namespace containing the user-defined datatypes. */
object Schema {
    object Shared {
        // Exported as 'Schema.Shared.Expr'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        @JsonClassDiscriminator("kind")
        sealed interface Expr {}

        // Exported as 'Schema.Shared.Expr_KindNumber'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        @SerialName("number")
        data class Expr_KindNumber(
            val value: Double,
        ) : Schema.Shared.Expr {
            @EncodeDefault
            val kind: String get() = "number"
        }

        // Exported as 'Schema.Shared.Expr_KindAdd'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        @SerialName("add")
        data class Expr_KindAdd(
            val left: Expr,
            val right: Expr,
        ) : Schema.Shared.Expr {
            @EncodeDefault
            val kind: String get() = "add"
        }

        // Exported as 'Schema.Shared.Expr_KindIf'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        @SerialName("if")
        data class Expr_KindIf(
            val condition: Expr,
            val then: Expr,
            val `else`: Expr,
        ) : Schema.Shared.Expr {
            @EncodeDefault
            val kind: String get() = "if"
        }

        // Exported as 'Schema.Shared.EnumWithCommonFields'
        @Serializable(with = EnumWithCommonFields_Serializer::class)
        sealed interface EnumWithCommonFields {
            val x: Int
            val y: Double
        }

        // Exported as 'Schema.Shared.EnumWithCommonFields_NotSuccess'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class EnumWithCommonFields_NotSuccess(
            /** x coordinate */
            override val x: Int,
            /** y coordinate */
            override val y: Double,
            /** z coordinate */
            val z: String,
        ) : Schema.Shared.EnumWithCommonFields {
            @EncodeDefault
            val success: Boolean get() = false
        }

        // Exported as 'Schema.Shared.EnumWithCommonFields_Success'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class EnumWithCommonFields_Success(
            /** x coordinate */
            override val x: Int,
            override val y: Double,
            val z: Int,
        ) : Schema.Shared.EnumWithCommonFields {
            @EncodeDefault
            val success: Boolean get() = true
        }

        // Exported as 'Schema.Shared.Schema_'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class Schema_(
            val e: EnumWithCommonFields,
        ) {}

        // Exported as 'Schema.Shared.String_'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        class String_() {}

        // Exported as 'Schema.Shared.Boolean_'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        class Boolean_() {}

        // Exported as 'Schema.Shared.List_'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        class List_() {}

        // Exported as 'Schema.Shared.Map_'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        class Map_() {}

        // Exported as 'Schema.Shared.EncodeDefault_'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        class EncodeDefault_() {}

        // Exported as 'Schema.Shared.Serializable_'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        class Serializable_() {}

        // Exported as 'Schema.Shared.AnyHolder'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class AnyHolder(
            val any: JsonElement,
        ) {}

        // Exported as 'Schema.Shared.SerializerHolder'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class SerializerHolder(
            val serializer: JsonElement,
        ) {}

        // Exported as 'Schema.Shared.Square'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        @SerialName("square")
        data class Square(
            val size: Double,
        ) : Schema.MyTemplate.Output_Shape {
            @EncodeDefault
            val kind: String get() = "square"
        }
    }

    object AnalyzeSalesData {
        // Exported as 'Schema.AnalyzeSalesData.SalesRow'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class SalesRow(
            val product: String,
            val units: Int,
            val revenueCents: Int,
            val region: String,
        ) {}

        // Exported as 'Schema.AnalyzeSalesData.Input'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class Input(
            val rows: List<SalesRow>,
            val question: String,
            val variant: Input_Variant,
        ) {}

        // Exported as 'Schema.AnalyzeSalesData.Input_Variant'
        @Serializable
        enum class Input_Variant {
            @SerialName("csv")
            Csv,
            @SerialName("tsv")
            Tsv,
        }

        // Exported as 'Schema.AnalyzeSalesData.Output'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class Output(
            val analysis: String,
            val topProduct: String,
            val totalRevenue: Double,
        ) {}
    }

    object MyTemplate {
        // Exported as 'Schema.MyTemplate.Input'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class Input(
            val text: String,
        ) {}

        // Exported as 'Schema.MyTemplate.Output'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        data class Output(
            val reversedText: String,
            val shape: Output_Shape,
        ) {}

        // Exported as 'Schema.MyTemplate.Output_Shape'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        @JsonClassDiscriminator("kind")
        sealed interface Output_Shape {}

        // Exported as 'Schema.MyTemplate.Output_Shape_KindCircle'
        @OptIn(ExperimentalSerializationApi::class)
        @Serializable
        @SerialName("circle")
        data class Output_Shape_KindCircle(
            val radius: Double,
        ) : Schema.MyTemplate.Output_Shape {
            @EncodeDefault
            val kind: String get() = "circle"
        }
    }
}

