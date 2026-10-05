import { Schema } from "./schema-types.js";

export const EMPTY_SCHEMA: Schema = {
  kind: "success",
  typeDeclarations: {},
  sharedDeclarations: {},
  identifiers: {},
  unionToMembers: new Map(),
  namingHints: {
    defaultScope: new Map(),
    shared: new Map(),
  },
  definitionLinks: [],
} as const;
