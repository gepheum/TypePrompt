import { glob } from "glob/raw";
import * as Paths from "path";
import { Config } from "../config/config-parser.js";
import { ExitError } from "./exit-error.js";
import { REAL_FILE_SYSTEM } from "./io.js";

export async function collectTemplateFiles(
  project: string,
  config: Config,
): Promise<{ [path: string]: string }> {
  const templateFiles = await glob(Paths.join(project, config.include), {
    withFileTypes: true,
  });
  if (templateFiles.length <= 0) {
    throw new ExitError(`No template files matching '${config.include}'`);
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
