import * as vscode from "vscode";
import { SUPPORTED_LANGUAGES, buildCompletionItems, createLascssResolver } from "./core/provider";

/**
 * VS Code extension giriş noktası.
 * - lascss paketini arar, class listesini/ detaylarını cache'ler.
 * - HTML/CSS/JS/TS/React/Vue dosyaları için completion provider kaydeder.
 */
export function activate(context: vscode.ExtensionContext) {
  const resolver = createLascssResolver();

  const provider = vscode.languages.registerCompletionItemProvider(
    SUPPORTED_LANGUAGES,
    {
      provideCompletionItems(document, position) {
        return buildCompletionItems(document, position, resolver);
      },
    },
    "-", // tire tetikleyici
    ":", // kolon tetikleyici (md:, hover: vb.)
    " ", // boşluk tetikleyici
  );
  context.subscriptions.push(provider);
}

// This method is called when your extension is deactivated
export function deactivate() {}
