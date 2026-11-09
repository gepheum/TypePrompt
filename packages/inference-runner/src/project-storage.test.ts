import type { Inferences } from "@typeprompt/core";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openProjectStorage, type ProjectStorage } from "./project-storage.js";

function createMockInferenceRun(overrides?: {
  id?: string;
  templateId?: string;
  isoTimestamp?: string;
}): Inferences.InferenceRun {
  return {
    kind: "playground-inference-run",
    id: overrides?.id ?? crypto.randomUUID(),
    templateId: overrides?.templateId ?? "Main:Greeting",
    isoTimestamp: overrides?.isoTimestamp ?? new Date().toISOString(),
    model: {
      model: "google/gemini-2.5-flash",
      temperature: 0.2,
    },
    templateFiles: {
      "prompts/greeting.tp": '<template name="Greeting"></template>',
    },
    inferences: [
      {
        sampleIndex: 0,
        sample: {
          name: "World greeting",
          input: { name: "World" },
        },
        request: {
          systemMessage: "You are a greeter.",
          tools: [],
          outputFormat: { format: "text" },
          messages: [
            {
              role: "user",
              input: { name: "World" },
              rendered: "Hello World",
            },
          ],
        },
        result: {
          kind: "success",
          response: {
            kind: "output",
            rawText: "Hello, World!",
            output: "Hello, World!",
          },
          telemetry: {
            latencyMs: 120,
          },
        },
      },
    ],
  };
}

