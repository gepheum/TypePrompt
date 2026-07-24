import { Schema } from "./schema-types.js";

export const EMPTY_SCHEMA: Schema = {
  kind: "success",
  typeDeclarations: {},
  sharedDeclarations: null,
  identifiers: new Set(),
  unionToMembers: new Map(),
  typeToNamingHint: new Map(),
} as const;
