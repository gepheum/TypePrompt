#!/usr/bin/env node

// TODO: async!

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { CODE_GENERATORS } from "./codegen/codegens.js";
import { ConfigParseError, parseConfigToml } from "./config/config-parser.js";
import { initializeProject } from "./project-initializer.js";
import { compile } from "./compiler/compiler.js";
import { InternalError } from "./util/shared-types.js";
import { findLine, LineFinderData } from "./util/line-finder.js";

type Command =
  | { readonly kind: "help" }
  | { readonly kind: "init"; readonly projectPath?: string }
  | { readonly kind: "gen"; readonly projectPath?: string }
  | { readonly kind: "error"; readonly message: string };

async function main(): Promise<void> {
  const command = parseCommandLine(process.argv.slice(2));

  if (command.kind === "error") {
    console.error(command.message);
    console.log();
    renderHelp();
    process.exitCode = 1;
    return;
  }

  if (command.kind === "help") {
    renderHelp();
    return;
  }

  try {
    if (command.kind === "init") {
      initializeProject(resolve(command.projectPath ?? process.cwd()));
      return;
    }

    const _: "gen" = command.kind;
    await runGeneration(command.projectPath);
  } catch (error: unknown) {
    if (error instanceof ConfigParseError) {
      for (const message of error.messages) {
        console.error(message);
      }
      process.exitCode = 1;
      return;
    }

    if (error instanceof Error) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

function parseCommandLine(argv: readonly string[]): Command {
  const command = argv[0] ?? "help";

  if (command === "help") {
    return { kind: "help" };
  }

  if (command !== "init" && command !== "gen") {
    return {
      kind: "error",
      message: `Unknown command '${command}'.`,
    };
  }

  let projectPath: string | undefined;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--project" || arg === "-p") {
      const value = argv[i + 1];
      if (!value) {
        return {
          kind: "error",
          message: `Missing value for ${arg}.`,
        };
      }
      projectPath = value;
      i += 1;
      continue;
    }

    return {
      kind: "error",
      message: `Unknown argument '${arg}'.`,
    };
  }

  if (command === "init") {
    return { kind: "init", projectPath };
  }
  return { kind: "gen", projectPath };
}

function renderHelp(): void {
  console.log("TypePrompt\n");
  console.log("Usage:");
  console.log("  npx typeprompt                 Show this help message");
  console.log("  npx typeprompt help            Show this help message");
  console.log(
    "  npx typeprompt init [-p PATH]  Initialize a new TypePrompt project",
  );
  console.log("  npx typeprompt gen [-p PATH]   Generate TypeScript code");
}

async function runGeneration(projectPath?: string): Promise<void> {
  const configPath = resolveConfigPath(projectPath);
  const configDir = dirname(configPath);

  if (!existsSync(configPath)) {
    throw new Error(`Cannot find ${configPath}`);
  }

  const config = parseConfigToml({
    content: readFileSync(configPath, "utf8"),
    path: configPath,
  });

  const inputPattern = config.input ?? "prompts/*.xml";
  const templateFiles = expandGlob(inputPattern, configDir);

  if (templateFiles.length === 0) {
    throw new Error(`No template files found matching '${inputPattern}'`);
  }

  const pathToContent = Object.fromEntries(await Promise.all(
    templateFiles.map(async (filePath) => ([
      filePath,
      await readFile(filePath, "utf8"),
    ])),
  ));

  const compilationResult = compile(pathToContent, { cache: null });

  let anyErrors = false;
  for (const [path, errors] of Object.entries(compilationResult.finalErrors)) {
    const {lineFinder} = compilationResult.sourceFiles[path]!;
    for (const error of errors) {
      console.error(formatError(error, path, lineFinder));
      anyErrors = anyErrors && (errors.length > 0);
    }
  }

  if (anyErrors) {
    return;
  }

  for (const generator of CODE_GENERATORS) {
    const outputs = generator(compilationResult, config);
    for (const output of outputs) {
      const outputPath = resolve(configDir, output.path);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, output.content, "utf8");
      const rel = relative(process.cwd(), outputPath) || outputPath;
      console.log(`Generated ${rel}`);
    }
  }
}

function resolveConfigPath(projectPath?: string): string {
  if (!projectPath) {
    return resolve(process.cwd(), "typeprompt.toml");
  }

  const resolved = resolve(projectPath);
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    return join(resolved, "typeprompt.toml");
  }

  return resolved.endsWith(".toml")
    ? resolved
    : join(resolved, "typeprompt.toml");
}

function formatError(error: InternalError, path: string, lineFinder: LineFinderData): string {
  return JSON.stringify({
    path,
    message: error,
    start: findLine(error.span.start, lineFinder),
    end: findLine(error.span.end, lineFinder),
  }, null, 2);
}

/**
 * Expands a glob pattern relative to `baseDir`.
 * Supports `*` (any chars within a segment) and `**` (any number of directory
 * levels). If the pattern contains no glob characters, the resolved path is
 * returned directly; if it is a directory, all `.xml` files under it are
 * returned recursively.
 */
function expandGlob(pattern: string, baseDir: string): string[] {
  const resolved = resolve(baseDir, pattern);
  if (!pattern.includes("*") && !pattern.includes("?")) {
    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      return collectXmlFiles(resolved);
    }
    return existsSync(resolved) ? [resolved] : [];
  }

  const segments = pattern.split("/");
  const results: string[] = [];
  walkGlob(baseDir, segments, 0, results);
  results.sort((a, b) => a.localeCompare(b, "en-US"));
  return results;
}

function walkGlob(
  dir: string,
  segments: readonly string[],
  segIdx: number,
  results: string[],
): void {
  if (!existsSync(dir)) return;
  const seg = segments[segIdx]!;
  const isLast = segIdx === segments.length - 1;

  if (seg === "**") {
    // Zero-directory match: try next segment in this directory.
    if (!isLast) {
      walkGlob(dir, segments, segIdx + 1, results);
    }
    // Recurse into every subdirectory, keeping the `**` in play.
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walkGlob(join(dir, entry.name), segments, segIdx, results);
      }
    }
  } else {
    const regex = globSegmentToRegex(seg);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!regex.test(entry.name)) continue;
      if (isLast && entry.isFile()) {
        results.push(join(dir, entry.name));
      } else if (!isLast && entry.isDirectory()) {
        walkGlob(join(dir, entry.name), segments, segIdx + 1, results);
      }
    }
  }
}

function globSegmentToRegex(segment: string): RegExp {
  const escaped = segment
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`);
}

function collectXmlFiles(dir: string): string[] {
  const results: string[] = [];
  const visit = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".xml")) {
        results.push(fullPath);
      }
    }
  };
  visit(dir);
  results.sort((a, b) => a.localeCompare(b, "en-US"));
  return results;
}

main();
