import { StrictJsonValue } from "../json/json-types.js";
import { parseYaml } from "../json/yaml-parser.js";
import { parseSchema } from "../schema/schema-parser.js";
import { SchemaParseResult } from "../schema/schema-types.js";
import {
  ErrorSink,
  InternalError,
  InternalErrors,
  Span,
  TextSpan,
} from "../util/shared-types.js";
import {
  AttributeValue,
  checkNoXmlAttributes,
  checkXmlAttributes,
  oneOf,
} from "../xml/xml-attributes-checker.js";
import type { ElementNode } from "../xml/xml-types.js";
import {
  Body,
  BodyInContext,
  OutputFormat,
  Snippet,
  Template,
  TemplateContent,
  TemplateContents,
  TemplateMeta,
  TemplateVariant,
} from "./compiler-types.js";

import * as z from "zod";
import { parseExpression } from "../expression/expression-parser.js";
import { checkNameConflicts } from "../util/casing.js";
import { checkAllAreElements } from "../xml/xml-node-checker.js";
import { parseBody } from "./body-parser.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a <template> element. The result has yet to be validated. */
export function parseTemplate(
  templateNode: ElementNode,
): Template | InternalErrors {
  return TemplateParser.parseTemplate(templateNode);
}

class TemplateParser {
  static parseTemplate(templateNode: ElementNode): Template | InternalErrors {
    const parser = new TemplateParser(templateNode);
    return parser.parse();
  }

  private constructor(readonly templateNode: ElementNode) {}

  parse(): Template | InternalErrors {
    // 1. Validate <template> attributes.
    const attrs = checkXmlAttributes(this.templateNode, {
      name: {
        schema: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
        expected: "an UpperCamelCase identifier",
      },
      namespace: {
        schema: z
          .string()
          .regex(/^[A-Z][A-Za-z0-9]*$/)
          .optional(),
        expected: "an UpperCamelCase identifier",
      },
    });
    if (attrs.kind === "error") {
      return attrs;
    }

    const { name, namespace } = attrs.attributes;

    for (const reservedName of ["Shared", "Meta"]) {
      if (name.value.text.toLowerCase() === reservedName.toLowerCase()) {
        const caseNote =
          name.value.text === reservedName ? "" : " (case-insensitive)";
        this.errors.push({
          span: name.nameSpan,
          message: `Template name cannot be '${reservedName}'${caseNote}`,
        });
      }
    }

    this.parseChildren();
    const contents = this.buildContents();
    if (contents) {
      this.verifySnippets(contents);
    }

    if (this.errors.length > 0) {
      return { kind: "error", errors: this.errors };
    }

    return {
      kind: "success",
      tag: this.templateNode.tag,
      name: name.value,
      namespace: namespace?.value ?? null,
      schema: this.schema as SchemaParseResult,
      tools: this.tools,
      outputFormat: this.outputFormat,
      contents: contents!,
      snippets: this.snippets,
      warnings: this.warnings,
    };
  }

  private parseChildren(): void {
    const children = checkAllAreElements(
      this.templateNode.children,
      [
        "schema",
        "tools",
        "snippet",
        "system",
        "user",
        "examples",
        "meta",
        "variant",
      ] as const,
      " in <template>",
      this.errors,
    );
    for (const [tag, child] of children) {
      switch (tag) {
        case "schema": {
          this.parseSchema(child);
          break;
        }
        case "tools": {
          this.parseTools(child);
          break;
        }
        case "snippet": {
          this.parseSnippet(child);
          break;
        }
        case "system":
        case "user":
        case "examples":
        case "meta": {
          this.topLevelContent.parse(tag, child, this.errors);
          break;
        }
        case "variant": {
          this.parseVariant(child);
          break;
        }
      }
    }
    const { schema } = this;
    if (schema === null) {
      this.errors.push({
        span: this.templateNode.tag,
        message: "Missing <schema> element",
      });
    }
  }

  private parseSchema(schemaNode: ElementNode): void {
    if (this.schema !== null) {
      this.errors.push({
        span: schemaNode.tag,
        message: "Multiple <schema> elements in <template>",
      });
    }
    const attrs = checkXmlAttributes(schemaNode, {
      "output-format": oneOf(["json", "text"]),
    });
    if (attrs.kind === "error") {
      this.errors.push(...attrs.errors);
    } else {
      const outputFormat = attrs.attributes["output-format"];
      if (outputFormat) {
        this.outputFormat = outputFormat.value;
      }
    }
    const textContent = extractTextContent(schemaNode, "typescript");
    if (textContent.kind === "error") {
      this.errors.push(...textContent.errors);
      return;
    }
    this.warnings.push(...textContent.warnings);
    const schema = parseSchema(textContent.text);
    if (schema.kind === "error") {
      this.errors.push(...schema.errors);
    }
    this.schema = schema;
  }