describe("ProjectStorage", () => {
  let storage: ProjectStorage;

  beforeEach(() => {
    storage = openProjectStorage(":memory:");
  });

  afterEach(() => {
    storage.close();
  });

  describe("schema and index creation", () => {
    it("creates the inferences table with id as primary key", () => {
      const tableInfo = storage.db
        .prepare("PRAGMA table_info(inferences)")
        .all() as { name: string; type: string; pk: number }[];

      assert.ok(tableInfo.length >= 4);
      const idCol = tableInfo.find((col) => col.name === "id");
      const templateIdCol = tableInfo.find((col) => col.name === "templateId");
      const timestampCol = tableInfo.find((col) => col.name === "timestamp");
      const dataCol = tableInfo.find((col) => col.name === "data");

      assert.ok(idCol && idCol.pk === 1, "id must be primary key");
      assert.ok(templateIdCol, "templateId column must exist");
      assert.ok(timestampCol, "timestamp column must exist");
      assert.ok(dataCol, "data column must exist");
    });

    it("creates index on (templateId, timestamp DESC)", () => {
      const indexList = storage.db
        .prepare("PRAGMA index_list(inferences)")
        .all() as { name: string }[];

      const hasIndex = indexList.some((idx) =>
        idx.name.includes("idx_inferences_templateId_timestamp"),
      );
      assert.ok(hasIndex, "index on templateId, timestamp must exist");

      const indexInfo = storage.db
        .prepare("PRAGMA index_xinfo(idx_inferences_templateId_timestamp)")
        .all() as { name: string; desc: number }[];

      assert.equal(indexInfo[0]?.name, "templateId");
      assert.equal(indexInfo[1]?.name, "timestamp");
      assert.equal(indexInfo[1]?.desc, 1, "timestamp index must be DESC");
    });

    it("uses the index when querying by templateId ordered by timestamp DESC", () => {
      const plan = storage.db
        .prepare(
          "EXPLAIN QUERY PLAN SELECT id FROM inferences WHERE templateId = ? ORDER BY timestamp DESC",
        )
        .all("Main:Greeting") as { detail: string }[];

      const usesIndex = plan.some((step) =>
        step.detail.includes("idx_inferences_templateId_timestamp"),
      );
      assert.ok(
        usesIndex,
        `Query plan must use index, got: ${JSON.stringify(plan)}`,
      );
    });

    it("creates the inference_runs view", () => {
      const runs = storage.db.prepare("SELECT * FROM inference_runs").all();
      assert.deepEqual(runs, []);
    });
  });

  describe("CRUD operations", () => {
    it("saves and retrieves an inference run by ID", () => {
      const run = createMockInferenceRun({ id: "inf-123" });
      storage.saveInferenceRun(run);

      const retrieved = storage.getInferenceRun("inf-123");
      assert.deepEqual(retrieved, run);
    });

    it("returns null when inference run is not found", () => {
      const retrieved = storage.getInferenceRun("non-existent");
      assert.equal(retrieved, null);
    });

    it("replaces existing record when saving an inference run with identical ID", () => {
      const run1 = createMockInferenceRun({
        id: "inf-dup",
        isoTimestamp: "2026-11-01T00:00:00.000Z",
      });
      const run2 = createMockInferenceRun({
        id: "inf-dup",
        isoTimestamp: "2026-11-02T00:00:00.000Z",
      });

      storage.saveInferenceRun(run1);
      storage.saveInferenceRun(run2);

      const retrieved = storage.getInferenceRun("inf-dup");
      assert.equal(retrieved?.isoTimestamp, "2026-11-02T00:00:00.000Z");

      const all = storage.listRecentInferenceRuns();
      assert.equal(all.length, 1);
    });

    it("lists inference runs for a template in timestamp DESC order", () => {
      const runOld = createMockInferenceRun({
        id: "inf-old",
        templateId: "Main:T1",
        isoTimestamp: "2026-11-01T10:00:00.000Z",
      });
      const runNew = createMockInferenceRun({
        id: "inf-new",
        templateId: "Main:T1",
        isoTimestamp: "2026-11-02T10:00:00.000Z",
      });
      const runOther = createMockInferenceRun({
        id: "inf-other",
        templateId: "Main:T2",
        isoTimestamp: "2026-11-03T10:00:00.000Z",
      });

      storage.saveInferenceRun(runOld);
      storage.saveInferenceRun(runNew);
      storage.saveInferenceRun(runOther);

      const t1Runs = storage.listInferenceRunsForTemplate("Main:T1");
      assert.equal(t1Runs.length, 2);
      assert.equal(t1Runs[0]?.id, "inf-new");
      assert.equal(t1Runs[1]?.id, "inf-old");
    });

    it("supports pagination in listInferenceRunsForTemplate", () => {
      for (let i = 1; i <= 5; i++) {
        storage.saveInferenceRun(
          createMockInferenceRun({
            id: `inf-${i}`,
            templateId: "Main:T",
            isoTimestamp: `2026-11-0${i}T00:00:00.000Z`,
          }),
        );
      }

      const paged = storage.listInferenceRunsForTemplate("Main:T", {
        limit: 2,
        offset: 1,
      });
      assert.equal(paged.length, 2);
      assert.equal(paged[0]?.id, "inf-4");
      assert.equal(paged[1]?.id, "inf-3");
    });

    it("retrieves lightweight summaries without parsing full payloads", () => {
      const run = createMockInferenceRun({
        id: "inf-summary-test",
        templateId: "Main:Summary",
        isoTimestamp: "2026-11-02T12:00:00.000Z",
      });
      storage.saveInferenceRun(run);

      const summaries =
        storage.listInferenceSummariesForTemplate("Main:Summary");
      assert.equal(summaries.length, 1);
      assert.deepEqual(summaries[0], {
        id: "inf-summary-test",
        templateId: "Main:Summary",
        timestamp: "2026-11-02T12:00:00.000Z",
      });
    });

    it("lists recent inference runs across all templates", () => {
      const run1 = createMockInferenceRun({
        id: "s1",
        templateId: "T1",
        isoTimestamp: "2026-11-01T00:00:00.000Z",
      });
      const run2 = createMockInferenceRun({
        id: "s2",
        templateId: "T2",
        isoTimestamp: "2026-11-02T00:00:00.000Z",
      });

      storage.saveInferenceRun(run1);
      storage.saveInferenceRun(run2);

      const recentRuns = storage.listRecentInferenceRuns();
      assert.equal(recentRuns.length, 2);
      assert.equal(recentRuns[0]?.id, "s2");
      assert.equal(recentRuns[1]?.id, "s1");
    });

    it("saves multiple inference runs in batch", () => {
      const runs = [
        createMockInferenceRun({ id: "batch-1" }),
        createMockInferenceRun({ id: "batch-2" }),
      ];
      storage.saveInferenceRuns(runs);

      assert.ok(storage.getInferenceRun("batch-1"));
      assert.ok(storage.getInferenceRun("batch-2"));
    });

    it("deletes an inference run by ID", () => {
      const run = createMockInferenceRun({ id: "to-delete" });
      storage.saveInferenceRun(run);

      assert.equal(storage.deleteInferenceRun("to-delete"), true);
      assert.equal(storage.getInferenceRun("to-delete"), null);
      assert.equal(storage.deleteInferenceRun("to-delete"), false);
    });
  });

  describe("file-based database", () => {
    it("opens and creates default typeprompt.sqlite file in directory", () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "tp-storage-test-"),
      );
      try {
        const fileStorage = openProjectStorage(tempDir);
        const run = createMockInferenceRun({ id: "disk-test" });
        fileStorage.saveInferenceRun(run);
        fileStorage.close();

        const dbFilePath = path.join(tempDir, "typeprompt.sqlite");
        assert.ok(
          fs.existsSync(dbFilePath),
          "typeprompt.sqlite must be created",
        );

        // Re-open and verify persistence
        const reopened = openProjectStorage(tempDir);
        const retrieved = reopened.getInferenceRun("disk-test");
        assert.deepEqual(retrieved, run);
        reopened.close();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
