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
import { collectTemplateFiles } from "./template-files-collector.js";

describe("collectTemplateFiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tp-collect-test-"));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("collects template files within project directory", async () => {
    const promptsDir = join(tempDir, "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(
      join(promptsDir, "Hello.tp"),
      "<template>hello</template>",
      "utf8",
    );

    const files = await collectTemplateFiles(tempDir, {
      include: ["prompts/**/*.tp"],
    });

    expect(files).toMatch({
      "prompts/Hello.tp": "<template>hello</template>",
    });
  });

  it("throws error when no template files match", async () => {
    let error: unknown;
    try {
      await collectTemplateFiles(tempDir, {
        include: ["prompts/**/*.tp"],
      });
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(
      /No template files matching 'prompts\/\*\*\/\*\.tp'/,
    );
  });

  it("throws error when template file is outside project directory", async () => {
    const projectDir = join(tempDir, "project");
    const outsideDir = join(tempDir, "outside");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(
      join(outsideDir, "Outside.tp"),
      "<template>outside</template>",
      "utf8",
    );

    let error: unknown;
    try {
      await collectTemplateFiles(projectDir, {
        include: ["../outside/*.tp"],
      });
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(/outside project directory/);
  });

  it("throws error when a template file does not have a .tp extension", async () => {
    const promptsDir = join(tempDir, "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(
      join(promptsDir, "Hello.xml"),
      "<template>hello</template>",
      "utf8",
    );

    let error: unknown;
    try {
      await collectTemplateFiles(tempDir, {
        include: ["prompts/**/*"],
      });
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(
      /Template file 'prompts\/Hello\.xml' must have a \.tp extension/,
    );
  });
});