  private parseTools(toolsNode: ElementNode): void {
    if (this.tools) {
      this.errors.push({
        span: toolsNode.tag,
        message: "Multiple <tools> elements in <template>",
      });
      return;
    }
    this.errors.push(...checkNoXmlAttributes(toolsNode));
    const textContent = extractTextContent(toolsNode, "yaml");
    if (textContent.kind === "error") {
      this.errors.push(...textContent.errors);
      return;
    }
    this.warnings.push(...textContent.warnings);
    const tools = parseYaml(textContent.text);
    if (tools.kind === "error") {
      this.errors.push(...tools.errors);
      return;
    }
    this.tools = tools;
  }

  private parseVariant(variantNode: ElementNode): void {
    const attrs = checkXmlAttributes(variantNode, {
      case: {
        schema: z.string(),
        expected: "a string",
      },
    });
    if (attrs.kind === "error") {
      this.errors.push(...attrs.errors);
      return;
    }
    const caseVal = attrs.attributes.case.value;
    const contentBuilder = new ContentBuilder();
    const children = checkAllAreElements(
      variantNode.children,
      ["meta", "system", "user", "examples"] as const,
      " in <variant>",
      this.errors,
    );
    for (const [tag, child] of children) {
      switch (tag) {
        case "system":
        case "user":
        case "examples": {
          contentBuilder.parse(tag, child, this.errors);
        }
      }
    }
    this.variants.push({
      tag: variantNode.tag,
      case: caseVal,
      content: contentBuilder,
    });
    this.warnings.push(...contentBuilder.warnings);
  }

  private buildContents(): TemplateContents | null {
    this.warnings.push(...this.topLevelContent.warnings);
    if (this.variants.length <= 0) {
      const templateTag = this.templateNode.tag;
      const content = this.topLevelContent.buildTopLevel(
        templateTag,
        this.errors,
      );
      if (content === null) {
        return null;
      }
      return { kind: "no-variants", content };
    } else {
      const defaultContent = this.topLevelContent.buildDefault();
      const defaultContentMask: {
        readonly [k in keyof TemplateContent]: boolean;
      } = {
        meta: !!defaultContent.meta,
        system: !!defaultContent.system,
        user: !!defaultContent.user,
        examples: !!defaultContent.examples,
      };
      const variants: TemplateVariant[] = [];
      for (const v of this.variants) {
        const content = v.content.buildVariant(
          v.tag,
          defaultContentMask,
          this.errors,
        );
        if (content === null) continue;
        variants.push({ tag: v.tag, case: v.case, content });
      }
      return { kind: "variants", variants, defaultContent };
    }
  }

  private parseSnippet(snippetNode: ElementNode): void {
    const attrs = checkXmlAttributes(snippetNode, {
      name: {
        schema: z.string().regex(/^[a-z][A-Za-z0-9]*$/),
        expected: "a lowerCamelCase identifier",
      },
      if: {
        schema: z.string().optional(),
        expected: "a string",
      },
      is: {
        schema: z.enum(["notNull", "notEmpty", "true"]).optional(),
        expected: "'notNull', 'notEmpty' or 'true'",
      },
      switch: {
        schema: z.string().optional(),
        expected: "a string",
      },
    });
    if (attrs.kind === "error") {
      this.errors.push(...attrs.errors);
      return;
    }
    if (attrs.attributes.is && !attrs.attributes.if) {
      this.errors.push({
        span: attrs.attributes.is.nameSpan,
        message: "'is' can only be used with an accompanying 'if' attribute",
      });
      return;
    }
    if (attrs.attributes.if && attrs.attributes.switch) {
      for (const span of [
        attrs.attributes.if.nameSpan,
        attrs.attributes.switch.nameSpan,
      ]) {
        const message = "Cannot have both 'if' and 'switch' attributes";
        this.errors.push({ span, message });
      }
      return;
    }
    if (attrs.attributes.if) {
      this.parseSnippetWithIf(
        snippetNode,
        attrs.attributes.name.value,
        attrs.attributes.if,
        attrs.attributes.is,
      );
    } else if (attrs.attributes.switch) {
      this.parseSnippetWithSwitch(
        snippetNode,
        attrs.attributes.name.value,
        attrs.attributes.switch,
      );
    } else {
      const body = parseBody(snippetNode, this.errors, {
        hasValContext: false,
      });
      this.snippets.push({
        kind: "snippet",
        name: attrs.attributes.name.value,
        body: body,
      });
    }
  }

