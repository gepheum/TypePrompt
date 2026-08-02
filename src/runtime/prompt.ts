// import * as z from "zod";
// import { Body, BodyPiece, Expression, InsertFormat, OutputFormat, Snippet, Templates } from "./runtime-types.js";

// export type Template<Input, Output> = {
//   readonly make: (input: Input) => Prompt<Output, Input>;
// };

// export type Prompt<Output, Input = unknown> = {
//   readonly meta: Meta;
//   readonly systemInstructions: string;
//   readonly userInstructions: string;
//   readonly examples: readonly FewShotExample[];
//   readonly outputType: z.ZodType<Output>;
//   readonly templateId: TemplateId;
//   readonly templateInput: Input;
// };

// export type FewShotExample = {
//   readonly userInstructions: string;
//   readonly assistantResponse: string;
// };

// // <generated>

// export type Meta = {};

// export type TemplateId = string;

// // </generated>

// function resolveTemplate<Input, Output>(
//   templateId: string,
//   templates: Templates,
//   input: Input,
// ): Prompt<Output, Input> {
//   const template = templates.templates[templateId];
//   if (!template) {
//     throw new Error(`Template '${templateId}' not found`);
//   }
//   const {contents, snippets} = template;

//   let meta: Meta;
//   let systemInstructions: string;
//   let userInstructions: string;
//   let examples: readonly FewShotExample[];
//   if (contents.kind === "no-variants") {
//     const {content} = contents;
//     meta = contents.meta;
//     systemInstructions = resolveBody(content.system, input, snippets);
//     userInstructions = resolveBody(content.user, input, snippets);
//   } else {
//     const {defaultContent} = contents;
//     const {variant} = input as {readonly variant: string};
//     const variantContents = contents.variants[variant];
//   }
//   return {
//     meta,
//     systemInstructions,
//     userInstructions,
//     templateId,
//   };
// }

// function resolveBody<Input>(
//   body: Body,
//   input: Input,
//   snippets: {readonly [c: string]: Snippet},
// ): string {
//   const resolvePiece = (piece: BodyPiece): string => {
//     switch (piece.kind) {
//       case "text": {
//         return piece.text;
//       }
//       case "insert-snippet": {
//         const snippet = snippets[piece.snippet];
//         if (!snippet) {
//           throw new Error(`Snippet '${piece.snippet}' not found`);
//         }
//         return indent(resolveBody(snippet, input, snippets), piece.indent);
//       }
//       case "insert-val": {
//         const val = evaluate(input, piece.val);
//         return indent(format(val, piece.format), piece.indent);
//       }
//     }
//   };
//   return body.map(resolvePiece).join("");
// }

// function indent(text: string, spaces: string): string {
//   if (spaces.length <= 0) {
//     return text;
//   } else {
//     return text.replace(/\n/g, `\n${spaces}`);
//   }
// }

// function evaluate<Input>(input: Input, expression: Expression): unknown {
//   switch (expression.kind) {
//     case "input": {
//       return input;
//     }
//     case "property": {
//       const {property} = expression;
//       return (input as Record<string, unknown>)[property];
//     }
//   }
// }

// function format(input: unknown, format?: InsertFormat): string {
//   switch (format) {
//     case "text": {
//       if (typeof(input) === "string") {
//         return input;
//       } else {
//         return String(input);
//       }
//     }
//     case "json": {
//       return JSON.stringify(input, undefined, 2);
//     }
//   }
// }
