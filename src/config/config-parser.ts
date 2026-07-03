import { parse as parseToml } from "smol-toml";
import { z } from "zod";

export type Config = {
  /// Glob pattern to match template files to be processed.
  /// Defaults to `prompts/*.xml`.
  readonly input?: string;
  /// Path to the generated Python file.
  readonly generatedDotPyPath?: string;
  /// Path to the generated TypeScript file.
  readonly generatedDotTsPath?: string;
};

export class ConfigParseError extends Error {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    super(messages.join("\n"));
    this.name = "ConfigParseError";
    this.messages = messages;
  }
}

export interface ParseConfigTomlArgs {
  readonly content: string;
  readonly path: string;
}

export function parseConfigToml(args: ParseConfigTomlArgs): Config {
  const parsedToml = parseTomlWithClearError(args.content, args.path);
  const parseResult = RawConfigSchema.safeParse(parsedToml);

  if (!parseResult.success) {
    throw new ConfigParseError(
      parseResult.error.issues.map((issue) =>
        formatSchemaIssue(args.path, issue),
      ),
    );
  }

  return parseResult.data;
}

const RawConfigSchema = z
  .object({
    input: z.string().min(1, "must be a non-empty string").optional(),
    generatedDotPyPath: z
      .string()
      .min(1, "must be a non-empty string")
      .optional(),
    generatedDotTsPath: z
      .string()
      .min(1, "must be a non-empty string")
      .optional(),
    // Compatibility aliases with clearer names.
    generatedPythonPath: z
      .string()
      .min(1, "must be a non-empty string")
      .optional(),
    generatedTypeScriptPath: z
      .string()
      .min(1, "must be a non-empty string")
      .optional(),
  })
  .strict()
  .superRefine((raw, ctx) => {
    if (
      raw.generatedDotPyPath !== undefined &&
      raw.generatedPythonPath !== undefined &&
      raw.generatedDotPyPath !== raw.generatedPythonPath
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["generatedPythonPath"],
        message:
          "conflicts with 'generatedDotPyPath' (both are set with different values)",
      });
    }

    if (
      raw.generatedDotTsPath !== undefined &&
      raw.generatedTypeScriptPath !== undefined &&
      raw.generatedDotTsPath !== raw.generatedTypeScriptPath
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["generatedTypeScriptPath"],
        message:
          "conflicts with 'generatedDotTsPath' (both are set with different values)",
      });
    }
  })
  .transform((raw): Config => {
    const config: {
      /// Glob pattern to match .tp files to be processed.
      /// Defaults to `prompts/*.tp`.
      input?: string;
      /// Path to the generated Python file.
      generatedDotPyPath?: string;
      /// Path to the generated TypeScript file.
      generatedDotTsPath?: string;
    } = {};

    if (raw.input !== undefined) {
      config.input = raw.input;
    }
    if (raw.generatedDotPyPath !== undefined) {
      config.generatedDotPyPath = raw.generatedDotPyPath;
    } else if (raw.generatedPythonPath !== undefined) {
      config.generatedDotPyPath = raw.generatedPythonPath;
    }
    if (raw.generatedDotTsPath !== undefined) {
      config.generatedDotTsPath = raw.generatedDotTsPath;
    } else if (raw.generatedTypeScriptPath !== undefined) {
      config.generatedDotTsPath = raw.generatedTypeScriptPath;
    }

    return config;
  });

function parseTomlWithClearError(content: string, path: string): unknown {
  try {
    return parseToml(content);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigParseError([`${path}: invalid TOML syntax: ${reason}`]);
  }
}

function formatSchemaIssue(path: string, issue: z.ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    const keys = issue.keys.map((key) => `'${key}'`).join(", ");
    return `${path}: unknown config field(s): ${keys}`;
  }

  const issuePath = formatIssuePath(issue.path);
  return `${path}: invalid value for '${issuePath}': ${issue.message}`;
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "<root>";
  }
  return path
    .map((part) => (typeof part === "number" ? `[${part}]` : String(part)))
    .join(".");
}
