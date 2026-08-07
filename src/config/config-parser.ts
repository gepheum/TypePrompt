import { LineCounter, parseDocument, Scalar, YAMLMap } from "yaml";
import { z } from "zod";

export type Config = {
  /// Glob pattern to match template files to be processed.
  /// Defaults to `prompts/*.xml`.
  readonly input?: string;

  readonly gen: {
    readonly typescript?:
      | {
          readonly enabled: false;
        }
      | {
          readonly enabled: true;
          /** Path to the generated .ts file. */
          readonly file: string;
        };
    readonly python?:
      | {
          readonly enabled: false;
        }
      | {
          readonly enabled: true;
          /** Path to the generated .py file. */
          readonly file: string;
        };
  };
};

export interface ConfigParseError {
  readonly ok: false;
  readonly messages: readonly string[];
}

export interface ConfigParseSuccess {
  readonly ok: true;
  readonly config: Config;
}

export type ConfigParseResult = ConfigParseSuccess | ConfigParseError;

export interface ParseConfigYamlArgs {
  readonly content: string;
  readonly path: string;
}

export function parseConfigYaml(args: ParseConfigYamlArgs): ConfigParseResult {
  const lineCounter = new LineCounter();
  const doc = parseDocument(args.content, { lineCounter });

  if (doc.errors.length > 0) {
    return {
      ok: false,
      messages: doc.errors.map((e) => {
        const pos = lineCounter.linePos(e.pos[0]);
        return `${args.path}:${pos.line}:${pos.col}: ${e.message}`;
      }),
    };
  }

  const parseResult = RawConfigSchema.safeParse(doc.toJS());

  if (!parseResult.success) {
    return {
      ok: false,
      messages: parseResult.error.issues.map((issue) =>
        formatSchemaIssue(args.path, issue, doc, lineCounter),
      ),
    };
  }

  return { ok: true, config: parseResult.data };
}

const RawConfigSchema = z
  .object({
    input: z.string().min(1, "must be a non-empty string").optional(),
    gen: z
      .object({
        typescript: z
          .discriminatedUnion("enabled", [
            z.object({ enabled: z.literal(false) }).strict(),
            z
              .object({
                enabled: z.literal(true),
                file: z
                  .string()
                  .refine((f) => f.endsWith(".ts"), `must end with '.ts'`),
              })
              .strict(),
          ])
          .optional(),
        python: z.discriminatedUnion("enabled", [
          z.object({ enabled: z.literal(false) }).strict(),
          z
            .object({
              enabled: z.literal(true),
              file: z
                .string()
                .refine((f) => f.endsWith(".py"), `must end with '.py'`),
            })
            .strict(),
        ]),
      })
      .strict(),
  })
  .strict();

function formatSchemaIssue(
  filePath: string,
  issue: z.core.$ZodIssue,
  doc: ReturnType<typeof parseDocument>,
  lineCounter: LineCounter,
): string {
  // Walk up the path until we find a node with a source range.
  let nodePath = [...issue.path] as PropertyKey[];
  let node: Scalar | YAMLMap | undefined;
  while (nodePath.length > 0) {
    const candidate = doc.getIn(nodePath, true);
    if (candidate instanceof Scalar || candidate instanceof YAMLMap) {
      node = candidate;
      break;
    }
    nodePath = nodePath.slice(0, -1);
  }

  const locationPrefix = node?.range
    ? ((): string => {
        const pos = lineCounter.linePos(node.range[0]);
        return `${filePath}:${pos.line}:${pos.col}`;
      })()
    : filePath;

  if (issue.code === "unrecognized_keys") {
    const keys = issue.keys.map((key) => `'${key}'`).join(", ");
    return `${locationPrefix}: unknown config field(s): ${keys}`;
  }

  const issuePath = formatIssuePath(issue.path);
  return `${locationPrefix}: invalid value for '${issuePath}': ${issue.message}`;
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "<root>";
  }
  return path
    .map((part) => (typeof part === "number" ? `[${part}]` : String(part)))
    .join(".");
}
