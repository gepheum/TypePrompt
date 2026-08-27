package dev.typeprompt

import com.example.prompts04.Schema
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class Prompts04Test {
    private val json = Json

    @Test
    fun testWriteProductDescriptionInputMarketingVariant() {
        val input =
            Schema.WriteProductDescription.Input(
                productName = "Ergonomic Chair",
                features = listOf("Lumbar support", "Breathable mesh", "Adjustable armrests"),
                variant = Schema.WriteProductDescription.Input_Variant.Marketing,
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.WriteProductDescription.Input>(serialized)
        assertEquals(input, deserialized)
        assertEquals(Schema.WriteProductDescription.Input_Variant.Marketing, deserialized.variant)
    }

    @Test
    fun testWriteProductDescriptionInputAllVariants() {
        for (variant in Schema.WriteProductDescription.Input_Variant.entries) {
            val input =
                Schema.WriteProductDescription.Input(
                    productName = "Gadget",
                    features = listOf("Feature A"),
                    variant = variant,
                )
            val serialized = json.encodeToString(input)
            val deserialized = json.decodeFromString<Schema.WriteProductDescription.Input>(serialized)
            assertEquals(input, deserialized)
        }
    }

    @Test
    fun testWriteProductDescriptionOutputSerialization() {
        val output =
            Schema.WriteProductDescription.Output(
                description = "Experience ultimate comfort with our Ergonomic Chair.",
            )
        val serialized = json.encodeToString(output)
        val deserialized = json.decodeFromString<Schema.WriteProductDescription.Output>(serialized)
        assertEquals(output, deserialized)
    }
}
