import Foundation
import Testing

@testable import TypePromptE2E

@Test func testGreeting() async throws {
  #expect(getGreeting() == "Hello, World!")
}

@Test func testStringEnumSerialization() async throws {
  let variant = TypePrompt.Schema.AnalyzeSalesData.Input_Variant.csv
  let encoder = JSONEncoder()
  let decoder = JSONDecoder()

  let data = try encoder.encode(variant)
  let jsonString = String(decoding: data, as: UTF8.self)
  #expect(jsonString == "\"csv\"")

  let decoded = try decoder.decode(
    TypePrompt.Schema.AnalyzeSalesData.Input_Variant.self, from: data)
  #expect(decoded == .csv)
}

@Test func testExprNumberSerialization() async throws {
  let expr = TypePrompt.Schema.Shared.Expr.kindNumber(
    TypePrompt.Schema.Shared.Expr_KindNumber(value: 42.0)
  )
  let encoder = JSONEncoder()
  let decoder = JSONDecoder()

  let data = try encoder.encode(expr)
  let jsonString = String(decoding: data, as: UTF8.self)
  #expect(jsonString.contains("\"kind\":\"number\""))
  #expect(jsonString.contains("\"value\":42"))

  let decoded = try decoder.decode(TypePrompt.Schema.Shared.Expr.self, from: data)
  if case .kindNumber(let num) = decoded {
    #expect(num.kind == "number")
    #expect(num.value == 42.0)
  } else {
    Issue.record("Expected .kindNumber")
  }
}

@Test func testExprAddSerialization() async throws {
  let expr = TypePrompt.Schema.Shared.Expr.kindAdd(
    TypePrompt.Schema.Shared.Expr_KindAdd(
      left: .kindNumber(TypePrompt.Schema.Shared.Expr_KindNumber(value: 1.0)),
      right: .kindNumber(TypePrompt.Schema.Shared.Expr_KindNumber(value: 2.0))
    )
  )
  let encoder = JSONEncoder()
  let decoder = JSONDecoder()

  let data = try encoder.encode(expr)
  let decoded = try decoder.decode(TypePrompt.Schema.Shared.Expr.self, from: data)
  if case .kindAdd(let add) = decoded {
    #expect(add.kind == "add")
    if case .kindNumber(let leftNum) = add.left {
      #expect(leftNum.value == 1.0)
    } else {
      Issue.record("Expected left to be .kindNumber")
    }
    if case .kindNumber(let rightNum) = add.right {
      #expect(rightNum.value == 2.0)
    } else {
      Issue.record("Expected right to be .kindNumber")
    }
  } else {
    Issue.record("Expected .kindAdd")
  }
}

@Test func testBooleanDiscriminatorSerialization() async throws {
  let notSuccess = TypePrompt.Schema.Shared.EnumWithCommonFields.notSuccess(
    TypePrompt.Schema.Shared.EnumWithCommonFields_NotSuccess(x: 10, y: 20.5, z: "error")
  )
  let success = TypePrompt.Schema.Shared.EnumWithCommonFields.success(
    TypePrompt.Schema.Shared.EnumWithCommonFields_Success(x: 10, y: 20.5, z: 99)
  )
  let encoder = JSONEncoder()
  let decoder = JSONDecoder()

  let dataNotSuccess = try encoder.encode(notSuccess)
  let decodedNotSuccess = try decoder.decode(
    TypePrompt.Schema.Shared.EnumWithCommonFields.self, from: dataNotSuccess)
  if case .notSuccess(let val) = decodedNotSuccess {
    #expect(val.success == false)
    #expect(val.x == 10)
    #expect(val.y == 20.5)
    #expect(val.z == "error")
  } else {
    Issue.record("Expected .notSuccess")
  }

  let dataSuccess = try encoder.encode(success)
  let decodedSuccess = try decoder.decode(
    TypePrompt.Schema.Shared.EnumWithCommonFields.self, from: dataSuccess)
  if case .success(let val) = decodedSuccess {
    #expect(val.success == true)
    #expect(val.x == 10)
    #expect(val.y == 20.5)
    #expect(val.z == 99)
  } else {
    Issue.record("Expected .success")
  }
}

@Test func testCommonFieldsGetters() async throws {
  let notSuccess = TypePrompt.Schema.Shared.EnumWithCommonFields.notSuccess(
    TypePrompt.Schema.Shared.EnumWithCommonFields_NotSuccess(x: 15, y: 35.5, z: "test")
  )
  let success = TypePrompt.Schema.Shared.EnumWithCommonFields.success(
    TypePrompt.Schema.Shared.EnumWithCommonFields_Success(x: 42, y: 84.0, z: 123)
  )

  #expect(notSuccess.x == 15)
  #expect(notSuccess.y == 35.5)

  #expect(success.x == 42)
  #expect(success.y == 84.0)
}

@Test func testOptionalFieldsOmission() async throws {
  let matrix = TypePrompt.Schema.Shared.Matrix(
    matrix: [],
    ints: [1, 2, 3],
    init: true,
    encode: false
  )
  #expect(matrix.otherMatrix == nil)
  #expect(matrix.foo == nil)
}

private struct TestMyTool: TypePrompt.ToolExecutor.MyTool {
  func myTool(
    input: TypePrompt.Schema.Shared.Square
  ) async throws -> TypePrompt.Schema.MyTool.Output {
    TypePrompt.Schema.MyTool.Output(
      shared: TypePrompt.Schema.MyTool.Shared_(
        value: "hello",
        square: input
      )
    )
  }
}

private struct TestMyOtherTool: TypePrompt.ToolExecutor.MyOtherTool {
  func myOtherTool(
    input: TypePrompt.Schema.Shared.Square
  ) async throws -> [TypePrompt.Schema.MyOtherTool.Output] {
    [
      TypePrompt.Schema.MyOtherTool.Output(
        shared: TypePrompt.Schema.MyOtherTool.Shared_(
          value: "world",
          square: input
        )
      )
    ]
  }
}

@Test func testCompositeToolExecutor() async throws {
  let composite = TypePrompt.ToolExecutor.MyOtherTemplate(
    myTool: TestMyTool(),
    myOtherTool: TestMyOtherTool()
  )
  let executor: any TypePrompt.ToolExecutor.MyTool & TypePrompt.ToolExecutor.MyOtherTool = composite
  let square = TypePrompt.Schema.Shared.Square(
    size: 5.0,
    fromJson: "a",
    self_: "b"
  )
  let out1 = try await executor.myTool(input: square)
  #expect(out1.shared.value == "hello")
  let out2 = try await executor.myOtherTool(input: square)
  #expect(out2.first?.shared.value == "world")
}

@Test func testPromptsStructCompilation() async throws {
  _ = TypePrompt01.Prompts.self
  _ = TypePrompt08.Prompts.self
  _ = TypePrompt.Prompts.self
}
