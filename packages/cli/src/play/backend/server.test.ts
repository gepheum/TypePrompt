import type { ValidCompilationResult } from "@typeprompt/core";
import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { createPlayClient } from "../frontend/trpc.js";
import { PlayServer } from "./server.js";

describe("play backend server", () => {
  it("starts the server on localhost, serves frontend index.html, and closes", async () => {
    // Port 0 binds to any free port
    const playServer = await PlayServer.start({
      port: 0,
      project: ".",
      getCompilationResult: () => null,
    });
    try {
      expect(playServer.port > 0).toBe(true);
      expect(playServer.url).toBe(`http://localhost:${playServer.port}`);

      const response = await fetch(`${playServer.url}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")?.includes("text/html")).toBe(
        true,
      );

      const html = await response.text();
      expect(html.includes("<play-app>")).toBe(true);
    } finally {
      await playServer.close();
    }
  });

  it("returns 405 for non-GET/HEAD methods", async () => {
    const playServer = await PlayServer.start({
      port: 0,
      project: ".",
      getCompilationResult: () => null,
    });
    try {
      const response = await fetch(`${playServer.url}/`, { method: "POST" });
      expect(response.status).toBe(405);
    } finally {
      await playServer.close();
    }
  });

  it("returns 404 for missing static assets with extensions", async () => {
    const playServer = await PlayServer.start({
      port: 0,
      project: ".",
      getCompilationResult: () => null,
    });
    try {
      const response = await fetch(`${playServer.url}/missing-file.js`);
      expect(response.status).toBe(404);
    } finally {
      await playServer.close();
    }
  });

  it("serves tRPC getTemplates when compilationResult is null", async () => {
    const playServer = await PlayServer.start({
      port: 0,
      project: ".",
      getCompilationResult: () => null,
    });
    try {
      const client = createPlayClient(`${playServer.url}/trpc`);
      const response = await client.getTemplates.query();
      expect(response.sourceFiles).toBe(undefined);
    } finally {
      await playServer.close();
    }
  });

  it("serves tRPC getTemplates when compilationResult is present", async () => {
    const mockResult = {
      signature: "test-sig",
      tools: {},
      templates: {},
      sourceFiles: {
        "prompts/test.tp": {
          path: "prompts/test.tp",
          content: '<template name="Test"></template>',
        },
      },
      timestampMillis: 5000,
    } as unknown as ValidCompilationResult;

    const playServer = await PlayServer.start({
      port: 0,
      project: ".",
      getCompilationResult: () => mockResult,
    });
    try {
      const client = createPlayClient(`${playServer.url}/trpc`);

      // Initial query without timestamp
      const res1 = await client.getTemplates.query();
      expect(res1.sourceFiles).toMatch({
        "prompts/test.tp": '<template name="Test"></template>',
      });

      // Query with matching timestamp returns empty object (sourceFiles omitted)
      const res2 = await client.getTemplates.query({
        currentTimestampMillis: 5000,
      });
      expect(res2.sourceFiles).toBe(undefined);

      // Query with older timestamp returns updated sourceFiles
      const res3 = await client.getTemplates.query({
        currentTimestampMillis: 4000,
      });
      expect(res3.sourceFiles).toMatch({
        "prompts/test.tp": '<template name="Test"></template>',
      });
    } finally {
      await playServer.close();
    }
  });
});
