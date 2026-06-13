export type XmlDocument = {
  readonly content: readonly XmlNode[];
}

export type XmlNode =
  | TextNode
  | ElementNode

export type TextNode = {
  readonly type: "text";
  readonly text: SourceSpan;
}

export type ElementNode = {
  readonly type: "element";
  readonly children: readonly XmlNode[];
  readonly tagName: SourceSpan;
  readonly attributes: { readonly [name: string]: Attribute };
}

export type Attribute = {
  readonly name: SourceSpan;
  /// Inside the quotes, not including them.
  readonly value?: SourceSpan;
}

export interface SourceSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export function parseXmlDocument(content: string): XmlDocument {
  throw "TODO";
}
