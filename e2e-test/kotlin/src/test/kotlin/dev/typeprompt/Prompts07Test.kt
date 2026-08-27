package dev.typeprompt

import com.example.prompts07.Schema
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class Prompts07Test {
    private val json = Json

    @Test
    fun testSharedAddressWithPostalCode() {
        val address =
            Schema.Shared.Address(
                street = "123 Main St",
                city = "San Francisco",
                country = "USA",
                postalCode = "94105",
            )
        val serialized = json.encodeToString(address)
        val deserialized = json.decodeFromString<Schema.Shared.Address>(serialized)
        assertEquals(address, deserialized)
    }

    @Test
    fun testSharedAddressWithoutPostalCode() {
        val address =
            Schema.Shared.Address(
                street = "Unknown St",
                city = "Dublin",
                country = "Ireland",
                postalCode = null,
            )
        val serialized = json.encodeToString(address)
        val deserialized = json.decodeFromString<Schema.Shared.Address>(serialized)
        assertEquals(address, deserialized)
        assertNull(deserialized.postalCode)
    }

    @Test
    fun testShippingConfirmationInputSerialization() {
        val contactInfo =
            Schema.Shared.ContactInfo(
                name = "Jane Doe",
                email = "jane@example.com",
                address =
                    Schema.Shared.Address(
                        street = "456 Market St",
                        city = "San Francisco",
                        country = "USA",
                        postalCode = "94105",
                    ),
            )
        val input =
            Schema.ShippingConfirmation.Input(
                recipient = contactInfo,
                orderNumber = "ORD-98765",
                estimatedDelivery = "2026-09-01",
                items =
                    listOf(
                        Schema.ShippingConfirmation.Input_Items(name = "Wireless Keyboard", quantity = 1),
                        Schema.ShippingConfirmation.Input_Items(name = "USB-C Cable", quantity = 3),
                    ),
            )
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.ShippingConfirmation.Input>(serialized)
        assertEquals(input, deserialized)
        assertEquals(2, deserialized.items.size)
        assertEquals(3, deserialized.items[1].quantity)
    }

    @Test
    fun testReturnSlipInputAllReturnReasons() {
        val contactInfo =
            Schema.Shared.ContactInfo(
                name = "John Smith",
                email = "john@example.com",
                address =
                    Schema.Shared.Address(
                        street = "10 Elm St",
                        city = "Boston",
                        country = "USA",
                        postalCode = "02108",
                    ),
            )
        for (reason in Schema.ReturnSlip.Input_ReturnReason.entries) {
            val input =
                Schema.ReturnSlip.Input(
                    customer = contactInfo,
                    returnReason = reason,
                    orderNumber = "RET-1234",
                )
            val serialized = json.encodeToString(input)
            val deserialized = json.decodeFromString<Schema.ReturnSlip.Input>(serialized)
            assertEquals(input, deserialized)
            assertEquals(reason, deserialized.returnReason)
        }
    }
}
