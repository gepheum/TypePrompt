import type { Config } from "@typeprompt/core/config/config-parser.js";
import { glob } from "glob/raw";
import * as Paths from "path";
import { ExitError } from "./exit-error.js";
import { REAL_FILE_SYSTEM } from "./io.js";

export async function collectTemplateFiles(
  project: string,
  config: Config,
): Promise<{ [path: string]: string }> {
  let { include } = config;
  if (typeof include === "string") {
    include = [include];
  }
  const patterns = include.map((pattern) => Paths.join(project, pattern));
  const templateFiles = await glob(patterns, {
    withFileTypes: true,
  });
  if (templateFiles.length <= 0) {
    const includeStr = include.map((i) => `'${i}'`).join(", ");
    throw new ExitError(`No template files matching ${includeStr}`);
  }

  const entries = templateFiles
    .filter((file) => file.isFile())
    .map(async (file): Promise<[string, string]> => {
      const fullPath = file.fullpath();
      const content = await REAL_FILE_SYSTEM.readTextFileAsync(fullPath);
      if (content === undefined) {
        throw new ExitError(`Cannot read ${fullPath}`);
      }
      const relativePath = Paths.relative(project, fullPath).replace(
        /\\/g,
        "/",
      );
      return [relativePath, content];
    });
  return Object.fromEntries(await Promise.all(entries));
}
