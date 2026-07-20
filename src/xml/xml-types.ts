import { DecodedSpan } from "../util/common-types.js";
import type { MappedSpan, OffsetMap, Span } from "../util/common-types.js";

export type CommentsPolicy = "drop-comments" | "keep-comments";

export type XmlDocument<C extends CommentsPolicy = "drop-comments"> = {
  readonly kind: "success";
  readonly root: {
    readonly children: readonly XmlNode<C>[];
  };
};

export type XmlNode<C extends CommentsPolicy = "drop-comments"> =
  | TextNode | ElementNode<C> | (C extends "keep-comments" ? XmlComment : never);

export type TextNode = {
  readonly kind: "text";
  /** XML escape sequences are decoded. */
  readonly text: string;
  /** UTF-16 position in the XML file. */
  readonly start: number;
  /** UTF-16 position in the XML file. */
  readonly end: number;
  /**
   * For mapping UTF-16 positions in `text` to UTF-16 positions in the XML file.
   * The first element is always: `{ decodedOffset: 0, sourceOffset: start }`
   */
  readonly offsetMap: OffsetMap;
  readonly allWhitespace: boolean;
};

export type ElementNode<C extends CommentsPolicy = "drop-comments"> = {
  readonly kind: "element";
  readonly tag: DecodedSpan;
  readonly attributes: { readonly [name: string]: Attribute };
  readonly children: readonly XmlNode<C>[];
  readonly isSelfClosing: boolean;
};

export type Attribute = {
  readonly name: DecodedSpan;
  /** Inside the quotes, not including them. */
  readonly value: MappedSpan;
};

export type XmlComment = {
  readonly kind: "comment";
  readonly span: Span;
};
