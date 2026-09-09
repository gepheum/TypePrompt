// <static:csharp-imports>
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
// </static:csharp-imports>

namespace TypePromptRuntime
{
    using Meta = object;

    // <static:csharp-public-types>
    public interface Template<TInput, TOutput, TToolExecutor>
    {
        Prompt<TOutput, TToolExecutor> Render(TInput input);
    }

    public record Prompt<TOutput, TToolExecutor>(
        Meta Meta,
        string SystemMessage,
        string UserMessage,
        IReadOnlyList<FewShotExample> Examples,
        IReadOnlyDictionary<string, Tool> Tools,
        OutputFormat OutputFormat,
        TemplateId TemplateId
    )
    {
        public TOutput ParseResponse(string response)
        {
            if (OutputFormat is JsonOutputFormat)
            {
                response = response.Trim();
                if (response.StartsWith("```"))
                {
                    response = Regex.Replace(
                        response,
                        @"^```(?:json)?\s*\n?([\s\S]*?)\n?```$",
                        "$1"
                    ).Trim();
                }
                try
                {
                    return JsonSerializer.Deserialize<TOutput>(response)!;
                }
                catch (Exception e)
                {
                    throw new Exception($"Template '{TemplateId.GetId()}': {e.Message}", e);
                }
            }
            else if (OutputFormat is TextOutputFormat)
            {
                return (TOutput)(object)response;
            }
            throw new InvalidOperationException($"Unsupported output format: {OutputFormat}");
        }

        /// <summary>
        /// Execute the given tool calls in parallel.
        /// </summary>
        public async Task<IReadOnlyList<ToolCallResponse>> ExecuteTools(
            IEnumerable<ToolCall> toolCalls,
            TToolExecutor toolExecutor
        )
        {
            var @namespace = TemplateId.GetId().Split(':')[0];
            var tasks = new List<Task<ToolCallResponse>>();
            foreach (var call in toolCalls)
            {
                tasks.Add(ToolExecution.ExecuteToolCall(call, @namespace, toolExecutor!));
            }
            return await Task.WhenAll(tasks);
        }
    }

    public abstract record OutputFormat;

    public record JsonOutputFormat(string StringifiedJsonSchema) : OutputFormat;

    public record TextOutputFormat : OutputFormat;

    public record Tool(
        string Name,
        string Description
    );

    /// <summary>
    /// A single few-shot example consisting of a user message, optional intermediate
    /// tool-call steps, and the expected response.
    /// </summary>
    public record FewShotExample(
        string UserMessage,
        IReadOnlyList<IntermediateStepExample> IntermediateSteps,
        string Response
    );

    /// <summary>
    /// One intermediate step within a few-shot example, containing the tool
    /// calls made at that step.
    /// </summary>
    public record IntermediateStepExample(
        IReadOnlyList<ToolCallExample> ToolCalls
    );

    /// <summary>A single tool call recorded inside an intermediate step.</summary>
    public record ToolCallExample(
        string CallId,
        string ToolName,
        string StringifiedInput,
        string StringifiedOutput
    );

    public record ToolCall(
        string CallId,
        string ToolName,
        string StringifiedInput
    );

    public record ToolCallResponse(
        string CallId,
        string StringifiedOutput
    );

    public sealed class Never
    {
        private Never() { }
    }
    // </static:csharp-public-types>

    // <generated>

    /// <summary>
    /// Uniquely identifies a prompt template.
    /// </summary>
    public enum TemplateId
    {
        Todo,
    }

    public static class TemplateIdExtensions
    {
        public static string GetId(this TemplateId templateId) =>
            templateId switch
            {
                TemplateId.Todo => "Main:Todo",
                _ => throw new ArgumentOutOfRangeException(nameof(templateId)),
            };
    }

    file static class ToolExecution
    {
        public static async Task<ToolCallResponse> ExecuteToolCall(ToolCall toolCall, string @namespace, object executor)
        {
            // Correct implementation will be produced by C# code generator.
            throw new NotImplementedException();
        }
    }

    // </generated>

    // <static:csharp-logic>
    file static class Rendering
    {
        public static Prompt<Output, ToolExecutor> Render<Input, Output, ToolExecutor>(Input input, Spec.Templates spec)
        {
            // Correct implementation will be produced by C# code generator.
            throw new NotImplementedException();
        }
    }
    // </static:csharp-logic>
}

