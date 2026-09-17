#!/usr/bin/env node
import { createLanguageServer } from "./server.js";

const server = createLanguageServer();
server.listen();
