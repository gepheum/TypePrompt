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
      join(promptsDir, "Hello.xml"),
      "<template>hello</template>",
      "utf8",
    );

    const files = await collectTemplateFiles(tempDir, {
      include: "prompts/**/*.xml",
    });

    expect(files).toMatch({
      "prompts/Hello.xml": "<template>hello</template>",
    });
  });

  it("throws error when no template files match", async () => {
    let error: unknown;
    try {
      await collectTemplateFiles(tempDir, {
        include: "prompts/**/*.xml",
      });
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(
      /No template files matching 'prompts\/\*\*\/\*\.xml'/,
    );
  });

  it("throws error when template file is outside project directory", async () => {
    const projectDir = join(tempDir, "project");
    const outsideDir = join(tempDir, "outside");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(
      join(outsideDir, "Outside.xml"),
      "<template>outside</template>",
      "utf8",
    );

    let error: unknown;
    try {
      await collectTemplateFiles(projectDir, {
        include: "../outside/*.xml",
      });
    } catch (e) {
      error = e;
    }

    expect(error instanceof ExitError).toBe(true);
    expect((error as ExitError).message).toMatch(/outside project directory/);
  });
});
