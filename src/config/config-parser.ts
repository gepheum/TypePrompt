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

export class ConfigParseError extends Error {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    super(messages.join("\n"));
    this.name = "ConfigParseError";
    this.messages = messages;
  }
}

export interface ParseConfigYamlArgs {
  readonly content: string;
  readonly path: string;
}

export function parseConfigYaml(args: ParseConfigYamlArgs): Config {
  const lineCounter = new LineCounter();
  const doc = parseDocument(args.content, { lineCounter });

  if (doc.errors.length > 0) {
    throw new ConfigParseError(
      doc.errors.map((e) => {
        const pos = lineCounter.linePos(e.pos[0]);
        return `${args.path}:${pos.line}:${pos.col}: ${e.message}`;
      }),
    );
  }

  const parseResult = RawConfigSchema.safeParse(doc.toJS());

  if (!parseResult.success) {
    throw new ConfigParseError(
      parseResult.error.issues.map((issue) =>
        formatSchemaIssue(args.path, issue, doc, lineCounter),
      ),
    );
  }

  return parseResult.data;
}

const langSchema = (ext: string) =>
  z
    .discriminatedUnion("enabled", [
      z.object({ enabled: z.literal(false) }).strict(),
      z
        .object({
          enabled: z.literal(true),
          file: z
            .string()
            .min(1, "must be a non-empty string")
            .refine((f) => f.endsWith(ext), `must end with '${ext}'`),
        })
        .strict(),
    ])
    .optional();

const RawConfigSchema = z
  .object({
    input: z.string().min(1, "must be a non-empty string").optional(),
    gen: z
      .object({
        typescript: langSchema(".ts"),
        python: langSchema(".py"),
      })
      .strict()
      .default({}),
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
    ? (() => {
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
