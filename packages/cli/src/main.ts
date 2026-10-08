#!/usr/bin/env node
import type {
  CompilationResult,
  ValidCompilationResult,
} from "@typeprompt/core/compiler/compiler-types.js";
import { compile } from "@typeprompt/core/compiler/compiler.js";
import {
  parseConfigYaml,
  type Config,
} from "@typeprompt/core/config/config-parser.js";
import { createLineFinder } from "@typeprompt/core/util/line-finder.js";
import * as FileSystem from "fs/promises";
import globParent from "glob-parent";
import { minimatch } from "minimatch";
import * as Paths from "path";
import Watcher from "watcher";
import type { OutputFile } from "./codegen/codegen-types.js";
import { CODE_GENERATORS } from "./codegen/codegens.js";
import { formatTemplateFile } from "./formatter/formatter.js";
import { parseCommandLine } from "./main/command-line-parser.js";
import {
  makeGray,
  makeGreen,
  makePathNormalizer,
  makeRed,
  renderErrors,
} from "./main/error-renderer.js";
import { ExitError } from "./main/exit-error.js";
import { isDirectory, REAL_FILE_SYSTEM } from "./main/io.js";
import { initializeProject } from "./main/project-initializer.js";
import { patchProject } from "./main/project-patcher.js";
import type { RenderableError } from "./main/renderable-error.js";
import {
  makeRenderableError,
  makeRenderableErrors,
} from "./main/renderable-error.js";
import { collectTemplateFiles } from "./main/template-files-collector.js";
export { formatTemplateFile };

class WatchModeMainLoop {
  private readonly includes: readonly string[];

  constructor(
    private readonly resolvedProject: string,
    private readonly config: Config,
    private readonly mode: "watch" | "once",
  ) {
    const { include } = config;
    this.includes =
      typeof include === "string"
        ? [Paths.join(resolvedProject, include)]
        : include.map((inc) => Paths.join(resolvedProject, inc));
  }

  async start(): Promise<void> {
    await this.generate();
    const watchDirs = Array.from(
      new Set(this.includes.map((inc) => globParent(inc))),
    );
    const watcher = new Watcher(watchDirs, {
      renameDetection: true,
      recursive: true,
      persistent: true,
    });
    watcher.on("all", (_, targetPath, targetPathNext) => {
      const matches = (p: string): boolean =>
        this.includes.some((inc) => minimatch(p, inc));
      if (matches(targetPath) || (targetPathNext && matches(targetPathNext))) {
        this.triggerGeneration();
      }
    });
  }

  private triggerGeneration(): void {
    if (this.generating) {
      this.mustRegenerate = true;
      return;
    }
    if (this.timeoutId !== undefined) {
      globalThis.clearTimeout(this.timeoutId);
    }
    const delayMillis = 200;
    const callback = (): void => {
      try {
        this.generate();
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e ? e.message : e;
        console.error(message);
      }
    };
    this.timeoutId = globalThis.setTimeout(callback, delayMillis);
  }

  async generate(): Promise<boolean> {
    this.generating = true;
    this.timeoutId = undefined;
    this.mustRegenerate = false;
    if (this.mode === "watch") {
      console.clear();
    }
    try {
      let compilationResult: CompilationResult;
      try {
        const templateFiles = await collectTemplateFiles(
          this.resolvedProject,
          this.config,
        );
        compilationResult = compile(templateFiles, {
          cache: this.previousCompilationResult,
        });
        this.previousCompilationResult = compilationResult;
      } catch (e) {
        if (this.mode === "watch" && e instanceof Error) {
          console.error(makeRed(e.message));
          return false;
        } else {
          throw e;
        }
      }
      const pathNormalizer = makePathNormalizer(this.resolvedProject);
      if (compilationResult.anyErrors) {
        const errors = makeRenderableErrors(
          compilationResult.finalErrors,
          compilationResult.sourceFiles,
          pathNormalizer,
        );
        renderErrors(errors, "error");
        return false;
      } else {
        const warnings = makeRenderableErrors(
          compilationResult.warnings,
          compilationResult.sourceFiles,
          pathNormalizer,
        );
        renderErrors(warnings, "warning");
        await this.doGenerate(compilationResult as ValidCompilationResult);
        if (this.mode === "watch") {
          const date = new Date().toLocaleTimeString("en-US");
          const successMessage = `Generation succeeded at ${date}`;
          console.log(makeGreen(successMessage));
          console.log("\nWaiting for changes in files matching:");
          for (const inc of this.includes) {
            console.log(`  ${inc}`);
          }
        }
        return true;
      }
    } finally {
      this.generating = false;
      if (this.mustRegenerate) {
        this.triggerGeneration();
      }
    }
  }

  private async doGenerate(
    compilationResult: ValidCompilationResult,
  ): Promise<void> {
    const outputFiles: OutputFile[] = [];
    for (const generator of CODE_GENERATORS) {
      outputFiles.push(...generator(compilationResult, this.config));
    }
    // Write all the generated files.
    await Promise.all(
      outputFiles.map(async (outputFile) => {
        const fsPath = Paths.join(this.resolvedProject, outputFile.path);
        await FileSystem.mkdir(Paths.dirname(fsPath), { recursive: true });
        await FileSystem.writeFile(fsPath, outputFile.content, "utf-8");
      }),
    );
  }

