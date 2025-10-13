import { z } from 'zod';

/**
 * Supported language codes (ISO 639-1)
 * Limited to major languages for Phase 1
 */
export const SUPPORTED_LANGUAGES = [
  'en',  // English
  'ja',  // Japanese
  'zh',  // Chinese (Simplified)
  'ko',  // Korean
  'es',  // Spanish
  'fr',  // French
  'de',  // German
  'it',  // Italian
  'pt',  // Portuguese
  'ru',  // Russian
  'ar',  // Arabic
  'hi',  // Hindi
  'nl',  // Dutch
  'sv',  // Swedish
  'pl',  // Polish
  'tr',  // Turkish
  'vi',  // Vietnamese
  'th',  // Thai
  'id',  // Indonesian
  'ms',  // Malay
] as const;

/**
 * Zod schema for supported languages
 */
export const SupportedLanguageSchema = z.enum(SUPPORTED_LANGUAGES);

export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

/**
 * Language display names (for UI)
 */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
  nl: 'Dutch',
  sv: 'Swedish',
  pl: 'Polish',
  tr: 'Turkish',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  ms: 'Malay',
};

/**
 * Check if a language code is supported
 */
export function isSupportedLanguage(code: string): code is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(code as SupportedLanguage);
}

/**
 * Get language display name
 */
export function getLanguageName(code: SupportedLanguage): string {
  return LANGUAGE_NAMES[code] || code;
}
