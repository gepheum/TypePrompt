import { parseConfigYaml } from "@typeprompt/core/config/config-parser.js";
import { expect } from "buckwheat";
import { afterEach, beforeEach, describe, it } from "mocha";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExitError } from "./exit-error.js";
import {
  HELLO_WORLD_TEMPLATE,
  initializeProject,
} from "./project-initializer.js";
import { patchProject } from "./project-patcher.js";

describe("patchProject", () => {
  let tempBaseDir: string;
  let tempPatchDir: string;

  beforeEach(() => {
    tempBaseDir = mkdtempSync(join(tmpdir(), "tp-patch-base-"));
    tempPatchDir = mkdtempSync(join(tmpdir(), "tp-patch-target-"));
  });

  afterEach(() => {
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
    if (existsSync(tempPatchDir)) {
      rmSync(tempPatchDir, { recursive: true, force: true });
    }
  });

  it("patches from a project directory", async () => {
    initializeProject(tempBaseDir);

    const targetProject = join(tempPatchDir, "my-patch");
    await patchProject({
      base: tempBaseDir,
      output: targetProject,
    });

    const configPath = join(targetProject, "typeprompt.yml");
    const templatePath = join(targetProject, "prompts", "hello-world.xml");
    const baseJsonPath = join(targetProject, "base.readonly.json");

    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(templatePath)).toBe(true);
    expect(existsSync(baseJsonPath)).toBe(true);

    const configContent = readFileSync(configPath, "utf8");
    const configResult = parseConfigYaml(configContent, configPath);
    expect(configResult.kind).toBe("success");
    if (configResult.kind === "success") {
      expect(configResult.config.include).toMatch(["prompts/hello-world.xml"]);
      expect(configResult.config.patch).toMatch({
        base: "base.readonly.json",
        overrides: "overrides.json",
      });
    }

    const baseJson = JSON.parse(readFileSync(baseJsonPath, "utf8"));
    expect(baseJson.sourceFiles["prompts/hello-world.xml"] !== undefined).toBe(
      true,
    );
    expect(baseJson.templates["Main:SayHello"] !== undefined).toBe(true);
  });

  it("patches from a .json spec file", async () => {
    initializeProject(tempBaseDir);

    const target1 = join(tempPatchDir, "target1");
    await patchProject({
      base: tempBaseDir,
      output: target1,
    });

    const baseJsonPath = join(target1, "base.readonly.json");
    const target2 = join(tempPatchDir, "target2");

    await patchProject({
      base: baseJsonPath,
      output: target2,
    });

    const configPath = join(target2, "typeprompt.yml");
    const templatePath = join(target2, "prompts", "hello-world.xml");
    const target2BaseJson = join(target2, "base.readonly.json");

    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(templatePath)).toBe(true);
    expect(existsSync(target2BaseJson)).toBe(true);

    const configContent = readFileSync(configPath, "utf8");
    const configResult = parseConfigYaml(configContent, configPath);
    expect(configResult.kind).toBe("success");
    if (configResult.kind === "success") {
      expect(configResult.config.include).toMatch(["prompts/hello-world.xml"]);
      expect(configResult.config.patch).toMatch({
        base: "base.readonly.json",
        overrides: "overrides.json",
      });
    }
  });

  it("fails if target project already contains a generated file", async () => {
    initializeProject(tempBaseDir);

    const targetProject = join(tempPatchDir, "existing-target");
    mkdirSync(targetProject, { recursive: true });
    writeFileSync(
      join(targetProject, "typeprompt.yml"),
      "include: prompts/*.xml",
      "utf8",
    );

    let error: unknown;
    try {
      await patchProject({
        base: tempBaseDir,
        output: targetProject,
      });
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(/File already exists/);
  });

  it("fails if base directory is missing", async () => {
    let error: unknown;
    try {
      await patchProject({
        base: join(tempBaseDir, "non-existent"),
        output: tempPatchDir,
      });
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
  });

  it("fails if JSON file has path outside project directory", async () => {
    const invalidJson = {
      edition: 0,
      signature: "sig",
      singleNamespace: true,
      templates: {},
      tools: {},
      sourceFiles: {
        "../SayHello.xml": HELLO_WORLD_TEMPLATE,
      },
    };

    const jsonPath = join(tempBaseDir, "invalid.json");
    writeFileSync(jsonPath, JSON.stringify(invalidJson), "utf8");

    let error: unknown;
    try {
      await patchProject({
        base: jsonPath,
        output: join(tempPatchDir, "target"),
      });
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(
      /outside the project directory/,
    );
  });

  it("fails if parent directory of project does not exist", async () => {
    initializeProject(tempBaseDir);

    let error: unknown;
    try {
      await patchProject({
        base: tempBaseDir,
        output: join(tempPatchDir, "non-existent-parent", "target"),
      });
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(
      /Parent directory does not exist/,
    );
  });
});
