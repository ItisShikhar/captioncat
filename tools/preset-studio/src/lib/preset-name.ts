const INVALID_PRESET_NAME_CHARACTERS = /[<>:"/\\|?*]/;
const RESERVED_WINDOWS_FILE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.json)?$/i;
const MAX_PRESET_FILE_NAME_LENGTH = 255;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 0x20 || codePoint === 0x7f;
  });
}

export function slugifyPresetName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'preset'
  );
}

export function presetFileNameFor(name: string): string {
  return `${slugifyPresetName(name)}.json`;
}

export function validatePresetName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Enter a preset name.';
  if (name !== value) return 'Remove leading or trailing spaces from the preset name.';
  if (INVALID_PRESET_NAME_CHARACTERS.test(name) || containsControlCharacter(name)) {
    return 'Use a name without < > : " / \\ | ? * or control characters.';
  }
  if (name.endsWith('.')) return 'A preset name cannot end with a period.';

  const fileName = presetFileNameFor(name);
  if (RESERVED_WINDOWS_FILE_NAME.test(fileName)) {
    return 'This name is reserved by the operating system. Choose another name.';
  }
  if (fileName.length > MAX_PRESET_FILE_NAME_LENGTH) {
    return `Keep the exported file name under ${MAX_PRESET_FILE_NAME_LENGTH} characters.`;
  }
  return undefined;
}
