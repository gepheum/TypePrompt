// <static:swift-imports>
import Foundation

// </static:swift-imports>

public enum TypePromptRuntime {
  // <static:swift-public-types>
  /// A single few-shot example consisting of a user message, optional intermediate
  /// tool-call steps, and the expected response.
  public struct FewShotExample: Sendable, Codable, Equatable {
    public let userMessage: String
    public let intermediateSteps: [IntermediateStepExample]
    public let response: String

    public init(
      userMessage: String,
      intermediateSteps: [IntermediateStepExample],
      response: String
    ) {
      self.userMessage = userMessage
      self.intermediateSteps = intermediateSteps
      self.response = response
    }
  }

  /// One intermediate step within a few-shot example, containing the tool
  /// calls made at that step.
  public struct IntermediateStepExample: Sendable, Codable, Equatable {
    public let toolCalls: [ToolCallExample]

    public init(toolCalls: [ToolCallExample]) {
      self.toolCalls = toolCalls
    }
  }

  /// A single tool call recorded inside an intermediate step.
  public struct ToolCallExample: Sendable, Codable, Equatable {
    public let callId: String
    public let toolName: String
    public let stringifiedInput: String
    public let stringifiedOutput: String

    public init(
      callId: String,
      toolName: String,
      stringifiedInput: String,
      stringifiedOutput: String
    ) {
      self.callId = callId
      self.toolName = toolName
      self.stringifiedInput = stringifiedInput
      self.stringifiedOutput = stringifiedOutput
    }
  }

  public struct ToolCall: Sendable, Codable, Equatable {
    public let callId: String
    public let toolName: String
    public let stringifiedInput: String

    public init(callId: String, toolName: String, stringifiedInput: String) {
      self.callId = callId
      self.toolName = toolName
      self.stringifiedInput = stringifiedInput
    }
  }

  public struct ToolCallResponse: Sendable, Codable, Equatable {
    public let callId: String
    public let stringifiedOutput: String

    public init(callId: String, stringifiedOutput: String) {
      self.callId = callId
      self.stringifiedOutput = stringifiedOutput
    }
  }
  // </static:swift-public-types>
}

// <static:swift-logic>
// </static:swift-logic>

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

// <generated:spec>
private enum Spec {
  struct Templates: Codable, Sendable {
    let edition: Int32
    let signature: String
    let templates: [String: Template]
    let tools: [String: Tool]
    let singleNamespace: Bool
    /// The key is a relative path to a .xml file. The value is the file content.
    let sourceFiles: [String: String]
  }

  struct Template: Codable, Sendable {
    let name: String
    let namespace: String
    let outputFormat: OutputFormat
    let tools: [TemplateTool]
    let contents: TemplateContents
    let snippets: [String: Snippet]
    let outputJsonSchema: JsonElement?

    init(
      name: String,
      namespace: String,
      outputFormat: OutputFormat,
      tools: [TemplateTool],
      contents: TemplateContents,
      snippets: [String: Snippet],
      outputJsonSchema: JsonElement? = nil,
    ) {
      self.name = name
      self.namespace = namespace
      self.outputFormat = outputFormat
      self.tools = tools
      self.contents = contents
      self.snippets = snippets
      self.outputJsonSchema = outputJsonSchema
    }
  }

  enum OutputFormat: String, Codable, Sendable {
    case json = "json"
    case text = "text"
  }

  struct TemplateTool: Codable, Sendable {
    let id: String
    let name: String
  }

  enum TemplateContents: Codable, Sendable {
    case kindNoVariants(TemplateContents_KindNoVariants)
    case kindVariants(TemplateContents_KindVariants)

    func encode(to encoder: any Encoder) throws {
      var container = encoder.singleValueContainer()
      switch self {
      case .kindNoVariants(let value):
        try container.encode(value)
      case .kindVariants(let value):
        try container.encode(value)
      }
    }

    private enum DiscriminatorCodingKeys: String, CodingKey {
      case discriminator = "kind"
    }

    init(from decoder: any Decoder) throws {
      let container = try decoder.container(keyedBy: DiscriminatorCodingKeys.self)
      let discriminator = try container.decode(String.self, forKey: .discriminator)
      switch discriminator {
      case "no-variants":
        self = .kindNoVariants(try TemplateContents_KindNoVariants(from: decoder))
      case "variants":
        self = .kindVariants(try TemplateContents_KindVariants(from: decoder))
      default:
        throw DecodingError.dataCorrupted(
          DecodingError.Context(
            codingPath: decoder.codingPath,
            debugDescription: "Unknown discriminator: \(discriminator)"
          )
        )
      }
    }
  }

