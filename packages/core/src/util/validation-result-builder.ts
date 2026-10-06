import type {
  DefinitionLink,
  InternalError,
  ValidationErrors,
  ValidationResult,
} from "./shared-types.js";

export class ValidationResultBuilder implements ValidationResult {
  readonly errors: InternalError[] = [];
  readonly definitionLinks: DefinitionLink[] = [];

  push(other: ValidationResult): void {
    this.errors.push(...other.errors);
    this.definitionLinks.push(...other.definitionLinks);
  }

  asErrors(): ValidationErrors {
    const { definitionLinks, errors } = this;
    return { kind: "error", errors, definitionLinks };
  }
}
