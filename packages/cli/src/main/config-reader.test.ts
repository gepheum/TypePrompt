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
import {
  checkNoConfigInDirectory,
  findConfigInDirectory,
  findProjectForFile,
  readConfigInDirectory,
  readSecretsInDirectory,
} from "./config-reader.js";
import { ExitError } from "./exit-error.js";

describe("config-reader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "config-reader-test-"));
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

  describe("readSecretsInDirectory", () => {
    it("reads secrets from .typeprompt.secrets.yaml", async () => {
      writeFileSync(
        join(tempDir, ".typeprompt.secrets.yaml"),
        [
          "apiKeys:",
          "  openai: sk-secrets-openai",
          "  anthropic: sk-secrets-anthropic",
          "  google: AIzaSy-secrets-google",
          "  xai: xai-secrets",
          "  mistral: mis-secrets",
          "  vercelGateway: vck-secrets",
        ].join("\n"),
        "utf8",
      );

      const secrets = await readSecretsInDirectory(tempDir);

      expect(secrets).toMatch({
        apiKeys: {
          openai: "sk-secrets-openai",
          anthropic: "sk-secrets-anthropic",
          google: "AIzaSy-secrets-google",
          xai: "xai-secrets",
          mistral: "mis-secrets",
          vercelGateway: "vck-secrets",
        },
      });
    });

    it("reads secrets from .typeprompt.secrets.yml when .yaml is not present", async () => {
      writeFileSync(
        join(tempDir, ".typeprompt.secrets.yml"),
        [
          "apiKeys:",
          "  openai: sk-yml-openai",
          "  google: AIzaSy-yml-google",
        ].join("\n"),
        "utf8",
      );

      const secrets = await readSecretsInDirectory(tempDir);

      expect(secrets).toMatch({
        apiKeys: {
          openai: "sk-yml-openai",
          google: "AIzaSy-yml-google",
        },
      });
    });

    it("prefers .typeprompt.secrets.yaml over .typeprompt.secrets.yml", async () => {
      writeFileSync(
        join(tempDir, ".typeprompt.secrets.yaml"),
        ["apiKeys:", "  openai: sk-from-yaml"].join("\n"),
        "utf8",
      );
      writeFileSync(
        join(tempDir, ".typeprompt.secrets.yml"),
        ["apiKeys:", "  openai: sk-from-yml"].join("\n"),
        "utf8",
      );

      const secrets = await readSecretsInDirectory(tempDir);

      expect(secrets).toMatch({
        apiKeys: {
          openai: "sk-from-yaml",
        },
      });
    });

    it("returns empty object when secrets file is omitted", async () => {
      const secrets = await readSecretsInDirectory(tempDir);
      expect(secrets).toMatch({});
    });

    it("does not read from .env files", async () => {
      writeFileSync(
        join(tempDir, ".env"),
        "OPENAI_API_KEY=dotenv-openai-key\n",
        "utf8",
      );

      const secrets = await readSecretsInDirectory(tempDir);
      expect(secrets).toMatch({});
    });

    it("throws ExitError when .typeprompt.secrets.yaml has invalid YAML syntax or unknown keys", async () => {
      writeFileSync(
        join(tempDir, ".typeprompt.secrets.yaml"),
        "unknownKey: 123\n",
        "utf8",
      );

      let caughtError: unknown;
      try {
        await readSecretsInDirectory(tempDir);
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError instanceof ExitError).toBe(true);
      expect((caughtError as Error).message).toMatch(
        /Invalid secrets file.*Unknown field 'unknownKey'/s,
      );
    });
  });
});
