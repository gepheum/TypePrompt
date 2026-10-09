import * as path from "node:path";
import type { ExtensionContext } from "vscode";
import { workspace } from "vscode";
import type {
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node.js";
import { LanguageClient, TransportKind } from "vscode-languageclient/node.js";
import { activateAutoCloseTag } from "./auto-close-tag.js";

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  activateAutoCloseTag(context);

  const serverModule = context.asAbsolutePath(
    path.join("..", "language-server", "dist", "main.js"),
  );

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
      args: ["--stdio"],
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      args: ["--stdio"],
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "xml" },
      { scheme: "file", pattern: "**/*.xml" },
      { scheme: "file", pattern: "**/typeprompt.yml" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher(
        "**/{*.xml,typeprompt.yml}",
      ),
    },
  };

  client = new LanguageClient(
    "typepromptLanguageServer",
    "TypePrompt Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
