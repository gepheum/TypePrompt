import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { startPlayServer } from "./server.js";

describe("play backend server", () => {
  it("starts the server on localhost, serves frontend index.html, and closes", async () => {
    // Port 0 binds to any free port
    const playServer = await startPlayServer({ port: 0 });
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
    const playServer = await startPlayServer({ port: 0 });
    try {
      const response = await fetch(`${playServer.url}/`, { method: "POST" });
      expect(response.status).toBe(405);
    } finally {
      await playServer.close();
    }
  });

  it("returns 404 for missing static assets with extensions", async () => {
    const playServer = await startPlayServer({ port: 0 });
    try {
      const response = await fetch(`${playServer.url}/missing-file.js`);
      expect(response.status).toBe(404);
    } finally {
      await playServer.close();
    }
  });
});
