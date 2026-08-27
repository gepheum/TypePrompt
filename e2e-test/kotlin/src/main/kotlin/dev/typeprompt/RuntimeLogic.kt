package dev.typeprompt

// <static:kotlin-imports>
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
// </static:kotlin-imports>

fun getGreeting(): String {
    return "Hello, World!"
}

fun main() {
    println(getGreeting())
}
