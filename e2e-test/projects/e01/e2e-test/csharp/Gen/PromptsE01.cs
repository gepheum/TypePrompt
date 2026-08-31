

namespace TypePrompt.Schema.Shared
{
    /// <summary>An expression</summary>
    public interface Expr
    {}

    public record Expr_KindNumber : TypePrompt.Schema.SharedExpr
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "number";
        [JsonPropertyName("value")]
        public double Value { get; init; }
    }

    public record Expr_KindAdd : TypePrompt.Schema.SharedExpr
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "add";
        [JsonPropertyName("left")]
        public Expr Left { get; init; }
        [JsonPropertyName("right")]
        public Expr Right { get; init; }
    }

    public record Expr_KindIf : TypePrompt.Schema.SharedExpr
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "if";
        [JsonPropertyName("condition")]
        public Expr Condition { get; init; }
        [JsonPropertyName("then")]
        public Expr Then { get; init; }
        [JsonPropertyName("else")]
        public Expr Else { get; init; }
    }

    public interface EnumWithCommonFields
    {
        /// <summary>x coordinate</summary>
        public int X { get; }
        /// <summary>y coordinate</summary>
        public double Y { get; }
    }

    public record EnumWithCommonFields_NotSuccess : TypePrompt.Schema.SharedEnumWithCommonFields
    {
        [JsonInclude]
        [JsonPropertyName("success")]
        private readonly Boolean Success = false;
        /// <summary>x coordinate</summary>
        [JsonPropertyName("x")]
        public int X { get; init; }
        /// <summary>y coordinate</summary>
        [JsonPropertyName("y")]
        public double Y { get; init; }
        /// <summary>z coordinate</summary>
        [JsonPropertyName("z")]
        public string Z { get; init; }
    }

    public record EnumWithCommonFields_Success : TypePrompt.Schema.SharedEnumWithCommonFields
    {
        [JsonInclude]
        [JsonPropertyName("success")]
        private readonly Boolean Success = true;
        /// <summary>x coordinate</summary>
        [JsonPropertyName("x")]
        public int X { get; init; }
        [JsonPropertyName("y")]
        public double Y { get; init; }
        [JsonPropertyName("z")]
        public int Z { get; init; }
    }

    public record Schema
    {
        [JsonPropertyName("e")]
        public EnumWithCommonFields E { get; init; }
    }

    public record String
    {}

    public record Boolean
    {}

    public record List_
    {}

    public record Map
    {}

    public record EncodeDefault
    {}

    public record Serializable
    {}

    public record KindAdd
    {}

    public record AnyHolder
    {
        [JsonPropertyName("any")]
        public JsonElement Any { get; init; }
    }

    public record SerializerHolder
    {
        [JsonPropertyName("serializer")]
        public JsonElement Serializer { get; init; }
    }

    public record Square : TypePrompt.Schema.MyTemplateOutput_Shape, TypePrompt.Schema.MyOtherTemplateOutput_Shape
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "square";
        [JsonPropertyName("size")]
        public double Size { get; init; }
        [JsonPropertyName("fromJson")]
        public string FromJson { get; init; }
        [JsonPropertyName("self")]
        public string Self { get; init; }
        [JsonInclude]
        [JsonPropertyName("foo")]
        private readonly string Foo = "foo";
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum E {
        [JsonStringEnumMemberName("class")]
        Class,
        [JsonStringEnumMemberName("if")]
        If,
        [JsonStringEnumMemberName("foo-BAR")]
        FooBar,
    }

    public record Matrix : TypePrompt.Schema.SharedMatrixUnion
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "matrix";
        [JsonPropertyName("matrix")]
        public List<List<Square>> Matrix { get; init; }
        [JsonPropertyName("otherMatrix")]
        public List<List<Square>>? OtherMatrix { get; init; }
        [JsonPropertyName("foo")]
        public Dictionary<String, List<Square>>? Foo { get; init; }
        [JsonPropertyName("ints")]
        public List<int> Ints { get; init; }
        [JsonPropertyName("init")]
        public bool Init { get; init; }
        [JsonPropertyName("encode")]
        public bool Encode { get; init; }
    }

    public interface MatrixUnion
    {
        public bool Init { get; }
        public bool Encode { get; }
    }

    public record MatrixUnion_KindEmpty : TypePrompt.Schema.SharedMatrixUnion
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "empty";
        [JsonPropertyName("init")]
        public bool Init { get; init; }
        [JsonPropertyName("encode")]
        public bool Encode { get; init; }
    }

    public record DiscriminatorCodingKeys
    {}
}  // namespace TypePrompt.Schema.Shared

namespace TypePrompt.Schema.AnalyzeSalesData
{
    public record SalesRow
    {
        [JsonPropertyName("product")]
        public string Product { get; init; }
        [JsonPropertyName("units")]
        public int Units { get; init; }
        [JsonPropertyName("revenueCents")]
        public int RevenueCents { get; init; }
        [JsonPropertyName("region")]
        public string Region { get; init; }
    }

    public record Input
    {
        [JsonPropertyName("rows")]
        public List<SalesRow> Rows { get; init; }
        [JsonPropertyName("question")]
        public string Question { get; init; }
        [JsonPropertyName("variant")]
        public Input_Variant Variant { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum Input_Variant {
        [JsonStringEnumMemberName("csv")]
        Csv,
        [JsonStringEnumMemberName("tsv")]
        Tsv,
    }

    public record Output
    {
        [JsonPropertyName("analysis")]
        public string Analysis { get; init; }
        [JsonPropertyName("topProduct")]
        public string TopProduct { get; init; }
        [JsonPropertyName("totalRevenue")]
        public double TotalRevenue { get; init; }
    }
}  // namespace TypePrompt.Schema.AnalyzeSalesData

namespace TypePrompt.Schema.MyTemplate
{
    public record Input
    {
        [JsonPropertyName("text")]
        public string Text { get; init; }
    }

    public record Output
    {
        [JsonPropertyName("reversedText")]
        public string ReversedText { get; init; }
        [JsonPropertyName("shape")]
        public Output_Shape Shape { get; init; }
    }

    public interface Output_Shape
    {}

    public record Output_Shape_KindCircle : TypePrompt.Schema.MyTemplateOutput_Shape
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "circle";
        [JsonPropertyName("radius")]
        public double Radius { get; init; }
    }
}  // namespace TypePrompt.Schema.MyTemplate

namespace TypePrompt.Schema.MyOtherTemplate
{
    public record Output
    {
        [JsonPropertyName("reversedText")]
        public string ReversedText { get; init; }
        [JsonPropertyName("shape")]
        public Output_Shape Shape { get; init; }
    }

    public interface Output_Shape
    {}

    public record Output_Shape_KindCircle : TypePrompt.Schema.MyOtherTemplateOutput_Shape
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "circle";
        [JsonPropertyName("radius")]
        public double Radius { get; init; }
    }
}  // namespace TypePrompt.Schema.MyOtherTemplate

namespace TypePrompt.Schema.MyTool
{
    public record Output
    {
        [JsonPropertyName("shared")]
        public Shared Shared { get; init; }
    }

    public record Shared
    {
        [JsonPropertyName("value")]
        public string Value { get; init; }
        [JsonPropertyName("square")]
        public global.TypePrompt.Schema.Shared.Square Square { get; init; }
    }
}  // namespace TypePrompt.Schema.MyTool
