package dev.typeprompt

import com.example.prompts03.Schema
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class Prompts03Test {
    private val json = Json

    @Test
    fun testResearchQuestionInputSerialization() {
        val input =
            Schema.ResearchQuestion.Input(
                question = "What is the capital of France?",
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.ResearchQuestion.Input>(serialized)
        assertEquals(input, deserialized)
    }

    @Test
    fun testResearchQuestionOutputSerialization() {
        val output =
            Schema.ResearchQuestion.Output(
                answer = "Paris is the capital of France.",
                sources = listOf("https://en.wikipedia.org/wiki/Paris", "https://france.fr"),
            )
        val serialized = json.encodeToString(output)
        val deserialized = json.decodeFromString<Schema.ResearchQuestion.Output>(serialized)
        assertEquals(output, deserialized)
        assertEquals(2, deserialized.sources.size)
    }

    @Test
    fun testResearchQuestionOutputEmptySources() {
        val output =
            Schema.ResearchQuestion.Output(
                answer = "General knowledge answer.",
                sources = emptyList(),
            )
        val serialized = json.encodeToString(output)
        val deserialized = json.decodeFromString<Schema.ResearchQuestion.Output>(serialized)
        assertEquals(output, deserialized)
        assertEquals(emptyList(), deserialized.sources)
    }

    @Test
    fun testWebSearchInputSerialization() {
        val input =
            Schema.WebSearch.Input(
                query = "kotlinx serialization polymorphism",
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.WebSearch.Input>(serialized)
        assertEquals(input, deserialized)
    }

    @Test
    fun testWebSearchOutputSerialization() {
        val output =
            Schema.WebSearch.Output(
                results =
                    listOf(
                        Schema.WebSearch.Output_Results(
                            title = "Kotlinx Serialization Guide",
                            url = "https://github.com/Kotlin/kotlinx.serialization",
                            snippet = "Kotlin multiplatform serialization library",
                        ),
                    ),
            )
        val serialized = json.encodeToString(output)
        val deserialized = json.decodeFromString<Schema.WebSearch.Output>(serialized)
        assertEquals(output, deserialized)
        assertEquals(1, deserialized.results.size)
        assertEquals("Kotlinx Serialization Guide", deserialized.results[0].title)
    }
}
