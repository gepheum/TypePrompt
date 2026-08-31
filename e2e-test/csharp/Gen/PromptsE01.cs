using System.Text.Json;
using System.Text.Json.Serialization;

namespace TypePrompt.Schema.Shared
{
    /// <summary>An expression</summary>
    [JsonConverter(typeof(Expr__Converter))]
    public interface Expr
    { }

    internal class Expr__Converter : JsonConverter<Expr>
    {
        public override Expr? Read(
            ref Utf8JsonReader reader,
            System.Type typeToConvert,
            JsonSerializerOptions options)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("kind", out var discElem))
            {
                throw new JsonException("Missing discriminator property 'kind'");
            }
            var discriminant = discElem.GetString();
            return discriminant switch
            {
                "number" => JsonSerializer.Deserialize<Expr_KindNumber>(root, options),
                "add" => JsonSerializer.Deserialize<Expr_KindAdd>(root, options),
                "if" => JsonSerializer.Deserialize<Expr_KindIf>(root, options),
                _ => throw new JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(
            Utf8JsonWriter writer,
            Expr value,
            JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record Expr_KindNumber : Expr
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "number";
        [JsonPropertyName("value")]
        public required double Value { get; init; }
    }

    public record Expr_KindAdd : Expr
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "add";
        [JsonPropertyName("left")]
        public required Expr Left { get; init; }
        [JsonPropertyName("right")]
        public required Expr Right { get; init; }
    }

    public record Expr_KindIf : Expr
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "if";
        [JsonPropertyName("condition")]
        public required Expr Condition { get; init; }
        [JsonPropertyName("then")]
        public required Expr Then { get; init; }
        [JsonPropertyName("else")]
        public required Expr Else { get; init; }
    }

    [JsonConverter(typeof(EnumWithCommonFields__Converter))]
    public interface EnumWithCommonFields
    {
        /// <summary>x coordinate</summary>
        public int X { get; }
        /// <summary>y coordinate</summary>
        public double Y { get; }
    }

    internal class EnumWithCommonFields__Converter : JsonConverter<EnumWithCommonFields>
    {
        public override EnumWithCommonFields? Read(
            ref Utf8JsonReader reader,
            System.Type typeToConvert,
            JsonSerializerOptions options)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("success", out var discElem))
            {
                throw new JsonException("Missing discriminator property 'success'");
            }
            var discriminant = discElem.GetBoolean();
            return discriminant switch
            {
                false => JsonSerializer.Deserialize<EnumWithCommonFields_NotSuccess>(root, options),
                true => JsonSerializer.Deserialize<EnumWithCommonFields_Success>(root, options),
            };
        }

        public override void Write(
            Utf8JsonWriter writer,
            EnumWithCommonFields value,
            JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record EnumWithCommonFields_NotSuccess : EnumWithCommonFields
    {
        [JsonInclude]
        [JsonPropertyName("success")]
        private readonly bool Success = false;
        /// <summary>x coordinate</summary>
        [JsonPropertyName("x")]
        public required int X { get; init; }
        /// <summary>y coordinate</summary>
        [JsonPropertyName("y")]
        public required double Y { get; init; }
        /// <summary>z coordinate</summary>
        [JsonPropertyName("z")]
        public required string Z { get; init; }
    }

    public record EnumWithCommonFields_Success : EnumWithCommonFields
    {
        [JsonInclude]
        [JsonPropertyName("success")]
        private readonly bool Success = true;
        /// <summary>x coordinate</summary>
        [JsonPropertyName("x")]
        public required int X { get; init; }
        [JsonPropertyName("y")]
        public required double Y { get; init; }
        [JsonPropertyName("z")]
        public required int Z { get; init; }
    }

    public record Schema
    {
        [JsonPropertyName("e")]
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
        [JsonPropertyName("any")]
        public required JsonElement Any { get; init; }
    }

    public record SerializerHolder
    {
        [JsonPropertyName("serializer")]
        public required JsonElement Serializer { get; init; }
    }

    public record Square : TypePrompt.Schema.MyTemplate.Output_Shape, TypePrompt.Schema.MyOtherTemplate.Output_Shape
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "square";
        [JsonPropertyName("size")]
        public required double Size { get; init; }
        [JsonPropertyName("fromJson")]
        public required string FromJson { get; init; }
        [JsonPropertyName("self")]
        public required string Self { get; init; }
        [JsonInclude]
        [JsonPropertyName("foo")]
        private readonly string Foo = "foo";
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum E
    {
        [JsonStringEnumMemberName("class")]
        Class,
        [JsonStringEnumMemberName("if")]
        If,
        [JsonStringEnumMemberName("foo-BAR")]
        FooBar,
    }

    public record Matrix : MatrixUnion
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "matrix";
        List<List<Square>> TypePrompt.Schema.Shared.MatrixUnion.Matrix => matrix;
        [JsonPropertyName("matrix")]
        public required List<List<Square>> matrix { get; init; }
        [JsonPropertyName("otherMatrix")]
        public required List<List<Square>>? OtherMatrix { get; init; }
        [JsonPropertyName("foo")]
        public required Dictionary<string, List<Square>>? Foo { get; init; }
        [JsonPropertyName("ints")]
        public required List<int> Ints { get; init; }
        [JsonPropertyName("init")]
        public required bool Init { get; init; }
        [JsonPropertyName("encode")]
        public required bool Encode { get; init; }
    }

    [JsonConverter(typeof(MatrixUnion__Converter))]
    public interface MatrixUnion
    {
        public List<List<Square>> Matrix { get; }
        public bool Init { get; }
        public bool Encode { get; }
    }

    internal class MatrixUnion__Converter : JsonConverter<MatrixUnion>
    {
        public override MatrixUnion? Read(
            ref Utf8JsonReader reader,
            System.Type typeToConvert,
            JsonSerializerOptions options)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("kind", out var discElem))
            {
                throw new JsonException("Missing discriminator property 'kind'");
            }
            var discriminant = discElem.GetString();
            return discriminant switch
            {
                "matrix" => JsonSerializer.Deserialize<Matrix>(root, options),
                "empty" => JsonSerializer.Deserialize<MatrixUnion_KindEmpty>(root, options),
                _ => throw new JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(
            Utf8JsonWriter writer,
            MatrixUnion value,
            JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record MatrixUnion_KindEmpty : MatrixUnion
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "empty";
        [JsonPropertyName("init")]
        public required bool Init { get; init; }
        [JsonPropertyName("encode")]
        public required bool Encode { get; init; }
        [JsonPropertyName("matrix")]
        public required List<List<Square>> Matrix { get; init; }
        [JsonPropertyName("foo")]
        public required string Foo { get; init; }
    }

    public record DiscriminatorCodingKeys
    { }
}  // namespace TypePrompt.Schema.Shared

