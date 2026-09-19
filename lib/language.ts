export const SUPPORT_LANGUAGES = ['hinglish', 'hindi', 'english'] as const;
export type SupportLanguage = typeof SUPPORT_LANGUAGES[number];
export function supportLanguage(value: unknown): SupportLanguage {
  return SUPPORT_LANGUAGES.includes(value as SupportLanguage) ? value as SupportLanguage : 'hinglish';
}
export function speechLanguage(language: SupportLanguage, text: string) {
  return /[\u0900-\u097f]/u.test(text) || language !== 'english' ? 'hi-IN' : 'en-IN';
}
export const LANGUAGE_OPTIONS: { value: SupportLanguage; label: string; description: string }[] = [
  { value: 'hinglish', label: 'Hinglish', description: 'हिंदी में समझें, English में छोटे कदम' },
  { value: 'hindi', label: 'हिंदी', description: 'समझाने और बात करने के लिए हिंदी' },
  { value: 'english', label: 'English', description: 'Simple English throughout' },
];
