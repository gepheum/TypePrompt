import * as Paths from "path";
import { REAL_FILE_SYSTEM } from "../util/io.js";
import { ExitError } from "./exit-error.js";

export type FoundConfig = {
  readonly projectDir: string;
  readonly configPath: string;
  readonly configContent: string;
};

export function findConfigInDirectory(
  projectDir: string,
): FoundConfig | undefined {
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = Paths.join(projectDir, name);
    const configContent = REAL_FILE_SYSTEM.readTextFile(configPath);
    if (configContent !== undefined) {
      return { projectDir, configPath, configContent };
    }
  }
  return undefined;
}

export function readConfigInDirectory(projectDir: string): FoundConfig {
  const found = findConfigInDirectory(projectDir);
  if (found !== undefined) {
    return found;
  }
  const defaultPath = Paths.join(projectDir, CONFIG_FILE_NAMES[0]);
  throw new ExitError(`Cannot find ${defaultPath}`);
}

export function checkNoConfigInDirectory(projectDir: string): void {
  const existingConfig = findConfigInDirectory(projectDir);
  if (existingConfig !== undefined) {
    const rel =
      Paths.relative(process.cwd(), existingConfig.configPath) ||
      existingConfig.configPath;
    throw new ExitError(`File already exists: ${rel}`);
  }
}

export function findProjectForFile(filePath: string): FoundConfig {
  const resolvedFile = Paths.resolve(filePath);
  if (REAL_FILE_SYSTEM.readTextFile(resolvedFile) === undefined) {
    throw new ExitError(`Cannot find ${filePath}`);
  }
  let currentDir = Paths.dirname(resolvedFile);
  while (true) {
    const found = findConfigInDirectory(currentDir);
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

const CONFIG_FILE_NAMES = ["typeprompt.yaml", "typeprompt.yml"] as const;
