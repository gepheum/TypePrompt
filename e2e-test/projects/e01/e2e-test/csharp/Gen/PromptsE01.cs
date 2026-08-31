

namespace TypePrompt.Schema.Shared
{
    /// <summary>An expression</summary>

    public record Expr_KindNumber : Schema.Shared.Expr
    {
        String Kind;
        double Value;
    }

    public record Expr_KindAdd : Schema.Shared.Expr
    {
        String Kind;
        Expr Left;
        Expr Right;
    }

    public record Expr_KindIf : Schema.Shared.Expr
    {
        String Kind;
        Expr Condition;
        Expr Then;
        Expr Else;
    }

    public record EnumWithCommonFields_NotSuccess : Schema.Shared.EnumWithCommonFields
    {
        Boolean Success;
        /// <summary>x coordinate</summary>
        int X;
        /// <summary>y coordinate</summary>
        double Y;
        /// <summary>z coordinate</summary>
        String Z;
    }

    public record EnumWithCommonFields_Success : Schema.Shared.EnumWithCommonFields
    {
        Boolean Success;
        /// <summary>x coordinate</summary>
        int X;
        double Y;
        int Z;
    }

    public record Schema
    {
        EnumWithCommonFields E;
    }

    public record String_
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
        JsonElement Any;
    }

    public record SerializerHolder
    {
        JsonElement Serializer;
    }

    public record Square : Schema.MyTemplate.Output_Shape, Schema.MyOtherTemplate.Output_Shape
    {
        String Kind;
        double Size;
        String FromJson;
        String Self;
        String Foo;
    }

    public record Matrix : Schema.Shared.MatrixUnion
    {
        String Kind;
        List<List<Square>> Matrix;
        List<List<Square>>? OtherMatrix;
        Dictionary<String, List<Square>>? Foo;
        List<int> Ints;
        bool Init;
        bool Encode;
    }

    public record MatrixUnion_KindEmpty : Schema.Shared.MatrixUnion
    {
        String Kind;
        bool Init;
        bool Encode;
    }

    public record DiscriminatorCodingKeys
    {}
}  // namespace TypePrompt.Schema.Shared

namespace TypePrompt.Schema.AnalyzeSalesData
{
    public record SalesRow
    {
        String Product;
        int Units;
        int RevenueCents;
        String Region;
    }

    public record Input
    {
        List<SalesRow> Rows;
        String Question;
        Input_Variant Variant;
    }

    public record Output
    {
        String Analysis;
        String TopProduct;
        double TotalRevenue;
    }
}  // namespace TypePrompt.Schema.AnalyzeSalesData

namespace TypePrompt.Schema.MyTemplate
{
    public record Input
    {
        String Text;
    }

    public record Output
    {
        String ReversedText;
        Output_Shape Shape;
    }

    public record Output_Shape_KindCircle : Schema.MyTemplate.Output_Shape
    {
        String Kind;
        double Radius;
    }
}  // namespace TypePrompt.Schema.MyTemplate

namespace TypePrompt.Schema.MyOtherTemplate
{
    public record Output
    {
        String ReversedText;
        Output_Shape Shape;
    }

    public record Output_Shape_KindCircle : Schema.MyOtherTemplate.Output_Shape
    {
        String Kind;
        double Radius;
    }
}  // namespace TypePrompt.Schema.MyOtherTemplate

namespace TypePrompt.Schema.MyTool
{
    public record Output
    {
        Shared Shared;
    }

    public record Shared
    {
        String Value;
        global.TypePrompt.Schema.Shared.Square Square;
    }
}  // namespace TypePrompt.Schema.MyTool
