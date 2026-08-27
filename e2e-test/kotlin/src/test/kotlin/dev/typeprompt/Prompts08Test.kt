package dev.typeprompt

import com.example.prompts08.Schema
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class Prompts08Test {
    private val json = Json

    @Test
    fun testLegalSharedPartyRoles() {
        for (role in Schema.Legal.Shared.Party_Role.entries) {
            val party =
                Schema.Legal.Shared.Party(
                    name = "Acme Corp",
                    role = role,
                    jurisdiction = "Delaware",
                )
            val serialized = json.encodeToString(party)
            val deserialized = json.decodeFromString<Schema.Legal.Shared.Party>(serialized)
            assertEquals(party, deserialized)
            assertEquals(role, deserialized.role)
        }
    }

    @Test
    fun testLegalSummarizeClauseInputAndOutput() {
        val input =
            Schema.Legal.SummarizeClause.Input(
                clauseText = "Neither party shall be liable for indirect damages.",
                reviewingParty =
                    Schema.Legal.Shared.Party(
                        name = "Client X",
                        role = Schema.Legal.Shared.Party_Role.Client,
                        jurisdiction = "California",
                    ),
            )
        val serializedInput = json.encodeToString(input)
        val deserializedInput = json.decodeFromString<Schema.Legal.SummarizeClause.Input>(serializedInput)
        assertEquals(input, deserializedInput)

        val output =
            Schema.Legal.SummarizeClause.Output(
                plainEnglishSummary = "Mutual waiver of consequential damages.",
                potentialRisks = listOf("Limits recovery in case of breach"),
                assessment = Schema.Legal.SummarizeClause.Output_Assessment.Standard,
            )
        val serializedOutput = json.encodeToString(output)
        val deserializedOutput = json.decodeFromString<Schema.Legal.SummarizeClause.Output>(serializedOutput)
        assertEquals(output, deserializedOutput)
    }

    @Test
    fun testLegalDraftNdaInput() {
        val input =
            Schema.Legal.DraftNda.Input(
                disclosingParty =
                    Schema.Legal.Shared.Party(
                        name = "Innovate LLC",
                        role = Schema.Legal.Shared.Party_Role.Client,
                        jurisdiction = "New York",
                    ),
                receivingParty =
                    Schema.Legal.Shared.Party(
                        name = "Partner Inc",
                        role = Schema.Legal.Shared.Party_Role.Counterparty,
                        jurisdiction = "New York",
                    ),
                purposeOfDisclosure = "Evaluating joint venture opportunity",
                durationYears = 3,
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.Legal.DraftNda.Input>(serialized)
        assertEquals(input, deserialized)
        assertEquals(3, deserialized.durationYears)
    }

    @Test
    fun testFinanceCurrencyAndMoneyAmount() {
        val currencies =
            listOf(
                Schema.Finance.Shared.Currency.Usd to """"USD"""",
                Schema.Finance.Shared.Currency.Eur to """"EUR"""",
                Schema.Finance.Shared.Currency.Gbp to """"GBP"""",
                Schema.Finance.Shared.Currency.Jpy to """"JPY"""",
            )
        for ((currency, expectedJson) in currencies) {
            val serialized = json.encodeToString(currency)
            assertEquals(expectedJson, serialized)
            val deserialized = json.decodeFromString<Schema.Finance.Shared.Currency>(serialized)
            assertEquals(currency, deserialized)

            val amount = Schema.Finance.Shared.MoneyAmount(value = 1500.50, currency = currency)
            val serializedAmount = json.encodeToString(amount)
            val deserializedAmount = json.decodeFromString<Schema.Finance.Shared.MoneyAmount>(serializedAmount)
            assertEquals(amount, deserializedAmount)
        }
    }

    @Test
    fun testFinanceSummarizeTransaction() {
        val input =
            Schema.Finance.SummarizeTransaction.Input(
                description = "Monthly AWS cloud hosting invoice",
                amount = Schema.Finance.Shared.MoneyAmount(1200.0, Schema.Finance.Shared.Currency.Usd),
                category = Schema.Finance.SummarizeTransaction.Input_Category.Expense,
                date = "2026-08-01",
            )
        val serializedInput = json.encodeToString(input)
        val deserializedInput = json.decodeFromString<Schema.Finance.SummarizeTransaction.Input>(serializedInput)
        assertEquals(input, deserializedInput)

        val output =
            Schema.Finance.SummarizeTransaction.Output(
                summary = "AWS Infrastructure expense for August 2026",
                bookkeepingLabel = "Hosting & Infrastructure",
            )
        val serializedOutput = json.encodeToString(output)
        val deserializedOutput = json.decodeFromString<Schema.Finance.SummarizeTransaction.Output>(serializedOutput)
        assertEquals(output, deserializedOutput)
    }

    @Test
    fun testFinanceDetectAnomalyOutputWithAndWithoutReason() {
        val anomalyOutput =
            Schema.Finance.DetectAnomaly.Output(
                isAnomaly = true,
                reason = "Amount is 5x higher than average monthly spend",
            )
        val serializedAnomaly = json.encodeToString(anomalyOutput)
        val deserializedAnomaly = json.decodeFromString<Schema.Finance.DetectAnomaly.Output>(serializedAnomaly)
        assertEquals(anomalyOutput, deserializedAnomaly)
        assertTrue(deserializedAnomaly.isAnomaly)

        val normalOutput =
            Schema.Finance.DetectAnomaly.Output(
                isAnomaly = false,
                reason = null,
            )
        val serializedNormal = json.encodeToString(normalOutput)
        val deserializedNormal = json.decodeFromString<Schema.Finance.DetectAnomaly.Output>(serializedNormal)
        assertEquals(normalOutput, deserializedNormal)
        assertNull(deserializedNormal.reason)
    }
}
