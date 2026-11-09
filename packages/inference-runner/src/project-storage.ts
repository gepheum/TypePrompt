import type { Inferences } from "@typeprompt/core";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type StoredInferenceSummary = {
  readonly id: string;
  readonly templateId: string;
  readonly timestamp: string;
};

export type ListInferenceRunsOptions = {
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
   * Saves an Inferences.InferenceRun into the SQLite database.
   * If an inference run with the same ID already exists, replaces it.
   */
  saveInferenceRun(inferenceRun: Inferences.InferenceRun): void;

  /**
   * Saves multiple Inferences.InferenceRuns in a single transaction.
   */
  saveInferenceRuns(inferenceRuns: readonly Inferences.InferenceRun[]): void;

  /**
   * Retrieves an Inferences.InferenceRun by its ID. Returns null if not found.
   */
  getInferenceRun(id: string): Inferences.InferenceRun | null;

  /**
   * Retrieves all Inferences.InferenceRuns for the specified template ID,
   * sorted by timestamp DESC.
   */
  listInferenceRunsForTemplate(
    templateId: string,
    options?: ListInferenceRunsOptions,
  ): readonly Inferences.InferenceRun[];

  /**
   * Retrieves lightweight summaries (id, templateId, timestamp) for the specified
   * template ID, sorted by timestamp DESC without parsing the full JSON payloads.
   */
  listInferenceSummariesForTemplate(
    templateId: string,
    options?: ListInferenceRunsOptions,
  ): readonly StoredInferenceSummary[];

  /**
   * Retrieves recent Inferences.InferenceRuns across all templates,
   * sorted by timestamp DESC.
   */
  listRecentInferenceRuns(
    options?: ListInferenceRunsOptions,
  ): readonly Inferences.InferenceRun[];

  /**
   * Deletes an inference run by its ID.
   * Returns true if a record was deleted, false otherwise.
   */
  deleteInferenceRun(id: string): boolean;

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

CREATE VIEW IF NOT EXISTS inference_runs AS SELECT * FROM inferences;
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
    (inferenceRuns: readonly Inferences.InferenceRun[]) => {
      for (const set of inferenceRuns) {
        insertStmt.run(
          set.id,
          set.templateId,
          set.isoTimestamp,
          JSON.stringify(set),
        );
      }
    },
  );

  const storage: ProjectStorage = {
    db,

    saveInferenceRun(inferenceRun: Inferences.InferenceRun): void {
      insertStmt.run(
        inferenceRun.id,
        inferenceRun.templateId,
        inferenceRun.isoTimestamp,
        JSON.stringify(inferenceRun),
      );
    },

    saveInferenceRuns(inferenceRuns: readonly Inferences.InferenceRun[]): void {
      saveBatchTransaction(inferenceRuns);
    },

    getInferenceRun(id: string): Inferences.InferenceRun | null {
      const row = getByIdStmt.get(id);
      if (!row) {
        return null;
      }
      return parseStoredInferenceRun(row.data);
    },

    listInferenceRunsForTemplate(
      templateId: string,
      options?: ListInferenceRunsOptions,
    ): readonly Inferences.InferenceRun[] {
      const limit = options?.limit ?? -1;
      const offset = options?.offset ?? 0;
      const rows = listByTemplateStmt.all(templateId, limit, offset);
      return rows.map((row) => parseStoredInferenceRun(row.data));
    },

    listInferenceSummariesForTemplate(
      templateId: string,
      options?: ListInferenceRunsOptions,
    ): readonly StoredInferenceSummary[] {
      const limit = options?.limit ?? -1;
      const offset = options?.offset ?? 0;
      return listSummariesByTemplateStmt.all(templateId, limit, offset);
    },

    listRecentInferenceRuns(
      options?: ListInferenceRunsOptions,
    ): readonly Inferences.InferenceRun[] {
      const limit = options?.limit ?? -1;
      const offset = options?.offset ?? 0;
      const rows = listRecentStmt.all(limit, offset);
      return rows.map((row) => parseStoredInferenceRun(row.data));
    },

    deleteInferenceRun(id: string): boolean {
      const result = deleteByIdStmt.run(id);
      return result.changes > 0;
    },

    close(): void {
      db.close();
    },
  };

  return storage;
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

function parseStoredInferenceRun(rawJson: string): Inferences.InferenceRun {
  const parsed = JSON.parse(rawJson);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    parsed.kind !== "playground-inference-run" ||
    typeof parsed.id !== "string" ||
    typeof parsed.templateId !== "string" ||
    typeof parsed.isoTimestamp !== "string" ||
    !Array.isArray(parsed.inferences)
  ) {
    throw new Error("Invalid stored InferenceRun JSON format");
  }
  return parsed as Inferences.InferenceRun;
}

type StoredInferenceRow = {
  readonly id: string;
  readonly templateId: string;
  readonly timestamp: string;
  readonly data: string;
};

const DEFAULT_DATABASE_FILENAME = "typeprompt.sqlite";
