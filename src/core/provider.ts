import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseMetaVars, parseUtilityClasses } from "./parser";
import { generateClassesWithDetails } from "./classGenerator";

export const SUPPORTED_LANGUAGES = [
  "html",
  "css",
  "scss",
  "sass",
  "less",
  "stylus",
  "postcss",
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
  "vue",
  "svelte",
  "astro",
  "angular",
] as const;

type CachedData = { classes: string[]; detailMap: Record<string, string>; variants: string[] };

/**
 * @description Verilen dizinden yukarı doğru çıkarak en yakın node_modules/lascss klasörünü bulur.
 */
export function findLascssDir(startDir: string): string | undefined {
  let current = startDir;

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

/**
 * @description LASCSS sınıf ve detaylarını cache'leyen çözümleyici.
 */
export function createLascssResolver() {
  const classCache = new Map<string, CachedData>();
  const errorShownFor = new Set<string>();

  function resolveClasses(document: vscode.TextDocument): CachedData | undefined {
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

    // Detail önceliği: utility (gerçek deklarasyon) -> meta (renk/shade fallback)
    const detailMap: Record<string, string> = { ...utilityClassesMap, ...metaGenerated.detailMap };

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

  return { getClassesForDocument: resolveClasses };
}

/**
 * @description Completion item'larını üretir (variant + class + renk swatch).
 */
export function buildCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  resolver: ReturnType<typeof createLascssResolver>,
): vscode.CompletionItem[] | undefined {
  const cached = resolver.getClassesForDocument(document);
  if (!cached) {
    return undefined;
  }
  const { classes: allClasses, detailMap, variants } = cached;

  const linePrefix = document.lineAt(position).text.slice(0, position.character);
  // Slash (/) ve [] içeren sınıfları da yakalamak için karakter setini genişlettik
  const lastWordMatch = linePrefix.match(/[\w:/\-\[\]]+$/);
  const lastWord = lastWordMatch ? lastWordMatch[0] : "";

  const replaceRange = new vscode.Range(
    position.line,
    position.character - lastWord.length,
    position.line,
    position.character,
  );

  const items: vscode.CompletionItem[] = [];

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

  // Variant + utility kombinasyonlarını dinamik üret (utility klasöründe variantlı haller yoksa)
  const variantMatch = lastWord.match(/^([a-zA-Z0-9_-]+:)(.*)$/);
  if (variantMatch && variants.includes(variantMatch[1].slice(0, -1))) {
    const variantPrefix = variantMatch[1];
    const suffix = variantMatch[2] ?? "";
    const baseClasses = allClasses.filter(c => !c.includes(":") && c.startsWith(suffix));

    for (const base of baseClasses) {
      const fullName = `${variantPrefix}${base}`;
      const item = new vscode.CompletionItem(fullName, vscode.CompletionItemKind.Keyword);
      item.insertText = fullName;
      item.filterText = fullName;
      item.range = replaceRange;
      const closeness = Math.max(base.length - suffix.length, 0);
      item.sortText = `1-${String(closeness).padStart(3, "0")}-${fullName}`;
      item.preselect = true;

      const detail = detailMap[base] ?? detailMap[fullName];
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

      items.push(item);
    }
  }

  const classItems = allClasses
    .filter(c => c.startsWith(lastWord))
    .map(c => {
      const item = new vscode.CompletionItem(c, vscode.CompletionItemKind.Keyword);
      item.insertText = c;
      item.filterText = c;
      item.range = replaceRange;
      const closeness = Math.max(c.length - lastWord.length, 0);
      item.sortText = `1-${String(closeness).padStart(3, "0")}-${c}`;
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
}

/**
 * @description Detail içindeki renk değerinden küçük bir renk önizlemesi (Markdown) üretir.
 */
export function createColorDoc(value: string): vscode.MarkdownString | undefined {
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
