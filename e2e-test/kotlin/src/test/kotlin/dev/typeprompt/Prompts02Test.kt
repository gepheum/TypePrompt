package dev.typeprompt

import com.example.prompts02.Schema
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class Prompts02Test {
    private val json = Json

    @Test
    fun testMetaSerializationWithTemperature() {
        val meta =
            Schema.Meta.Meta(
                model = Schema.Meta.Meta_Model.Gpt4o,
                temperature = 0.7,
            )
        val serialized = json.encodeToString(meta)
        assertEquals("""{"model":"gpt-4o","temperature":0.7}""", serialized)
        val deserialized = json.decodeFromString<Schema.Meta.Meta>(serialized)
        assertEquals(meta, deserialized)
    }

    @Test
    fun testMetaSerializationWithNullTemperature() {
        val meta =
            Schema.Meta.Meta(
                model = Schema.Meta.Meta_Model.Gpt4oMini,
                temperature = null,
            )
        val serialized = json.encodeToString(meta)
        assertEquals("""{"model":"gpt-4o-mini","temperature":null}""", serialized)
        val deserialized = json.decodeFromString<Schema.Meta.Meta>(serialized)
        assertEquals(meta, deserialized)
        assertNull(deserialized.temperature)
    }

    @Test
    fun testTriageTicketInputSerialization() {
        val input =
            Schema.TriageTicket.Input(
                subject = "Login issue",
                body = "Cannot login on mobile app",
                customerTier = Schema.TriageTicket.Input_CustomerTier.Enterprise,
                recentTickets =
                    listOf(
                        Schema.TriageTicket.Input_RecentTickets(
                            id = "T-101",
                            summary = "Password reset",
                            category = Schema.TriageTicket.TicketCategory.TechnicalIssue,
                        ),
                        Schema.TriageTicket.Input_RecentTickets(
                            id = "T-102",
                            summary = "Invoice request",
                            category = Schema.TriageTicket.TicketCategory.Billing,
                        ),
                    ),
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.TriageTicket.Input>(serialized)
        assertEquals(input, deserialized)
        assertEquals(2, deserialized.recentTickets.size)
        assertEquals(Schema.TriageTicket.TicketCategory.TechnicalIssue, deserialized.recentTickets[0].category)
    }

    @Test
    fun testTriageTicketInputEmptyRecentTickets() {
        val input =
            Schema.TriageTicket.Input(
                subject = "Question",
                body = "General inquiry",
                customerTier = Schema.TriageTicket.Input_CustomerTier.Free,
                recentTickets = emptyList(),
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.TriageTicket.Input>(serialized)
        assertEquals(input, deserialized)
        assertEquals(emptyList(), deserialized.recentTickets)
    }

    @Test
    fun testTriageTicketOutputSerializationWithReply() {
        val output =
            Schema.TriageTicket.Output(
                category = Schema.TriageTicket.TicketCategory.FeatureRequest,
                urgency = Schema.TriageTicket.Output_Urgency.Low,
                summary = "Customer requested dark mode",
                suggestedActions = listOf("Log feature request in Jira", "Notify product team"),
                suggestedReply = "Thanks for the feedback! We have logged this request.",
            )
        val serialized = json.encodeToString(output)
        val deserialized = json.decodeFromString<Schema.TriageTicket.Output>(serialized)
        assertEquals(output, deserialized)
    }

    @Test
    fun testTriageTicketOutputSerializationWithoutReply() {
        val output =
            Schema.TriageTicket.Output(
                category = Schema.TriageTicket.TicketCategory.Other,
                urgency = Schema.TriageTicket.Output_Urgency.Critical,
                summary = "Severe outage reported",
                suggestedActions = emptyList(),
                suggestedReply = null,
            )
        val serialized = json.encodeToString(output)
        val deserialized = json.decodeFromString<Schema.TriageTicket.Output>(serialized)
        assertEquals(output, deserialized)
        assertNull(deserialized.suggestedReply)
    }
}
