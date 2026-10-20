import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionContext } from "vscode";
import { ExtensionMode, workspace } from "vscode";
import type {
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node.js";
import { LanguageClient, TransportKind } from "vscode-languageclient/node.js";
import { activateAutoCloseTag } from "./auto-close-tag.js";
import { activateEnterHandler } from "./enter-handler.js";
import { activateToggleComment } from "./toggle-comment.js";

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  activateAutoCloseTag(context);
  activateEnterHandler(context);
  activateToggleComment(context);

  const devServerModule = context.asAbsolutePath(
    path.join("..", "language-server", "dist", "main.js"),
  );
  const bundledServerModule = context.asAbsolutePath(
    path.join("dist", "server.js"),
  );

  const serverModule =
    fs.existsSync(devServerModule) &&
    (context.extensionMode === ExtensionMode.Development ||
      !fs.existsSync(bundledServerModule))
      ? devServerModule
      : bundledServerModule;

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
      { scheme: "file", pattern: "**/typeprompt.yaml" },
      { scheme: "file", pattern: "**/typeprompt.yml" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher(
        "**/{*.xml,typeprompt.yaml,typeprompt.yml}",
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
