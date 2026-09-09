package dev.typeprompt

// <static:kotlin-imports>
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.encodeToString
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// </static:kotlin-imports>

// <static:kotlin-public-types>
interface Template<in Input, out Output, in ToolExecutor> {
    fun render(input: Input): Prompt<Output, ToolExecutor>
}

data class Prompt<out Output, in ToolExecutor>(
    val meta: Meta,
    val systemMessage: String,
    val userMessage: String,
    val examples: List<FewShotExample>,
    val tools: Map<String, Tool>,
    val outputFormat: OutputFormat,
    val templateId: TemplateId,
) {
    fun parseResponse(response: String): Output {
        when (outputFormat) {
            is JsonOutputFormat -> {
                var cleaned = response.trim()
                if (cleaned.startsWith("```")) {
                    cleaned = cleaned.replace(Regex("""^```(?:json)?\s*\n?([\s\S]*?)\n?```$"""), "$1").trim()
                }
                try {
                    val jsonElement = Json.parseToJsonElement(cleaned)
                    @Suppress("UNCHECKED_CAST")
                    return jsonElement as Output
                } catch (e: SerializationException) {
                    throw SerializationException("Template '$templateId': ${e.message}", e)
                }
            }

            is TextOutputFormat -> {
                @Suppress("UNCHECKED_CAST")
                return response as Output
            }
        }
    }

    suspend fun executeTools(
        toolCalls: List<ToolCall>,
        toolExecutor: ToolExecutor,
    ): List<ToolCallResponse> {
        val namespace = templateId.toString().split(':')[0]
        return toolCalls.map { call ->
            executeToolCall(call, namespace, toolExecutor as Any)
        }
    }
}


sealed class OutputFormat

data class JsonOutputFormat(
    val stringifiedJsonSchema: String,
) : OutputFormat()

class TextOutputFormat : OutputFormat()

data class Tool(
    val name: String,
    val description: String,
)

/**
 * A single few-shot example consisting of a user message, optional intermediate
 * tool-call steps, and the expected response.
 */
data class FewShotExample(
    val userMessage: String,
    val intermediateSteps: List<IntermediateStepExample>,
    val response: String,
)

/**
 * One intermediate step within a few-shot example, containing the tool
 * calls made at that step.
 */
data class IntermediateStepExample(
    val toolCalls: List<ToolCallExample>,
)

/** A single tool call recorded inside an intermediate step. */
data class ToolCallExample(
    val callId: String,
    val toolName: String,
    val stringifiedInput: String,
    val stringifiedOutput: String,
)

data class ToolCall(
    val callId: String,
    val toolName: String,
    val stringifiedInput: String,
)

data class ToolCallResponse(
    val callId: String,
    val stringifiedOutput: String,
)

object NoTools
// </static:kotlin-public-types>

/** Uniquely identifies a prompt template. */
enum class TemplateId(private val id: String) {
    TODO("Main:Todo");

    override fun toString(): String = id
}

enum class Meta { Default }

@Suppress("unused")
private suspend fun executeToolCall(
    toolCall: ToolCall,
    namespace: String,
    executor: Any,
): ToolCallResponse {
    throw NotImplementedError()
}

// <static:kotlin-logic>
private fun parseMeta(element: JsonElement?): Meta {
    if (element == null) return null as Meta
    return Json.decodeFromJsonElement<Meta>(element)
}
// </static:kotlin-logic>

