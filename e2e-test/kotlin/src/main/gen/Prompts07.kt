typealias Meta = Schema.Meta.Meta;

/** Namespace containing the user-defined datatypes. */
object Schema {
  object Meta {
    // Exported as 'Schema.Meta.Meta'
    @Serializable
    data class Meta(
      val model:
      /** Sampling temperature (0-2). */
      val temperature: Double?
    ) {}

    // Exported as 'Schema.Meta.Meta_Model'
    @Serializable
    enum class Meta_Model {
      @SerialName("gpt-4o")
      Gpt4o
      @SerialName("gpt-4o-mini")
      Gpt4oMini
    }
  }

  object Shared {
    // Exported as 'Schema.Shared.Address'
    @Serializable
    data class Address(
      val street: String
      val city: String
      val country: String
      val postalCode: String?
    ) {}

    // Exported as 'Schema.Shared.ContactInfo'
    @Serializable
    data class ContactInfo(
      val name: String
      val email: String
      val address: {}
    ) {}
  }

  object ShippingConfirmation {
    // Exported as 'Schema.ShippingConfirmation.Input'
    @Serializable
    data class Input(
      val recipient: {}
      val orderNumber: String
      val estimatedDelivery: String
      val items: readonly {}[]
    ) {}

    // Exported as 'Schema.ShippingConfirmation.Input_Items'
    @Serializable
    data class Input_Items(
      val name: String
      val quantity: Int
    ) {}

    typealias Output = String
  }

  object ReturnSlip {
    // Exported as 'Schema.ReturnSlip.Input'
    @Serializable
    data class Input(
      val customer: {}
      val returnReason:
      val orderNumber: String
    ) {}

    // Exported as 'Schema.ReturnSlip.Input_ReturnReason'
    @Serializable
    enum class Input_ReturnReason {
      @SerialName("defective")
      Defective
      @SerialName("wrongItem")
      WrongItem
      @SerialName("changedMind")
      ChangedMind
      @SerialName("other")
      Other
    }

    typealias Output = String
  }
}

