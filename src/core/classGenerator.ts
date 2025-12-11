/**
 * @description
 * meta.min.css içindeki renk ve varyant bilgilerinden sadece class listesini üretir.
 * (detay bilgisine ihtiyacın yoksa bu fonksiyonu kullan.)
 */
export function generateClasses(parsedMeta: Record<string, string>): string[] {
  return generateClassesWithDetails(parsedMeta).classes;
}

/**
 * @description
 * meta.min.css içindeki renk/varyant bilgilerini okuyup class + detail map üretir.
 * detailMap: sınıf adı -> renk/ilgili açıklama (hex/rgb veya deklarasyon)
 */
export function generateClassesWithDetails(parsedMeta: Record<string, string>): {
  classes: string[];
  detailMap: Record<string, string>;
  variants: string[];
} {
  const shadeValues = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const detailMap: Record<string, string> = {};
  const colorShades: Record<string, Record<number, string>> = {};
  const colorDefaults: Record<string, string> = {};

  // 1️⃣ Aktif utilities (bg, text, border, vb.)
  const activeUtilities = Object.entries(parsedMeta)
    .filter(([k, v]) => k.startsWith("las-config-color-") && v === "true")
    .map(([k]) => k.replace("las-config-color-", ""));

  // 2️⃣ Renk değişkenlerini base + shade olarak ayır
  for (const [key, value] of Object.entries(parsedMeta)) {
    if (!key.startsWith("las-color-")) {
      continue;
    }
    const rest = key.replace("las-color-", "");
    const shadeMatch = rest.match(/^(.*?)-(\d{2,3})$/); // red-500 gibi
    if (shadeMatch) {
      const shadeNumber = Number(shadeMatch[2]);
      if (shadeValues.includes(shadeNumber)) {
        const base = shadeMatch[1];
        colorShades[base] = colorShades[base] ?? {};
        colorShades[base][shadeNumber] = resolveVar(value, parsedMeta);
        continue;
      }
    }

    // shade yoksa (veya tanınmıyorsa) default olarak tut
    colorDefaults[rest] = resolveVar(value, parsedMeta);
  }

  const colorNames = new Set([
    ...Object.keys(colorShades),
    ...Object.keys(colorDefaults),
  ]);

  // 2.1️⃣ Base fallback: eğer shade 500 varsa base olarak kullan
  for (const name of Object.keys(colorShades)) {
    const shade500 = colorShades[name]?.[500];
    if (shade500 && !colorDefaults[name]) {
      colorDefaults[name] = shade500;
    }
  }

  // 3️⃣ Single colors (white, black, transparent, current)
  const singleColors = Object.entries(parsedMeta)
    .filter(([k, _v]) => k.startsWith("las-single-color-"))
    .map(([k, v]) => ({ name: k.replace("las-single-color-", ""), value: resolveVar(v, parsedMeta) }));

  // 4️⃣ Variantlar (hover, focus, active, vb.)
  const variants = Object.entries(parsedMeta)
    .filter(([k, _v]) => k.startsWith("las-variant-"))
    .map(([k, v]) => ({ name: k.replace("las-variant-", ""), value: v }));

  const breakpoints = Object.keys(parsedMeta)
    .filter(k => k.startsWith("las-breakpoint-"))
    .map(k => k.replace("las-breakpoint-", ""));
  const defaultBreakpoints = ["sm", "md", "lg", "xl", "2xl"];
  const variantNames = Array.from(
    new Set<string>([...variants.map(v => v.name), ...breakpoints, ...defaultBreakpoints]),
  );

  // 5️⃣ Class listesi oluştur
  const classes: string[] = [];

  // Renk + Shade
  for (const util of activeUtilities) {
    for (const colorName of colorNames) {
      for (const shade of shadeValues) {
        const className = `${util}-${colorName}-${shade}`;
        classes.push(className);
        const shadeValue = colorShades[colorName]?.[shade];
        const baseColor = colorDefaults[colorName] ?? colorShades[colorName]?.[500];
        if (shadeValue) {
          detailMap[className] = shadeValue;
        } else if (baseColor) {
          detailMap[className] = calculateShade(baseColor, shade);
        }
      }
    }
    // Single colors
    for (const color of singleColors) {
      const className = `${util}-${color.name}`;
      classes.push(className);
      if (parsedMeta[`las-single-color-${color.name}`]) {
        detailMap[className] = resolveVar(parsedMeta[`las-single-color-${color.name}`], parsedMeta);
      }
    }
  }

  // Variant ekleme (hover:, md:, vb.)
  const finalClasses: string[] = [];
  for (const variantName of variantNames) {
    for (const c of classes) {
      finalClasses.push(`${variantName}:${c}`);
      if (detailMap[c]) {
        detailMap[`${variantName}:${c}`] = detailMap[c];
      }
    }
  }

  // Tüm sınıfları birleştir
  return { classes: [...classes, ...finalClasses], detailMap, variants: variantNames };
}

