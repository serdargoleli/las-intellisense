import * as fs from "fs";

/**
 * meta.min.css dosyasındaki :root CSS değişkenlerini parse eder.
 * @param filePath meta.min.css dosyasının tam yolu
 * @returns {Record<string, string>} değişken adı -> değer objesi
 */
export function parseMetaVars(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const vars: Record<string, string> = {};
  const regex = /--([\w-]+):\s*([^;]+);/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    vars[match[1]] = match[2].trim();
  }

  return vars;
}

/**
 * utility.min.css içindeki class isimlerini ve ilk deklarasyonlarını parse eder.
 * @param filePath utility.min.css tam yolu
 * @returns Record<className, declaration>
 */
export function parseUtilityClasses(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  // Slash ve escape karakteri (\) içeren utility class'larını da yakalamak için karakter seti genişletildi
  const regex = /\.([a-zA-Z0-9\\\/\-\[\]:]+)\{([^}]*)\}/g;
  const classes: Record<string, string> = {};
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const className = match[1].replace(/\\\//g, "/"); // w-1\/2 -> w-1/2
    const body = match[2] || "";
    const firstDeclaration = body.split(";").map(s => s.trim()).filter(Boolean)[0];
    classes[className] = firstDeclaration ? `${firstDeclaration};` : body;
  }

  return classes;
}
