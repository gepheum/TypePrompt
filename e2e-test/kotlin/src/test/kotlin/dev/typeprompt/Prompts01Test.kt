package dev.typeprompt

import com.example.prompts01.Schema
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class Prompts01Test {
    private val json = Json

    @Test
    fun testTranslateInputSerialization() {
        val input =
            Schema.Translate.Input(
                text = "Hello world",
                targetLanguage = "French",
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.Translate.Input>(serialized)
        assertEquals(input, deserialized)
        assertEquals("Hello world", deserialized.text)
        assertEquals("French", deserialized.targetLanguage)
    }

    @Test
    fun testTranslateInputSpecialCharacters() {
        val input =
            Schema.Translate.Input(
                text = "Line 1\nLine 2\t\"quoted\" and unicode: 🚀",
                targetLanguage = "zh-CN",
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.Translate.Input>(serialized)
        assertEquals(input, deserialized)
    }

    @Test
    fun testTranslateInputEmptyStrings() {
        val input =
            Schema.Translate.Input(
                text = "",
                targetLanguage = "",
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.Translate.Input>(serialized)
        assertEquals(input, deserialized)
    }
}
