import { parseDocument, Scalar, YAMLMap } from "yaml";
import { z } from "zod";
import { InternalError, InternalErrors } from "../util/shared-types.js";

export type Config = {
  /// Glob pattern to match template files to be processed.
  /// Usually: 'prompts/**/*.xml'.
  readonly include: string;

  readonly gen?: {
    readonly cpp?: {
      /** Path to the generated .h file. */
      readonly file: string;
      readonly rootNamespace: string;
    };
    readonly csharp?: {
      /** Path to the generated .cs file. */
      readonly file: string;
      readonly rootNamespace: string;
    };
    readonly dart?: {
      /** Path to the generated .dart file. */
      readonly file: string;
    };
    readonly kotlin?: {
      /** Path to the generated .kt file. */
      readonly file: string;
      readonly package: string;
    };
    readonly python?: {
      /** Path to the generated .py file. */
      readonly file: string;
    };
    readonly rust?: {
      /** Path to the generated .rs file. */
      readonly file: string;
    };
    readonly swift?: {
      /** Path to the generated .swift file. */
      readonly file: string;
      readonly rootNamespace: string;
    };
    readonly typescript?: {
      /** Path to the generated .ts file. */
      readonly file: string;
    };
  };
};

export interface ConfigParseSuccess {
  readonly kind: "success";
  readonly config: Config;
}

export type ConfigParseResult = ConfigParseSuccess | InternalErrors;

export function parseConfigYaml(content: string): ConfigParseResult {
  const doc = parseDocument(content);

  if (doc.errors.length >= 1) {
    return {
      kind: "error",
      errors: doc.errors.map((e) => ({
        span: { start: e.pos[0], end: e.pos[1] },
        message: e.message,
      })),
    };
  }

  const parseResult = RawConfigSchema.safeParse(doc.toJS());

  if (!parseResult.success) {
    return {
      kind: "error",
      errors: parseResult.error.issues.map((issue) =>
        makeSchemaIssueError(issue, doc),
      ),
    };
  }

  return { kind: "success", config: parseResult.data };
}

const RawConfigSchema = z
  .object({
    include: z.string().min(1, "must be a non-empty string"),
    gen: z
      .object({
        cpp: z
          .object({
            file: z
              .string()
              .refine((f) => f.endsWith(".h"), "must end with '.h'"),
            rootNamespace: z
              .string()
              .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be a valid identifier")
              .optional()
              .default("typeprompt"),
          })
          .strict()
          .optional(),
        csharp: z
          .object({
            file: z
              .string()
              .refine((f) => f.endsWith(".cs"), "must end with '.cs'"),
            rootNamespace: z
              .string()
              .regex(
                /^[A-Z][A-Za-z0-9_]*$/,
                "must be a valid PascalCase identifier",
              )
              .optional()
              .default("TypePrompt"),
          })
          .strict()
          .optional(),
        dart: z
          .object({
            file: z
              .string()
              .refine((f) => f.endsWith(".dart"), "must end with '.dart'"),
          })
          .strict()
          .optional(),
        kotlin: z
          .object({
            file: z
              .string()
              .refine((f) => f.endsWith(".kt"), "must end with '.kt'"),
            package: z
              .string()
              .regex(
                /^([a-z_$][a-z0-9_$]*)(\.[a-z_$][a-z0-9_$]*)*$/,
                "must be a valid snake_case identifier",
              ),
          })
          .strict()
          .optional(),
        python: z
          .object({
            file: z
              .string()
              .refine((f) => f.endsWith(".py"), "must end with '.py'"),
          })
          .strict()
          .optional(),
        rust: z
          .object({
            file: z
              .string()
              .refine((f) => f.endsWith(".rs"), "must end with '.rs'"),
          })
          .strict()
          .optional(),
        swift: z
          .object({
            file: z
              .string()
              .refine((f) => f.endsWith(".swift"), "must end with '.swift'"),
            rootNamespace: z
              .string()
              .regex(
                /^[A-Z][A-Za-z0-9_]*$/,
                "must be a valid PascalCase identifier",
              )
              .optional()
              .default("TypePrompt"),
          })
          .strict()
          .optional(),
        typescript: z
          .object({
            file: z
              .string()
              .refine((f) => f.endsWith(".ts"), "must end with '.ts'"),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function makeSchemaIssueError(
  issue: z.core.$ZodIssue,
  doc: ReturnType<typeof parseDocument>,
): InternalError {
  // Walk up the path until we find a node with a source range.
  let nodePath = [...issue.path] as PropertyKey[];
  let node: Scalar | YAMLMap | undefined;
  while (nodePath.length >= 1) {
    const candidate = doc.getIn(nodePath, true);
    if (candidate instanceof Scalar || candidate instanceof YAMLMap) {
      node = candidate;
      break;
    }
    nodePath = nodePath.slice(0, -1);
  }

  const span = node?.range
    ? { start: node.range[0], end: node.range[1] }
    : { start: 0, end: 0 };

  if (issue.code === "unrecognized_keys") {
    const keys = issue.keys.map((key) => `'${key}'`).join(", ");
    return { span, message: `Unknown config field(s): ${keys}` };
  }

  const issuePath = formatIssuePath(issue.path);
  return {
    span,
    message: `Invalid value for '${issuePath}': ${issue.message}`,
  };
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length <= 0) {
    return "<root>";
  }
  return path
    .map((part) => (typeof part === "number" ? `[${part}]` : String(part)))
    .join(".");
}
