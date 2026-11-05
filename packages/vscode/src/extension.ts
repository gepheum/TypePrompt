import {
  CompilationResultStore,
  type WireCompilationResults,
} from "@typeprompt/language-server";
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
import { activateNewFileScaffolding } from "./new-file-scaffolding.js";
import {
  activatePlaygroundPreview,
  type PlaygroundPreviewController,
} from "./playground-preview.js";
import { activateToggleComment } from "./toggle-comment.js";

export interface TypePromptExtensionApi {
  readonly compilationStore: CompilationResultStore;
  readonly playgroundPreview: PlaygroundPreviewController;
}

let client: LanguageClient | undefined;
export const compilationStore = new CompilationResultStore();

export function activate(context: ExtensionContext): TypePromptExtensionApi {
  activateAutoCloseTag(context);
  activateEnterHandler(context);
  activateToggleComment(context);
  activateNewFileScaffolding(context, () => client);
  const playgroundPreview = activatePlaygroundPreview(
    context,
    compilationStore,
  );

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
      { scheme: "file", language: "typeprompt" },
      { scheme: "file", pattern: "**/*.tp" },
      { scheme: "file", pattern: "**/typeprompt.yaml" },
      { scheme: "file", pattern: "**/typeprompt.yml" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher(
        "**/{*.tp,typeprompt.yaml,typeprompt.yml}",
      ),
    },
  };

  client = new LanguageClient(
    "typepromptLanguageServer",
    "TypePrompt Language Server",
    serverOptions,
    clientOptions,
  );

  client.onNotification(
    "typeprompt/compilationResult",
    (params: WireCompilationResults) => {
      compilationStore.handleNotification(params);
      playgroundPreview.notifyCompilationUpdate();
    },
  );

  client.start();

  return {
    compilationStore,
    playgroundPreview,
  };
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
