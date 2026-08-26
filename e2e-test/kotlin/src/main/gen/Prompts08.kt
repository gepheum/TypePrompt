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

  object Legal {
    object Shared {
      // Exported as 'Schema.Legal.Shared.Party'
      @Serializable
      data class Party(
        val name: String
        val role:
        val jurisdiction: String
      ) {}

      // Exported as 'Schema.Legal.Shared.Party_Role'
      @Serializable
      enum class Party_Role {
        @SerialName("client")
        Client
        @SerialName("counterparty")
        Counterparty
        @SerialName("witness")
        Witness
        @SerialName("arbitrator")
        Arbitrator
      }
    }

    object SummarizeClause {
      // Exported as 'Schema.Legal.SummarizeClause.Input'
      @Serializable
      data class Input(
        val clauseText: String
        /** Who is asking — affects what risks to highlight. */
        val reviewingParty: {}
      ) {}

      // Exported as 'Schema.Legal.SummarizeClause.Output'
      @Serializable
      data class Output(
        val plainEnglishSummary: String
        val potentialRisks: readonly String[]
        /** Whether the clause is standard or unusual. */
        val assessment:
      ) {}

      // Exported as 'Schema.Legal.SummarizeClause.Output_Assessment'
      @Serializable
      enum class Output_Assessment {
        @SerialName("standard")
        Standard
        @SerialName("unusual")
        Unusual
        @SerialName("redFlag")
        RedFlag
      }
    }

    object DraftNda {
      // Exported as 'Schema.Legal.DraftNda.Input'
      @Serializable
      data class Input(
        val disclosingParty: {}
        val receivingParty: {}
        val purposeOfDisclosure: String
        val durationYears: Int
      ) {}

      typealias Output = String
    }
  }

  object Finance {
    object Shared {
      // Exported as 'Schema.Finance.Shared.Currency'
      @Serializable
      enum class Currency {
        @SerialName("USD")
        Usd
        @SerialName("EUR")
        Eur
        @SerialName("GBP")
        Gbp
        @SerialName("JPY")
        Jpy
      }

      // Exported as 'Schema.Finance.Shared.MoneyAmount'
      @Serializable
      data class MoneyAmount(
        val value: Double
        val currency:
      ) {}
    }

    object SummarizeTransaction {
      // Exported as 'Schema.Finance.SummarizeTransaction.Input'
      @Serializable
      data class Input(
        val description: String
        val amount: {}
        val category:
        val date: String
      ) {}

      // Exported as 'Schema.Finance.SummarizeTransaction.Input_Category'
      @Serializable
      enum class Input_Category {
        @SerialName("income")
        Income
        @SerialName("expense")
        Expense
        @SerialName("transfer")
        Transfer
      }

      // Exported as 'Schema.Finance.SummarizeTransaction.Output'
      @Serializable
      data class Output(
        val summary: String
        /** Suggested label for bookkeeping. */
        val bookkeepingLabel: String
      ) {}
    }

    object DetectAnomaly {
      // Exported as 'Schema.Finance.DetectAnomaly.Input'
      @Serializable
      data class Input(
        val recentTransactions: readonly {}[]
        val newTransaction: {}
      ) {}

      // Exported as 'Schema.Finance.DetectAnomaly.Input_RecentTransactions'
      @Serializable
      data class Input_RecentTransactions(
        val description: String
        val amount: {}
        val date: String
      ) {}

      // Exported as 'Schema.Finance.DetectAnomaly.Input_NewTransaction'
      @Serializable
      data class Input_NewTransaction(
        val description: String
        val amount: {}
        val date: String
      ) {}

      // Exported as 'Schema.Finance.DetectAnomaly.Output'
      @Serializable
      data class Output(
        val isAnomaly: Boolean
        val reason: String?
      ) {}
    }
  }
}

