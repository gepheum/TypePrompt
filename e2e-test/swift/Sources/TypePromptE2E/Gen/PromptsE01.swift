

enum TypePrompt {
  /// Namespace containing the user-defined datatypes.
  enum Schema {
    enum Shared {
      // Exported as 'TypePrompt.Schema.Shared.Expr'
      /// An expression
      indirect enum Expr {
        case kindNumber(Expr_KindNumber)
        case kindAdd(Expr_KindAdd)
        case kindIf(Expr_KindIf)
      }

      // Exported as 'TypePrompt.Schema.Shared.Expr_KindNumber'
      struct Expr_KindNumber : Codable {
        let kind: String
        let value: Double

        init(
          value: Double,
        ) {
          self.kind = "number"
          self.value = value
        }
      }

      // Exported as 'TypePrompt.Schema.Shared.Expr_KindAdd'
      struct Expr_KindAdd : Codable {
        let kind: String
        let `left`: Expr
        let `right`: Expr

        init(
          `left`: Expr,
          `right`: Expr,
        ) {
          self.kind = "add"
          self.`left` = `left`
          self.`right` = `right`
        }
      }

      // Exported as 'TypePrompt.Schema.Shared.Expr_KindIf'
      struct Expr_KindIf : Codable {
        let kind: String
        let condition: Expr
        let then: Expr
        let `else`: Expr

        init(
          condition: Expr,
          then: Expr,
          `else`: Expr,
        ) {
          self.kind = "if"
          self.condition = condition
          self.then = then
          self.`else` = `else`
        }
      }

      // Exported as 'TypePrompt.Schema.Shared.EnumWithCommonFields'
      indirect enum EnumWithCommonFields {
        case notSuccess(EnumWithCommonFields_NotSuccess)
        case success(EnumWithCommonFields_Success)
      }

      // Exported as 'TypePrompt.Schema.Shared.EnumWithCommonFields_NotSuccess'
      struct EnumWithCommonFields_NotSuccess : Codable {
        let success: Bool
        /// x coordinate
        let x: Int32
        /// y coordinate
        let y: Double
        /// z coordinate
        let z: String

        init(
          x: Int32,
          y: Double,
          z: String,
        ) {
          self.success = false
          self.x = x
          self.y = y
          self.z = z
        }
      }

      // Exported as 'TypePrompt.Schema.Shared.EnumWithCommonFields_Success'
      struct EnumWithCommonFields_Success : Codable {
        let success: Bool
        /// x coordinate
        let x: Int32
        let y: Double
        let z: Int32

        init(
          x: Int32,
          y: Double,
          z: Int32,
        ) {
          self.success = true
          self.x = x
          self.y = y
          self.z = z
        }
      }

      // Exported as 'TypePrompt.Schema.Shared.Schema'
      struct Schema : Codable {
        let e: EnumWithCommonFields
      }

      // Exported as 'TypePrompt.Schema.Shared.String_'
      struct String_ : Codable {}

      // Exported as 'TypePrompt.Schema.Shared.Boolean'
      struct Boolean : Codable {}

      // Exported as 'TypePrompt.Schema.Shared.List'
      struct List : Codable {}

      // Exported as 'TypePrompt.Schema.Shared.Map'
      struct Map : Codable {}

      // Exported as 'TypePrompt.Schema.Shared.EncodeDefault'
      struct EncodeDefault : Codable {}

      // Exported as 'TypePrompt.Schema.Shared.Serializable'
      struct Serializable : Codable {}

      // Exported as 'TypePrompt.Schema.Shared.AnyHolder'
      struct AnyHolder : Codable {
        let `any`: JsonElement
      }

      // Exported as 'TypePrompt.Schema.Shared.SerializerHolder'
      struct SerializerHolder : Codable {
        let serializer: JsonElement
      }

      // Exported as 'TypePrompt.Schema.Shared.Square'
      struct Square : Codable {
        let kind: String
        let size: Double
        let fromJson: String
        let self_: String
        let foo: String

        init(
          size: Double,
          fromJson: String,
          self_: String,
        ) {
          self.kind = "square"
          self.size = size
          self.fromJson = fromJson
          self.self_ = self_
          self.foo = "foo"
        }
      }

      // Exported as 'TypePrompt.Schema.Shared.E'
      enum E {
        case `class`
        case `if`
        case fooBar
      }

      // Exported as 'TypePrompt.Schema.Shared.Matrix'
      struct Matrix : Codable {
        let matrix: [[Square]]
        let otherMatrix: [[Square]]?
        let foo: [String: [Square]]?
        let ints: [Int32]
      }
    }

    enum AnalyzeSalesData {
      // Exported as 'TypePrompt.Schema.AnalyzeSalesData.SalesRow'
      struct SalesRow : Codable {
        let product: String
        let units: Int32
        let revenueCents: Int32
        let region: String
      }

      // Exported as 'TypePrompt.Schema.AnalyzeSalesData.Input'
      struct Input : Codable {
        let rows: [SalesRow]
        let question: String
        let variant: Input_Variant
      }

      // Exported as 'TypePrompt.Schema.AnalyzeSalesData.Input_Variant'
      enum Input_Variant {
        case csv
        case tsv
      }

      // Exported as 'TypePrompt.Schema.AnalyzeSalesData.Output'
      struct Output : Codable {
        let analysis: String
        let topProduct: String
        let totalRevenue: Double
      }
    }

    enum MyTemplate {
      // Exported as 'TypePrompt.Schema.MyTemplate.Input'
      struct Input : Codable {
        let text: String
      }

      // Exported as 'TypePrompt.Schema.MyTemplate.Output'
      struct Output : Codable {
        let reversedText: String
        let shape: Output_Shape
      }

      // Exported as 'TypePrompt.Schema.MyTemplate.Output_Shape'
      indirect enum Output_Shape {
        case kindSquare(Shared.Square)
        case kindCircle(Output_Shape_KindCircle)
      }

      // Exported as 'TypePrompt.Schema.MyTemplate.Output_Shape_KindCircle'
      struct Output_Shape_KindCircle : Codable {
        let kind: String
        let radius: Double

        init(
          radius: Double,
        ) {
          self.kind = "circle"
          self.radius = radius
        }
      }
    }

    enum MyOtherTemplate {
      // Exported as 'TypePrompt.Schema.MyOtherTemplate.Output'
      struct Output : Codable {
        let reversedText: String
        let shape: Output_Shape
      }

      // Exported as 'TypePrompt.Schema.MyOtherTemplate.Output_Shape'
      indirect enum Output_Shape {
        case kindSquare(Shared.Square)
        case kindCircle(Output_Shape_KindCircle)
      }

      // Exported as 'TypePrompt.Schema.MyOtherTemplate.Output_Shape_KindCircle'
      struct Output_Shape_KindCircle : Codable {
        let kind: String
        let radius: Double

        init(
          radius: Double,
        ) {
          self.kind = "circle"
          self.radius = radius
        }
      }
    }

    enum MyTool {
      // Exported as 'TypePrompt.Schema.MyTool.Output'
      struct Output : Codable {
        let shared: Shared_
      }

      // Exported as 'TypePrompt.Schema.MyTool.Shared_'
      struct Shared_ : Codable {
        let value: String
        let square: Shared.Square
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
