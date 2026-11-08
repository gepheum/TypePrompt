import type { Inferences } from "@typeprompt/core";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type StoredInferenceSummary = {
  readonly id: string;
  readonly templateId: string;
  readonly timestamp: string;
};

export type ListInferenceSetsOptions = {
  readonly limit?: number;
  readonly offset?: number;
};

export type OpenStorageOptions = {
  readonly dbPath?: string;
  readonly inMemory?: boolean;
};

export interface ProjectStorage {
  readonly db: Database.Database;

  /**
   * Saves a Inferences.InferenceSet into the SQLite database.
   * If an inference set with the same ID already exists, replaces it.
   */
  saveInferenceSet(inferenceSet: Inferences.InferenceSet): void;

  /**
   * Saves multiple Inferences.InferenceSets in a single transaction.
   */
  saveInferenceSets(inferenceSets: readonly Inferences.InferenceSet[]): void;

  /**
   * Retrieves a Inferences.InferenceSet by its ID. Returns null if not found.
   */
  getInferenceSet(id: string): Inferences.InferenceSet | null;

  /**
   * Retrieves all Inferences.InferenceSets for the specified template ID,
   * sorted by timestamp DESC.
   */
  listInferenceSetsForTemplate(
    templateId: string,
    options?: ListInferenceSetsOptions,
  ): readonly Inferences.InferenceSet[];

  /**
   * Retrieves lightweight summaries (id, templateId, timestamp) for the specified
   * template ID, sorted by timestamp DESC without parsing the full JSON payloads.
   */
  listInferenceSummariesForTemplate(
    templateId: string,
    options?: ListInferenceSetsOptions,
  ): readonly StoredInferenceSummary[];

  /**
   * Retrieves recent Inferences.InferenceSets across all templates,
   * sorted by timestamp DESC.
   */
  listRecentInferenceSets(
    options?: ListInferenceSetsOptions,
  ): readonly Inferences.InferenceSet[];

  /**
   * Deletes an inference set by its ID.
   * Returns true if a record was deleted, false otherwise.
   */
  deleteInferenceSet(id: string): boolean;

  /**
   * Closes the SQLite database connection.
   */
  close(): void;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS inferences (
  id TEXT PRIMARY KEY,
  templateId TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inferences_templateId_timestamp 
ON inferences (templateId, timestamp DESC);

CREATE VIEW IF NOT EXISTS inference_sets AS SELECT * FROM inferences;
`.trim();

export function getDatabasePath(projectDir: string): string {
  return path.join(projectDir, DEFAULT_DATABASE_FILENAME);
}

export function resolveDatabasePath(
  projectDirOrDbPath: string,
  options?: OpenStorageOptions,
): string {
  if (options?.inMemory || projectDirOrDbPath === ":memory:") {
    return ":memory:";
  }
  if (options?.dbPath) {
    return path.resolve(options.dbPath);
  }
  if (
    projectDirOrDbPath.endsWith(".sqlite") ||
    projectDirOrDbPath.endsWith(".db")
  ) {
    return path.resolve(projectDirOrDbPath);
  }
  return path.resolve(projectDirOrDbPath, DEFAULT_DATABASE_FILENAME);
}

export function createProjectStorage(db: Database.Database): ProjectStorage {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  const insertStmt = db.prepare<[string, string, string, string]>(`
    INSERT OR REPLACE INTO inferences (id, templateId, timestamp, data)
    VALUES (?, ?, ?, ?)
  `);

  const getByIdStmt = db.prepare<[string], StoredInferenceRow>(`
    SELECT id, templateId, timestamp, data
    FROM inferences
    WHERE id = ?
  `);

  const listByTemplateStmt = db.prepare<
    [string, number, number],
    StoredInferenceRow
  >(`
    SELECT id, templateId, timestamp, data
    FROM inferences
    WHERE templateId = ?
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const listSummariesByTemplateStmt = db.prepare<
    [string, number, number],
    StoredInferenceSummary
  >(`
    SELECT id, templateId, timestamp
    FROM inferences
    WHERE templateId = ?
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const listRecentStmt = db.prepare<[number, number], StoredInferenceRow>(`
    SELECT id, templateId, timestamp, data
    FROM inferences
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const deleteByIdStmt = db.prepare<[string]>(`
    DELETE FROM inferences WHERE id = ?
  `);

  const saveBatchTransaction = db.transaction(
    (inferenceSets: readonly Inferences.InferenceSet[]) => {
      for (const set of inferenceSets) {
        insertStmt.run(
          set.id,
          set.templateId,
          set.isoTimestamp,
          JSON.stringify(set),
        );
      }
    },
  );

  return {
    db,

    saveInferenceSet(inferenceSet: Inferences.InferenceSet): void {
      insertStmt.run(
        inferenceSet.id,
        inferenceSet.templateId,
        inferenceSet.isoTimestamp,
        JSON.stringify(inferenceSet),
      );
    },

    saveInferenceSets(inferenceSets: readonly Inferences.InferenceSet[]): void {
      saveBatchTransaction(inferenceSets);
    },

    getInferenceSet(id: string): Inferences.InferenceSet | null {
      const row = getByIdStmt.get(id);
      if (!row) {
        return null;
      }
      return parseStoredInferenceSet(row.data);
    },

    listInferenceSetsForTemplate(
      templateId: string,
      options?: ListInferenceSetsOptions,
    ): readonly Inferences.InferenceSet[] {
      const limit = options?.limit ?? -1;
      const offset = options?.offset ?? 0;
      const rows = listByTemplateStmt.all(templateId, limit, offset);
      return rows.map((row) => parseStoredInferenceSet(row.data));
    },

    listInferenceSummariesForTemplate(
      templateId: string,
      options?: ListInferenceSetsOptions,
    ): readonly StoredInferenceSummary[] {
      const limit = options?.limit ?? -1;
      const offset = options?.offset ?? 0;
      return listSummariesByTemplateStmt.all(templateId, limit, offset);
    },

    listRecentInferenceSets(
      options?: ListInferenceSetsOptions,
    ): readonly Inferences.InferenceSet[] {
      const limit = options?.limit ?? -1;
      const offset = options?.offset ?? 0;
      const rows = listRecentStmt.all(limit, offset);
      return rows.map((row) => parseStoredInferenceSet(row.data));
    },

    deleteInferenceSet(id: string): boolean {
      const result = deleteByIdStmt.run(id);
      return result.changes > 0;
    },

    close(): void {
      db.close();
    },
  };
}

export function openProjectStorage(
  projectDirOrDbPath: string,
  options?: OpenStorageOptions,
): ProjectStorage {
  const dbPath = resolveDatabasePath(projectDirOrDbPath, options);
  if (dbPath !== ":memory:") {
    const parentDir = path.dirname(dbPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }
  const db = new Database(dbPath);
  return createProjectStorage(db);
}

function parseStoredInferenceSet(rawJson: string): Inferences.InferenceSet {
  const parsed = JSON.parse(rawJson);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    parsed.kind !== "playground-inference-set" ||
    typeof parsed.id !== "string" ||
    typeof parsed.templateId !== "string" ||
    typeof parsed.isoTimestamp !== "string" ||
    !Array.isArray(parsed.inferences)
  ) {
    throw new Error("Invalid stored InferenceSet JSON format");
  }
  return parsed as Inferences.InferenceSet;
}

type StoredInferenceRow = {
  readonly id: string;
  readonly templateId: string;
  readonly timestamp: string;
  readonly data: string;
};

const DEFAULT_DATABASE_FILENAME = "typeprompt.sqlite";