function calculateShade(baseColor: string, shade: number): string {
  if (shade === 500 || baseColor === "transparent" || baseColor === "currentColor") {
    return baseColor;
  }

  const white = "#ffffff";
  const black = "#000000";

  if (shade < 500) {
    const whitePercent = ((500 - shade) / 500) * 100;
    return mixColors(baseColor, white, whitePercent);
  }

  const blackPercent = ((shade - 500) / 500) * 100;
  return mixColors(baseColor, black, blackPercent);
}

/**
 * @description İki rengi yüzde ağırlıkla karıştırır.
 * @param color1 Ana renk
 * @param color2 Karışacak renk (beyaz/siyah)
 * @param weight color2 ağırlığı (0-100)
 */
function mixColors(color1: string, color2: string, weight: number): string {
  const c1 = colorToRgb(color1);
  const c2 = colorToRgb(color2);
  if (!c1 || !c2) {
    return color1;
  }

  const w = weight / 100;
  const r = Math.round(c1.r * (1 - w) + c2.r * w);
  const g = Math.round(c1.g * (1 - w) + c2.g * w);
  const b = Math.round(c1.b * (1 - w) + c2.b * w);

  return rgbToHex(r, g, b);
}

function hexToRgb(hex: string) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function colorToRgb(value: string) {
  if (!value) {
    return null;
  }

  // Hex
  const hex = value.trim();
  if (/^#?[0-9a-fA-F]{3,6}$/.test(hex)) {
    return hexToRgb(hex);
  }

  // rgb() veya rgb uzaylı format: rgb(255 0 0) | rgb(255, 0, 0)
  const rgbFuncMatch = value.match(/rgb\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)\s*\)/i);
  if (rgbFuncMatch) {
    return {
      r: Number(rgbFuncMatch[1]),
      g: Number(rgbFuncMatch[2]),
      b: Number(rgbFuncMatch[3]),
    };
  }

  // Boşlukla ayrılmış değerler: "255 0 0" veya "255 0 0 / 1"
  const spaceParts = value.split("/")[0].trim().split(/\s+/);
  if (spaceParts.length === 3 && spaceParts.every(p => /^[0-9.]+$/.test(p))) {
    return {
      r: Number(spaceParts[0]),
      g: Number(spaceParts[1]),
      b: Number(spaceParts[2]),
    };
  }

  // İçinde sayı geçen diğer formatlar (örn. "239 68 68;", var(...) fallback'ı)
  const numbers = value.match(/[\d.]+/g);
  if (numbers && numbers.length >= 3) {
    return {
      r: Number(numbers[0]),
      g: Number(numbers[1]),
      b: Number(numbers[2]),
    };
  }

  return null;
}

/**
 * @description var(--color, fallback) ifadelerini çözümler, meta içindeki değerle değiştirir.
 */
function resolveVar(value: string, meta: Record<string, string>, depth = 0): string {
  if (!value || depth > 5) {
    return value;
  }

  const varRegex = /var\(\s*--([^) ,]+)(?:\s*,\s*([^)]+))?\s*\)/;
  const match = value.match(varRegex);
  if (!match) {
    return value.trim();
  }

  const varName = match[1];
  const fallback = match[2];
  const resolved = meta[varName] ?? fallback ?? value;
  const replaced = value.replace(varRegex, resolved);
  return resolveVar(replaced, meta, depth + 1);
}
