import * as path from "node:path";
import { type ExtensionContext, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    path.join("..", "language-server", "dist", "main.js"),
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "xml" },
      { scheme: "file", pattern: "**/*.prompt" },
      { scheme: "file", pattern: "**/*.prompt.xml" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.{xml,prompt}"),
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
