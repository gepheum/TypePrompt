export type InternalErrors = {
  readonly kind: "error";
  readonly errors: readonly InternalError[];
};

export type InternalError = {
  readonly span: SourceSpan;
  readonly message: string;
};

export interface SourceSpan {
  /** UTF-16 position in the XML file. */
  readonly start: number;
  /** UTF-16 position in the XML file. */
  readonly end: number;
}

export interface DecodedSpan {
  /** XML escape sequences are decoded. */
  readonly text: string;
  /** UTF-16 position in the XML file. */
  readonly start: number;
  /** UTF-16 position in the XML file. */
  readonly end: number;
}