  struct TemplateContents_KindNoVariants: Codable, Sendable {
    let kind: String
    let content: TemplateContent

    init(
      content: TemplateContent,
    ) {
      self.kind = "no-variants"
      self.content = content
    }
  }

  struct TemplateContents_KindVariants: Codable, Sendable {
    let kind: String
    let variants: [String: TemplateContent]
    let defaultContent: TemplateContent

    init(
      variants: [String: TemplateContent],
      defaultContent: TemplateContent,
    ) {
      self.kind = "variants"
      self.variants = variants
      self.defaultContent = defaultContent
    }
  }

  struct TemplateContent: Codable, Sendable {
    let meta: JsonElement?
    let system: [BodyPiece]?
    let user: [BodyPiece]?
    let examples: [FewShotExample]?

    init(
      meta: JsonElement? = nil,
      system: [BodyPiece]? = nil,
      user: [BodyPiece]? = nil,
      examples: [FewShotExample]? = nil,
    ) {
      self.meta = meta
      self.system = system
      self.user = user
      self.examples = examples
    }
  }

  struct FewShotExample: Codable, Sendable {
    let input: JsonElement
    let output: JsonElement
    let intermediateSteps: [FewShotExample_IntermediateSteps]
  }

  struct FewShotExample_IntermediateSteps: Codable, Sendable {
    let toolCalls: [ToolCallExample]
  }

  struct ToolCallExample: Codable, Sendable {
    let callId: String
    let toolId: String
    let toolName: String
    let input: JsonElement
    let output: JsonElement
  }

  enum BodyPiece: Codable, Sendable {
    case kindText(BodyPiece_KindText)
    case kindInsertVal(BodyPiece_KindInsertVal)
    case kindInsertSnippet(BodyPiece_KindInsertSnippet)

    func encode(to encoder: any Encoder) throws {
      var container = encoder.singleValueContainer()
      switch self {
      case .kindText(let value):
        try container.encode(value)
      case .kindInsertVal(let value):
        try container.encode(value)
      case .kindInsertSnippet(let value):
        try container.encode(value)
      }
    }

    private enum DiscriminatorCodingKeys: String, CodingKey {
      case discriminator = "kind"
    }

    init(from decoder: any Decoder) throws {
      let container = try decoder.container(keyedBy: DiscriminatorCodingKeys.self)
      let discriminator = try container.decode(String.self, forKey: .discriminator)
      switch discriminator {
      case "text":
        self = .kindText(try BodyPiece_KindText(from: decoder))
      case "insert-val":
        self = .kindInsertVal(try BodyPiece_KindInsertVal(from: decoder))
      case "insert-snippet":
        self = .kindInsertSnippet(try BodyPiece_KindInsertSnippet(from: decoder))
      default:
        throw DecodingError.dataCorrupted(
          DecodingError.Context(
            codingPath: decoder.codingPath,
            debugDescription: "Unknown discriminator: \(discriminator)"
          )
        )
      }
    }
  }

  struct BodyPiece_KindText: Codable, Sendable {
    let kind: String
    let text: String

    init(
      text: String,
    ) {
      self.kind = "text"
      self.text = text
    }
  }

  struct BodyPiece_KindInsertVal: Codable, Sendable {
    let kind: String
    let val: Expression
    let format: InsertFormat
    let indent: String

    init(
      val: Expression,
      format: InsertFormat,
      indent: String,
    ) {
      self.kind = "insert-val"
      self.val = val
      self.format = format
      self.indent = indent
    }
  }

  struct BodyPiece_KindInsertSnippet: Codable, Sendable {
    let kind: String
    /// Snippet name.
    let snippet: String
    /// Only contains whitespace characters.
    let indent: String

    init(
      snippet: String,
      indent: String,
    ) {
      self.kind = "insert-snippet"
      self.snippet = snippet
      self.indent = indent
    }
  }

  enum InsertFormat: String, Codable, Sendable {
    case text = "text"
    case json = "json"
    case yaml = "yaml"
    case toon = "toon"
    case csv = "csv"
    case tsv = "tsv"
  }

