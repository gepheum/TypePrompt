

namespace TypePrompt.Schema.Shared
{
    /// <summary>An expression</summary>
    @Serializable(with = Expr_Serializer::class)
    sealed interface Expr {}

    private object Expr_Serializer : JsonContentPolymorphicSerializer<Expr>(Expr::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<Expr> {
            return when (val kind = element.jsonObject["kind"]?.jsonPrimitive?.contentOrNull) {
                "number" -> Expr_KindNumber.serializer()
                "add" -> Expr_KindAdd.serializer()
                "if" -> Expr_KindIf.serializer()
                else -> throw IllegalArgumentException("Unknown discriminant: '${kind}'")
            }
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("number")
    data class Expr_KindNumber private constructor(
        val kind: String,
        val value: Double,
    ) : Schema.Shared.Expr {
        constructor(
            value: Double,
        ) : this(
            kind = "number",
            value = value,
        )
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("add")
    data class Expr_KindAdd private constructor(
        val kind: String,
        val left: Expr,
        val right: Expr,
    ) : Schema.Shared.Expr {
        constructor(
            left: Expr,
            right: Expr,
        ) : this(
            kind = "add",
            left = left,
            right = right,
        )
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("if")
    data class Expr_KindIf private constructor(
        val kind: String,
        val condition: Expr,
        val then: Expr,
        val else_: Expr,
    ) : Schema.Shared.Expr {
        constructor(
            condition: Expr,
            then: Expr,
            else_: Expr,
        ) : this(
            kind = "if",
            condition = condition,
            then = then,
            else_ = else_,
        )
    }

    @Serializable(with = EnumWithCommonFields_Serializer::class)
    sealed interface EnumWithCommonFields {
        val x: Int
        val y: Double
    }

    private object EnumWithCommonFields_Serializer : JsonContentPolymorphicSerializer<EnumWithCommonFields>(EnumWithCommonFields::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<EnumWithCommonFields> {
            return when (val kind = element.jsonObject["success"]?.jsonPrimitive?.contentOrNull) {
                "false" -> EnumWithCommonFields_NotSuccess.serializer()
                "true" -> EnumWithCommonFields_Success.serializer()
                else -> throw IllegalArgumentException("Unknown discriminant: '${kind}'")
            }
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class EnumWithCommonFields_NotSuccess private constructor(
        val success: Boolean,
        /// <summary>x coordinate</summary>
        override val x: Int,
        /// <summary>y coordinate</summary>
        override val y: Double,
        /// <summary>z coordinate</summary>
        val z: String,
    ) : Schema.Shared.EnumWithCommonFields {
        constructor(
            /// <summary>x coordinate</summary>
            x: Int,
            /// <summary>y coordinate</summary>
            y: Double,
            /// <summary>z coordinate</summary>
            z: String,
        ) : this(
            success = false,
            x = x,
            y = y,
            z = z,
        )
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class EnumWithCommonFields_Success private constructor(
        val success: Boolean,
        /// <summary>x coordinate</summary>
        override val x: Int,
        override val y: Double,
        val z: Int,
    ) : Schema.Shared.EnumWithCommonFields {
        constructor(
            /// <summary>x coordinate</summary>
            x: Int,
            y: Double,
            z: Int,
        ) : this(
            success = true,
            x = x,
            y = y,
            z = z,
        )
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Schema(
        val e: EnumWithCommonFields,
    ) {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    class String_() {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    class Boolean() {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    class List() {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    class Map() {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    class EncodeDefault() {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    class Serializable() {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    class KindAdd() {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class AnyHolder(
        val any: JsonElement,
    ) {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class SerializerHolder(
        val serializer: JsonElement,
    ) {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("square")
    data class Square private constructor(
        val kind: String,
        val size: Double,
        val fromJson: String,
        val self: String,
        val foo: String,
    ) : Schema.MyTemplate.Output_Shape, Schema.MyOtherTemplate.Output_Shape {
        constructor(
            size: Double,
            fromJson: String,
            self: String,
        ) : this(
            kind = "square",
            size = size,
            fromJson = fromJson,
            self = self,
            foo = "foo",
        )
    }

    @Serializable
    enum class E {
        @SerialName("class")
        Class,
        @SerialName("if")
        If,
        @SerialName("foo-BAR")
        FooBar,
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("matrix")
    data class Matrix private constructor(
        val kind: String,
        val matrix: List<List<Square>>,
        val otherMatrix: List<List<Square>>?,
        val foo: Map<String, List<Square>>?,
        val ints: List<Int>,
        override val init: Boolean,
        override val encode: Boolean,
    ) : Schema.Shared.MatrixUnion {
        constructor(
            matrix: List<List<Square>>,
            otherMatrix: List<List<Square>>?,
            foo: Map<String, List<Square>>?,
            ints: List<Int>,
            init: Boolean,
            encode: Boolean,
        ) : this(
            kind = "matrix",
            matrix = matrix,
            otherMatrix = otherMatrix,
            foo = foo,
            ints = ints,
            init = init,
            encode = encode,
        )
    }

    @Serializable(with = MatrixUnion_Serializer::class)
    sealed interface MatrixUnion {
        val init: Boolean
        val encode: Boolean
    }

    private object MatrixUnion_Serializer : JsonContentPolymorphicSerializer<MatrixUnion>(MatrixUnion::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<MatrixUnion> {
            return when (val kind = element.jsonObject["kind"]?.jsonPrimitive?.contentOrNull) {
                "matrix" -> Matrix.serializer()
                "empty" -> MatrixUnion_KindEmpty.serializer()
                else -> throw IllegalArgumentException("Unknown discriminant: '${kind}'")
            }
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("empty")
    data class MatrixUnion_KindEmpty private constructor(
        val kind: String,
        override val init: Boolean,
        override val encode: Boolean,
    ) : Schema.Shared.MatrixUnion {
        constructor(
            init: Boolean,
            encode: Boolean,
        ) : this(
            kind = "empty",
            init = init,
            encode = encode,
        )
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    class DiscriminatorCodingKeys() {}
}  // namespace TypePrompt.Schema.Shared

namespace TypePrompt.Schema.AnalyzeSalesData
{
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class SalesRow(
        val product: String,
        val units: Int,
        val revenueCents: Int,
        val region: String,
    ) {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Input(
        val rows: List<SalesRow>,
        val question: String,
        val variant: Input_Variant,
    ) {}

    @Serializable
    enum class Input_Variant {
        @SerialName("csv")
        Csv,
        @SerialName("tsv")
        Tsv,
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Output(
        val analysis: String,
        val topProduct: String,
        val totalRevenue: Double,
    ) {}
}  // namespace TypePrompt.Schema.AnalyzeSalesData
}

namespace TypePrompt.Schema.MyTemplate
{
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Input(
        val text: String,
    ) {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Output(
        val reversedText: String,
        val shape: Output_Shape,
    ) {}

    @Serializable(with = Output_Shape_Serializer::class)
    sealed interface Output_Shape {}

    private object Output_Shape_Serializer : JsonContentPolymorphicSerializer<Output_Shape>(Output_Shape::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<Output_Shape> {
            return when (val kind = element.jsonObject["kind"]?.jsonPrimitive?.contentOrNull) {
                "square" -> global.TypePrompt.Schema.Shared.Square.serializer()
                "circle" -> Output_Shape_KindCircle.serializer()
                else -> throw IllegalArgumentException("Unknown discriminant: '${kind}'")
            }
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("circle")
    data class Output_Shape_KindCircle private constructor(
        val kind: String,
        val radius: Double,
    ) : Schema.MyTemplate.Output_Shape {
        constructor(
            radius: Double,
        ) : this(
            kind = "circle",
            radius = radius,
        )
    }
}  // namespace TypePrompt.Schema.MyTemplate
}

namespace TypePrompt.Schema.MyOtherTemplate
{
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Output(
        val reversedText: String,
        val shape: Output_Shape,
    ) {}

    @Serializable(with = Output_Shape_Serializer::class)
    sealed interface Output_Shape {}

    private object Output_Shape_Serializer : JsonContentPolymorphicSerializer<Output_Shape>(Output_Shape::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<Output_Shape> {
            return when (val kind = element.jsonObject["kind"]?.jsonPrimitive?.contentOrNull) {
                "square" -> global.TypePrompt.Schema.Shared.Square.serializer()
                "circle" -> Output_Shape_KindCircle.serializer()
                else -> throw IllegalArgumentException("Unknown discriminant: '${kind}'")
            }
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("circle")
    data class Output_Shape_KindCircle private constructor(
        val kind: String,
        val radius: Double,
    ) : Schema.MyOtherTemplate.Output_Shape {
        constructor(
            radius: Double,
        ) : this(
            kind = "circle",
            radius = radius,
        )
    }
}  // namespace TypePrompt.Schema.MyOtherTemplate
}

namespace TypePrompt.Schema.MyTool
{
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Output(
        val shared: Shared,
    ) {}

    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Shared(
        val value: String,
        val square: global.TypePrompt.Schema.Shared.Square,
    ) {}
}  // namespace TypePrompt.Schema.MyTool
