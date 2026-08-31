

namespace TypePrompt.Schema.Shared
{
    /// <summary>An expression</summary>

    public record Expr_KindNumber : Schema.Shared.Expr
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "number";
        [JsonPropertyName("value")]
        public double Value;
    }

    public record Expr_KindAdd : Schema.Shared.Expr
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "add";
        [JsonPropertyName("left")]
        public Expr Left;
        [JsonPropertyName("right")]
        public Expr Right;
    }

    public record Expr_KindIf : Schema.Shared.Expr
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "if";
        [JsonPropertyName("condition")]
        public Expr Condition;
        [JsonPropertyName("then")]
        public Expr Then;
        [JsonPropertyName("else")]
        public Expr Else;
    }

    public record EnumWithCommonFields_NotSuccess : Schema.Shared.EnumWithCommonFields
    {
        [JsonInclude]
        [JsonPropertyName("success")]
        private readonly Boolean Success = false;
        /// <summary>x coordinate</summary>
        [JsonPropertyName("x")]
        public int X;
        /// <summary>y coordinate</summary>
        [JsonPropertyName("y")]
        public double Y;
        /// <summary>z coordinate</summary>
        [JsonPropertyName("z")]
        public string Z;
    }

    public record EnumWithCommonFields_Success : Schema.Shared.EnumWithCommonFields
    {
        [JsonInclude]
        [JsonPropertyName("success")]
        private readonly Boolean Success = true;
        /// <summary>x coordinate</summary>
        [JsonPropertyName("x")]
        public int X;
        [JsonPropertyName("y")]
        public double Y;
        [JsonPropertyName("z")]
        public int Z;
    }

    public record Schema
    {
        [JsonPropertyName("e")]
        public EnumWithCommonFields E;
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
        public JsonElement Any;
    }

    public record SerializerHolder
    {
        [JsonPropertyName("serializer")]
        public JsonElement Serializer;
    }

    public record Square : Schema.MyTemplate.Output_Shape, Schema.MyOtherTemplate.Output_Shape
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "square";
        [JsonPropertyName("size")]
        public double Size;
        [JsonPropertyName("fromJson")]
        public string FromJson;
        [JsonPropertyName("self")]
        public string Self;
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

    public record Matrix : Schema.Shared.MatrixUnion
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "matrix";
        [JsonPropertyName("matrix")]
        public List<List<Square>> Matrix;
        [JsonPropertyName("otherMatrix")]
        public List<List<Square>>? OtherMatrix;
        [JsonPropertyName("foo")]
        public Dictionary<String, List<Square>>? Foo;
        [JsonPropertyName("ints")]
        public List<int> Ints;
        [JsonPropertyName("init")]
        public bool Init;
        [JsonPropertyName("encode")]
        public bool Encode;
    }

    public record MatrixUnion_KindEmpty : Schema.Shared.MatrixUnion
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "empty";
        [JsonPropertyName("init")]
        public bool Init;
        [JsonPropertyName("encode")]
        public bool Encode;
    }

    public record DiscriminatorCodingKeys
    {}
}  // namespace TypePrompt.Schema.Shared

namespace TypePrompt.Schema.AnalyzeSalesData
{
    public record SalesRow
    {
        [JsonPropertyName("product")]
        public string Product;
        [JsonPropertyName("units")]
        public int Units;
        [JsonPropertyName("revenueCents")]
        public int RevenueCents;
        [JsonPropertyName("region")]
        public string Region;
    }

    public record Input
    {
        [JsonPropertyName("rows")]
        public List<SalesRow> Rows;
        [JsonPropertyName("question")]
        public string Question;
        [JsonPropertyName("variant")]
        public Input_Variant Variant;
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
        public string Analysis;
        [JsonPropertyName("topProduct")]
        public string TopProduct;
        [JsonPropertyName("totalRevenue")]
        public double TotalRevenue;
    }
}  // namespace TypePrompt.Schema.AnalyzeSalesData

namespace TypePrompt.Schema.MyTemplate
{
    public record Input
    {
        [JsonPropertyName("text")]
        public string Text;
    }

    public record Output
    {
        [JsonPropertyName("reversedText")]
        public string ReversedText;
        [JsonPropertyName("shape")]
        public Output_Shape Shape;
    }

    public record Output_Shape_KindCircle : Schema.MyTemplate.Output_Shape
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "circle";
        [JsonPropertyName("radius")]
        public double Radius;
    }
}  // namespace TypePrompt.Schema.MyTemplate

namespace TypePrompt.Schema.MyOtherTemplate
{
    public record Output
    {
        [JsonPropertyName("reversedText")]
        public string ReversedText;
        [JsonPropertyName("shape")]
        public Output_Shape Shape;
    }

    public record Output_Shape_KindCircle : Schema.MyOtherTemplate.Output_Shape
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "circle";
        [JsonPropertyName("radius")]
        public double Radius;
    }
}  // namespace TypePrompt.Schema.MyOtherTemplate

namespace TypePrompt.Schema.MyTool
{
    public record Output
    {
        [JsonPropertyName("shared")]
        public Shared Shared;
    }

    public record Shared
    {
        [JsonPropertyName("value")]
        public string Value;
        [JsonPropertyName("square")]
        public global.TypePrompt.Schema.Shared.Square Square;
    }
}  // namespace TypePrompt.Schema.MyTool
