import { parseSecretsYaml, type Secrets } from "@typeprompt/core";
import * as Paths from "path";
import { REAL_FILE_SYSTEM } from "../util/io.js";
import { ExitError } from "./exit-error.js";

export type ConfigMatch = {
  readonly projectDir: string;
  readonly configPath: string;
  readonly configContent: string;
};

export async function findConfigInDirectory(
  projectDir: string,
): Promise<ConfigMatch | undefined> {
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = Paths.join(projectDir, name);
    const configContent = await REAL_FILE_SYSTEM.readTextFileAsync(configPath);
    if (configContent !== undefined) {
      return { projectDir, configPath, configContent };
    }
  }
  return undefined;
}

export async function readConfigInDirectory(
  projectDir: string,
): Promise<ConfigMatch> {
  const found = await findConfigInDirectory(projectDir);
  if (found !== undefined) {
    return found;
  }
  const defaultPath = Paths.join(projectDir, CONFIG_FILE_NAMES[0]);
  throw new ExitError(`Cannot find ${defaultPath}`);
}

export async function checkNoConfigInDirectory(
  projectDir: string,
): Promise<void> {
  const existingConfig = await findConfigInDirectory(projectDir);
  if (existingConfig !== undefined) {
    const rel =
      Paths.relative(process.cwd(), existingConfig.configPath) ||
      existingConfig.configPath;
    throw new ExitError(`File already exists: ${rel}`);
  }
}

/**
 * Walks up parent directories starting from `filePath`'s directory until a
 * TypePrompt config file (`typeprompt.yaml` or `typeprompt.yml`) is found.
 */
export async function findProjectForFile(
  filePath: string,
): Promise<ConfigMatch> {
  const resolvedFile = Paths.resolve(filePath);
  if ((await REAL_FILE_SYSTEM.readTextFileAsync(resolvedFile)) === undefined) {
    throw new ExitError(`Cannot find ${filePath}`);
  }
  let currentDir = Paths.dirname(resolvedFile);
  while (true) {
    const found = await findConfigInDirectory(currentDir);
    if (found !== undefined) {
      return found;
    }
    const parentDir = Paths.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new ExitError(
        `Cannot find ${CONFIG_FILE_NAMES[0]} in any parent directory of ${filePath}`,
      );
    }
    currentDir = parentDir;
  }
}

/**
 * Reads secrets for the project from `.typeprompt.secrets.yaml` (or `.typeprompt.secrets.yml`)
 * in `projectDir`. Returns `{}` if neither file exists.
 */
export async function readSecretsInDirectory(
  projectDir: string,
): Promise<Secrets> {
  for (const fileName of SECRETS_FILE_NAMES) {
    const filePath = Paths.join(projectDir, fileName);
    const content = await REAL_FILE_SYSTEM.readTextFileAsync(filePath);
    if (content !== undefined) {
      const parseResult = parseSecretsYaml(content, filePath);
      if (parseResult.kind === "error") {
        const errorMessages = parseResult.errors
          .map((e) => e.message)
          .join("\n");
        throw new ExitError(
          `Invalid secrets file '${filePath}':\n${errorMessages}`,
        );
      }
      return parseResult.secrets;
    }
  }
  return {};
}

const CONFIG_FILE_NAMES = ["typeprompt.yaml", "typeprompt.yml"] as const;

const SECRETS_FILE_NAMES = [
  ".typeprompt.secrets.yaml",
  ".typeprompt.secrets.yml",
] as const;
