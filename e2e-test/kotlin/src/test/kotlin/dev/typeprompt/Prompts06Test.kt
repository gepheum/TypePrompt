package dev.typeprompt

import com.example.prompts06.Schema
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class Prompts06Test {
    private val json = Json

    @Test
    fun testWriteComparisonArticlePricingWithOverage() {
        val pricing =
            Schema.WriteComparisonArticle.Pricing(
                model = Schema.WriteComparisonArticle.Pricing_Model.PerHour,
                basePrice = 0.045,
                overage = 0.01,
            )
        val serialized = json.encodeToString(pricing)
        val deserialized = json.decodeFromString<Schema.WriteComparisonArticle.Pricing>(serialized)
        assertEquals(pricing, deserialized)
    }

    @Test
    fun testWriteComparisonArticlePricingWithoutOverage() {
        val pricing =
            Schema.WriteComparisonArticle.Pricing(
                model = Schema.WriteComparisonArticle.Pricing_Model.PerMonth,
                basePrice = 29.99,
                overage = null,
            )
        val serialized = json.encodeToString(pricing)
        val deserialized = json.decodeFromString<Schema.WriteComparisonArticle.Pricing>(serialized)
        assertEquals(pricing, deserialized)
        assertNull(deserialized.overage)
    }

    @Test
    fun testWriteComparisonArticleInputSerialization() {
        val input =
            Schema.WriteComparisonArticle.Input(
                providers =
                    listOf(
                        Schema.WriteComparisonArticle.Provider(
                            name = "CloudHost A",
                            region = "us-east-1",
                            category = Schema.WriteComparisonArticle.ProductCategory.Compute,
                            pricing =
                                Schema.WriteComparisonArticle.Pricing(
                                    model = Schema.WriteComparisonArticle.Pricing_Model.PerHour,
                                    basePrice = 0.05,
                                    overage = null,
                                ),
                            benchmarks =
                                listOf(
                                    Schema.WriteComparisonArticle.Benchmark(
                                        name = "Geekbench",
                                        score = 4200.5,
                                        unit = "points",
                                    ),
                                ),
                            pros = listOf("Fast CPU", "Low latency network"),
                            cons = listOf("Higher cost"),
                        ),
                    ),
                useCase = "High performance computing workloads",
                audience = Schema.WriteComparisonArticle.Input_Audience.Architect,
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.WriteComparisonArticle.Input>(serialized)
        assertEquals(input, deserialized)
    }

    @Test
    fun testWriteComparisonArticleOutputSerialization() {
        val output =
            Schema.WriteComparisonArticle.Output(
                title = "Cloud Compute Comparison 2026",
                introduction = "In this article, we compare top cloud providers...",
                sections =
                    listOf(
                        Schema.WriteComparisonArticle.Output_Sections(
                            providerName = "CloudHost A",
                            body = "CloudHost A offers exceptional single-thread performance...",
                        ),
                    ),
                conclusion = "Both options have merits.",
                recommendation = "Use CloudHost A for raw compute.",
            )
        val serialized = json.encodeToString(output)
        val deserialized = json.decodeFromString<Schema.WriteComparisonArticle.Output>(serialized)
        assertEquals(output, deserialized)
    }
}
