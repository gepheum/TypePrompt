using System.Text.Json;
using TypePrompt.Schema.AnalyzeSalesData;
using TypePrompt.Schema.Shared;

namespace TypePrompt.Tests;

public class GreeterTest
{
    [Fact]
    public void TestGreeting()
    {
        Assert.Equal("Hello, World!", Greeter.GetGreeting());
    }

    [Fact]
    public void TestStringEnumSerialization()
    {
        var variant = Input_Variant.Csv;
        var json = JsonSerializer.Serialize(variant);
        Assert.Equal("\"csv\"", json);

        var decoded = JsonSerializer.Deserialize<Input_Variant>(json);
        Assert.Equal(Input_Variant.Csv, decoded);
    }

    [Fact]
    public void TestExprSerialization()
    {
        Expr expr = new Expr_KindAdd
        {
            Left = new Expr_KindNumber { Value = 1.0 },
            Right = new Expr_KindNumber { Value = 2.0 }
        };

        var json = JsonSerializer.Serialize<Expr>(expr);
        Assert.Contains("\"kind\":\"add\"", json);

        var decoded = JsonSerializer.Deserialize<Expr>(json);
        Assert.NotNull(decoded);
        var add = Assert.IsType<Expr_KindAdd>(decoded);
        var left = Assert.IsType<Expr_KindNumber>(add.Left);
        Assert.Equal(1.0, left.Value);
    }

    [Fact]
    public void TestBooleanDiscriminatorSerialization()
    {
        EnumWithCommonFields notSuccess = new EnumWithCommonFields_NotSuccess
        {
            X = 10,
            Y = 20.5,
            Z = "error"
        };
        EnumWithCommonFields success = new EnumWithCommonFields_Success
        {
            X = 42,
            Y = 84.0,
            Z = 99
        };

        // Test common fields getters
        Assert.Equal(10, notSuccess.X);
        Assert.Equal(20.5, notSuccess.Y);
        Assert.Equal(42, success.X);
        Assert.Equal(84.0, success.Y);

        var jsonSuccess = JsonSerializer.Serialize<EnumWithCommonFields>(success);
        Assert.Contains("\"success\":true", jsonSuccess);

        var decodedSuccess = JsonSerializer.Deserialize<EnumWithCommonFields>(jsonSuccess);
        Assert.NotNull(decodedSuccess);
        var succ = Assert.IsType<EnumWithCommonFields_Success>(decodedSuccess);
        Assert.Equal(42, succ.X);
        Assert.Equal(84.0, succ.Y);
        Assert.Equal(99, succ.Z);
    }

    [Fact]
    public void TestOptionalFieldsOmission()
    {
        var matrix = new Matrix
        {
            matrix = new List<List<Square>>(),
            Ints = new List<int> { 1, 2, 3 },
            Init = true,
            Encode = false
        };

        Assert.Null(matrix.OtherMatrix);
        Assert.Null(matrix.Foo);
    }
}

