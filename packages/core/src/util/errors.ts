import type { InternalError, InternalErrors } from "./shared-types.js";

export function makeSingletonErrors(error: InternalError): InternalErrors {
  return { kind: "error", errors: [error] };
}
