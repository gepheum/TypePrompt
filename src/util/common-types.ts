export type InternalErrors = {
  readonly kind: "error";
  readonly errors: readonly InternalError[];
};

export type InternalError = {
  readonly span: Span;
  readonly message: string;
};

/** Span in a source XML file. */
export interface Span {
  /** As a UTF-16 position in the XML file. */
  readonly start: number;
  /** As a UTF-16 position in the XML file. */
  readonly end: number;
}

/** Extends `Span` with the decoded text. */
export interface DecodedSpan {
  /** XML escape sequences are decoded. */
  readonly text: string;
  /** As a UTF-16 position in the XML file. */
  readonly start: number;
  /** As a UTF-16 position in the XML file. */
  readonly end: number;
}

/**
 * Extends `DecodedSpan` with an offset map for mapping positions in `text` to
 * positions in the XML file.
 */
export interface MappedSpan {
  /** XML escape sequences are decoded. */
  readonly text: string;
  /** As a UTF-16 position in the XML file. */
  readonly start: number;
  /** As a UTF-16 position in the XML file. */
  readonly end: number;
  /**
   * For mapping UTF-16 positions in `text` to UTF-16 positions in the XML file.
   * The first element is always: `{ decodedOffset: 0, sourceOffset: start }`
   */
  readonly offsetMap: OffsetMap;
}

export interface MappedText {
  /** XML escape sequences are decoded. */
  readonly text: string;
  readonly offsetMap: OffsetMap;
}

/// Segment-based mapping from decoded offsets back to source offsets.
///
/// Entries are sorted by `decodedOffset`. Each entry defines a decoded segment that
/// starts at `decodedOffset` and ends at the next entry's `decodedOffset` (or at
/// `decoded.length` for the last entry).
export type OffsetMap = readonly OffsetMapEntry[];

export type OffsetMapEntry = {
  readonly decodedOffset: number;
  readonly sourceOffset: number;
};
