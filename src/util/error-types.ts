export type InternalErrors = {
  readonly kind: "error";
  readonly errors: readonly InternalError[];
};

export type InternalError = {
  readonly span: Omit<SourceSpan, "text">;
  readonly message: string;
};

export interface SourceSpan {
  /// Escape sequences are *not* decoded.
  readonly text: string;
  readonly start: number;
  readonly end: number;
}
