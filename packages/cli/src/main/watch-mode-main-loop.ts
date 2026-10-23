import { parseCompilationResult } from "@typeprompt/core";
import type {
  CompilationResult,
  ValidCompilationResult,
} from "@typeprompt/core/compiler/compiler-types.js";
import { compile } from "@typeprompt/core/compiler/compiler.js";
import type { Config } from "@typeprompt/core/config/config-parser.js";
import * as FileSystem from "fs/promises";
import globParent from "glob-parent";
import { minimatch } from "minimatch";
import * as Paths from "path";
import Watcher from "watcher";
import type { OutputFile } from "../codegen/codegen-types.js";
import { CODE_GENERATORS } from "../codegen/codegens.js";
import { makeGreen, makeRed, renderErrors } from "./error-renderer.js";
import { ExitError } from "./exit-error.js";
import {
  makePathNormalizer,
  makeRenderableErrors,
} from "./renderable-error.js";
import { collectTemplateFiles } from "./template-files-collector.js";

export class WatchModeMainLoop {
  private readonly includes: readonly string[];
  private patchBase: ValidCompilationResult | null = null;
  private timeoutId?: NodeJS.Timeout;
  private generating = false;
  private mustRegenerate = false;
  private previousCompilationResult: CompilationResult | null = null;

  constructor(
    private readonly resolvedProject: string,
    private readonly config: Config,
    private readonly options:
      | {
          readonly watch: false;
        }
      | {
          readonly watch: true;
          readonly play?: false;
        }
      | {
          readonly watch: true;
          readonly play: true;
          /** Called after a successful compilation. */
          readonly onCompilationSuccess: (
            r: ValidCompilationResult,
          ) => Promise<void>;
        },
  ) {
    this.includes = config.include.map((inc) =>
      Paths.join(resolvedProject, inc),
    );
  }

  async maybeReadPatchBase(): Promise<void> {
    const { config, resolvedProject } = this;
    if (!config.patch) return;
    const basePath = Paths.join(resolvedProject, "patch-base.json");
    const jsonContent = await FileSystem.readFile(
      Paths.join(resolvedProject, "patch-base.json"),
      "utf-8",
    );
    const patchBase = parseCompilationResult(jsonContent, basePath);
    if (patchBase.anyErrors) {
      throw new ExitError(patchBase.error);
    }
    this.patchBase = patchBase;
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
    const { options } = this;
    if (options.watch) {
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
          patchBase: this.patchBase,
        });
        this.previousCompilationResult = compilationResult;
      } catch (e) {
        if (options.watch && e instanceof Error) {
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
        const result = compilationResult as ValidCompilationResult;
        if (options.watch) {
          if (options.play) {
            options.onCompilationSuccess(result);
          } else {
            await this.doGenerate(result);
            console.log(
              makeGreen(
                "Generation succeeded at ".concat(
                  new Date(result.timestampMillis).toLocaleTimeString("en-US"),
                ),
              ),
            );
            console.log("\nWatching for changes in files matching:");
            for (const inc of this.includes) {
              console.log(`  ${inc}`);
            }
          }
        } else {
          await this.doGenerate(result);
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
}
