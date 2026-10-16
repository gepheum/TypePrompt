import { expect } from "buckwheat";
import { afterEach, beforeEach, describe, it } from "mocha";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExitError } from "./exit-error.js";
import {
  checkNoConfigInDirectory,
  findConfigInDirectory,
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
    it("returns undefined when no config file exists", () => {
      expect(findConfigInDirectory(tempDir)).toBe(undefined);
    });

    it("finds typeprompt.yaml when present", () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      writeFileSync(yamlPath, "include: []\n", "utf8");
      expect(findConfigInDirectory(tempDir)).toBe(yamlPath);
    });

    it("finds typeprompt.yml when present", () => {
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(ymlPath, "include: []\n", "utf8");
      expect(findConfigInDirectory(tempDir)).toBe(ymlPath);
    });

    it("prefers typeprompt.yaml over typeprompt.yml when both exist", () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(yamlPath, "include: [yaml]\n", "utf8");
      writeFileSync(ymlPath, "include: [yml]\n", "utf8");
      expect(findConfigInDirectory(tempDir)).toBe(yamlPath);
    });
  });

  describe("readConfigInDirectory", () => {
    it("reads typeprompt.yaml when present", () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      writeFileSync(yamlPath, "include:\n  - prompts/**/*.xml\n", "utf8");
      const result = readConfigInDirectory(tempDir);
      expect(result.configPath).toBe(yamlPath);
      expect(result.configContent).toBe("include:\n  - prompts/**/*.xml\n");
    });

    it("reads typeprompt.yml when present", () => {
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(ymlPath, "include:\n  - yml-prompts/**/*.xml\n", "utf8");
      const result = readConfigInDirectory(tempDir);
      expect(result.configPath).toBe(ymlPath);
      expect(result.configContent).toBe("include:\n  - yml-prompts/**/*.xml\n");
    });

    it("prefers typeprompt.yaml when both exist", () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(yamlPath, "from: yaml\n", "utf8");
      writeFileSync(ymlPath, "from: yml\n", "utf8");
      const result = readConfigInDirectory(tempDir);
      expect(result.configPath).toBe(yamlPath);
      expect(result.configContent).toBe("from: yaml\n");
    });

    it("throws ExitError when neither config file exists", () => {
      let error: unknown;
      try {
        readConfigInDirectory(tempDir);
      } catch (e) {
        error = e;
      }
      expect(error instanceof ExitError).toBe(true);
      expect((error as ExitError).message).toMatch(/Cannot find/);
      expect((error as ExitError).message).toMatch(/typeprompt\.yaml/);
    });
  });

  describe("checkNoConfigInDirectory", () => {
    it("does not throw when directory contains no config file", () => {
      checkNoConfigInDirectory(tempDir);
    });

    it("throws ExitError when typeprompt.yaml exists", () => {
      const yamlPath = join(tempDir, "typeprompt.yaml");
      writeFileSync(yamlPath, "include: []\n", "utf8");
      let error: unknown;
      try {
        checkNoConfigInDirectory(tempDir);
      } catch (e) {
        error = e;
      }
      expect(error instanceof ExitError).toBe(true);
      expect((error as ExitError).message).toMatch(/File already exists/);
      expect((error as ExitError).message).toMatch(/typeprompt\.yaml/);
    });

    it("throws ExitError when typeprompt.yml exists", () => {
      const ymlPath = join(tempDir, "typeprompt.yml");
      writeFileSync(ymlPath, "include: []\n", "utf8");
      let error: unknown;
      try {
        checkNoConfigInDirectory(tempDir);
      } catch (e) {
        error = e;
      }
      expect(error instanceof ExitError).toBe(true);
      expect((error as ExitError).message).toMatch(/File already exists/);
      expect((error as ExitError).message).toMatch(/typeprompt\.yml/);
    });
  });
});
