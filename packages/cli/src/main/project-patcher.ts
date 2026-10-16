import {
  makeTemplates,
  parseCompilationResult,
  type Spec,
} from "@typeprompt/core";
import type { ValidCompilationResult } from "@typeprompt/core/compiler/compiler-types.js";
import { compile } from "@typeprompt/core/compiler/compiler.js";
import { parseConfigYaml } from "@typeprompt/core/config/config-parser.js";
import { createLineFinder } from "@typeprompt/core/util/line-finder.js";
import * as FileSystem from "fs/promises";
import * as Paths from "path";
import { renderErrors } from "./error-renderer.js";
import { ExitError } from "./exit-error.js";
import { isDirectory, REAL_FILE_SYSTEM } from "./io.js";
import {
  checkNoConfigInDirectory,
  readConfigInDirectory,
} from "./project-config.js";
import type { RenderableError } from "./renderable-error.js";
import {
  makePathNormalizer,
  makeRenderableError,
  makeRenderableErrors,
} from "./renderable-error.js";
import { collectTemplateFiles } from "./template-files-collector.js";

export async function patchProject(args: {
  readonly base: string;
  readonly output: string;
}): Promise<void> {
  const { base } = args;
  const output = Paths.resolve(args.output);
  {
    const parentDir = Paths.dirname(output);
    if (!(await isDirectory(parentDir))) {
      throw new ExitError(`Parent directory does not exist: ${parentDir}`);
    }
  }

  let compilationResult: ValidCompilationResult;

  const baseIsUrl = base.startsWith("http://") || base.startsWith("https://");
  if (baseIsUrl || base.endsWith(".json")) {
    let jsonContent: string;
    if (baseIsUrl) {
      let response: Response;
      try {
        response = await fetch(base);
      } catch (e) {
        throw new ExitError(
          `Failed to fetch ${base}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (!response.ok) {
        throw new ExitError(
          `Failed to fetch ${base}: ${response.status} ${response.statusText}`.trim(),
        );
      }
      jsonContent = await response.text();
    } else {
      const baseFilePath = Paths.resolve(base);
      const content = REAL_FILE_SYSTEM.readTextFile(baseFilePath);
      if (content === undefined) {
        throw new ExitError(`Cannot find ${base}`);
      }
      jsonContent = content;
    }

    const parseResult = parseCompilationResult(jsonContent, base);
    if (parseResult.anyErrors) {
      throw new ExitError(parseResult.error);
    }
    compilationResult = parseResult;
  } else {
    const baseDir = Paths.resolve(base);
    if (!(await isDirectory(baseDir))) {
      throw new ExitError(`Not a directory: ${base}`);
    }

    const { configPath, configContent } = readConfigInDirectory(baseDir);

    const configResult = parseConfigYaml(configContent, configPath);
    if (configResult.kind === "error") {
      const lineFinder = createLineFinder(configContent);
      const pathNormalizer = makePathNormalizer(baseDir);
      const errors = configResult.errors.map((e): RenderableError =>
        makeRenderableError(e, configPath, lineFinder, pathNormalizer),
      );
      renderErrors(errors, "error");
      throw new ExitError("Invalid TypePrompt config");
    }

    const templateFiles = await collectTemplateFiles(
      baseDir,
      configResult.config,
    );
    const result = compile(templateFiles, { cache: null, patchBase: null });
    if (result.anyErrors) {
      const pathNormalizer = makePathNormalizer(baseDir);
      const errors = makeRenderableErrors(
        result.finalErrors,
        result.sourceFiles,
        pathNormalizer,
      );
      renderErrors(errors, "error");
      throw new ExitError("Compilation of base project failed");
    }
    compilationResult = result as ValidCompilationResult;
  }

  // Verify that every path in compilationResult.sourceFiles is included in the
  // project directory
  for (const filePath of Object.keys(compilationResult.sourceFiles)) {
    const normalized = Paths.normalize(filePath).replace(/\\/g, "/");
    if (normalized.startsWith("..") || Paths.isAbsolute(normalized)) {
      throw new ExitError(
        `Template file '${filePath}' outside project directory`,
      );
    }
  }

  const templates: Spec.Templates = makeTemplates(compilationResult);

  const configYaml = [
    "patch:",
    "  base: patch-base.json",
    "  overrides: overrides.json",
    "",
    "include:",
    Object.keys(templates.sourceFiles)
      .sort()
      .map((p) => `  - ${p}`)
      .join("\n"),
    "",
  ].join("\n");

  const filesToWrite: { readonly [path: string]: string } = {
    ...templates.sourceFiles,
    "typeprompt.yaml": configYaml,
    "patch-base.json": JSON.stringify(templates, undefined, 2),
  };

  checkNoConfigInDirectory(output);

  const existingFiles = (
    await Promise.all(
      Object.keys(filesToWrite).map(async (relativePath) => {
        const fullPath = Paths.join(output, relativePath);
        return (await fileExists(fullPath)) ? fullPath : null;
      }),
    )
  ).filter((path): path is string => path !== null);

  if (existingFiles.length > 0) {
    const fileList = existingFiles
      .map((f) => Paths.relative(process.cwd(), f) || f)
      .join(", ");
    throw new ExitError(`File already exists: ${fileList}`);
  }

  await Promise.all(
    Object.entries(filesToWrite).map(async ([relativePath, content]) => {
      const targetPath = Paths.join(output, relativePath);
      const dir = Paths.dirname(targetPath);
      await FileSystem.mkdir(dir, { recursive: true });
      await FileSystem.writeFile(targetPath, content, "utf-8");
    }),
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await FileSystem.access(path);
    return true;
  } catch {
    return false;
  }
}
