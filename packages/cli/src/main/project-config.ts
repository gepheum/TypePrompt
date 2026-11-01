import * as Paths from "path";
import { REAL_FILE_SYSTEM } from "../util/io.js";
import { ExitError } from "./exit-error.js";

export function findConfigInDirectory(projectDir: string): string | undefined {
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = Paths.join(projectDir, name);
    if (REAL_FILE_SYSTEM.readTextFile(configPath) !== undefined) {
      return configPath;
    }
  }
  return undefined;
}

export function readConfigInDirectory(projectDir: string): {
  readonly configPath: string;
  readonly configContent: string;
} {
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = Paths.join(projectDir, name);
    const configContent = REAL_FILE_SYSTEM.readTextFile(configPath);
    if (configContent !== undefined) {
      return { configPath, configContent };
    }
  }
  const defaultPath = Paths.join(projectDir, CONFIG_FILE_NAMES[0]);
  throw new ExitError(`Cannot find ${defaultPath}`);
}

export function checkNoConfigInDirectory(projectDir: string): void {
  const existingConfig = findConfigInDirectory(projectDir);
  if (existingConfig !== undefined) {
    const rel = Paths.relative(process.cwd(), existingConfig) || existingConfig;
    throw new ExitError(`File already exists: ${rel}`);
  }
}

const CONFIG_FILE_NAMES = ["typeprompt.yaml", "typeprompt.yml"] as const;