  private parseSnippetWithIf(
    snippetNode: ElementNode,
    name: TextSpan,
    ifAttr: AttributeValue<string>,
    isAttr: AttributeValue<"notNull" | "notEmpty" | "true"> | undefined,
  ): void {
    const expression = parseExpression(ifAttr.value, {
      hasValContext: false,
    });
    if (expression.kind === "error") {
      this.errors.push(...expression.errors);
      return;
    }
    const branches: {
      then?: BodyInContext;
      else?: BodyInContext;
    } = {};
    const children = checkAllAreElements(
      snippetNode.children,
      ["then", "else"] as const,
      " in <snippet if='...'>",
      this.errors,
    );
    for (const [tag, child] of children) {
      switch (tag) {
        case "then":
        case "else": {
          this.errors.push(...checkNoXmlAttributes(child));
          if (branches[tag] !== undefined) {
            this.errors.push({
              span: child.tag,
              message: `Multiple <${tag}> elements in <snippet if='...'>`,
            });
          }
          branches[tag] = parseBody(child, this.errors, {
            hasValContext: true,
          });
          break;
        }
      }
    }
    for (const tag of ["then", "else"] as const) {
      if (!branches[tag]) {
        this.errors.push({
          span: snippetNode.tag,
          message: `Missing <${tag}> element in <snippet if='...'>`,
        });
        return;
      }
    }
    this.snippets.push({
      kind: "snippet-if",
      name,
      expression: expression.expression,
      is: isAttr?.value ?? null,
      then: branches.then!,
      else: branches.else!,
    });
  }

  private parseSnippetWithSwitch(
    snippetNode: ElementNode,
    name: TextSpan,
    switchAttr: AttributeValue<string>,
  ): void {
    const expression = parseExpression(switchAttr.value, {
      hasValContext: false,
    });
    if (expression.kind === "error") {
      this.errors.push(...expression.errors);
      return;
    }
    const branches: Array<{
      readonly case: TextSpan;
      readonly body: Body;
    }> = [];
    const seenOptions = new Set<string>();
    const children = checkAllAreElements(
      snippetNode.children,
      ["on"] as const,
      " in <snippet switch='...'>",
      this.errors,
    );
    for (const [tag, child] of children) {
      switch (tag) {
        case "on": {
          const attrs = checkXmlAttributes(child, {
            case: {
              schema: z.string(),
              expected: "a string",
            },
          });
          if (attrs.kind === "error") {
            this.errors.push(...attrs.errors);
            break;
          }
          const caseSpan = attrs.attributes.case.value;
          const body = parseBody(child, this.errors, { hasValContext: false });
          if (seenOptions.has(caseSpan.text)) {
            this.errors.push({
              span: attrs.attributes.case.value,
              message: `Duplicate case '${caseSpan}'`,
            });
          }
          seenOptions.add(caseSpan.text);
          branches.push({ case: caseSpan, body });
          break;
        }
      }
    }
    this.snippets.push({
      kind: "snippet-switch",
      name,
      switchTag: switchAttr.nameSpan,
      expression: expression.expression,
      branches: branches,
    });
  }

  private verifySnippets(contents: TemplateContents): void {
    // Verify that:
    // 1. All snippet names are unique.
    // 2. All <insert snippet='...'> references point to a valid snippet.
    // 3. Every snippet does not circularly references itself.
    // 4. All snippets are used.

    // Verify that all snippet names are unique.
    this.errors.push(...checkNameConflicts(this.snippets.map((s) => s.name)));
    if (this.errors.length !== 0) {
      return;
    }
    const snippets = this.indexSnippets();
    const seenSnippets = new Set<string>();
    const spanToError = new Map<Span, string>();

    const traverse = (
      body: Body | BodyInContext | undefined,
      inProgress: Set<Snippet>,
    ): void => {
      if (!body) return;
      for (const piece of body) {
        if (piece.kind !== "insert-snippet") continue;
        const snippetName = piece.snippet.text;
        const snippet = snippets[snippetName];
        if (!snippet) {
          spanToError.set(piece.snippet, `Unknown snippet '${snippetName}'`);
          continue;
        }
        if (inProgress.has(snippet)) {
          spanToError.set(
            piece.snippet,
            `Snippet '${snippetName}' circularly references itself`,
          );
          continue;
        }
        inProgress.add(snippet);
        switch (snippet.kind) {
          case "snippet": {
            traverse(snippet.body, inProgress);
            break;
          }
          case "snippet-if": {
            traverse(snippet.then, inProgress);
            traverse(snippet.else, inProgress);
            break;
          }
          case "snippet-switch": {
            for (const branch of snippet.branches) {
              traverse(branch.body, inProgress);
            }
            break;
          }
        }
        inProgress.delete(snippet);
        seenSnippets.add(snippetName);
      }
    };

    switch (contents.kind) {
      case "no-variants": {
        traverse(contents.content.system, new Set());
        traverse(contents.content.user, new Set());
        break;
      }
      case "variants": {
        traverse(contents.defaultContent.system, new Set());
        traverse(contents.defaultContent.user, new Set());
        for (const variant of contents.variants) {
          traverse(variant.content.system, new Set());
          traverse(variant.content.user, new Set());
        }
        break;
      }
    }

    for (const [span, error] of spanToError.entries()) {
      this.errors.push({ span, message: error });
    }

    for (const snippet of this.snippets) {
      if (!seenSnippets.has(snippet.name.text)) {
        this.errors.push({
          span: snippet.name,
          message: `Snippet '${snippet.name.text}' is never used`,
        });
      }
    }
  }

