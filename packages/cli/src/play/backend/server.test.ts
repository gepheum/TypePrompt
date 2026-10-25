import type { ValidCompilationResult } from "@typeprompt/core";
import { createPlayClient } from "@typeprompt/playground";
import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { PlayServer } from "./server.js";

describe("play backend server", () => {
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

  it("starts the server on localhost, serves frontend index.html, and closes", async () => {
    // Port 0 binds to any free port
    const playServer = await PlayServer.start({
      port: 0,
      project: ".",
      getCompilationResult: () => mockResult,
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
      getCompilationResult: () => mockResult,
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
      getCompilationResult: () => mockResult,
    });
    try {
      const response = await fetch(`${playServer.url}/missing-file.js`);
      expect(response.status).toBe(404);
    } finally {
      await playServer.close();
    }
  });

  it("serves tRPC pullSources when compilationResult is present", async () => {
    const playServer = await PlayServer.start({
      port: 0,
      project: ".",
      getCompilationResult: () => mockResult,
    });
    try {
      const client = createPlayClient(`${playServer.url}/trpc`);

      const res = await client.pullSources.query({
        lastTimestampMillis: null,
      });
      expect(res.timestampMillis).toBe(5000);
      expect(res.sourceFiles).toMatch({
        "prompts/test.tp": '<template name="Test"></template>',
      });
    } finally {
      await playServer.close();
    }
  });
});
