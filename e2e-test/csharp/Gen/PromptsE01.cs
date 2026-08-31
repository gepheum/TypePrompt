

namespace TypePrompt.Schema.Shared
{
    /// <summary>An expression</summary>
    [System.Text.Json.Serialization.JsonConverter(typeof(Expr__Converter))]
    public interface Expr
    { }

    internal class Expr__Converter : System.Text.Json.Serialization.JsonConverter<Expr>
    {
        public override Expr? Read(
            ref System.Text.Json.Utf8JsonReader reader,
            System.Type typeToConvert,
            System.Text.Json.JsonSerializerOptions options)
        {
            using var doc = System.Text.Json.JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("kind", out var discElem))
            {
                throw new System.Text.Json.JsonException("Missing discriminator property 'kind'");
            }
            var discriminant = discElem.GetString();
            return discriminant switch
            {
                "number" => System.Text.Json.JsonSerializer.Deserialize<Expr_KindNumber>(root, options),
                "add" => System.Text.Json.JsonSerializer.Deserialize<Expr_KindAdd>(root, options),
                "if" => System.Text.Json.JsonSerializer.Deserialize<Expr_KindIf>(root, options),
                _ => throw new System.Text.Json.JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(
            System.Text.Json.Utf8JsonWriter writer,
            Expr value,
            System.Text.Json.JsonSerializerOptions options)
        {
            System.Text.Json.JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record Expr_KindNumber : Expr
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("kind")]
        private readonly string Kind = "number";
        [System.Text.Json.Serialization.JsonPropertyName("value")]
        public required double Value { get; init; }
    }

