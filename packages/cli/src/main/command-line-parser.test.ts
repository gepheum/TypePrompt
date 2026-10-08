import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { parseCommandLine } from "./command-line-parser.js";

describe("command-line-parser", () => {
  describe("help and version", () => {
    it("returns help for empty arguments", () => {
      expect(parseCommandLine([])).toMatch({ kind: "help" });
    });

    it("returns help for 'help', '--help', and '-h'", () => {
      expect(parseCommandLine(["help"])).toMatch({ kind: "help" });
      expect(parseCommandLine(["--help"])).toMatch({ kind: "help" });
      expect(parseCommandLine(["-h"])).toMatch({ kind: "help" });
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
      expect(parseCommandLine(["init", "--watch"])).toMatch({ kind: "error" });
      expect(parseCommandLine(["init", "--ci"])).toMatch({ kind: "error" });
      expect(parseCommandLine(["init", "--base", "foo"])).toMatch({
        kind: "error",
      });
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
      expect(parseCommandLine(["gen", "--ci"])).toMatch({ kind: "error" });
      expect(parseCommandLine(["gen", "--base", "foo"])).toMatch({
        kind: "error",
      });
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
      expect(parseCommandLine(["format", "--watch"])).toMatch({
        kind: "error",
      });
      expect(parseCommandLine(["format", "-b", "base.json"])).toMatch({
        kind: "error",
      });
    });
  });

  describe("patch command", () => {
    it("parses patch without options", () => {
      expect(parseCommandLine(["patch"])).toMatch({
        kind: "patch",
        project: undefined,
        base: undefined,
      });
    });

    it("parses patch with -b/--base and -p/--project", () => {
      expect(
        parseCommandLine(["patch", "-b", "base.json", "-p", "my-patch"]),
      ).toMatch({
        kind: "patch",
        project: "my-patch",
        base: "base.json",
      });
    });

    it("parses patch with --base=... and --project=...", () => {
      expect(
        parseCommandLine([
          "patch",
          "--base=./base.json",
          "--project=./patch-dir",
        ]),
      ).toMatch({
        kind: "patch",
        project: "./patch-dir",
        base: "./base.json",
      });
    });

    it("returns error for invalid flags on patch", () => {
      expect(parseCommandLine(["patch", "--watch"])).toMatch({
        kind: "error",
      });
      expect(parseCommandLine(["patch", "--ci"])).toMatch({
        kind: "error",
      });
    });
  });

  describe("error handling", () => {
    it("returns error for unknown commands", () => {
      expect(parseCommandLine(["unknown"])).toMatch({ kind: "error" });
    });

    it("returns error for unknown options", () => {
      expect(parseCommandLine(["gen", "--unknown-flag"])).toMatch({
        kind: "error",
      });
    });

    it("returns error for positional arguments after command", () => {
      expect(parseCommandLine(["gen", "unexpected-arg"])).toMatch({
        kind: "error",
      });
    });

    it("returns error for duplicated options", () => {
      expect(parseCommandLine(["gen", "-p", "a", "-p", "b"])).toMatch({
        kind: "error",
      });
      expect(
        parseCommandLine(["patch", "-b", "a.json", "-b", "b.json"]),
      ).toMatch({ kind: "error" });
      expect(parseCommandLine(["gen", "-w", "-w"])).toMatch({
        kind: "error",
      });
      expect(parseCommandLine(["format", "--ci", "--ci"])).toMatch({
        kind: "error",
      });
    });

    it("returns error for missing option values", () => {
      expect(parseCommandLine(["gen", "-p"])).toMatch({ kind: "error" });
      expect(parseCommandLine(["patch", "-b"])).toMatch({ kind: "error" });
      expect(parseCommandLine(["gen", "--project="])).toMatch({
        kind: "error",
      });
      expect(parseCommandLine(["patch", "--base="])).toMatch({
        kind: "error",
      });
    });
  });
});
