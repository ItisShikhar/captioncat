export type TextDirection = 'auto' | 'ltr' | 'rtl';
export type ResolvedTextDirection = Exclude<TextDirection, 'auto'>;

const RTL_LANGUAGE_TAGS = new Set([
  'ar',
  'ckb',
  'dv',
  'fa',
  'he',
  'iw',
  'ku',
  'nqo',
  'ps',
  'sd',
  'syr',
  'ug',
  'ur',
  'yi',
]);

const LTR_LANGUAGE_TAGS = new Set([
  'as',
  'bn',
  'de',
  'el',
  'en',
  'es',
  'fr',
  'gu',
  'hi',
  'id',
  'it',
  'ja',
  'kn',
  'ko',
  'ml',
  'mr',
  'ne',
  'nl',
  'or',
  'pa',
  'pl',
  'pt',
  'ro',
  'ru',
  'sa',
  'sv',
  'ta',
  'te',
  'th',
  'tr',
  'uk',
  'vi',
  'zh',
]);

const RTL_SCRIPT_TAGS = new Set(['arab', 'hebr', 'nkoo', 'syrc', 'thaa']);
const LTR_SCRIPT_TAGS = new Set([
  'beng',
  'cyrl',
  'deva',
  'grek',
  'hani',
  'hang',
  'hans',
  'hant',
  'kana',
  'latn',
  'taml',
  'telu',
  'thai',
]);

export function getLanguageTag(language: string | undefined): string | undefined {
  const value = language?.trim().toLowerCase();
  return value ? value.split(/[-_]/)[0] : undefined;
}

function getScriptTag(language: string | undefined): string | undefined {
  const parts = language?.trim().toLowerCase().split(/[-_]/) ?? [];
  return parts.find((part) => /^[a-z]{4}$/.test(part));
}

export function isTextDirection(value: unknown): value is TextDirection {
  return value === 'auto' || value === 'ltr' || value === 'rtl';
}

export function directionForLanguage(language: string | undefined): ResolvedTextDirection | undefined {
  const languageTag = getLanguageTag(language);
  if (!languageTag) return undefined;
  const scriptTag = getScriptTag(language);
  if (RTL_SCRIPT_TAGS.has(scriptTag ?? '')) return 'rtl';
  if (LTR_SCRIPT_TAGS.has(scriptTag ?? '')) return 'ltr';
  if (RTL_LANGUAGE_TAGS.has(languageTag)) return 'rtl';
  if (LTR_LANGUAGE_TAGS.has(languageTag)) return 'ltr';
  return undefined;
}

export function isRightToLeftLanguage(language: string | undefined): boolean {
  return directionForLanguage(language) === 'rtl';
}

function isRightToLeftCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0590 && codePoint <= 0x05ff) ||
    (codePoint >= 0x0600 && codePoint <= 0x08ff) ||
    (codePoint >= 0x0700 && codePoint <= 0x074f) ||
    (codePoint >= 0x0780 && codePoint <= 0x07bf) ||
    (codePoint >= 0x0800 && codePoint <= 0x083f) ||
    (codePoint >= 0x0840 && codePoint <= 0x085f) ||
    (codePoint >= 0x0860 && codePoint <= 0x086f) ||
    (codePoint >= 0x0870 && codePoint <= 0x089f) ||
    (codePoint >= 0x08a0 && codePoint <= 0x08ff) ||
    (codePoint >= 0xfb1d && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff) ||
    (codePoint >= 0x10800 && codePoint <= 0x10fff) ||
    (codePoint >= 0x1e800 && codePoint <= 0x1efff)
  );
}

function isLeftToRightCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0041 && codePoint <= 0x005a) ||
    (codePoint >= 0x0061 && codePoint <= 0x007a) ||
    (codePoint >= 0x00c0 && codePoint <= 0x02af) ||
    (codePoint >= 0x0370 && codePoint <= 0x052f) ||
    (codePoint >= 0x0530 && codePoint <= 0x058f) ||
    (codePoint >= 0x0900 && codePoint <= 0x1fff) ||
    (codePoint >= 0x2e80 && codePoint <= 0x9fff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff)
  );
}

export function directionForText(text: string | undefined): ResolvedTextDirection | undefined {
  if (!text) return undefined;
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (isRightToLeftCodePoint(codePoint)) return 'rtl';
    if (isLeftToRightCodePoint(codePoint)) return 'ltr';
  }
  return undefined;
}

export function resolveTextDirection(
  direction: TextDirection | undefined,
  language?: string,
  text?: string,
): ResolvedTextDirection {
  if (direction === 'rtl' || direction === 'ltr') return direction;
  return directionForLanguage(language) ?? directionForText(text) ?? 'ltr';
}
