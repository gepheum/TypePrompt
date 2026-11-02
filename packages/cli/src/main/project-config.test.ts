import { expect } from "buckwheat";
import { afterEach, beforeEach, describe, it } from "mocha";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExitError } from "./exit-error.js";
import {
  checkNoConfigInDirectory,
  findConfigInDirectory,
  findProjectForFile,
  readConfigInDirectory,
} from "./project-config.js";

describe("project-config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "project-config-test-"));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("findConfigInDirectory", () => {
    it("returns undefined when no config file exists", async () => {
      expect(await findConfigInDirectory(tempDir)).toBe(undefined);
    });

    it("finds typeprompt.yaml when present", async () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      writeFileSync(yamlPath, "include: []\n", "utf8");
      expect(await findConfigInDirectory(tempDir)).toMatch({
        configPath: yamlPath,
        configContent: "include: []\n",
      });
    });

    it("finds typeprompt.yml when present", async () => {
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(ymlPath, "include: []\n", "utf8");
      expect(await findConfigInDirectory(tempDir)).toMatch({
        configPath: ymlPath,
        configContent: "include: []\n",
      });
    });

    it("prefers typeprompt.yaml over typeprompt.yml when both exist", async () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(yamlPath, "include: [yaml]\n", "utf8");
      writeFileSync(ymlPath, "include: [yml]\n", "utf8");
      expect(await findConfigInDirectory(tempDir)).toMatch({
        configPath: yamlPath,
        configContent: "include: [yaml]\n",
      });
    });
  });

  describe("readConfigInDirectory", () => {
    it("reads typeprompt.yaml when present", async () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      writeFileSync(yamlPath, "include:\n  - prompts/**/*.tp\n", "utf8");
      const result = await readConfigInDirectory(tempDir);
      expect(result.configPath).toBe(yamlPath);
      expect(result.configContent).toBe("include:\n  - prompts/**/*.tp\n");
    });

    it("reads typeprompt.yml when present", async () => {
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(ymlPath, "include:\n  - yml-prompts/**/*.tp\n", "utf8");
      const result = await readConfigInDirectory(tempDir);
      expect(result.configPath).toBe(ymlPath);
      expect(result.configContent).toBe("include:\n  - yml-prompts/**/*.tp\n");
    });

    it("prefers typeprompt.yaml when both exist", async () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(yamlPath, "from: yaml\n", "utf8");
      writeFileSync(ymlPath, "from: yml\n", "utf8");
      const result = await readConfigInDirectory(tempDir);
      expect(result.configPath).toBe(yamlPath);
      expect(result.configContent).toBe("from: yaml\n");
    });

    it("throws ExitError when neither config file exists", async () => {
      let error: unknown;
      try {
        await readConfigInDirectory(tempDir);
      } catch (e) {
        error = e;
      }
      expect(error instanceof ExitError).toBe(true);
      expect((error as ExitError).message).toMatch(/Cannot find/);
      expect((error as ExitError).message).toMatch(/typeprompt\.yaml/);
    });
  });

  describe("checkNoConfigInDirectory", () => {
    it("does not throw when directory contains no config file", async () => {
      await checkNoConfigInDirectory(tempDir);
    });

    it("throws ExitError when typeprompt.yaml exists", async () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      writeFileSync(yamlPath, "include: []\n", "utf8");
      let error: unknown;
      try {
        await checkNoConfigInDirectory(tempDir);
      } catch (e) {
        error = e;
      }
      expect(error instanceof ExitError).toBe(true);
      expect((error as ExitError).message).toMatch(/File already exists/);
      expect((error as ExitError).message).toMatch(/typeprompt\.yaml/);
    });

    it("throws ExitError when typeprompt.yml exists", async () => {
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(ymlPath, "include: []\n", "utf8");
      let error: unknown;
      try {
        await checkNoConfigInDirectory(tempDir);
      } catch (e) {
        error = e;
      }
      expect(error instanceof ExitError).toBe(true);
      expect((error as ExitError).message).toMatch(/File already exists/);
      expect((error as ExitError).message).toMatch(/typeprompt\.yml/);
    });
  });

  describe("findProjectForFile", () => {
    it("walks up parent directories to find the directory and config content", async () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      writeFileSync(yamlPath, "include:\n  - prompts/**/*.tp\n", "utf8");
      const nestedDir = join(tempDir, "prompts", "Finance");
      mkdirSync(nestedDir, { recursive: true });
      const playFile = join(nestedDir, "DetectAnomaly.play.tp");
      writeFileSync(playFile, '<playground for="DetectAnomaly" />\n', "utf8");

      expect(await findProjectForFile(playFile)).toMatch({
        projectDir: tempDir,
        configPath: yamlPath,
        configContent: "include:\n  - prompts/**/*.tp\n",
      });
    });

    it("throws ExitError when the file does not exist", async () => {
      let error: unknown;
      try {
        await findProjectForFile(join(tempDir, "missing.play.tp"));
      } catch (e) {
        error = e;
      }
      expect(error instanceof ExitError).toBe(true);
      expect((error as ExitError).message).toMatch(/Cannot find/);
    });
  });
});
