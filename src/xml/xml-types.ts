import type { MappedSpan, Span } from "../util/common-types.js";
import { DecodedSpan } from "../util/common-types.js";

export type XmlDocument = {
  readonly kind: "success";
  readonly root: {
    readonly children: readonly XmlNode[];
  };
};

export type XmlNode = TextNode | ElementNode;

export type TextNode = {
  readonly kind: "text";
  readonly allWhitespace: boolean;
} & MappedSpan;

export type ElementNode = {
  readonly kind: "element";
  readonly tag: DecodedSpan;
  readonly attributes: { readonly [name: string]: Attribute };
  readonly contentStart: number;
  readonly children: readonly XmlNode[];
  readonly comments: readonly XmlComment[];
  readonly isSelfClosing: boolean;
};

export type Attribute = {
  readonly name: DecodedSpan;
  /** Inside the quotes, not including them. */
  readonly value: MappedSpan;
};

export type XmlComment = {
  readonly span: Span;
};
