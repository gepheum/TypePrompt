#!/usr/bin/env node
import {
  parseCompilationResult,
  type Inferences,
  type ValidCompilationResult,
} from "@typeprompt/core";
import { compile } from "@typeprompt/core/compiler/compiler.js";
import {
  parseConfigYaml,
  type Config,
} from "@typeprompt/core/config/config-parser.js";
import { createLineFinder } from "@typeprompt/core/util/line-finder.js";
import { formatTemplateFile } from "@typeprompt/formatter";
import { runPlaygroundInferences } from "@typeprompt/inference-runner";
import * as FileSystem from "fs/promises";
import * as Paths from "path";
import { parseCommandLine } from "./main/command-line-parser.js";
import {
  findProjectForFile,
  readConfigInDirectory,
  readSecretsInDirectory,
  type ConfigMatch,
} from "./main/config-reader.js";
import { makeGray, makeRed, renderErrors } from "./main/error-renderer.js";
import { ExitError } from "./main/exit-error.js";
import { initializeProject } from "./main/project-initializer.js";
import { patchProject } from "./main/project-patcher.js";
import type { RenderableError } from "./main/renderable-error.js";
import {
  makePathNormalizer,
  makeRenderableError,
  makeRenderableErrors,
} from "./main/renderable-error.js";
import { collectTemplateFiles } from "./main/template-files-collector.js";
import { WatchModeMainLoop } from "./main/watch-mode-main-loop.js";
import { isDirectory } from "./util/io.js";
export { formatTemplateFile };

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
  const compilationResult = compile(templateFiles, {
    cache: null,
    patchBase: null,
  });
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
  const watchModeMainLoop = new WatchModeMainLoop(resolvedProject, config);
  await watchModeMainLoop.maybeReadPatchBase();
  if (mode === "watch") {
    await watchModeMainLoop.start();
  } else {
    const success: boolean = await watchModeMainLoop.generate();
    process.exit(success ? 0 : 1);
  }
}

async function runPlaygroundFile(
  resolvedProject: string,
  config: Config,
  file: string,
): Promise<void> {
  const resolvedFile = Paths.resolve(file);
  const relativeFilePath = Paths.relative(
    resolvedProject,
    resolvedFile,
  ).replace(/\\/g, "/");

  let patchBase: ValidCompilationResult | null = null;
  if (config.patch) {
    const basePath = Paths.join(resolvedProject, "patch-base.json");
    const jsonContent = await FileSystem.readFile(basePath, "utf-8");
    const parsedPatchBase = parseCompilationResult(jsonContent, basePath);
    if (parsedPatchBase.anyErrors) {
      throw new ExitError(parsedPatchBase.error);
    }
    patchBase = parsedPatchBase;
  }

  const templateFiles = await collectTemplateFiles(resolvedProject, config);
  const compilationResult = compile(templateFiles, {
    cache: null,
    patchBase,
  });
  const pathNormalizer = makePathNormalizer(resolvedProject);
  if (compilationResult.anyErrors) {
    const errors = makeRenderableErrors(
      compilationResult.finalErrors,
      compilationResult.sourceFiles,
      pathNormalizer,
    );
    renderErrors(errors, "error");
    process.exit(1);
  }
  const validCompilationResult = compilationResult as ValidCompilationResult;

  if (!(relativeFilePath in validCompilationResult.sourceFiles)) {
    throw new ExitError(
      `File '${file}' is not matched by project include patterns`,
    );
  }

  const playgroundEntry = Object.entries(
    validCompilationResult.playgrounds,
  ).find(
    ([, playground]) => playground.playground.tag.path === relativeFilePath,
  );
  if (!playgroundEntry) {
    throw new ExitError(`File '${file}' is not a <playground> file`);
  }
  const [templateId] = playgroundEntry;

  const secrets = await readSecretsInDirectory(resolvedProject);
  let inferenceRun: Inferences.InferenceRun;
  try {
    inferenceRun = await runPlaygroundInferences(
      validCompilationResult,
      templateId,
      { apiKeys: secrets.apiKeys },
    );
  } catch (e) {
    if (e instanceof Error) {
      throw ExitError.wrap(e);
    }
    throw e;
  }
  console.log(JSON.stringify(inferenceRun, null, 2));
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

  switch (args.kind) {
    case "init": {
      await initializeProject(args.project ?? ".");
      return;
    }
    case "patch": {
      await patchProject({
        base: args.base,
        output: args.output,
      });
      return;
    }
    case "help":
    case "error": {
      return;
    }
  }

  const {
    projectDir: resolvedProject,
    configPath,
    configContent,
  } = await (async (): Promise<ConfigMatch> => {
    if (args.kind === "run") {
      if (await isDirectory(args.file)) {
        throw new ExitError(`Expected a file, got directory: ${args.file}`);
      }
      return findProjectForFile(args.file);
    }
    const project = args.project ?? ".";
    if (!(await isDirectory(project))) {
      console.error(makeRed(`Not a directory: ${project}`));
      process.exit(1);
    }
    return readConfigInDirectory(Paths.resolve(project));
  })();

  const configResult = parseConfigYaml(configContent, configPath);
  if (configResult.kind === "error") {
    const lineFinder = createLineFinder(configContent);
    const pathNormalizer = makePathNormalizer(resolvedProject);
    const errors = configResult.errors.map((e): RenderableError =>
      makeRenderableError(e, configPath, lineFinder, pathNormalizer),
    );
    renderErrors(errors, "error");
    process.exit(1);
  }
  const config = configResult.config!;

  switch (args.kind) {
    case "format": {
      // Check or fix the formatting of the template files.
      const mode = args.subcommand === "ci" ? "check" : "fix";
      await format(args.project ?? ".", config, mode);
      break;
    }
    case "gen": {
      await runGeneration(resolvedProject, config, args.subcommand ?? "once");
      break;
    }
    case "run": {
      await runPlaygroundFile(resolvedProject, config, args.file);
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
