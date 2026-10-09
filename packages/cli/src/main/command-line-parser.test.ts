import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { parseCommandLine, type ParsedArgs } from "./command-line-parser.js";

function parseAndCapture(args: string[]): {
  result: ParsedArgs;
  errors: string[];
  logs: string[];
} {
  const errors: string[] = [];
  const logs: string[] = [];
  const originalError = console.error;
  const originalLog = console.log;
  try {
    console.error = (...msg: unknown[]): void => {
      errors.push(msg.map(String).join(" "));
    };
    console.log = (...msg: unknown[]): void => {
      logs.push(msg.map(String).join(" "));
    };
    const result = parseCommandLine(args);
    return { result, errors, logs };
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
}

describe("command-line-parser", () => {
  describe("help and version", () => {
    it("returns help for empty arguments", () => {
      const { result } = parseAndCapture([]);
      expect(result).toMatch({ kind: "help" });
    });

    it("returns help for 'help', '--help', and '-h'", () => {
      expect(parseAndCapture(["help"]).result).toMatch({ kind: "help" });
      expect(parseAndCapture(["--help"]).result).toMatch({ kind: "help" });
      expect(parseAndCapture(["-h"]).result).toMatch({ kind: "help" });
    });

    it("returns version for 'version', '--version', and '-v'", () => {
      expect(parseCommandLine(["version"])).toMatch({ kind: "version" });
      expect(parseCommandLine(["--version"])).toMatch({ kind: "version" });
      expect(parseCommandLine(["-v"])).toMatch({ kind: "version" });
    });
  });

  describe("init command", () => {
    it("parses init with default options", () => {
      expect(parseCommandLine(["init"])).toMatch({
        kind: "init",
        project: undefined,
      });
    });

    it("parses init with -p / --project", () => {
      expect(parseCommandLine(["init", "-p", "my-project"])).toMatch({
        kind: "init",
        project: "my-project",
      });
      expect(parseCommandLine(["init", "--project=my-project"])).toMatch({
        kind: "init",
        project: "my-project",
      });
    });

    it("returns error if invalid flags are passed to init", () => {
      const watchTest = parseAndCapture(["init", "--watch"]);
      expect(watchTest.result).toMatch({ kind: "error" });
      expect(watchTest.errors[0]?.trim()).toBe(
        "Error: Option --watch is not valid for 'init' command",
      );

      const ciTest = parseAndCapture(["init", "--ci"]);
      expect(ciTest.result).toMatch({ kind: "error" });
      expect(ciTest.errors[0]?.trim()).toBe(
        "Error: Option --ci is not valid for 'init' command",
      );

      const baseTest = parseAndCapture(["init", "--base", "foo"]);
      expect(baseTest.result).toMatch({ kind: "error" });
      expect(baseTest.errors[0]?.trim()).toBe(
        "Error: Option --base is not valid for 'init' command",
      );
    });
  });

  describe("gen command", () => {
    it("parses gen without flags", () => {
      expect(parseCommandLine(["gen"])).toMatch({
        kind: "gen",
        project: undefined,
        subcommand: undefined,
      });
    });

    it("parses gen with --watch / -w", () => {
      expect(parseCommandLine(["gen", "--watch"])).toMatch({
        kind: "gen",
        project: undefined,
        subcommand: "watch",
      });
      expect(parseCommandLine(["gen", "-w"])).toMatch({
        kind: "gen",
        project: undefined,
        subcommand: "watch",
      });
    });

    it("parses gen with project and watch options combined", () => {
      expect(parseCommandLine(["gen", "-p", "sub/dir", "--watch"])).toMatch({
        kind: "gen",
        project: "sub/dir",
        subcommand: "watch",
      });
    });

    it("returns error for invalid flags on gen", () => {
      const ciTest = parseAndCapture(["gen", "--ci"]);
      expect(ciTest.result).toMatch({ kind: "error" });
      expect(ciTest.errors[0]?.trim()).toBe(
        "Error: Option --ci is not valid for 'gen' command",
      );

      const baseTest = parseAndCapture(["gen", "--base", "foo"]);
      expect(baseTest.result).toMatch({ kind: "error" });
      expect(baseTest.errors[0]?.trim()).toBe(
        "Error: Option --base is not valid for 'gen' command",
      );
    });
  });

  describe("format command", () => {
    it("parses format without flags", () => {
      expect(parseCommandLine(["format"])).toMatch({
        kind: "format",
        project: undefined,
        subcommand: undefined,
      });
    });

    it("parses format with --ci", () => {
      expect(parseCommandLine(["format", "--ci"])).toMatch({
        kind: "format",
        project: undefined,
        subcommand: "ci",
      });
    });

    it("parses format with project and ci", () => {
      expect(
        parseCommandLine(["format", "--ci", "-p", "custom/project"]),
      ).toMatch({
        kind: "format",
        project: "custom/project",
        subcommand: "ci",
      });
    });

    it("returns error for invalid flags on format", () => {
      const watchTest = parseAndCapture(["format", "--watch"]);
      expect(watchTest.result).toMatch({ kind: "error" });
      expect(watchTest.errors[0]?.trim()).toBe(
        "Error: Option --watch is not valid for 'format' command",
      );

      const baseTest = parseAndCapture(["format", "-b", "base.json"]);
      expect(baseTest.result).toMatch({ kind: "error" });
      expect(baseTest.errors[0]?.trim()).toBe(
        "Error: Option --base is not valid for 'format' command",
      );
    });
  });

  describe("patch command", () => {
    it("returns error if --base is missing for patch", () => {
      const { result, errors } = parseAndCapture(["patch"]);
      expect(result).toMatch({ kind: "error" });
      expect(errors[0]?.trim()).toBe(
        "Error: Option --base is required for 'patch' command",
      );

      const withOutputOnly = parseAndCapture(["patch", "-o", "my-patch"]);
      expect(withOutputOnly.result).toMatch({ kind: "error" });
      expect(withOutputOnly.errors[0]?.trim()).toBe(
        "Error: Option --base is required for 'patch' command",
      );
    });

    it("returns error if --output is missing for patch", () => {
      const withBaseOnly = parseAndCapture(["patch", "-b", "base.json"]);
      expect(withBaseOnly.result).toMatch({ kind: "error" });
      expect(withBaseOnly.errors[0]?.trim()).toBe(
        "Error: Option --output is required for 'patch' command",
      );
    });

    it("parses patch with -b/--base and -o/--output", () => {
      expect(
        parseCommandLine(["patch", "-b", "base.json", "-o", "my-patch"]),
      ).toMatch({
        kind: "patch",
        output: "my-patch",
        base: "base.json",
      });
    });

    it("parses patch with --base=... and --output=...", () => {
      expect(
        parseCommandLine([
          "patch",
          "--base=./base.json",
          "--output=./patch-dir",
        ]),
      ).toMatch({
        kind: "patch",
        output: "./patch-dir",
        base: "./base.json",
      });
    });

    it("returns error for invalid flags on patch", () => {
      const watchTest = parseAndCapture(["patch", "--watch"]);
      expect(watchTest.result).toMatch({ kind: "error" });
      expect(watchTest.errors[0]?.trim()).toBe(
        "Error: Option --watch is not valid for 'patch' command",
      );

      const ciTest = parseAndCapture(["patch", "--ci"]);
      expect(ciTest.result).toMatch({ kind: "error" });
      expect(ciTest.errors[0]?.trim()).toBe(
        "Error: Option --ci is not valid for 'patch' command",
      );

      const projectTest = parseAndCapture(["patch", "-p", "my-patch"]);
      expect(projectTest.result).toMatch({ kind: "error" });
      expect(projectTest.errors[0]?.trim()).toBe(
        "Error: Option --project is not valid for 'patch' command",
      );
    });
  });

  describe("error handling", () => {
    it("returns error for unknown commands", () => {
      const { result, errors } = parseAndCapture(["unknown"]);
      expect(result).toMatch({ kind: "error" });
      expect(errors[0]?.trim()).toBe("Error: Unknown command: unknown");
    });

    it("returns error for unknown options", () => {
      const { result, errors } = parseAndCapture(["gen", "--unknown-flag"]);
      expect(result).toMatch({ kind: "error" });
      expect(errors[0]?.trim()).toBe(
        "Error: Unknown option for 'gen': --unknown-flag",
      );
    });

    it("returns error for positional arguments after command", () => {
      const { result, errors } = parseAndCapture(["gen", "unexpected-arg"]);
      expect(result).toMatch({ kind: "error" });
      expect(errors[0]?.trim()).toBe(
        "Error: Unexpected argument: unexpected-arg",
      );
    });

    it("returns error for duplicated options", () => {
      const dupProject = parseAndCapture(["gen", "-p", "a", "-p", "b"]);
      expect(dupProject.result).toMatch({ kind: "error" });
      expect(dupProject.errors[0]?.trim()).toBe(
        "Error: Option -p specified multiple times",
      );

      const dupBase = parseAndCapture([
        "patch",
        "-b",
        "a.json",
        "-b",
        "b.json",
      ]);
      expect(dupBase.result).toMatch({ kind: "error" });
      expect(dupBase.errors[0]?.trim()).toBe(
        "Error: Option -b specified multiple times",
      );

      const dupOutput = parseAndCapture(["patch", "-o", "dirA", "-o", "dirB"]);
      expect(dupOutput.result).toMatch({ kind: "error" });
      expect(dupOutput.errors[0]?.trim()).toBe(
        "Error: Option -o specified multiple times",
      );

      const dupWatch = parseAndCapture(["gen", "-w", "-w"]);
      expect(dupWatch.result).toMatch({ kind: "error" });
      expect(dupWatch.errors[0]?.trim()).toBe(
        "Error: Option -w specified multiple times",
      );

      const dupCi = parseAndCapture(["format", "--ci", "--ci"]);
      expect(dupCi.result).toMatch({ kind: "error" });
      expect(dupCi.errors[0]?.trim()).toBe(
        "Error: Option --ci specified multiple times",
      );
    });

    it("returns error for missing option values", () => {
      const missingP = parseAndCapture(["gen", "-p"]);
      expect(missingP.result).toMatch({ kind: "error" });
      expect(missingP.errors[0]?.trim()).toBe(
        "Error: Option -p requires a value",
      );

      const missingO = parseAndCapture(["patch", "-o"]);
      expect(missingO.result).toMatch({ kind: "error" });
      expect(missingO.errors[0]?.trim()).toBe(
        "Error: Option -o requires a value",
      );

      const missingB = parseAndCapture(["patch", "-b"]);
      expect(missingB.result).toMatch({ kind: "error" });
      expect(missingB.errors[0]?.trim()).toBe(
        "Error: Option -b requires a value",
      );

      const missingProjectEq = parseAndCapture(["gen", "--project="]);
      expect(missingProjectEq.result).toMatch({ kind: "error" });
      expect(missingProjectEq.errors[0]?.trim()).toBe(
        "Error: Option --project requires a value",
      );

      const missingOutputEq = parseAndCapture(["patch", "--output="]);
      expect(missingOutputEq.result).toMatch({ kind: "error" });
      expect(missingOutputEq.errors[0]?.trim()).toBe(
        "Error: Option --output requires a value",
      );

      const missingBaseEq = parseAndCapture(["patch", "--base="]);
      expect(missingBaseEq.result).toMatch({ kind: "error" });
      expect(missingBaseEq.errors[0]?.trim()).toBe(
        "Error: Option --base requires a value",
      );
    });
  });
});