  private timeoutId?: NodeJS.Timeout;
  private generating = false;
  private mustRegenerate = false;
  private previousCompilationResult: CompilationResult | null = null;
}

type ModuleFormatResult = {
  readonly path: string;
  readonly formatted: string;
  readonly alreadyFormatted: boolean;
};

async function format(
  resolvedProject: string,
  config: Config,
  mode: "fix" | "check",
): Promise<void> {
  const templateFiles = await collectTemplateFiles(resolvedProject, config);
  const compilationResult = compile(templateFiles, { cache: null });
  if (compilationResult.anyErrors) {
    const errors = makeRenderableErrors(
      compilationResult.finalErrors,
      compilationResult.sourceFiles,
      makePathNormalizer(resolvedProject),
    );
    renderErrors(errors, "error");
    process.exit(1);
  }
  const pathNormalizer = makePathNormalizer(resolvedProject);
  const formatResults: ModuleFormatResult[] = await Promise.all(
    Object.entries(templateFiles).map(async ([relativePath, unformatted]) => {
      const formatted = await formatTemplateFile(unformatted);
      const path = pathNormalizer(relativePath);
      return { path, formatted, alreadyFormatted: formatted === unformatted };
    }),
  );
  let numFilesNotFormatted = 0;
  const writeTasks: Promise<void>[] = [];
  for (const { path, formatted, alreadyFormatted } of formatResults) {
    if (mode === "fix") {
      if (alreadyFormatted) {
        console.log(`${makeGray(path)} (unchanged)`);
      } else {
        writeTasks.push(FileSystem.writeFile(path, formatted, "utf-8"));
        console.log(makeGray(path));
      }
    } else {
      const _: "check" = mode;
      if (alreadyFormatted) {
        console.log(`${makeGray(path)} (OK)`);
      } else {
        console.log(makeRed(path));
        ++numFilesNotFormatted;
      }
    }
  }
  await Promise.all(writeTasks);
  if (numFilesNotFormatted) {
    console.log();
    console.log(
      makeRed(
        `${numFilesNotFormatted} file${
          numFilesNotFormatted > 1 ? "s" : ""
        } not formatted; run with 'format fix' to format ${
          numFilesNotFormatted > 1 ? "them" : "it"
        }`,
      ),
    );
    process.exit(1);
  }
}

async function runGeneration(
  resolvedProject: string,
  config: Config,
  mode: "watch" | "once",
): Promise<void> {
  // Run the code generators in watch mode or once.
  const watchModeMainLoop = new WatchModeMainLoop(
    resolvedProject,
    config,
    mode,
  );
  if (mode === "watch") {
    await watchModeMainLoop.start();
  } else {
    const success: boolean = await watchModeMainLoop.generate();
    process.exit(success ? 0 : 1);
  }
}

async function main(): Promise<void> {
  const args = parseCommandLine(process.argv.slice(2));

  if (args.kind === "version") {
    const packageJsonPath = new URL("../package.json", import.meta.url);
    const packageJson = JSON.parse(
      await FileSystem.readFile(packageJsonPath, "utf-8"),
    );
    console.log(`v${packageJson.version}`);
    return;
  }

  const project = args.project ?? ".";

  switch (args.kind) {
    case "init": {
      initializeProject(project);
      return;
    }
    case "patch": {
      await patchProject({
        base: args.base,
        project: args.project,
      });
      return;
    }
    case "help":
    case "error": {
      return;
    }
  }

  if (!(await isDirectory(project))) {
    console.error(makeRed(`Not a directory: ${project}`));
    process.exit(1);
  }

  const resolvedProject = Paths.resolve(args.project ?? ".");
  const configPath = Paths.join(resolvedProject, "typeprompt.yml");
  const configContent = REAL_FILE_SYSTEM.readTextFile(configPath);
  if (configContent === undefined) {
    console.error(makeRed(`Cannot find ${configPath}`));
    process.exit(1);
  }

  const configResult = parseConfigYaml(configContent, configPath);
  if (configResult.kind === "error") {
    const lineFinder = createLineFinder(configContent);
    const pathNormalizer = makePathNormalizer(resolvedProject);
    const errors = configResult.errors.map((e): RenderableError =>
      makeRenderableError(e, configPath, lineFinder, pathNormalizer),
    );
    console.error(makeRed("Invalid TypePrompt config"));
    renderErrors(errors, "error");
    process.exit(1);
  }
  const config = configResult.config!;

  switch (args.kind) {
    case "format": {
      // Check or fix the formatting of the template files.
      const mode = args.subcommand === "ci" ? "check" : "fix";
      await format(project, config, mode);
      break;
    }
    case "gen": {
      await runGeneration(resolvedProject, config, args.subcommand ?? "once");
      break;
    }
    default: {
      const _: never = args;
      throw new TypeError(_);
    }
  }
}

try {
  await main();
} catch (e) {
  if (e instanceof Error) {
    console.error(makeRed(e.message));
    if (e instanceof ExitError) {
      process.exit(1);
    }
  }
  throw e;
}
