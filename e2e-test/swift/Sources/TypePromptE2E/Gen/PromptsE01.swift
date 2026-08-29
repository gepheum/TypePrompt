

enum TypePrompt {
  /// Namespace containing the user-defined datatypes.
  enum Schema {
    enum Shared {
      // Exported as 'Schema.Shared.Expr'
      /// An expression
      enum Expr {}

      // Exported as 'Schema.Shared.Expr_KindNumber'
      struct Expr_KindNumber {
        let value: Double
      }

      // Exported as 'Schema.Shared.Expr_KindAdd'
      struct Expr_KindAdd {
        let `left`: Expr
        let `right`: Expr
      }

      // Exported as 'Schema.Shared.Expr_KindIf'
      struct Expr_KindIf {
        let condition: Expr
        let then: Expr
        let `else`: Expr
      }

      // Exported as 'Schema.Shared.EnumWithCommonFields'
      enum EnumWithCommonFields {}

      // Exported as 'Schema.Shared.EnumWithCommonFields_NotSuccess'
      struct EnumWithCommonFields_NotSuccess {
        /// x coordinate
        let x: Int32
        /// y coordinate
        let y: Double
        /// z coordinate
        let z: String
      }

      // Exported as 'Schema.Shared.EnumWithCommonFields_Success'
      struct EnumWithCommonFields_Success {
        /// x coordinate
        let x: Int32
        let y: Double
        let z: Int32
      }

      // Exported as 'Schema.Shared.Schema_'
      struct Schema_ {
        let e: EnumWithCommonFields
      }

      // Exported as 'Schema.Shared.String_'
      struct String_ {}

      // Exported as 'Schema.Shared.Boolean_'
      struct Boolean_ {}

      // Exported as 'Schema.Shared.List_'
      struct List_ {}

      // Exported as 'Schema.Shared.Map_'
      struct Map_ {}

      // Exported as 'Schema.Shared.EncodeDefault'
      struct EncodeDefault {}

      // Exported as 'Schema.Shared.Serializable_'
      struct Serializable_ {}

      // Exported as 'Schema.Shared.AnyHolder'
      struct AnyHolder {
        let `any`: JsonElement
      }

      // Exported as 'Schema.Shared.SerializerHolder'
      struct SerializerHolder {
        let serializer: JsonElement
      }

      // Exported as 'Schema.Shared.Square'
      struct Square {
        let size: Double
        let fromJson: String
      }

      // Exported as 'Schema.Shared.E'
      enum E {
        case Class
        case If
        case FooBar
      }

      // Exported as 'Schema.Shared.Matrix'
      struct Matrix {
        let matrix: [[Square]]
        let otherMatrix: [[Square]]?
        let foo: [String: [Square]]?
        let ints: [Int32]
      }
    }

    enum AnalyzeSalesData {
      // Exported as 'Schema.AnalyzeSalesData.SalesRow'
      struct SalesRow {
        let product: String
        let units: Int32
        let revenueCents: Int32
        let region: String
      }

      // Exported as 'Schema.AnalyzeSalesData.Input'
      struct Input {
        let rows: [SalesRow]
        let question: String
        let variant: Input_Variant
      }

      // Exported as 'Schema.AnalyzeSalesData.Input_Variant'
      enum Input_Variant {
        case Csv
        case Tsv
      }

      // Exported as 'Schema.AnalyzeSalesData.Output'
      struct Output {
        let analysis: String
        let topProduct: String
        let totalRevenue: Double
      }
    }

    enum MyTemplate {
      // Exported as 'Schema.MyTemplate.Input'
      struct Input {
        let text: String
      }

      // Exported as 'Schema.MyTemplate.Output'
      struct Output {
        let reversedText: String
        let shape: Output_Shape
      }

      // Exported as 'Schema.MyTemplate.Output_Shape'
      enum Output_Shape {}

      // Exported as 'Schema.MyTemplate.Output_Shape_KindCircle'
      struct Output_Shape_KindCircle {
        let radius: Double
      }
    }
  }

  public enum JsonElement: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JsonElement])
    case array([JsonElement])
    case null

    public init(from decoder: Decoder) throws {
      let container = try decoder.singleValueContainer()
      if container.decodeNil() {
        self = .null
      } else if let bool = try? container.decode(Bool.self) {
        self = .bool(bool)
      } else if let num = try? container.decode(Double.self) {
        self = .number(num)
      } else if let str = try? container.decode(String.self) {
        self = .string(str)
      } else if let arr = try? container.decode([JsonElement].self) {
        self = .array(arr)
      } else if let dict = try? container.decode([String: JsonElement].self) {
        self = .object(dict)
      } else {
        throw DecodingError.dataCorruptedError(
          in: container,
          debugDescription: "Unsupported JSON value"
        )
      }
    }

    public func encode(to encoder: Encoder) throws {
      var container = encoder.singleValueContainer()
      switch self {
        case .string(let str):
          try container.encode(str)
        case .number(let num):
          try container.encode(num)
        case .bool(let bool):
          try container.encode(bool)
        case .object(let dict):
          try container.encode(dict)
        case .array(let arr):
          try container.encode(arr)
        case .null:
          try container.encodeNil()
      }
    }
  }
}
