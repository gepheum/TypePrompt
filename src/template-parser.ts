export type Templates = {
  readonly kind: "success";
  readonly templates: readonly Template[];
};

export type Template = {
  readonly name: string;
  /// Variant name. Can be empty.
  readonly variant: string;
};

export type TemplateParseErrors = {
  readonly kind: "error";
  readonly errors: readonly TemplateParseError[];
};

export type TemplateParseError = {
  readonly path: string;
  /// 0-based
  readonly line: number;
  /// 0-based
  readonly column: number;
  readonly position: number;
  readonly message: string;
};

export type SourceFile = {
  readonly path: string;
  readonly content: string;
};
