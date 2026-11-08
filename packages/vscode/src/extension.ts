import type { Lsp } from "@typeprompt/core";
import { ProjectStore } from "@typeprompt/language-server";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionContext } from "vscode";
import { ExtensionMode, workspace } from "vscode";
import type {
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node.js";
import { LanguageClient, TransportKind } from "vscode-languageclient/node.js";
import { activateAutoCloseTag } from "./editor/auto-close-tag.js";
import {
  activateCreatePlayground,
  type CreatePlaygroundController,
} from "./editor/create-playground.js";
import { activateEnterHandler } from "./editor/enter-handler.js";
import { activateNewFileScaffolding } from "./editor/new-file-scaffolding.js";
import { activateToggleComment } from "./editor/toggle-comment.js";
import {
  activatePlaygroundPreview,
  type PlaygroundPreviewController,
} from "./preview/playground-preview.js";

export interface TypePromptExtensionApi {
  readonly projectStore: ProjectStore;
  readonly playgroundPreview: PlaygroundPreviewController;
  readonly createPlayground: CreatePlaygroundController;
}

let client: LanguageClient | undefined;
export const projectStore = new ProjectStore();

export function activate(context: ExtensionContext): TypePromptExtensionApi {
  activateAutoCloseTag(context);
  activateEnterHandler(context);
  activateToggleComment(context);
  activateNewFileScaffolding(context, projectStore);
  const playgroundPreview = activatePlaygroundPreview(context, projectStore);
  const createPlayground = activateCreatePlayground(context, projectStore);

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
      { scheme: "file", pattern: "**/.typeprompt.secrets.yaml" },
      { scheme: "file", pattern: "**/.typeprompt.secrets.yml" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher(
        "**/{*.tp,typeprompt.yaml,typeprompt.yml,.typeprompt.secrets.yaml,.typeprompt.secrets.yml}",
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
    (params: Lsp.WireProjects) => {
      projectStore.handleNotification(params);
      playgroundPreview.notifyCompilationUpdate();
      createPlayground.notifyCompilationUpdate();
    },
  );

  client.start();

  return {
    projectStore,
    playgroundPreview,
    createPlayground,
  };
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
