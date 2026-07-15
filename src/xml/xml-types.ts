import type { SourceSpan } from "../util/error-types.js";
import type { OffsetMap } from "./text-node-join.js";

export type CommentsPolicy = "drop-comments" | "keep-comments";

export type XmlDocument<C extends CommentsPolicy = "drop-comments"> = {
  readonly kind: "success";
  readonly root: {
    readonly children: readonly XmlNode<C>[];
  };
};

export type XmlNode<C extends CommentsPolicy = "drop-comments"> =
  TextNode | ElementNode<C> | (C extends "keep-comments" ? XmlComment : never);

export type TextNode = {
  readonly kind: "text";
  readonly sourceSpan: SourceSpan;
  /// Decoded text content (for example, "&lt;" -> "<").
  readonly decoded: string;
  /// Mapping segments from decoded offsets to source offsets.
  /// The first element is always
  //   `{ decodedOffset: 0, sourceOffset: sourceSpan.start }`
  // even if the text is empty.
  readonly offsetMap: OffsetMap;
  readonly allWhitespace: boolean;
};

export type ElementNode<C extends CommentsPolicy = "drop-comments"> = {
  readonly kind: "element";
  /// Span covering the content between the opening and closing tags.
  /// Empty (start === end) for self-closing elements and elements with no content.
  readonly contentSpan: SourceSpan;
  readonly children: readonly XmlNode<C>[];
  readonly tagName: SourceSpan;
  readonly attributes: { readonly [name: string]: Attribute };
  readonly isSelfClosing: boolean;
};

export type Attribute = {
  readonly name: SourceSpan;
  /// Inside the quotes, not including them.
  readonly value: SourceSpan;
  /// Decoded attribute value (for example, "&lt;" -> "<").
  readonly decodedValue: string;
};

export type XmlComment = {
  readonly kind: "comment";
  readonly sourceSpan: SourceSpan;
};
