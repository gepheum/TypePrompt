namespace TypePrompt.Tests;

public class GreeterTest
{
    [Fact]
    public void TestGreeting()
    {
        Assert.Equal("Hello, World!", Greeter.GetGreeting());
    }
}
