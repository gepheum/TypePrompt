#!/usr/bin/env node
import * as FileSystem from "fs/promises";
import * as Paths from "path";
import Watcher from "watcher";
import { OutputFile } from "./codegen/codegen-types.js";
import { CODE_GENERATORS } from "./codegen/codegens.js";
import {
  CompilationResult,
  ValidCompilationResult,
} from "./compiler/compiler-types.js";
import { compile } from "./compiler/compiler.js";
import { parseConfigYaml, type Config } from "./config/config-parser.js";
import { parseCommandLine } from "./main/command-line-parser.js";
import { makeGreen, makeRed, renderErrors } from "./main/error-renderer.js";
import { ExitError } from "./main/exit-error.js";
import {
  isDirectory,
  REAL_FILE_SYSTEM,
  rewritePathForRendering,
} from "./main/io.js";
import { collectTemplateFiles } from "./main/template-files-collector.js";
// import { initializeProject } from "./project_initializer.js";
import globParent from "glob-parent";
import { minimatch } from "minimatch";
import {
  makeRenderableError,
  makeRenderableErrors,
  RenderableError,
} from "./main/renderable-error.js";
import { createLineFinder } from "./util/line-finder.js";

class WatchModeMainLoop {
  constructor(
    private readonly project: string,
    private readonly config: Config,
    private readonly mode: "watch" | "once",
  ) {}

  private readonly include = Paths.resolve(Paths.join(this.project, this.config.include));

  async start(): Promise<void> {
    await this.generate();
    const { include } = this;
    const watcher = new Watcher(globParent(include), {
      renameDetection: true,
      recursive: true,
      persistent: true,
    });
    watcher.on("all", (_, targetPath, targetPathNext) => {
      if (
        minimatch(targetPath, include) ||
        (targetPathNext && minimatch(targetPathNext, include))
      ) {
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
          this.project,
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
      if (compilationResult.anyErrors) {
        const errors = makeRenderableErrors(
          compilationResult.finalErrors,
          compilationResult.sourceFiles,
        );
        renderErrors(errors, "error");
        return false;
      } else {
        // TODO
        // renderErrors(warnings, "warning");
        await this.doGenerate(compilationResult as ValidCompilationResult);
        if (this.mode === "watch") {
          const date = new Date().toLocaleTimeString("en-US");
          const successMessage = `Generation succeeded at ${date}`;
          console.log(makeGreen(successMessage));
          console.log("\nWaiting for changes in files matching:");
          console.log("  ".concat(this.include));
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
        const fsPath = Paths.join(this.project, outputFile.path);
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

// TODO
// type ModuleFormatResult = {
//   readonly formattedCode: string;
//   readonly alreadyFormatted: boolean;
// };

async function format(
  config: Config,
  project: string,
  mode: "fix" | "check",
): Promise<void> {
  // const moduleSet = await collectModules(srcDir, undefined, "lenient");
  // const pathToFormatResult = new Map<string, ModuleFormatResult>();
  // for await (const [modulePath, module] of moduleSet.modules) {
  //   const unformattedCode = module.result.sourceCode;
  //   const formattedModule = formatModule({
  //     sourceCode: unformattedCode,
  //     modulePath: modulePath,
  //     resolvedModule: module.result,
  //   });
  //   const { errors } = formattedModule;
  //   if (errors.length) {
  //     renderErrors(errors, "error");
  //     process.exit(1);
  //   }
  //   const fullPath = Paths.join(srcDir, modulePath);
  //   pathToFormatResult.set(fullPath, {
  //     formattedCode: formattedModule.newSourceCode,
  //     alreadyFormatted: formattedModule.newSourceCode === unformattedCode,
  //   });
  // }
  // let numFilesNotFormatted = 0;
  // const writeTasks: Promise<void>[] = [];
  // for (const [path, result] of pathToFormatResult) {
  //   const relativePath = Paths.relative(srcDir, path).replace(/\\/g, "/");
  //   if (mode === "fix") {
  //     if (result.alreadyFormatted) {
  //       console.log(`${makeGray(relativePath)} (unchanged)`);
  //     } else {
  //       writeTasks.push(
  //         FileSystem.writeFile(path, result.formattedCode, "utf-8"),
  //       );
  //       console.log(makeGray(relativePath));
  //     }
  //   } else {
  //     const _: "check" = mode;
  //     if (result.alreadyFormatted) {
  //       console.log(`${makeGray(relativePath)} (OK)`);
  //     } else {
  //       console.log(makeRed(relativePath));
  //       ++numFilesNotFormatted;
  //     }
  //   }
  // }
  // await Promise.all(writeTasks);
  // if (numFilesNotFormatted) {
  //   console.log();
  //   console.log(
  //     makeRed(
  //       `${numFilesNotFormatted} file${
  //         numFilesNotFormatted > 1 ? "s" : ""
  //       } not formatted; run with 'format fix' to format ${
  //         numFilesNotFormatted > 1 ? "them" : "it"
  //       }`,
  //     ),
  //   );
  //   process.exit(1);
  // }
}

async function runGeneration(
  project: string,
  config: Config,
  mode: "watch" | "once",
): Promise<void> {
  // Run the code generators in watch mode or once.
  const watchModeMainLoop = new WatchModeMainLoop(project, config, mode);
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

  const project = args.project || ".";

  if (!(await isDirectory(project))) {
    console.error(makeRed(`Not a directory: ${project}`));
    process.exit(1);
  }

  switch (args.kind) {
    case "init": {
      // TODO
      // initializeProject(project);
      return;
    }
    case "help":
    case "error": {
      return;
    }
  }

  const configPath = rewritePathForRendering(
    Paths.join(project, "typeprompt.yml"),
  );
  const configContent = REAL_FILE_SYSTEM.readTextFile(configPath);
  if (configContent === undefined) {
    console.error(makeRed(`Cannot find ${configPath}`));
    process.exit(1);
  }

  const configResult = parseConfigYaml(configContent);
  if (configResult.kind === "error") {
    const lineFinder = createLineFinder(configContent);
    const errors = configResult.errors.map((e): RenderableError =>
      makeRenderableError(e, configPath, lineFinder),
    );
    console.error(makeRed("Invalid TypePrompt config"));
    renderErrors(errors, "error");
    process.exit(1);
  }
  const config = configResult.config!;

  switch (args.kind) {
    case "format": {
      // Check or fix the formatting of the template files.
      // TODO
      // await format(
      //   config,
      //   project,
      //   args.subcommand === "ci" ? "check" : "fix",
      // );
      break;
    }
    case "gen": {
      await runGeneration(project, config, args.subcommand ?? "once");
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
