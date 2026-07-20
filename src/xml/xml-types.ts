import type { MappedSpan, OffsetMap, Span } from "../util/common-types.js";
import { DecodedSpan } from "../util/common-types.js";

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
  readonly allWhitespace: boolean;
} & MappedSpan;

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
