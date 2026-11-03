import type { PlaygroundInferenceSet } from "@typeprompt/core";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openProjectStorage, type ProjectStorage } from "./project-storage.js";

function createMockInferenceSet(overrides?: {
  id?: string;
  templateId?: string;
  isoTimestamp?: string;
}): PlaygroundInferenceSet {
  return {
    kind: "playground-inference-set",
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
        name: "World greeting",
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

    it("creates the inference_sets view", () => {
      const result = storage.db.prepare("SELECT * FROM inference_sets").all();
      assert.deepEqual(result, []);
    });
  });

  describe("CRUD operations", () => {
    it("saves and retrieves an inference set by ID", () => {
      const set = createMockInferenceSet({ id: "inf-123" });
      storage.saveInferenceSet(set);

      const retrieved = storage.getInferenceSet("inf-123");
      assert.deepEqual(retrieved, set);
    });

    it("returns null when inference set is not found", () => {
      const retrieved = storage.getInferenceSet("non-existent");
      assert.equal(retrieved, null);
    });

    it("replaces existing record when saving an inference set with identical ID", () => {
      const set1 = createMockInferenceSet({
        id: "inf-dup",
        isoTimestamp: "2026-11-01T00:00:00.000Z",
      });
      const set2 = createMockInferenceSet({
        id: "inf-dup",
        isoTimestamp: "2026-11-02T00:00:00.000Z",
      });

      storage.saveInferenceSet(set1);
      storage.saveInferenceSet(set2);

      const retrieved = storage.getInferenceSet("inf-dup");
      assert.equal(retrieved?.isoTimestamp, "2026-11-02T00:00:00.000Z");

      const all = storage.listRecentInferenceSets();
      assert.equal(all.length, 1);
    });

    it("lists inference sets for a template in timestamp DESC order", () => {
      const setOld = createMockInferenceSet({
        id: "inf-old",
        templateId: "Main:T1",
        isoTimestamp: "2026-11-01T10:00:00.000Z",
      });
      const setNew = createMockInferenceSet({
        id: "inf-new",
        templateId: "Main:T1",
        isoTimestamp: "2026-11-02T10:00:00.000Z",
      });
      const setOther = createMockInferenceSet({
        id: "inf-other",
        templateId: "Main:T2",
        isoTimestamp: "2026-11-03T10:00:00.000Z",
      });

      storage.saveInferenceSet(setOld);
      storage.saveInferenceSet(setNew);
      storage.saveInferenceSet(setOther);

      const t1Sets = storage.listInferenceSetsForTemplate("Main:T1");
      assert.equal(t1Sets.length, 2);
      assert.equal(t1Sets[0]?.id, "inf-new");
      assert.equal(t1Sets[1]?.id, "inf-old");
    });

    it("supports pagination in listInferenceSetsForTemplate", () => {
      for (let i = 1; i <= 5; i++) {
        storage.saveInferenceSet(
          createMockInferenceSet({
            id: `inf-${i}`,
            templateId: "Main:T",
            isoTimestamp: `2026-11-0${i}T00:00:00.000Z`,
          }),
        );
      }

      const paged = storage.listInferenceSetsForTemplate("Main:T", {
        limit: 2,
        offset: 1,
      });
      assert.equal(paged.length, 2);
      assert.equal(paged[0]?.id, "inf-4");
      assert.equal(paged[1]?.id, "inf-3");
    });

    it("retrieves lightweight summaries without parsing full payloads", () => {
      const set = createMockInferenceSet({
        id: "inf-summary-test",
        templateId: "Main:Summary",
        isoTimestamp: "2026-11-02T12:00:00.000Z",
      });
      storage.saveInferenceSet(set);

      const summaries =
        storage.listInferenceSummariesForTemplate("Main:Summary");
      assert.equal(summaries.length, 1);
      assert.deepEqual(summaries[0], {
        id: "inf-summary-test",
        templateId: "Main:Summary",
        timestamp: "2026-11-02T12:00:00.000Z",
      });
    });

    it("lists recent inference sets across all templates", () => {
      const set1 = createMockInferenceSet({
        id: "s1",
        templateId: "T1",
        isoTimestamp: "2026-11-01T00:00:00.000Z",
      });
      const set2 = createMockInferenceSet({
        id: "s2",
        templateId: "T2",
        isoTimestamp: "2026-11-02T00:00:00.000Z",
      });

      storage.saveInferenceSet(set1);
      storage.saveInferenceSet(set2);

      const recent = storage.listRecentInferenceSets();
      assert.equal(recent.length, 2);
      assert.equal(recent[0]?.id, "s2");
      assert.equal(recent[1]?.id, "s1");
    });

    it("saves multiple inference sets in batch", () => {
      const sets = [
        createMockInferenceSet({ id: "batch-1" }),
        createMockInferenceSet({ id: "batch-2" }),
      ];
      storage.saveInferenceSets(sets);

      assert.ok(storage.getInferenceSet("batch-1"));
      assert.ok(storage.getInferenceSet("batch-2"));
    });

    it("deletes an inference set by ID", () => {
      const set = createMockInferenceSet({ id: "to-delete" });
      storage.saveInferenceSet(set);

      assert.equal(storage.deleteInferenceSet("to-delete"), true);
      assert.equal(storage.getInferenceSet("to-delete"), null);
      assert.equal(storage.deleteInferenceSet("to-delete"), false);
    });
  });

  describe("file-based database", () => {
    it("opens and creates default typeprompt.sqlite file in directory", () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "tp-storage-test-"),
      );
      try {
        const fileStorage = openProjectStorage(tempDir);
        const set = createMockInferenceSet({ id: "disk-test" });
        fileStorage.saveInferenceSet(set);
        fileStorage.close();

        const dbFilePath = path.join(tempDir, "typeprompt.sqlite");
        assert.ok(
          fs.existsSync(dbFilePath),
          "typeprompt.sqlite must be created",
        );

        // Re-open and verify persistence
        const reopened = openProjectStorage(tempDir);
        const retrieved = reopened.getInferenceSet("disk-test");
        assert.deepEqual(retrieved, set);
        reopened.close();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
