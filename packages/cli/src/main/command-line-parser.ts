export type ParsedArgs =
  | {
      kind: "gen";
      subcommand?: "watch";
      project?: string;
    }
  | {
      kind: "format";
      subcommand?: "ci";
      project?: string;
    }
  | {
      kind: "init";
      project?: string;
    }
  | {
      kind: "patch";
      output: string;
      base: string;
    }
  | {
      kind: "help";
      project?: undefined;
    }
  | {
      kind: "version";
      project?: undefined;
    }
  | {
      kind: "error";
      project?: undefined;
    };

/**
 * Parse command-line arguments and return a structured representation.
 *
 * @param args - Array of command-line arguments (typically process.argv.slice(2))
 * @returns ParsedCommandLine object representing the command and its options
 */
export function parseCommandLine(args: string[]): ParsedArgs {
  if (args.length <= 0) {
    printHelp();
    return { kind: "help" };
  }

  const command = args[0];

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return { kind: "help" };
  }

  if (command === "version" || command === "--version" || command === "-v") {
    return { kind: "version" };
  }

  const validCommands = ["gen", "format", "init", "patch"];
  if (!command || !validCommands.includes(command)) {
    printError(`Unknown command: ${command}`);
    printHelp();
    return { kind: "error" };
  }

  try {
    const options = parseOptions(args.slice(1));

    switch (command) {
      case "gen":
        return buildGenCommand(options);
      case "format":
        return buildFormatCommand(options);
      case "init":
        return buildInitCommand(options);
      case "patch":
        return buildPatchCommand(options);
      default:
        throw new CommandLineParseError(`Unexpected command: ${command}`);
    }
  } catch (error) {
    if (error instanceof CommandLineParseError) {
      printError(error.message);
      return { kind: "error" };
    }
    throw error;
  }
}

const COMMAND_BASE = "npx typeprompt";

const HELP_TEXT = `
Usage: ${COMMAND_BASE} <command> [options]

Commands:
  init         Initialize a TypePrompt project in the current directory
  gen          Generate code from template files to target languages
  format       Format all template files
  patch        Initialize a patch project against a base project
  help         Display this help message

Options:
  -p <path>    Path to the directory containing the typeprompt.yaml file
  -b <path>    Path to base project directory or templates.json file (patch only)
  -o <path>    Path to output patch project directory (patch only)
  --watch, -w  Automatically run code generation when template files change
                 (gen only)
  --ci         Fail if code is not properly formatted (format only)

Examples:
  ${COMMAND_BASE} init
  ${COMMAND_BASE} gen
  ${COMMAND_BASE} gen --watch
  ${COMMAND_BASE} format -p path/to/project
  ${COMMAND_BASE} format --ci -p path/to/project
  ${COMMAND_BASE} patch -b path/to/base -o path/to/patch
`;

export class CommandLineParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandLineParseError";
  }
}

type ParsedOptions = {
  project?: string;
  output?: string;
  base?: string;
  watch?: boolean;
  ci?: boolean;
  unknown: string[];
};

function parseOptions(args: string[]): ParsedOptions {
  const options: ParsedOptions = {
    unknown: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    let matched = false;

    for (const [key, flags] of STRING_OPTIONS) {
      for (const flag of flags) {
        if (arg.startsWith(`${flag}=`)) {
          const value = arg.substring(flag.length + 1);
          if (!value) {
            throw new CommandLineParseError(`Option ${flag} requires a value`);
          }
          if (options[key] !== undefined) {
            throw new CommandLineParseError(
              `Option ${flag} specified multiple times`,
            );
          }
          options[key] = value;
          matched = true;
          break;
        }
        if (arg === flag) {
          if (i + 1 >= args.length) {
            throw new CommandLineParseError(`Option ${arg} requires a value`);
          }
          if (options[key] !== undefined) {
            throw new CommandLineParseError(
              `Option ${arg} specified multiple times`,
            );
          }
          options[key] = args[++i];
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (matched) continue;

    for (const [key, flags] of BOOLEAN_OPTIONS) {
      if ((flags as readonly string[]).includes(arg)) {
        if (options[key]) {
          throw new CommandLineParseError(
            `Option ${arg} specified multiple times`,
          );
        }
        options[key] = true;
        matched = true;
        break;
      }
    }

    if (matched) continue;

    if (arg.startsWith("-")) {
      options.unknown.push(arg);
    } else {
      // Positional argument - not allowed anymore
      throw new CommandLineParseError(`Unexpected argument: ${arg}`);
    }
  }

  return options;
}

type OptionKey = keyof Omit<ParsedOptions, "unknown">;

const OPTION_FLAGS: Record<OptionKey, string> = {
  project: "--project",
  output: "--output",
  base: "--base",
  watch: "--watch",
  ci: "--ci",
};

function validateAllowedOptions(
  options: ParsedOptions,
  command: string,
  allowed: readonly OptionKey[],
): void {
  validateNoUnknownOptions(options, command);

  const allowedSet = new Set<OptionKey>(allowed);
  for (const [key, flag] of Object.entries(OPTION_FLAGS) as [
    OptionKey,
    string,
  ][]) {
    if (!allowedSet.has(key) && options[key] !== undefined) {
      throw new CommandLineParseError(
        `Option ${flag} is not valid for '${command}' command`,
      );
    }
  }
}

function buildGenCommand(options: ParsedOptions): ParsedArgs {
  validateAllowedOptions(options, "gen", ["project", "watch"]);
  return {
    kind: "gen",
    project: options.project,
    subcommand: options.watch ? "watch" : undefined,
  };
}

function buildFormatCommand(options: ParsedOptions): ParsedArgs {
  validateAllowedOptions(options, "format", ["project", "ci"]);
  return {
    kind: "format",
    project: options.project,
    subcommand: options.ci ? "ci" : undefined,
  };
}

function buildInitCommand(options: ParsedOptions): ParsedArgs {
  validateAllowedOptions(options, "init", ["project"]);
  return {
    kind: "init",
    project: options.project,
  };
}

function buildPatchCommand(options: ParsedOptions): ParsedArgs {
  validateAllowedOptions(options, "patch", ["output", "base"]);
  if (options.base === undefined) {
    throw new CommandLineParseError(
      "Option --base is required for 'patch' command",
    );
  }
  if (options.output === undefined) {
    throw new CommandLineParseError(
      "Option --output is required for 'patch' command",
    );
  }
  return {
    kind: "patch",
    output: options.output,
    base: options.base,
  };
}

function validateNoUnknownOptions(
  options: ParsedOptions,
  command: string,
): void {
  if (options.unknown.length >= 1) {
    throw new CommandLineParseError(
      `Unknown option${options.unknown.length > 1 ? "s" : ""} for '${command}': ${options.unknown.join(", ")}`,
    );
  }
}

function printHelp(): void {
  console.log(HELP_TEXT);
}

function printError(message: string): void {
  console.error(`Error: ${message}\n`);
}

const STRING_OPTIONS = [
  ["project", ["--project", "-p"] as const],
  ["output", ["--output", "-o"] as const],
  ["base", ["--base", "-b"] as const],
] as const;

const BOOLEAN_OPTIONS = [
  ["watch", ["--watch", "-w"] as const],
  ["ci", ["--ci"] as const],
] as const;
