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
      project?: string;
      base?: string;
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
  patch        Initialize a patch project against a base project or spec
  help         Display this help message

Options:
  -p <path>    Path to the directory containing the typeprompt.yml file
  -b <path>    Path to base project directory or .json spec file (patch only)
  --watch, -w  Automatically run code generation when template files change
                 (gen only)
  --ci         Fail if code is not properly formatted (format only)

Examples:
  ${COMMAND_BASE} init
  ${COMMAND_BASE} gen
  ${COMMAND_BASE} gen --watch
  ${COMMAND_BASE} format -p path/to/project
  ${COMMAND_BASE} format --ci -p path/to/project
  ${COMMAND_BASE} patch -b path/to/base -p path/to/patch
`;

export class CommandLineParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandLineParseError";
  }
}

type ParsedOptions = {
  project?: string;
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

    // Check for --option=value syntax
    if (arg.startsWith("--project=") || arg.startsWith("-p=")) {
      const value = arg.substring(arg.indexOf("=") + 1);
      if (!value) {
        throw new CommandLineParseError(
          `Option ${arg.split("=")[0]} requires a value`,
        );
      }
      if (options.project !== undefined) {
        throw new CommandLineParseError(
          `Option ${arg.split("=")[0]} specified multiple times`,
        );
      }
      options.project = value;
    } else if (arg === "--project" || arg === "-p") {
      if (i + 1 >= args.length) {
        throw new CommandLineParseError(`Option ${arg} requires a value`);
      }
      if (options.project !== undefined) {
        throw new CommandLineParseError(
          `Option ${arg} specified multiple times`,
        );
      }
      options.project = args[i + 1];
      i++; // Skip the next argument as it's the value
    } else if (arg.startsWith("--base=") || arg.startsWith("-b=")) {
      const value = arg.substring(arg.indexOf("=") + 1);
      if (!value) {
        throw new CommandLineParseError(
          `Option ${arg.split("=")[0]} requires a value`,
        );
      }
      if (options.base !== undefined) {
        throw new CommandLineParseError(
          `Option ${arg.split("=")[0]} specified multiple times`,
        );
      }
      options.base = value;
    } else if (arg === "--base" || arg === "-b") {
      if (i + 1 >= args.length) {
        throw new CommandLineParseError(`Option ${arg} requires a value`);
      }
      if (options.base !== undefined) {
        throw new CommandLineParseError(
          `Option ${arg} specified multiple times`,
        );
      }
      options.base = args[i + 1];
      i++;
    } else if (arg === "--watch" || arg === "-w") {
      if (options.watch) {
        throw new CommandLineParseError(
          `Option ${arg} specified multiple times`,
        );
      }
      options.watch = true;
    } else if (arg === "--ci") {
      if (options.ci) {
        throw new CommandLineParseError("Option --ci specified multiple times");
      }
      options.ci = true;
    } else if (arg.startsWith("-")) {
      options.unknown.push(arg);
    } else {
      // Positional argument - not allowed anymore
      throw new CommandLineParseError(`Unexpected argument: ${arg}`);
    }
  }

  return options;
}

function buildGenCommand(options: ParsedOptions): ParsedArgs {
  validateNoUnknownOptions(options, "gen");

  if (options.ci) {
    throw new CommandLineParseError(
      "Option --ci is not valid for 'gen' command",
    );
  }
  if (options.base) {
    throw new CommandLineParseError(
      "Option --base is not valid for 'gen' command",
    );
  }

  return {
    kind: "gen",
    project: options.project,
    subcommand: options.watch ? "watch" : undefined,
  };
}

function buildFormatCommand(options: ParsedOptions): ParsedArgs {
  validateNoUnknownOptions(options, "format");

  if (options.watch) {
    throw new CommandLineParseError(
      "Option --watch is not valid for 'format' command",
    );
  }
  if (options.base) {
    throw new CommandLineParseError(
      "Option --base is not valid for 'format' command",
    );
  }

  return {
    kind: "format",
    project: options.project,
    subcommand: options.ci ? "ci" : undefined,
  };
}

function buildInitCommand(options: ParsedOptions): ParsedArgs {
  validateNoUnknownOptions(options, "init");

  if (options.watch) {
    throw new CommandLineParseError(
      "Option --watch is not valid for 'init' command",
    );
  }
  if (options.ci) {
    throw new CommandLineParseError(
      "Option --ci is not valid for 'init' command",
    );
  }
  if (options.base) {
    throw new CommandLineParseError(
      "Option --base is not valid for 'init' command",
    );
  }

  return {
    kind: "init",
    project: options.project,
  };
}

function buildPatchCommand(options: ParsedOptions): ParsedArgs {
  validateNoUnknownOptions(options, "patch");

  if (options.watch) {
    throw new CommandLineParseError(
      "Option --watch is not valid for 'patch' command",
    );
  }
  if (options.ci) {
    throw new CommandLineParseError(
      "Option --ci is not valid for 'patch' command",
    );
  }

  return {
    kind: "patch",
    project: options.project,
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
