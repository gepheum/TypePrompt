// <static:swift-imports>
import Foundation

// </static:swift-imports>

// <static:swift-logic>
public enum JsonElement: Codable, Sendable, Equatable {
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
// </static:swift-logic>
