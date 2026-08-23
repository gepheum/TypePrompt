import type { MappedSpan, Span } from "../util/shared-types.js";
import { TextSpan } from "../util/shared-types.js";

export type XmlDocument = {
  readonly kind: "success";
  readonly root: {
    readonly topLevelNodes: readonly XmlNode[];
    readonly topLevelComments: readonly XmlComment[];
  };
};

export type XmlNode = TextNode | ElementNode;

export type TextNode = {
  readonly kind: "text";
  readonly allWhitespace: boolean;
  readonly xmlSlice: string;
} & MappedSpan;

export type ElementNode = {
  readonly kind: "element";
  readonly tag: TextSpan;
  readonly attributes: { readonly [name: string]: Attribute };
  readonly contentStart: number;
  readonly children: readonly XmlNode[];
  readonly comments: readonly XmlComment[];
  readonly isSelfClosing: boolean;
  readonly xmlSlice: string;
} & Span;

export type Attribute = {
  readonly name: TextSpan;
  /** Inside the quotes, not including them. */
  readonly value: MappedSpan;
};

export type XmlComment = Span & {
  readonly kind: "comment";
  readonly xmlSlice: string;
};