  private indexSnippets(): { readonly [name: string]: Snippet } {
    return Object.fromEntries(this.snippets.map((s) => [s.name.text, s]));
  }

  private readonly errors: InternalError[] = [];
  private schema: SchemaParseResult | InternalErrors | null = null;
  private tools: StrictJsonValue | null = null;
  private outputFormat: TextSpan<OutputFormat> | null = null;
  private readonly topLevelContent = new ContentBuilder();
  private readonly variants: VariantBuilder[] = [];
  private readonly snippets: Snippet[] = [];
  private readonly warnings: InternalError[] = [];
}

type VariantBuilder = {
  readonly tag: Span;
  /** Variant name. */
  readonly case: TextSpan;
  readonly content: ContentBuilder;
};

type WithTag<T> = {
  readonly value: T;
  readonly tag: Span;
};

class ContentBuilder {
  meta: TemplateMeta | undefined;
  system: WithTag<Body> | undefined;
  user: WithTag<Body> | undefined;
  examples: WithTag<StrictJsonValue> | undefined;
  warnings: InternalError[] = [];

  parse(
    tag: "meta" | "system" | "user" | "examples",
    e: ElementNode,
    errors: ErrorSink,
  ): void {
    if (this[tag] !== undefined) {
      errors.push({
        span: e.tag,
        message: `Multiple <${tag}> elements`,
      });
      return;
    }
    switch (tag) {
      case "meta": {
        errors.push(...checkNoXmlAttributes(e));
        const textContent = extractTextContent(e, "yaml");
        if (textContent.kind === "error") {
          errors.push(...textContent.errors);
        } else {
          this.warnings.push(...textContent.warnings);
          const meta = parseYaml(textContent.text);
          if (meta.kind === "error") {
            errors.push(...meta.errors);
          } else {
            this.meta = { value: meta, tag: e.tag };
          }
        }
        break;
      }
      case "system":
      case "user": {
        const body = parseBody(e, errors, { hasValContext: false });
        this[tag] = { value: body, tag: e.tag };
        break;
      }
      case "examples": {
        const textContent = extractTextContent(e, "yaml");
        if (textContent.kind === "error") {
          errors.push(...textContent.errors);
        } else {
          this.warnings.push(...textContent.warnings);
          const examples = parseYaml(textContent.text);
          if (examples.kind === "error") {
            errors.push(...examples.errors);
          } else {
            this.examples = { value: examples, tag: e.tag };
          }
        }
        break;
      }
    }
  }

  /** Builds the top-level template content when there are no variants. */
  buildTopLevel(templateTag: Span, errors: ErrorSink): TemplateContent | null {
    for (const tag of ["system", "user"] as const) {
      if (!this[tag]) {
        errors.push({
          span: templateTag,
          message: `Missing <${tag}> element`,
        });
      }
    }

    if (!this.system || !this.user) {
      return null;
    }

    return {
      meta: this.meta,
      system: this.system!.value,
      user: this.user!.value,
      examples: this.examples?.value,
    };
  }

  /**
   * Builds the default template content when there are variants.
   * The default content is used to fill in missing fields in each variant.
   */
  buildDefault(): Partial<TemplateContent> {
    return {
      meta: this.meta,
      system: this.system?.value,
      user: this.user?.value,
      examples: this.examples?.value,
    };
  }

  /**
   * Builds the template content for a variant.
   * Missing fields can be found in the default content returned by
   * {@link buildDefault}.
   */
  buildVariant(
    variantTag: Span,
    defaultContentMask: { readonly [k in keyof TemplateContent]: boolean },
    errors: ErrorSink,
  ): Partial<TemplateContent> {
    for (const tag of ["meta", "system", "user", "examples"] as const) {
      if (this[tag] && defaultContentMask[tag]) {
        errors.push({
          span: this[tag].tag,
          message: `<${tag}> is already specified at the <template> level`,
          hint: `Remove the <${tag}> element from the <template> level or from the <variant> level`,
        });
      }

      switch (tag) {
        case "system":
        case "user": {
          if (!this[tag] && !defaultContentMask[tag]) {
            errors.push({
              span: variantTag,
              message: `Missing <${tag}> element`,
            });
          }
        }
      }
    }

    return {
      meta: this.meta,
      system: this.system?.value,
      user: this.user?.value,
      examples: this.examples?.value,
    };
  }
}