// <generated:spec>
internal object Spec {
    // Exported as 'Spec.Templates'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Templates(
        val edition: Int,
        val signature: String,
        val templates: Map<String, Template>,
        val tools: Map<String, Tool>,
        val singleNamespace: Boolean,
        /** The key is a relative path to a .xml file. The value is the file content. */
        val sourceFiles: Map<String, String>,
    ) {}

    // Exported as 'Spec.Template'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Template(
        val name: String,
        val namespace: String,
        val outputFormat: OutputFormat,
        val tools: List<TemplateTool>,
        val contents: TemplateContents,
        val snippets: Map<String, Snippet>,
        @kotlinx.serialization.EncodeDefault val outputJsonSchema: JsonElement? = null,
    ) {}

    // Exported as 'Spec.OutputFormat'
    @Serializable
    enum class OutputFormat {
        @SerialName("json")
        Json,

        @SerialName("text")
        Text,
    }

    // Exported as 'Spec.TemplateTool'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class TemplateTool(
        val id: String,
        val name: String,
    ) {}

    // Exported as 'Spec.TemplateContents'
    @Serializable(with = TemplateContents_Serializer::class)
    sealed interface TemplateContents {}

    private object TemplateContents_Serializer :
        JsonContentPolymorphicSerializer<TemplateContents>(TemplateContents::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<TemplateContents> {
            return when (val kind = element.jsonObject["kind"]?.jsonPrimitive?.contentOrNull) {
                "no-variants" -> TemplateContents_KindNoVariants.serializer()
                "variants" -> TemplateContents_KindVariants.serializer()
                else -> throw IllegalArgumentException("Unknown discriminant: '${kind}'")
            }
        }
    }

    // Exported as 'Spec.TemplateContents_KindNoVariants'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("no-variants")
    data class TemplateContents_KindNoVariants private constructor(
        val kind: String,
        val content: TemplateContent,
    ) : TemplateContents {
        constructor(
            content: TemplateContent,
        ) : this(
            kind = "no-variants",
            content = content,
        )
    }

    // Exported as 'Spec.TemplateContents_KindVariants'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("variants")
    data class TemplateContents_KindVariants private constructor(
        val kind: String,
        val variants: Map<String, TemplateContent>,
        val defaultContent: TemplateContent,
    ) : TemplateContents {
        constructor(
            variants: Map<String, TemplateContent>,
            defaultContent: TemplateContent,
        ) : this(
            kind = "variants",
            variants = variants,
            defaultContent = defaultContent,
        )
    }

    // Exported as 'Spec.TemplateContent'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class TemplateContent(
        @kotlinx.serialization.EncodeDefault val meta: JsonElement? = null,
        @kotlinx.serialization.EncodeDefault val system: List<BodyPiece>? = null,
        @kotlinx.serialization.EncodeDefault val user: List<BodyPiece>? = null,
        @kotlinx.serialization.EncodeDefault val examples: List<FewShotExample>? = null,
    ) {}

    // Exported as 'Spec.FewShotExample'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class FewShotExample(
        val input: JsonElement,
        val output: JsonElement,
        val intermediateSteps: List<FewShotExample_IntermediateSteps>,
    ) {}

    // Exported as 'Spec.FewShotExample_IntermediateSteps'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class FewShotExample_IntermediateSteps(
        val toolCalls: List<ToolCallExample>,
    ) {}

    // Exported as 'Spec.ToolCallExample'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class ToolCallExample(
        val callId: String,
        val toolId: String,
        val toolName: String,
        val input: JsonElement,
        val output: JsonElement,
    ) {}

    // Exported as 'Spec.BodyPiece'
    @Serializable(with = BodyPiece_Serializer::class)
    sealed interface BodyPiece {}

    private object BodyPiece_Serializer : JsonContentPolymorphicSerializer<BodyPiece>(BodyPiece::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<BodyPiece> {
            return when (val kind = element.jsonObject["kind"]?.jsonPrimitive?.contentOrNull) {
                "text" -> BodyPiece_KindText.serializer()
                "insert-val" -> BodyPiece_KindInsertVal.serializer()
                "insert-snippet" -> BodyPiece_KindInsertSnippet.serializer()
                else -> throw IllegalArgumentException("Unknown discriminant: '${kind}'")
            }
        }
    }

    // Exported as 'Spec.BodyPiece_KindText'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("text")
    data class BodyPiece_KindText private constructor(
        val kind: String,
        val text: String,
    ) : BodyPiece {
        constructor(
            text: String,
        ) : this(
            kind = "text",
            text = text,
        )
    }

    // Exported as 'Spec.BodyPiece_KindInsertVal'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("insert-val")
    data class BodyPiece_KindInsertVal private constructor(
        val kind: String,
        val `val`: Expression,
        val format: InsertFormat,
        val indent: String,
    ) : BodyPiece {
        constructor(
            `val`: Expression,
            format: InsertFormat,
            indent: String,
        ) : this(
            kind = "insert-val",
            `val` = `val`,
            format = format,
            indent = indent,
        )
    }

    // Exported as 'Spec.BodyPiece_KindInsertSnippet'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("insert-snippet")
    data class BodyPiece_KindInsertSnippet private constructor(
        val kind: String,
        /** Snippet name. */
        val snippet: String,
        /** Only contains whitespace characters. */
        val indent: String,
    ) : BodyPiece {
        constructor(
            /** Snippet name. */
            snippet: String,
            /** Only contains whitespace characters. */
            indent: String,
        ) : this(
            kind = "insert-snippet",
            snippet = snippet,
            indent = indent,
        )
    }

    // Exported as 'Spec.InsertFormat'
    @Serializable
    enum class InsertFormat {
        @SerialName("text")
        Text,

        @SerialName("json")
        Json,

        @SerialName("yaml")
        Yaml,

        @SerialName("toon")
        Toon,

        @SerialName("csv")
        Csv,

        @SerialName("tsv")
        Tsv,
    }

    // Exported as 'Spec.Expression'
    @Serializable(with = Expression_Serializer::class)
    sealed interface Expression {}

    private object Expression_Serializer : JsonContentPolymorphicSerializer<Expression>(Expression::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<Expression> {
            return when (val kind = element.jsonObject["kind"]?.jsonPrimitive?.contentOrNull) {
                "input" -> Expression_KindInput.serializer()
                "property" -> Expression_KindProperty.serializer()
                else -> throw IllegalArgumentException("Unknown discriminant: '${kind}'")
            }
        }
    }

    // Exported as 'Spec.Expression_KindInput'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("input")
    data class Expression_KindInput private constructor(
        val kind: String,
    ) : Expression {
        constructor() : this(
            kind = "input",
        )
    }

    // Exported as 'Spec.Expression_KindProperty'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("property")
    data class Expression_KindProperty private constructor(
        val kind: String,
        val left: Expression,
        val property: String,
    ) : Expression {
        constructor(
            left: Expression,
            property: String,
        ) : this(
            kind = "property",
            left = left,
            property = property,
        )
    }

    // Exported as 'Spec.Snippet'
    @Serializable(with = Snippet_Serializer::class)
    sealed interface Snippet {}

    private object Snippet_Serializer : JsonContentPolymorphicSerializer<Snippet>(Snippet::class) {
        override fun selectDeserializer(element: JsonElement): DeserializationStrategy<Snippet> {
            return when (val kind = element.jsonObject["kind"]?.jsonPrimitive?.contentOrNull) {
                "snippet" -> Snippet_KindSnippet.serializer()
                "snippet-if" -> Snippet_KindSnippetIf.serializer()
                "snippet-switch" -> Snippet_KindSnippetSwitch.serializer()
                else -> throw IllegalArgumentException("Unknown discriminant: '${kind}'")
            }
        }
    }

    // Exported as 'Spec.Snippet_KindSnippet'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("snippet")
    data class Snippet_KindSnippet private constructor(
        val kind: String,
        val body: List<BodyPiece>,
    ) : Snippet {
        constructor(
            body: List<BodyPiece>,
        ) : this(
            kind = "snippet",
            body = body,
        )
    }

    // Exported as 'Spec.Snippet_KindSnippetIf'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("snippet-if")
    data class Snippet_KindSnippetIf private constructor(
        val kind: String,
        val expression: Expression,
        val `is`: Snippet_KindSnippetIf_Is,
        val then: List<BodyPiece>,
        val `else`: List<BodyPiece>,
    ) : Snippet {
        constructor(
            expression: Expression,
            `is`: Snippet_KindSnippetIf_Is,
            then: List<BodyPiece>,
            `else`: List<BodyPiece>,
        ) : this(
            kind = "snippet-if",
            expression = expression,
            `is` = `is`,
            then = then,
            `else` = `else`,
        )
    }

    // Exported as 'Spec.Snippet_KindSnippetIf_Is'
    @Serializable
    enum class Snippet_KindSnippetIf_Is {
        @SerialName("not-null")
        NotNull,

        @SerialName("not-empty")
        NotEmpty,

        @SerialName("true")
        True,
    }

    // Exported as 'Spec.Snippet_KindSnippetSwitch'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    @SerialName("snippet-switch")
    data class Snippet_KindSnippetSwitch private constructor(
        val kind: String,
        val expression: Expression,
        val branches: Map<String, List<BodyPiece>>,
    ) : Snippet {
        constructor(
            expression: Expression,
            branches: Map<String, List<BodyPiece>>,
        ) : this(
            kind = "snippet-switch",
            expression = expression,
            branches = branches,
        )
    }

    // Exported as 'Spec.Tool'
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class Tool(
        val id: String,
        val name: String,
        val description: String,
        @kotlinx.serialization.EncodeDefault val outputJsonSchema: JsonElement? = null,
    ) {}
}  // object Spec
// </generated:spec>

fun getGreeting(): String {
    return "Hello, World!"
}

fun main() {
    println(getGreeting())
}
