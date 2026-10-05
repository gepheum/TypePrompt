import {
  DefinitionLink,
  InternalError,
  ValidationResult,
} from "./shared-types.js";

export class ValidationResultBuilder implements ValidationResult {
  readonly errors: InternalError[] = [];
  readonly definitionLinks: DefinitionLink[] = [];

  push(other: ValidationResult): void {
    this.errors.push(...other.errors);
    this.definitionLinks.push(...other.definitionLinks);
  }
}