    public record Expr_KindAdd : Expr
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("kind")]
        private readonly string Kind = "add";
        [System.Text.Json.Serialization.JsonPropertyName("left")]
        public required Expr Left { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("right")]
        public required Expr Right { get; init; }
    }

    public record Expr_KindIf : Expr
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("kind")]
        private readonly string Kind = "if";
        [System.Text.Json.Serialization.JsonPropertyName("condition")]
        public required Expr Condition { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("then")]
        public required Expr Then { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("else")]
        public required Expr Else { get; init; }
    }

    [System.Text.Json.Serialization.JsonConverter(typeof(EnumWithCommonFields__Converter))]
    public interface EnumWithCommonFields
    {
        /// <summary>x coordinate</summary>
        public int X { get; }
        /// <summary>y coordinate</summary>
        public double Y { get; }
    }

    internal class EnumWithCommonFields__Converter : System.Text.Json.Serialization.JsonConverter<EnumWithCommonFields>
    {
        public override EnumWithCommonFields? Read(
            ref System.Text.Json.Utf8JsonReader reader,
            System.Type typeToConvert,
            System.Text.Json.JsonSerializerOptions options)
        {
            using var doc = System.Text.Json.JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("success", out var discElem))
            {
                throw new System.Text.Json.JsonException("Missing discriminator property 'success'");
            }
            var discriminant = discElem.GetBoolean();
            return discriminant switch
            {
                false => System.Text.Json.JsonSerializer.Deserialize<EnumWithCommonFields_NotSuccess>(root, options),
                true => System.Text.Json.JsonSerializer.Deserialize<EnumWithCommonFields_Success>(root, options),
            };
        }

        public override void Write(
            System.Text.Json.Utf8JsonWriter writer,
            EnumWithCommonFields value,
            System.Text.Json.JsonSerializerOptions options)
        {
            System.Text.Json.JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record EnumWithCommonFields_NotSuccess : EnumWithCommonFields
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("success")]
        private readonly bool Success = false;
        /// <summary>x coordinate</summary>
        [System.Text.Json.Serialization.JsonPropertyName("x")]
        public required int X { get; init; }
        /// <summary>y coordinate</summary>
        [System.Text.Json.Serialization.JsonPropertyName("y")]
        public required double Y { get; init; }
        /// <summary>z coordinate</summary>
        [System.Text.Json.Serialization.JsonPropertyName("z")]
        public required string Z { get; init; }
    }

    public record EnumWithCommonFields_Success : EnumWithCommonFields
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("success")]
        private readonly bool Success = true;
        /// <summary>x coordinate</summary>
        [System.Text.Json.Serialization.JsonPropertyName("x")]
        public required int X { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("y")]
        public required double Y { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("z")]
        public required int Z { get; init; }
    }

    public record Schema
    {
        [System.Text.Json.Serialization.JsonPropertyName("e")]
        public required EnumWithCommonFields E { get; init; }
    }

    public record String
    { }

    public record Boolean
    { }

    public record List_
    { }

    public record Map
    { }

    public record EncodeDefault
    { }

    public record Serializable
    { }

    public record KindAdd
    { }

    public record AnyHolder
    {
        [System.Text.Json.Serialization.JsonPropertyName("any")]
        public required System.Text.Json.JsonElement Any { get; init; }
    }

    public record SerializerHolder
    {
        [System.Text.Json.Serialization.JsonPropertyName("serializer")]
        public required System.Text.Json.JsonElement Serializer { get; init; }
    }

    public record Square : TypePrompt.Schema.MyTemplate.Output_Shape, TypePrompt.Schema.MyOtherTemplate.Output_Shape
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("kind")]
        private readonly string Kind = "square";
        [System.Text.Json.Serialization.JsonPropertyName("size")]
        public required double Size { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("fromJson")]
        public required string FromJson { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("self")]
        public required string Self { get; init; }
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("foo")]
        private readonly string Foo = "foo";
    }

    [System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
    public enum E
    {
        [System.Text.Json.Serialization.JsonStringEnumMemberName("class")]
        Class,
        [System.Text.Json.Serialization.JsonStringEnumMemberName("if")]
        If,
        [System.Text.Json.Serialization.JsonStringEnumMemberName("foo-BAR")]
        FooBar,
    }

    public record Matrix : MatrixUnion
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("kind")]
        private readonly string Kind = "matrix";
        System.Collections.Generic.List<System.Collections.Generic.List<Square>> TypePrompt.Schema.Shared.MatrixUnion.Matrix => matrix;
        [System.Text.Json.Serialization.JsonPropertyName("matrix")]
        public required System.Collections.Generic.List<System.Collections.Generic.List<Square>> matrix { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("otherMatrix")]
        public required System.Collections.Generic.List<System.Collections.Generic.List<Square>>? OtherMatrix { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("foo")]
        public required System.Collections.Generic.Dictionary<string, System.Collections.Generic.List<Square>>? Foo { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("ints")]
        public required System.Collections.Generic.List<int> Ints { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("init")]
        public required bool Init { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("encode")]
        public required bool Encode { get; init; }
    }

    [System.Text.Json.Serialization.JsonConverter(typeof(MatrixUnion__Converter))]
    public interface MatrixUnion
    {
        public System.Collections.Generic.List<System.Collections.Generic.List<Square>> Matrix { get; }
        public bool Init { get; }
        public bool Encode { get; }
    }

    internal class MatrixUnion__Converter : System.Text.Json.Serialization.JsonConverter<MatrixUnion>
    {
        public override MatrixUnion? Read(
            ref System.Text.Json.Utf8JsonReader reader,
            System.Type typeToConvert,
            System.Text.Json.JsonSerializerOptions options)
        {
            using var doc = System.Text.Json.JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("kind", out var discElem))
            {
                throw new System.Text.Json.JsonException("Missing discriminator property 'kind'");
            }
            var discriminant = discElem.GetString();
            return discriminant switch
            {
                "matrix" => System.Text.Json.JsonSerializer.Deserialize<Matrix>(root, options),
                "empty" => System.Text.Json.JsonSerializer.Deserialize<MatrixUnion_KindEmpty>(root, options),
                _ => throw new System.Text.Json.JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(
            System.Text.Json.Utf8JsonWriter writer,
            MatrixUnion value,
            System.Text.Json.JsonSerializerOptions options)
        {
            System.Text.Json.JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record MatrixUnion_KindEmpty : MatrixUnion
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("kind")]
        private readonly string Kind = "empty";
        [System.Text.Json.Serialization.JsonPropertyName("init")]
        public required bool Init { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("encode")]
        public required bool Encode { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("matrix")]
        public required System.Collections.Generic.List<System.Collections.Generic.List<Square>> Matrix { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("foo")]
        public required string Foo { get; init; }
    }

    public record DiscriminatorCodingKeys
    { }
}  // namespace TypePrompt.Schema.Shared

namespace TypePrompt.Schema.AnalyzeSalesData
{
    public record SalesRow
    {
        [System.Text.Json.Serialization.JsonPropertyName("product")]
        public required string Product { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("units")]
        public required int Units { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("revenueCents")]
        public required int RevenueCents { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("region")]
        public required string Region { get; init; }
    }

    public record Input
    {
        [System.Text.Json.Serialization.JsonPropertyName("rows")]
        public required System.Collections.Generic.List<SalesRow> Rows { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("question")]
        public required string Question { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("variant")]
        public required Input_Variant Variant { get; init; }
    }