namespace TypePrompt.Schema.AnalyzeSalesData
{
    public record SalesRow
    {
        [JsonPropertyName("product")]
        public required string Product { get; init; }
        [JsonPropertyName("units")]
        public required int Units { get; init; }
        [JsonPropertyName("revenueCents")]
        public required int RevenueCents { get; init; }
        [JsonPropertyName("region")]
        public required string Region { get; init; }
    }

    public record Input
    {
        [JsonPropertyName("rows")]
        public required List<SalesRow> Rows { get; init; }
        [JsonPropertyName("question")]
        public required string Question { get; init; }
        [JsonPropertyName("variant")]
        public required Input_Variant Variant { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Input_Variant
    {
        [JsonStringEnumMemberName("csv")]
        Csv,
        [JsonStringEnumMemberName("tsv")]
        Tsv,
    }

    public record Output
    {
        [JsonPropertyName("analysis")]
        public required string Analysis { get; init; }
        [JsonPropertyName("topProduct")]
        public required string TopProduct { get; init; }
        [JsonPropertyName("totalRevenue")]
        public required double TotalRevenue { get; init; }
    }
}  // namespace TypePrompt.Schema.AnalyzeSalesData

namespace TypePrompt.Schema.MyTemplate
{
    public record Input
    {
        [JsonPropertyName("text")]
        public required string Text { get; init; }
    }

    public record Output
    {
        [JsonPropertyName("reversedText")]
        public required string ReversedText { get; init; }
        [JsonPropertyName("shape")]
        public required Output_Shape Shape { get; init; }
    }

    [JsonConverter(typeof(Output_Shape__Converter))]
    public interface Output_Shape
    { }

    internal class Output_Shape__Converter : JsonConverter<Output_Shape>
    {
        public override Output_Shape? Read(
            ref Utf8JsonReader reader,
            System.Type typeToConvert,
            JsonSerializerOptions options)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("kind", out var discElem))
            {
                throw new JsonException("Missing discriminator property 'kind'");
            }
            var discriminant = discElem.GetString();
            return discriminant switch
            {
                "square" => JsonSerializer.Deserialize<global::TypePrompt.Schema.Shared.Square>(root, options),
                "circle" => JsonSerializer.Deserialize<Output_Shape_KindCircle>(root, options),
                _ => throw new JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(
            Utf8JsonWriter writer,
            Output_Shape value,
            JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record Output_Shape_KindCircle : Output_Shape
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "circle";
        [JsonPropertyName("radius")]
        public required double Radius { get; init; }
    }
}  // namespace TypePrompt.Schema.MyTemplate

namespace TypePrompt.Schema.MyOtherTemplate
{
    public record Output
    {
        [JsonPropertyName("reversedText")]
        public required string ReversedText { get; init; }
        [JsonPropertyName("shape")]
        public required Output_Shape Shape { get; init; }
    }

    [JsonConverter(typeof(Output_Shape__Converter))]
    public interface Output_Shape
    { }

    internal class Output_Shape__Converter : JsonConverter<Output_Shape>
    {
        public override Output_Shape? Read(
            ref Utf8JsonReader reader,
            System.Type typeToConvert,
            JsonSerializerOptions options)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("kind", out var discElem))
            {
                throw new JsonException("Missing discriminator property 'kind'");
            }
            var discriminant = discElem.GetString();
            return discriminant switch
            {
                "square" => JsonSerializer.Deserialize<global::TypePrompt.Schema.Shared.Square>(root, options),
                "circle" => JsonSerializer.Deserialize<Output_Shape_KindCircle>(root, options),
                _ => throw new JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(
            Utf8JsonWriter writer,
            Output_Shape value,
            JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    public record Output_Shape_KindCircle : Output_Shape
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "circle";
        [JsonPropertyName("radius")]
        public required double Radius { get; init; }
    }
}  // namespace TypePrompt.Schema.MyOtherTemplate

namespace TypePrompt.Schema.MyTool
{
    public record Output
    {
        [JsonPropertyName("shared")]
        public required Shared Shared { get; init; }
    }

    public record Shared
    {
        [JsonPropertyName("value")]
        public required string Value { get; init; }
        [JsonPropertyName("square")]
        public required global::TypePrompt.Schema.Shared.Square Square { get; init; }
    }
}  // namespace TypePrompt.Schema.MyTool
