import type { Schema } from "./schema-types.js";

export const EMPTY_SCHEMA: Schema = {
  kind: "success",
  typeDeclarations: {},
  sharedDeclarations: {},
  source: {
    text: "",
    start: 0,
    end: 0,
  },
  identifiers: {},
  unionToMembers: new Map(),
  namingHints: {
    defaultScope: new Map(),
    shared: new Map(),
  },
  definitionLinks: [],
} as const;
