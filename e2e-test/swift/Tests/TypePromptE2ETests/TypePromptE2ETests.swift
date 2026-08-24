import Testing

@testable import TypePromptE2E

@Test func testGreeting() async throws {
  #expect(getGreeting() == "Hello, World!")
}
