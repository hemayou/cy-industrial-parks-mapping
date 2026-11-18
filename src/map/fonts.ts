import type { FontFacesSpecification } from 'maplibre-gl';

let cached: FontFacesSpecification | undefined;
export function mapFontFaces(): FontFacesSpecification {
  if (cached && Object.keys(cached).length) return cached;
  const faces: Record<string, { url: string; 'unicode-range': string[] }[]> = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const font = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();
      if (font !== 'Noto Sans SC' && font !== 'Noto Serif SC') continue;
      const source = rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/);
      if (!source) continue;
      const weight = rule.style.getPropertyValue('font-weight').trim() === '700' ? 'Bold' : 'Regular';
      const unicode = rule.style.getPropertyValue('unicode-range').split(',').map(range => range.trim()).filter(Boolean);
      const key = `${font} ${weight}`;
      (faces[key] ??= []).push({
        url: new URL(source[1], sheet.href || document.baseURI).href,
        'unicode-range': unicode.length ? unicode : ['U+0-10FFFF'],
      });
    }
  }
  cached = faces;
  return faces;
}
