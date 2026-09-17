import com.example.prompts.*
import com.openai.client.OpenAIClient
import com.openai.client.okhttp.OpenAIOkHttpClient
import com.openai.core.JsonValue
import com.openai.models.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*

/**
 * Generic helper to execute any TypePrompt prompt with OpenAI.
 */
suspend fun <Output, ToolExecutor> executePrompt(
    client: OpenAIClient,
    prompt: Prompt<Output, ToolExecutor>,
    toolExecutor: ToolExecutor,
): Output {
    // 1. Prepare tools for OpenAI from prompt.tools
    val tools: List<ChatCompletionTool> = prompt.tools.values.map { t ->
        val jsonMap: Map<String, JsonValue> = (t.inputJsonSchema as? JsonObject)?.mapValues { (_, v) ->
            JsonValue.from(v.toString())
        } ?: emptyMap()

        ChatCompletionTool.builder()
            .function(
                FunctionDefinition.builder()
                    .name(t.name)
                    .description(t.description)
                    .parameters(FunctionParameters.builder().putAllAdditionalProperties(jsonMap).build())
                    .build()
            )
            .build()
    }

    // 2. Format initial messages
    val messages = mutableListOf<ChatCompletionMessageParam>()
    messages.add(
        ChatCompletionMessageParam.ofSystem(
            ChatCompletionSystemMessageParam.builder().content(prompt.systemMessage).build()
        )
    )

    for (example in prompt.examples) {
        messages.add(
            ChatCompletionMessageParam.ofUser(
                ChatCompletionUserMessageParam.builder().content(example.userMessage).build()
            )
        )
        messages.add(
            ChatCompletionMessageParam.ofAssistant(
                ChatCompletionAssistantMessageParam.builder().content(example.response).build()
            )
        )
    }

    messages.add(
        ChatCompletionMessageParam.ofUser(
            ChatCompletionUserMessageParam.builder().content(prompt.userMessage).build()
        )
    )

    // 3. Tool execution & completion loop
    while (true) {
        val params = ChatCompletionCreateParams.builder()
            .model(ChatModel.GPT_4O)
            .messages(messages)
            .apply {
                if (tools.isNotEmpty()) tools(tools)
                if (prompt.outputFormat is JsonOutputFormat) {
                    val jsonFormat = prompt.outputFormat as JsonOutputFormat
                    val schemaMap: Map<String, JsonValue> = (jsonFormat.jsonSchema as? JsonObject)?.mapValues { (_, v) ->
                        JsonValue.from(v.toString())
                    } ?: emptyMap()

                    responseFormat(
                        ResponseFormatJsonSchema.builder()
                            .jsonSchema(
                                ResponseFormatJsonSchema.JsonSchema.builder()
                                    .name("output")
                                    .strict(true)
                                    .schema(ResponseFormatJsonSchema.JsonSchema.Schema.builder().putAllAdditionalProperties(schemaMap).build())
                                    .build()
                            )
                            .build()
                    )
                }
            }
            .build()

        val response = client.chat().completions().create(params)
        val choice = response.choices().firstOrNull() ?: error("No choices returned by OpenAI")
        val message = choice.message()

        // If the model requested tool calls, execute them with prompt.executeTools()
        val toolCalls = message.toolCalls().orElse(emptyList())
        if (toolCalls.isNotEmpty()) {
            val toolCallsToExecute = toolCalls.map { tc ->
                com.example.prompts.ToolCall(
                    callId = tc.id(),
                    toolName = tc.function().name(),
                    stringifiedInput = tc.function().arguments(),
                )
            }

            val toolResults = prompt.executeTools(toolCallsToExecute, toolExecutor)

            for (result in toolResults) {
                messages.add(
                    ChatCompletionMessageParam.ofTool(
                        ChatCompletionToolMessageParam.builder()
                            .toolCallId(result.callId)
                            .content(result.stringifiedOutput)
                            .build()
                    )
                )
            }
            continue
        }

        // Final response: parse and validate into typed Output
        val content = message.content().orElse("")
        return prompt.parseResponse(content)
    }
}

fun main(args: Array<String>) = runBlocking {
    val text = args.getOrNull(0) ?: "Hello world! TypePrompt brings type safety to LLM prompts."
    val targetLanguage = args.getOrNull(1) ?: "French"

    val apiKey = System.getenv("OPENAI_API_KEY")
    if (apiKey.isNullOrBlank()) {
        System.err.println("Error: OPENAI_API_KEY environment variable is not set.")
        System.err.println("Please set OPENAI_API_KEY to run the translation against OpenAI.")
        System.err.println("Usage: OPENAI_API_KEY=\"sk-...\" ./gradlew run --args=\"'Hello world' 'Spanish'\"")
        return@runBlocking
    }

    val client: OpenAIClient = OpenAIOkHttpClient.fromEnv()

    println("Translating: \"$text\" -> $targetLanguage\n")

    // 1. Render the typed prompt
    val prompt = prompts.renderTranslate(
        Schema.Translate.Input(
            text = text,
            targetLanguage = targetLanguage,
        )
    )

    // 2. Execute the prompt with OpenAI
    val translation = executePrompt(client, prompt, NoTools)

    println("Translation:\n$translation")
}
