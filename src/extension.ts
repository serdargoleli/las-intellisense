import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseMetaVars, parseUtilityClasses } from "./core/parser";
import { generateClassesWithDetails } from "./core/classGenerator";

export function activate(context: vscode.ExtensionContext) {
  type CachedData = { classes: string[]; detailMap: Record<string, string>; variants: string[] };
  const classCache = new Map<string, CachedData>();
  const errorShownFor = new Set<string>();

  function findLascssDir(startDir: string): string | undefined {
    let current = startDir;

    // Walk up the tree to find the nearest node_modules/lascss
    while (true) {
      const candidate = path.join(current, "node_modules", "lascss");
      if (fs.existsSync(candidate)) {
        return candidate;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    return undefined;
  }

  function getClassesForDocument(document: vscode.TextDocument): CachedData | undefined {
    const lascssDir =
      findLascssDir(path.dirname(document.uri.fsPath)) ||
      (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        ? findLascssDir(vscode.workspace.workspaceFolders[0].uri.fsPath)
        : undefined);

    if (!lascssDir) {
      if (!errorShownFor.has("missing-dir")) {
        vscode.window.showErrorMessage("❌ lascss bulunamadı. Projede lascss kurulu mu?");
        errorShownFor.add("missing-dir");
      }
      return undefined;
    }

    if (classCache.has(lascssDir)) {
      return classCache.get(lascssDir);
    }

    const metaPath = path.join(lascssDir, "dist/meta.min.css");
    const utilityPath = path.join(lascssDir, "dist/utility.min.css");

    if (!fs.existsSync(metaPath) || !fs.existsSync(utilityPath)) {
      if (!errorShownFor.has(lascssDir)) {
        vscode.window.showErrorMessage("❌ meta.min.css veya utility.min.css bulunamadı.");
        errorShownFor.add(lascssDir);
      }
      return undefined;
    }

    const parsedMeta = parseMetaVars(metaPath);
    const metaGenerated = generateClassesWithDetails(parsedMeta);
    const metaClasses = metaGenerated.classes;
    const utilityClassesMap = parseUtilityClasses(utilityPath);
    const utilityClasses = Object.keys(utilityClassesMap);
    const allClasses = Array.from(new Set([...metaClasses, ...utilityClasses]));

    // Utility çıktısı gerçek CSS deklarasyonunu içerdiği için öncelik utility'de olmalı,
    // meta sadece fallback olarak devreye girsin.
    // Detail önceliği: utility (gerçek deklarasyon) -> meta (renk/shade fallback)
    // Sonraki spread kazanır; metaComputed ile utility'den gelen sabit var() ifadelerini ezip gerçek rengi gösterir.
    const detailMap: Record<string, string> = { ...utilityClassesMap, ...metaGenerated.detailMap };

    // Variant set'ini meta + class adlarından çıkar
    const variants = new Set<string>(metaGenerated.variants);
    for (const cls of allClasses) {
      const idx = cls.indexOf(":");
      if (idx > 0) {
        variants.add(cls.slice(0, idx));
      }
    }

    const cached: CachedData = { classes: allClasses, detailMap, variants: Array.from(variants) };
    classCache.set(lascssDir, cached);
    return cached;
  }

  const provider = vscode.languages.registerCompletionItemProvider(
    [
      "html",
      "css",
      "scss",
      "javascript",
      "typescript",
      "javascriptreact",
      "typescriptreact",
      "vue",
    ],
    {
      provideCompletionItems(document, position) {
        const cached = getClassesForDocument(document);
        if (!cached) {
          return undefined;
        }
        const { classes: allClasses, detailMap, variants } = cached;

        const linePrefix = document.lineAt(position).text.slice(0, position.character);

        // Son yazılan kelimeyi yakala, hem tire hem kolon dahil
        const lastWordMatch = linePrefix.match(/[\w:-]+$/);
        const lastWord = lastWordMatch ? lastWordMatch[0] : "";

        const replaceRange = new vscode.Range(
          position.line,
          position.character - lastWord.length,
          position.line,
          position.character,
        );

        const items: vscode.CompletionItem[] = [];

        // Variant önerileri (md:, hover: vb.)
        const variantSuggestions = variants
          .map(v => `${v}:`)
          .filter(v => v.startsWith(lastWord))
          .map(v => {
            const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Module);
            item.insertText = v;
            item.filterText = v;
            item.range = replaceRange;
            item.sortText = `0-variant-${v}`;
            item.detail = "LASCSS variant";
            item.preselect = true;
            return item;
          });

        items.push(...variantSuggestions);

        const classItems = allClasses
          .filter(c => c.startsWith(lastWord)) // lastWord ile başlayanları filtrele
          .map(c => {
            const item = new vscode.CompletionItem(c, vscode.CompletionItemKind.Keyword);
            item.insertText = c;
            item.filterText = c; // VSCode matchingini netleştir
            item.range = replaceRange; // yazılan kısmı tamamen değiştir
            item.sortText = `1-class-${c}`; // Variantlardan sonra gelsin
            item.preselect = true;

            const detail = detailMap[c];
            if (detail) {
              item.detail = detail;
              const colorDoc = createColorDoc(detail);
              if (colorDoc) {
                item.kind = vscode.CompletionItemKind.Color;
                item.documentation = colorDoc;
              }
            }
            if (!item.detail) {
              item.detail = "LASCSS class";
            }
            return item;
          });

        items.push(...classItems);
        return items;
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

function createColorDoc(value: string): vscode.MarkdownString | undefined {
  const color = value.trim();
  const isHex = /^#?[0-9a-fA-F]{6}$/.test(color) || /^#?[0-9a-fA-F]{3}$/.test(color);
  const isRgb = /^rgb\(/i.test(color) || /^[0-9.]+\s+[0-9.]+\s+[0-9.]+/.test(color);

  if (!isHex && !isRgb) {
    return undefined;
  }

  const hex = color.startsWith("#") ? color : color;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16">
    <rect width="32" height="16" rx="2" ry="2" fill="${hex}"/>
  </svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  const md = new vscode.MarkdownString(`![color](${uri})\n\n\`${color}\``);
  md.supportHtml = true;
  md.isTrusted = true;
  return md;
}