    [System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
    public enum Input_Variant
    {
        [System.Text.Json.Serialization.JsonStringEnumMemberName("csv")]
        Csv,
        [System.Text.Json.Serialization.JsonStringEnumMemberName("tsv")]
        Tsv,
    }

    public record Output
    {
        [System.Text.Json.Serialization.JsonPropertyName("analysis")]
        public required string Analysis { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("topProduct")]
        public required string TopProduct { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("totalRevenue")]
        public required double TotalRevenue { get; init; }
    }
}  // namespace TypePrompt.Schema.AnalyzeSalesData

namespace TypePrompt.Schema.MyTemplate
{
    public record Input
    {
        [System.Text.Json.Serialization.JsonPropertyName("text")]
        public required string Text { get; init; }
    }

    public record Output
    {
        [System.Text.Json.Serialization.JsonPropertyName("reversedText")]
        public required string ReversedText { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("shape")]
        public required Output_Shape Shape { get; init; }
    }

    [System.Text.Json.Serialization.JsonConverter(typeof(Output_Shape__Converter))]
    public interface Output_Shape
    { }

    internal class Output_Shape__Converter : System.Text.Json.Serialization.JsonConverter<Output_Shape>
    {
        public override Output_Shape? Read(
            ref System.Text.Json.Utf8JsonReader reader,
            System.Type typeToConvert,
            System.Text.Json.JsonSerializerOptions options)
        {
            using var doc = System.Text.Json.JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("kind", out var discElem))
            {
                throw new System.Text.Json.JsonException("Missing discriminator property 'kind'");
            }
            var discriminant = discElem.GetString();
            return discriminant switch
            {
                "square" => System.Text.Json.JsonSerializer.Deserialize<global::TypePrompt.Schema.Shared.Square>(root, options),
                "circle" => System.Text.Json.JsonSerializer.Deserialize<Output_Shape_KindCircle>(root, options),
                _ => throw new System.Text.Json.JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(
            System.Text.Json.Utf8JsonWriter writer,
            Output_Shape value,
            System.Text.Json.JsonSerializerOptions options)
        {
            System.Text.Json.JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record Output_Shape_KindCircle : Output_Shape
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("kind")]
        private readonly string Kind = "circle";
        [System.Text.Json.Serialization.JsonPropertyName("radius")]
        public required double Radius { get; init; }
    }
}  // namespace TypePrompt.Schema.MyTemplate

namespace TypePrompt.Schema.MyOtherTemplate
{
    public record Output
    {
        [System.Text.Json.Serialization.JsonPropertyName("reversedText")]
        public required string ReversedText { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("shape")]
        public required Output_Shape Shape { get; init; }
    }

    [System.Text.Json.Serialization.JsonConverter(typeof(Output_Shape__Converter))]
    public interface Output_Shape
    { }

    internal class Output_Shape__Converter : System.Text.Json.Serialization.JsonConverter<Output_Shape>
    {
        public override Output_Shape? Read(
            ref System.Text.Json.Utf8JsonReader reader,
            System.Type typeToConvert,
            System.Text.Json.JsonSerializerOptions options)
        {
            using var doc = System.Text.Json.JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("kind", out var discElem))
            {
                throw new System.Text.Json.JsonException("Missing discriminator property 'kind'");
            }
            var discriminant = discElem.GetString();
            return discriminant switch
            {
                "square" => System.Text.Json.JsonSerializer.Deserialize<global::TypePrompt.Schema.Shared.Square>(root, options),
                "circle" => System.Text.Json.JsonSerializer.Deserialize<Output_Shape_KindCircle>(root, options),
                _ => throw new System.Text.Json.JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(
            System.Text.Json.Utf8JsonWriter writer,
            Output_Shape value,
            System.Text.Json.JsonSerializerOptions options)
        {
            System.Text.Json.JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record Output_Shape_KindCircle : Output_Shape
    {
        [System.Text.Json.Serialization.JsonInclude]
        [System.Text.Json.Serialization.JsonPropertyName("kind")]
        private readonly string Kind = "circle";
        [System.Text.Json.Serialization.JsonPropertyName("radius")]
        public required double Radius { get; init; }
    }
}  // namespace TypePrompt.Schema.MyOtherTemplate

namespace TypePrompt.Schema.MyTool
{
    public record Output
    {
        [System.Text.Json.Serialization.JsonPropertyName("shared")]
        public required Shared Shared { get; init; }
    }

    public record Shared
    {
        [System.Text.Json.Serialization.JsonPropertyName("value")]
        public required string Value { get; init; }
        [System.Text.Json.Serialization.JsonPropertyName("square")]
        public required global::TypePrompt.Schema.Shared.Square Square { get; init; }
    }
}  // namespace TypePrompt.Schema.MyTool
