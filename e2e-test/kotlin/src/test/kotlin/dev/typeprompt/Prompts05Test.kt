package dev.typeprompt

import com.example.prompts05.Schema
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class Prompts05Test {
    private val json = Json

    @Test
    fun testSummarizeDocumentInputWithFocusTopic() {
        val input =
            Schema.SummarizeDocument.Input(
                title = "Quarterly Report",
                content = "Detailed quarterly performance analysis...",
                focusTopic = "Revenue Growth",
                audience = Schema.SummarizeDocument.Input_Audience.Executive,
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.SummarizeDocument.Input>(serialized)
        assertEquals(input, deserialized)
        assertEquals("Revenue Growth", deserialized.focusTopic)
    }

    @Test
    fun testSummarizeDocumentInputWithoutFocusTopic() {
        val input =
            Schema.SummarizeDocument.Input(
                title = "Tech Specs",
                content = "Architecture overview...",
                focusTopic = null,
                audience = Schema.SummarizeDocument.Input_Audience.Technical,
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.SummarizeDocument.Input>(serialized)
        assertEquals(input, deserialized)
        assertNull(deserialized.focusTopic)
    }

    @Test
    fun testSummarizeDocumentOutputSerialization() {
        val output =
            Schema.SummarizeDocument.Output(
                summary = "Summary of document.",
                keyPoints = listOf("Point 1", "Point 2", "Point 3"),
            )
        val serialized = json.encodeToString(output)
        val deserialized = json.decodeFromString<Schema.SummarizeDocument.Output>(serialized)
        assertEquals(output, deserialized)
        assertEquals(3, deserialized.keyPoints.size)
    }
}