// <generated:spec>
namespace Spec
{
    file record Templates
    {
        [JsonPropertyName("edition")]
        public required int Edition { get; init; }
        [JsonPropertyName("signature")]
        public required string Signature { get; init; }
        [JsonPropertyName("templates")]
        public required Dictionary<string, Template> templates { get; init; }
        [JsonPropertyName("tools")]
        public required Dictionary<string, Tool> Tools { get; init; }
        [JsonPropertyName("singleNamespace")]
        public required bool SingleNamespace { get; init; }
        /// <summary>The key is a relative path to a .xml file. The value is the file content.</summary>
        [JsonPropertyName("sourceFiles")]
        public required Dictionary<string, string> SourceFiles { get; init; }
    }

    file record Template
    {
        [JsonPropertyName("name")]
        public required string Name { get; init; }
        [JsonPropertyName("namespace")]
        public required string Namespace { get; init; }
        [JsonPropertyName("outputFormat")]
        public required OutputFormat OutputFormat { get; init; }
        [JsonPropertyName("tools")]
        public required List<TemplateTool> Tools { get; init; }
        [JsonPropertyName("contents")]
        public required TemplateContents Contents { get; init; }
        [JsonPropertyName("snippets")]
        public required Dictionary<string, Snippet> Snippets { get; init; }
        [JsonPropertyName("outputJsonSchema")]
        public JsonElement? OutputJsonSchema { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    file enum OutputFormat
    {
        [JsonStringEnumMemberName("json")]
        Json,
        [JsonStringEnumMemberName("text")]
        Text,
    }

    file record TemplateTool
    {
        [JsonPropertyName("id")]
        public required string Id { get; init; }
        [JsonPropertyName("name")]
        public required string Name { get; init; }
    }

    [JsonConverter(typeof(TemplateContents__Converter))]
    file interface TemplateContents
    { }

    file class TemplateContents__Converter : JsonConverter<TemplateContents>
    {
        public override TemplateContents? Read(ref Utf8JsonReader reader, System.Type typeToConvert, JsonSerializerOptions options)
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
                "no-variants" => JsonSerializer.Deserialize<TemplateContents_KindNoVariants>(root, options),
                "variants" => JsonSerializer.Deserialize<TemplateContents_KindVariants>(root, options),
                _ => throw new JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(Utf8JsonWriter writer, TemplateContents value, JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    file record TemplateContents_KindNoVariants : TemplateContents
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "no-variants";
        [JsonPropertyName("content")]
        public required TemplateContent Content { get; init; }
    }

    file record TemplateContents_KindVariants : TemplateContents
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "variants";
        [JsonPropertyName("variants")]
        public required Dictionary<string, TemplateContent> Variants { get; init; }
        [JsonPropertyName("defaultContent")]
        public required TemplateContent DefaultContent { get; init; }
    }

    file record TemplateContent
    {
        [JsonPropertyName("meta")]
        public JsonElement? Meta { get; init; }
        [JsonPropertyName("system")]
        public List<BodyPiece>? System_ { get; init; }
        [JsonPropertyName("user")]
        public List<BodyPiece>? User { get; init; }
        [JsonPropertyName("examples")]
        public List<FewShotExample>? Examples { get; init; }
    }

    file record FewShotExample
    {
        [JsonPropertyName("input")]
        public required JsonElement Input { get; init; }
        [JsonPropertyName("output")]
        public required JsonElement Output { get; init; }
        [JsonPropertyName("intermediateSteps")]
        public required List<FewShotExample_IntermediateSteps> IntermediateSteps { get; init; }
    }

    file record FewShotExample_IntermediateSteps
    {
        [JsonPropertyName("toolCalls")]
        public required List<ToolCallExample> ToolCalls { get; init; }
    }

    file record ToolCallExample
    {
        [JsonPropertyName("callId")]
        public required string CallId { get; init; }
        [JsonPropertyName("toolId")]
        public required string ToolId { get; init; }
        [JsonPropertyName("toolName")]
        public required string ToolName { get; init; }
        [JsonPropertyName("input")]
        public required JsonElement Input { get; init; }
        [JsonPropertyName("output")]
        public required JsonElement Output { get; init; }
    }

    [JsonConverter(typeof(BodyPiece__Converter))]
    file interface BodyPiece
    { }

    file class BodyPiece__Converter : JsonConverter<BodyPiece>
    {
        public override BodyPiece? Read(ref Utf8JsonReader reader, System.Type typeToConvert, JsonSerializerOptions options)
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
                "text" => JsonSerializer.Deserialize<BodyPiece_KindText>(root, options),
                "insert-val" => JsonSerializer.Deserialize<BodyPiece_KindInsertVal>(root, options),
                "insert-snippet" => JsonSerializer.Deserialize<BodyPiece_KindInsertSnippet>(root, options),
                _ => throw new JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(Utf8JsonWriter writer, BodyPiece value, JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    file record BodyPiece_KindText : BodyPiece
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "text";
        [JsonPropertyName("text")]
        public required string Text { get; init; }
    }

    file record BodyPiece_KindInsertVal : BodyPiece
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "insert-val";
        [JsonPropertyName("val")]
        public required Expression Val { get; init; }
        [JsonPropertyName("format")]
        public required InsertFormat Format { get; init; }
        [JsonPropertyName("indent")]
        public required string Indent { get; init; }
    }

    file record BodyPiece_KindInsertSnippet : BodyPiece
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "insert-snippet";
        /// <summary>Snippet name.</summary>
        [JsonPropertyName("snippet")]
        public required string Snippet { get; init; }
        /// <summary>Only contains whitespace characters.</summary>
        [JsonPropertyName("indent")]
        public required string Indent { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    file enum InsertFormat
    {
        [JsonStringEnumMemberName("text")]
        Text,
        [JsonStringEnumMemberName("json")]
        Json,
        [JsonStringEnumMemberName("yaml")]
        Yaml,
        [JsonStringEnumMemberName("toon")]
        Toon,
        [JsonStringEnumMemberName("csv")]
        Csv,
        [JsonStringEnumMemberName("tsv")]
        Tsv,
    }

    [JsonConverter(typeof(Expression__Converter))]
    file interface Expression
    { }

    file class Expression__Converter : JsonConverter<Expression>
    {
        public override Expression? Read(ref Utf8JsonReader reader, System.Type typeToConvert, JsonSerializerOptions options)
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
                "input" => JsonSerializer.Deserialize<Expression_KindInput>(root, options),
                "property" => JsonSerializer.Deserialize<Expression_KindProperty>(root, options),
                _ => throw new JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(Utf8JsonWriter writer, Expression value, JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    file record Expression_KindInput : Expression
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "input";
    }

    file record Expression_KindProperty : Expression
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "property";
        [JsonPropertyName("left")]
        public required Expression Left { get; init; }
        [JsonPropertyName("property")]
        public required string Property { get; init; }
    }

    [JsonConverter(typeof(Snippet__Converter))]
    file interface Snippet
    { }

    file class Snippet__Converter : JsonConverter<Snippet>
    {
        public override Snippet? Read(ref Utf8JsonReader reader, System.Type typeToConvert, JsonSerializerOptions options)
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
                "snippet" => JsonSerializer.Deserialize<Snippet_KindSnippet>(root, options),
                "snippet-if" => JsonSerializer.Deserialize<Snippet_KindSnippetIf>(root, options),
                "snippet-switch" => JsonSerializer.Deserialize<Snippet_KindSnippetSwitch>(root, options),
                _ => throw new JsonException($"Unknown discriminant value '{discriminant}'")
            };
        }

        public override void Write(Utf8JsonWriter writer, Snippet value, JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    file record Snippet_KindSnippet : Snippet
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "snippet";
        [JsonPropertyName("body")]
        public required List<BodyPiece> Body { get; init; }
    }

    file record Snippet_KindSnippetIf : Snippet
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "snippet-if";
        [JsonPropertyName("expression")]
        public required Expression Expression { get; init; }
        [JsonPropertyName("is")]
        public required Snippet_KindSnippetIf_Is Is { get; init; }
        [JsonPropertyName("then")]
        public required List<BodyPiece> Then { get; init; }
        [JsonPropertyName("else")]
        public required List<BodyPiece> Else { get; init; }
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    file enum Snippet_KindSnippetIf_Is
    {
        [JsonStringEnumMemberName("not-null")]
        NotNull,
        [JsonStringEnumMemberName("not-empty")]
        NotEmpty,
        [JsonStringEnumMemberName("true")]
        True,
    }

    file record Snippet_KindSnippetSwitch : Snippet
    {
        [JsonInclude]
        [JsonPropertyName("kind")]
        private readonly string Kind = "snippet-switch";
        [JsonPropertyName("expression")]
        public required Expression Expression { get; init; }
        [JsonPropertyName("branches")]
        public required Dictionary<string, List<BodyPiece>> Branches { get; init; }
    }

    file record Tool
    {
        [JsonPropertyName("id")]
        public required string Id { get; init; }
        [JsonPropertyName("name")]
        public required string Name { get; init; }
        [JsonPropertyName("description")]
        public required string Description { get; init; }
        [JsonPropertyName("outputJsonSchema")]
        public JsonElement? OutputJsonSchema { get; init; }
    }
}  // namespace Spec
// </generated:spec>