  indirect enum Expression: Codable, Sendable {
    case kindInput(Expression_KindInput)
    case kindProperty(Expression_KindProperty)

    func encode(to encoder: any Encoder) throws {
      var container = encoder.singleValueContainer()
      switch self {
      case .kindInput(let value):
        try container.encode(value)
      case .kindProperty(let value):
        try container.encode(value)
      }
    }

    private enum DiscriminatorCodingKeys: String, CodingKey {
      case discriminator = "kind"
    }

    init(from decoder: any Decoder) throws {
      let container = try decoder.container(keyedBy: DiscriminatorCodingKeys.self)
      let discriminator = try container.decode(String.self, forKey: .discriminator)
      switch discriminator {
      case "input":
        self = .kindInput(try Expression_KindInput(from: decoder))
      case "property":
        self = .kindProperty(try Expression_KindProperty(from: decoder))
      default:
        throw DecodingError.dataCorrupted(
          DecodingError.Context(
            codingPath: decoder.codingPath,
            debugDescription: "Unknown discriminator: \(discriminator)"
          )
        )
      }
    }
  }

  struct Expression_KindInput: Codable, Sendable {
    let kind: String

    init() {
      self.kind = "input"
    }
  }

  struct Expression_KindProperty: Codable, Sendable {
    let kind: String
    let `left`: Expression
    let property: String

    init(
      `left`: Expression,
      property: String,
    ) {
      self.kind = "property"
      self.`left` = `left`
      self.property = property
    }
  }

  enum Snippet: Codable, Sendable {
    case kindSnippet(Snippet_KindSnippet)
    case kindSnippetIf(Snippet_KindSnippetIf)
    case kindSnippetSwitch(Snippet_KindSnippetSwitch)

    func encode(to encoder: any Encoder) throws {
      var container = encoder.singleValueContainer()
      switch self {
      case .kindSnippet(let value):
        try container.encode(value)
      case .kindSnippetIf(let value):
        try container.encode(value)
      case .kindSnippetSwitch(let value):
        try container.encode(value)
      }
    }

    private enum DiscriminatorCodingKeys: String, CodingKey {
      case discriminator = "kind"
    }

    init(from decoder: any Decoder) throws {
      let container = try decoder.container(keyedBy: DiscriminatorCodingKeys.self)
      let discriminator = try container.decode(String.self, forKey: .discriminator)
      switch discriminator {
      case "snippet":
        self = .kindSnippet(try Snippet_KindSnippet(from: decoder))
      case "snippet-if":
        self = .kindSnippetIf(try Snippet_KindSnippetIf(from: decoder))
      case "snippet-switch":
        self = .kindSnippetSwitch(try Snippet_KindSnippetSwitch(from: decoder))
      default:
        throw DecodingError.dataCorrupted(
          DecodingError.Context(
            codingPath: decoder.codingPath,
            debugDescription: "Unknown discriminator: \(discriminator)"
          )
        )
      }
    }
  }

  struct Snippet_KindSnippet: Codable, Sendable {
    let kind: String
    let body: [BodyPiece]

    init(
      body: [BodyPiece],
    ) {
      self.kind = "snippet"
      self.body = body
    }
  }

  struct Snippet_KindSnippetIf: Codable, Sendable {
    let kind: String
    let expression: Expression
    let `is`: Snippet_KindSnippetIf_Is
    let then: [BodyPiece]
    let `else`: [BodyPiece]

    init(
      expression: Expression,
      `is`: Snippet_KindSnippetIf_Is,
      then: [BodyPiece],
      `else`: [BodyPiece],
    ) {
      self.kind = "snippet-if"
      self.expression = expression
      self.`is` = `is`
      self.then = then
      self.`else` = `else`
    }
  }

  enum Snippet_KindSnippetIf_Is: String, Codable, Sendable {
    case notNull = "not-null"
    case notEmpty = "not-empty"
    case `true` = "true"
  }

  struct Snippet_KindSnippetSwitch: Codable, Sendable {
    let kind: String
    let expression: Expression
    let branches: [String: [BodyPiece]]

    init(
      expression: Expression,
      branches: [String: [BodyPiece]],
    ) {
      self.kind = "snippet-switch"
      self.expression = expression
      self.branches = branches
    }
  }

  struct Tool: Codable, Sendable {
    let id: String
    let name: String
    let description: String
    let outputJsonSchema: JsonElement?

    init(
      id: String,
      name: String,
      description: String,
      outputJsonSchema: JsonElement? = nil,
    ) {
      self.id = id
      self.name = name
      self.description = description
      self.outputJsonSchema = outputJsonSchema
    }
  }
}  // enum Spec
// </generated:spec>
