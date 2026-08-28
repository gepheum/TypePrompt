package dev.typeprompt

import com.example.prompts_e01.Meta
import com.example.prompts_e01.Schema
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PromptsE01Test {
    private val json = Json

    // ─── Meta Typealias ────────────────────────────────────────────────────────

    @Test
    fun testMetaTypealiasIsNull() {
        val meta: Meta = null
        assertNull(meta)
    }

    // ─── Expr Sealed Hierarchy Tests (String Discriminator) ────────────────────

    @Test
    fun testExprNumberSerialization() {
        val expr: Schema.Shared.Expr = Schema.Shared.Expr_KindNumber(value = 42.0)
        val serialized = json.encodeToString(expr)
        assertEquals("""{"kind":"number","value":42.0}""", serialized)
        val deserialized = json.decodeFromString<Schema.Shared.Expr>(serialized)
        assertEquals(expr, deserialized)
        assertIs<Schema.Shared.Expr_KindNumber>(deserialized)
        assertEquals(42.0, deserialized.value)
        assertEquals("number", deserialized.kind)
    }

    @Test
    fun testExprAddSerialization() {
        val expr: Schema.Shared.Expr =
            Schema.Shared.Expr_KindAdd(
                left = Schema.Shared.Expr_KindNumber(1.0),
                right = Schema.Shared.Expr_KindNumber(2.0),
            )
        val serialized = json.encodeToString(expr)
        assertEquals(
            """{"kind":"add","left":{"kind":"number","value":1.0},"right":{"kind":"number","value":2.0}}""",
            serialized,
        )
        val deserialized = json.decodeFromString<Schema.Shared.Expr>(serialized)
        assertEquals(expr, deserialized)
        assertIs<Schema.Shared.Expr_KindAdd>(deserialized)
    }

    @Test
    fun testExprIfSerialization() {
        val expr: Schema.Shared.Expr =
            Schema.Shared.Expr_KindIf(
                condition = Schema.Shared.Expr_KindNumber(1.0),
                then = Schema.Shared.Expr_KindNumber(100.0),
                `else` = Schema.Shared.Expr_KindNumber(200.0),
            )
        val serialized = json.encodeToString(expr)
        val expected =
            """{"kind":"if","condition":{"kind":"number","value":1.0},""" +
                """"then":{"kind":"number","value":100.0},"else":{"kind":"number","value":200.0}}"""
        assertEquals(expected, serialized)
        val deserialized = json.decodeFromString<Schema.Shared.Expr>(serialized)
        assertEquals(expr, deserialized)
        assertIs<Schema.Shared.Expr_KindIf>(deserialized)
    }

    // ─── AnalyzeSalesData Tests ────────────────────────────────────────────────

    @Test
    fun testAnalyzeSalesDataInputAndOutput() {
        val input =
            Schema.AnalyzeSalesData.Input(
                rows =
                    listOf(
                        Schema.AnalyzeSalesData.SalesRow("Widget A", 120, 240000, "north"),
                        Schema.AnalyzeSalesData.SalesRow("Widget B", 85, 340000, "south"),
                    ),
                question = "Top product?",
                variant = Schema.AnalyzeSalesData.Input_Variant.Csv,
            )
        val serializedInput = json.encodeToString(input)
        val deserializedInput = json.decodeFromString<Schema.AnalyzeSalesData.Input>(serializedInput)
        assertEquals(input, deserializedInput)
        assertEquals(Schema.AnalyzeSalesData.Input_Variant.Csv, deserializedInput.variant)

        val output =
            Schema.AnalyzeSalesData.Output(
                analysis = "Widget A generated the most revenue.",
                topProduct = "Widget A",
                totalRevenue = 580000.0,
            )
        val serializedOutput = json.encodeToString(output)
        val deserializedOutput = json.decodeFromString<Schema.AnalyzeSalesData.Output>(serializedOutput)
        assertEquals(output, deserializedOutput)
    }

    // ─── JsonElement Holder Tests (AnyHolder & SerializerHolder) ───────────────

    @Test
    fun testAnyHolderWithVariousJsonElements() {
        // String primitive
        val stringHolder = Schema.Shared.AnyHolder(any = JsonPrimitive("hello"))
        val serializedStr = json.encodeToString(stringHolder)
        assertEquals("""{"any":"hello"}""", serializedStr)
        assertEquals(stringHolder, json.decodeFromString<Schema.Shared.AnyHolder>(serializedStr))

        // Number primitive
        val numHolder = Schema.Shared.AnyHolder(any = JsonPrimitive(123))
        val serializedNum = json.encodeToString(numHolder)
        assertEquals("""{"any":123}""", serializedNum)
        assertEquals(numHolder, json.decodeFromString<Schema.Shared.AnyHolder>(serializedNum))

        // Double primitive
        val doubleHolder = Schema.Shared.AnyHolder(any = JsonPrimitive(3.14159))
        val serializedDouble = json.encodeToString(doubleHolder)
        assertEquals("""{"any":3.14159}""", serializedDouble)
        assertEquals(doubleHolder, json.decodeFromString<Schema.Shared.AnyHolder>(serializedDouble))

        // Boolean primitive
        val boolHolder = Schema.Shared.AnyHolder(any = JsonPrimitive(true))
        val serializedBool = json.encodeToString(boolHolder)
        assertEquals("""{"any":true}""", serializedBool)
        assertEquals(boolHolder, json.decodeFromString<Schema.Shared.AnyHolder>(serializedBool))

        // JsonObject
        val objHolder =
            Schema.Shared.AnyHolder(
                any = JsonObject(mapOf("key" to JsonPrimitive("value"), "nested" to JsonPrimitive(42))),
            )
        val serializedObj = json.encodeToString(objHolder)
        assertEquals(objHolder, json.decodeFromString<Schema.Shared.AnyHolder>(serializedObj))

        // JsonArray
        val arrHolder =
            Schema.Shared.AnyHolder(
                any = JsonArray(listOf(JsonPrimitive(1), JsonPrimitive(2), JsonPrimitive(3))),
            )
        val serializedArr = json.encodeToString(arrHolder)
        assertEquals(arrHolder, json.decodeFromString<Schema.Shared.AnyHolder>(serializedArr))

        // JsonNull
        val nullHolder = Schema.Shared.AnyHolder(any = JsonNull)
        val serializedNull = json.encodeToString(nullHolder)
        assertEquals("""{"any":null}""", serializedNull)
        assertEquals(nullHolder, json.decodeFromString<Schema.Shared.AnyHolder>(serializedNull))
    }

    @Test
    fun testSerializerHolderSerialization() {
        val holder = Schema.Shared.SerializerHolder(serializer = JsonPrimitive("customSerializerName"))
        val serialized = json.encodeToString(holder)
        assertEquals("""{"serializer":"customSerializerName"}""", serialized)
        assertEquals(holder, json.decodeFromString<Schema.Shared.SerializerHolder>(serialized))
    }

    // ─── Reserved Names Empty Classes Tests ────────────────────────────────────

    @Test
    fun testEmptyClassesSerialization() {
        val str = Schema.Shared.String_()
        assertEquals("{}", json.encodeToString(str))
        json.decodeFromString<Schema.Shared.String_>("{}")

        val bool = Schema.Shared.Boolean_()
        assertEquals("{}", json.encodeToString(bool))
        json.decodeFromString<Schema.Shared.Boolean_>("{}")

        val list = Schema.Shared.List_()
        assertEquals("{}", json.encodeToString(list))
        json.decodeFromString<Schema.Shared.List_>("{}")

        val map = Schema.Shared.Map_()
        assertEquals("{}", json.encodeToString(map))
        json.decodeFromString<Schema.Shared.Map_>("{}")

        val serializable = Schema.Shared.Serializable_()
        assertEquals("{}", json.encodeToString(serializable))
        json.decodeFromString<Schema.Shared.Serializable_>("{}")
    }

    // ─── MyTemplate & Output_Shape Tests ───────────────────────────────────────

    @Test
    fun testMyTemplateInputSerialization() {
        val input = Schema.MyTemplate.Input(text = "sample text")
        val serialized = json.encodeToString(input)
        val deserialized = json.decodeFromString<Schema.MyTemplate.Input>(serialized)
        assertEquals(input, deserialized)
        assertEquals("sample text", deserialized.text)
    }

    @Test
    fun testMyTemplateOutputWithCircle() {
        val shape: Schema.MyTemplate.Output_Shape = Schema.MyTemplate.Output_Shape_KindCircle(radius = 5.5)
        val output =
            Schema.MyTemplate.Output(
                reversedText = "olleh",
                shape = shape,
            )
        val serialized = json.encodeToString(output)
        val deserialized = json.decodeFromString<Schema.MyTemplate.Output>(serialized)
        assertEquals(output, deserialized)
        assertIs<Schema.MyTemplate.Output_Shape_KindCircle>(deserialized.shape)
        assertEquals(5.5, deserialized.shape.radius)
    }

    // ─── EnumWithCommonFields Tests (Boolean Discriminant) ─────────────────────

    @Test
    fun testEnumWithCommonFieldsSuccessSerializationAndDeserialization() {
        val jsonString = """{"success":true,"x":10,"y":20.5,"z":99}"""
        val deserialized = json.decodeFromString<Schema.Shared.EnumWithCommonFields>(jsonString)
        assertIs<Schema.Shared.EnumWithCommonFields_Success>(deserialized)
        assertEquals(10, deserialized.x)
        assertEquals(20.5, deserialized.y)
        assertEquals(99, deserialized.z)
        assertTrue(deserialized.success)

        val reserialized = json.encodeToString<Schema.Shared.EnumWithCommonFields>(deserialized)
        val roundtrip = json.decodeFromString<Schema.Shared.EnumWithCommonFields>(reserialized)
        assertEquals(deserialized, roundtrip)
    }

    @Test
    fun testEnumWithCommonFieldsNotSuccessSerializationAndDeserialization() {
        val jsonString = """{"success":false,"x":5,"y":15.0,"z":"failure-reason"}"""
        val deserialized = json.decodeFromString<Schema.Shared.EnumWithCommonFields>(jsonString)
        assertIs<Schema.Shared.EnumWithCommonFields_NotSuccess>(deserialized)
        assertEquals(5, deserialized.x)
        assertEquals(15.0, deserialized.y)
        assertEquals("failure-reason", deserialized.z)
        assertFalse(deserialized.success)

        val reserialized = json.encodeToString<Schema.Shared.EnumWithCommonFields>(deserialized)
        val roundtrip = json.decodeFromString<Schema.Shared.EnumWithCommonFields>(reserialized)
        assertEquals(deserialized, roundtrip)
    }

    @Test
    fun testSchema_WrapperSerializationAndDeserialization() {
        val wrapper = Schema.Shared.Schema_(e = Schema.Shared.EnumWithCommonFields_Success(x = 1, y = 2.0, z = 3))
        val serialized = json.encodeToString(wrapper)
        val deserialized = json.decodeFromString<Schema.Shared.Schema_>(serialized)
        assertEquals(wrapper, deserialized)
    }
}
