import { parseXmlDocument } from "../xml/xml-parser.js";

function expectSuccess(
  result: ReturnType<typeof parseXmlDocument>,
): Extract<ReturnType<typeof parseXmlDocument>, { kind: "success" }> {
  if (result.kind !== "success") {
    throw new Error(
      `Expected success, got errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result;
}
