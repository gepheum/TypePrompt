export type InternalErrors = {
  readonly kind: "error";
  readonly errors: readonly InternalError[];
};

export type InternalError = {
  readonly span: Span;
  readonly message: string;
  readonly hint?: string;
  readonly rule?: string;
  readonly suggestions?: readonly string[];
};

export type ErrorSink = {
  push: (...errors: readonly InternalError[]) => void;
};

/** Span in a source XML file. */
export type Span = {
  readonly path: string;
  /** Start of the range as a UTF-16 position in the XML file. */
  readonly start: number;
  /** End of the range as a UTF-16 position in the XML file. */
  readonly end: number;
};

/** Extends `Span` with the decoded text. */
export type TextSpan<T = string> = Span & {
  /** XML escape sequences are decoded. */
  readonly text: T;
};

/**
 * Extends `TextSpan` with an offset map for mapping positions in `text` to positions
 * in the XML file.
 */
export type MappedSpan<T = string> = TextSpan<T> & {
  /**
   * For mapping UTF-16 positions in `text` to UTF-16 positions in the XML file.
   * The first element is always: `{ textPosition: 0, sourcePosition: start }`
   */
  readonly offsetMap: OffsetMap;
};

export interface MappedText {
  readonly path: string;
  /** XML escape sequences are decoded. */
  readonly text: string;
  readonly offsetMap: OffsetMap;
}

/**
 * Segment-based mapping from decoded offsets back to source offsets.
 *
 * Entries are sorted by `textPosition`. Each entry defines a decoded segment that
 * starts at `textPosition` and ends at the next entry's `textPosition`, or at
 * `text.length` for the last entry.
 */
export type OffsetMap = readonly OffsetMapEntry[];

export type OffsetMapEntry = {
  readonly textPosition: number;
  readonly sourcePosition: number;
};

export type DefinitionLink = {
  readonly reference: Span;
  readonly definition: TextSpan;
};
