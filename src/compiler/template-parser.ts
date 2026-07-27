import { JsonValue } from "../json/json-types.js";
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
} from "../xml/xml-attributes-checker.js";
import type { ElementNode } from "../xml/xml-types.js";
import {
  Body,
  BodyInContext,
  OutputFormat,
  PromptContent,
  PromptContents,
  PromptVariant,
  Snippet,
  Template,
} from "./compiler-types.js";

import * as z from "zod";
import { parseExpression } from "../expression/expression-parser.js";
import { checkNoAmbiguity } from "../util/casing.js";
import { checkAllAreElements } from "../xml/xml-node-checker.js";
import { parseBody } from "./body-parser.js";
import { extractTextContent } from "./text-extractor.js";

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

    this.parseChildren();
    const contents = this.buildPromptContents();
    if (contents) {
      this.verifySnippets(contents);
    }

    if (this.errors.length > 0) {
      return { kind: "error", errors: this.errors };
    }

    return {
      kind: "success",
      tag: this.templateNode.tag,
      name: name.valueSpan,
      namespace: namespace?.valueSpan ?? null,
      meta: this.meta,
      schema: this.schema!,
      outputFormat: this.outputFormat,
      contents: contents!,
      snippets: this.snippets,
    };
  }

  private parseChildren(): void {
    const children = checkAllAreElements(
      this.templateNode.children,
      [
        "meta",
        "schema",
        "snippet",
        "system",
        "user",
        "examples",
        "variant",
      ] as const,
      " in <template>",
      this.errors,
    );
    for (const [tag, child] of children) {
      switch (tag) {
        case "meta": {
          this.parseMeta(child);
          break;
        }
        case "schema": {
          this.parseSchema(child);
          break;
        }
        case "snippet": {
          this.parseSnippet(child);
          break;
        }
        case "system":
        case "user":
        case "examples": {
          this.topLevelPrompt.parse(child, this.errors);
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

  private parseMeta(metaNode: ElementNode): void {
    if (this.meta !== null) {
      this.errors.push({
        span: metaNode.tag,
        message: "Multiple <meta> elements found in <template>",
      });
    }
    this.errors.push(...checkNoXmlAttributes(metaNode));
    const textContent = extractTextContent(metaNode);
    if (textContent.kind === "error") {
      this.errors.push(...textContent.errors);
      return;
    }
    const meta = parseYaml(textContent.text);
    if (meta.kind === "error") {
      this.errors.push(...meta.errors);
    } else {
      this.meta = meta;
    }
  }

  private parseSchema(schemaNode: ElementNode): void {
    if (this.meta !== null) {
      this.errors.push({
        span: schemaNode.tag,
        message: "Multiple <schema> elements found in <template>",
      });
    }
    const attrs = checkXmlAttributes(schemaNode, {
      "output-format": {
        schema: z
          .string()
          .regex(/^[a-z][A-Za-z0-9]*$/)
          .optional(),
        expected: "a lowerCamelCase identifier",
      },
    });
    if (attrs.kind === "error") {
      this.errors.push(...attrs.errors);
    } else {
      const outputFormat = attrs.attributes["output-format"];
      if (outputFormat) {
        this.outputFormat = this.parseOutputFormat(outputFormat.valueSpan);
      }
    }
    const textContent = extractTextContent(schemaNode);
    if (textContent.kind === "error") {
      this.errors.push(...textContent.errors);
      return;
    }
    const schema = parseSchema(textContent.text);
    if (schema.kind === "error") {
      this.errors.push(...schema.errors);
    } else {
      this.schema = schema;
    }
  }

  private parseOutputFormat(format: TextSpan): OutputFormat | null {
    const { text } = format;
    if (!/^[a-z][A-Za-z0-9]*$/.test(text)) {
      this.errors.push({
        span: format,
        message: "Expected: lowerCamelCase identifier",
      });
      return null;
    }
    const kind = text === "json" || text === "text" ? text : "custom";
    return {
      kind: kind,
      format: format,
    };
  }

  private parseVariant(variantNode: ElementNode): void {
    const attrs = checkXmlAttributes(variantNode, {
      name: {
        schema: z.string().regex(/^[a-z][A-Za-z0-9]*$/),
        expected: "a lowerCamelCase identifier",
      },
    });
    if (attrs.kind === "error") {
      this.errors.push(...attrs.errors);
      return;
    }
    const variant = attrs.attributes.name.valueSpan;
    const promptBuilder = new PromptBuilder();
    const children = checkAllAreElements(
      variantNode.children,
      ["system", "user", "examples"] as const,
      " in <variant>",
      this.errors,
    );
    for (const [tag, child] of children) {
      switch (tag) {
        case "system":
        case "user":
        case "examples": {
          promptBuilder.parse(child, this.errors);
        }
      }
    }
    this.variants.push({
      tag: variantNode.tag,
      variant: variant,
      content: promptBuilder,
    });
  }

  private buildPromptContents(): PromptContents | null {
    if (this.variants.length <= 0) {
      const templateTag = this.templateNode.tag;
      const content = this.topLevelPrompt.build(templateTag, null, this.errors);
      if (content === null) {
        return null;
      }
      return {
        kind: "no-variants",
        content: content,
      };
    } else {
      const topLevelPrompt = this.topLevelPrompt.buildPartial();
      const variants: PromptVariant[] = [];
      for (const v of this.variants) {
        const content = v.content.build(v.tag, topLevelPrompt, this.errors);
        if (content === null) continue;
        const { variant } = v;
        variants.push({ variant, content });
      }
      return {
        kind: "variants",
        variants: variants,
      };
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
        schema: z.enum(["notNull", "notEmpty"]).optional(),
        expected: "'notNull' or 'notEmpty'",
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
        attrs.attributes.if,
        attrs.attributes.is,
      );
    } else if (attrs.attributes.switch) {
      this.parseSnippetWithSwitch(snippetNode, attrs.attributes.switch);
    } else {
      const body = parseBody(snippetNode, this.errors, { hasValContext: true });
      this.snippets.push({
        kind: "snippet",
        name: attrs.attributes.name.valueSpan,
        body: body,
      });
    }
  }

  private parseSnippetWithIf(
    snippetNode: ElementNode,
    ifAttr: AttributeValue<string>,
    isAttr: AttributeValue<"notNull" | "notEmpty"> | undefined,
  ): void {
    const expression = parseExpression(ifAttr.valueSpan, {
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
      name: snippetNode.tag,
      expression: expression.expression,
      is: isAttr?.value ?? null,
      then: branches.then!,
      else: branches.else!,
    });
  }

  private parseSnippetWithSwitch(
    snippetNode: ElementNode,
    switchAttr: AttributeValue<string>,
  ): void {
    const expression = parseExpression(switchAttr.valueSpan, {
      hasValContext: false,
    });
    if (expression.kind === "error") {
      this.errors.push(...expression.errors);
      return;
    }
    const cases: Array<{
      readonly option: string;
      readonly body: BodyInContext;
    }> = [];
    const seenOptions = new Set<string>();
    const children = checkAllAreElements(
      snippetNode.children,
      ["case"] as const,
      " in <snippet switch='...'>",
      this.errors,
    );
    for (const [tag, child] of children) {
      switch (tag) {
        case "case": {
          const attrs = checkXmlAttributes(child, {
            when: {
              schema: z.string().regex(/^[A-Za-z0-9]+(,[A-Za-z0-9]+)*$/),
              expected: "comma-separated identifiers",
            },
          });
          if (attrs.kind === "error") {
            this.errors.push(...attrs.errors);
            break;
          }
          const options = attrs.attributes.when.valueSpan.text.split(",");
          const body = parseBody(child, this.errors, {
            hasValContext: true,
          });
          for (const option of options) {
            if (seenOptions.has(option)) {
              this.errors.push({
                span: attrs.attributes.when.valueSpan,
                message: `Duplicate option '${option}'`,
              });
            }
            seenOptions.add(option);
            cases.push({ option, body });
          }
          break;
        }
      }
    }
    this.snippets.push({
      kind: "snippet-switch",
      name: snippetNode.tag,
      expression: expression.expression,
      cases: cases,
    });
  }

  private verifySnippets(contents: PromptContents): void {
    // Verify that:
    // 1. All snippet names are unique.
    // 2. All <insert snippet='...'> references point to a valid snippet.
    // 3. Every snippet does not circularly references itself.
    // 4. All snippets are used.

    // Verify that all snippet names are unique.
    this.errors.push(
      ...checkNoAmbiguity(
        this.snippets.map((s) => s.name),
        { exactMatchIsConflict: true },
      ),
    );
    if (this.errors.length !== 0) {
      return;
    }
    const snippets = this.indexSnippets();
    const seenSnippets = new Set<string>();
    const spanToError = new Map<Span, string>();

    const traverse = (
      body: Body | BodyInContext,
      inProgress: Set<Snippet>,
    ): void => {
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
          case "snippet":
            traverse(snippet.body, inProgress);
            break;
          case "snippet-if":
            traverse(snippet.then, inProgress);
            traverse(snippet.else, inProgress);
            break;
          case "snippet-switch":
            for (const c of snippet.cases) {
              traverse(c.body, inProgress);
            }
            break;
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
  private meta: JsonValue<"strict"> | null = null;
  private schema: SchemaParseResult | null = null;
  private outputFormat: OutputFormat | null = null;
  private readonly topLevelPrompt = new PromptBuilder();
  private readonly variants: VariantBuilder[] = [];
  private readonly snippets: Snippet[] = [];
}

type VariantBuilder = {
  readonly tag: Span;
  /** Variant name. */
  readonly variant: TextSpan;
  readonly content: PromptBuilder;
};

type PartialPromptContent = {
  readonly system?: Body;
  readonly user?: Body;
  readonly examples?: JsonValue<"strict">;
};

type WithSpan<T> = {
  readonly value: T;
  readonly span: Span;
};

class PromptBuilder {
  system: WithSpan<Body> | undefined;
  user: WithSpan<Body> | undefined;
  examples: WithSpan<JsonValue<"strict">> | undefined;

  parse(e: ElementNode, errors: ErrorSink): void {
    const tag = e.tag.text;
    switch (tag) {
      case "system":
      case "user": {
        if (this[tag] !== undefined) {
          errors.push({
            span: e.tag,
            message: `Multiple <${tag}> elements`,
          });
        }
        const body = parseBody(e, errors, { hasValContext: false });
        this[tag] = { value: body, span: e.tag };
        break;
      }
      case "examples": {
        if (this.examples !== undefined) {
          errors.push({
            span: e.tag,
            message: "Multiple <examples> elements",
          });
        }
        const textContent = extractTextContent(e);
        if (textContent.kind === "error") {
          errors.push(...textContent.errors);
        } else {
          const examples = parseYaml(textContent.text);
          if (examples.kind === "error") {
            errors.push(...examples.errors);
          } else {
            this.examples = { value: examples, span: e.tag };
          }
        }
        break;
      }
      default: {
        errors.push({
          span: e.tag,
          message: `Unexpected element <${tag}>`,
          suggestions: ["system", "user", "examples"],
        });
        break;
      }
    }
  }

  build(
    parentTag: Span,
    defaultPrompt: PartialPromptContent | null,
    errors: ErrorSink,
  ): PromptContent | null {
    for (const tag of ["system", "user", "examples"] as const) {
      if (this[tag] && defaultPrompt?.[tag]) {
        errors.push({
          span: this[tag].span,
          message: `<${tag}> is already specified at the <template> level`,
          hint: `Remove the <${tag}> element from the <template> level or from the <variant> level`,
        });
      }

      if (tag !== "examples" && !this[tag] && !defaultPrompt?.[tag]) {
        errors.push({
          span: parentTag,
          message: `Missing <${tag}> element`,
        });
      }
    }

    return {
      system: (this.system?.value ?? defaultPrompt?.system)!,
      user: (this.user?.value ?? defaultPrompt?.user)!,
      examples: this.examples?.value ?? defaultPrompt?.examples ?? null,
    };
  }

  buildPartial(): PartialPromptContent {
    return {
      system: this.system?.value,
      user: this.user?.value,
      examples: this.examples?.value,
    };
  }
}
