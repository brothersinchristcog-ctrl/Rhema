import { en, TranslationSchema } from './en';

export type SupportedLanguage = 'en' | 'te' | 'hi' | 'ta' | 'mr' | 'ml' | 'kn';

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  sub: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', sub: 'English' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', sub: 'Telugu' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', sub: 'Hindi' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', sub: 'Tamil' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', sub: 'Marathi' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', sub: 'Malayalam' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', sub: 'Kannada' },
];

// Lazy-load non-English locale dictionaries on demand so 1st launch only parses the active language
const loadedLocales: Partial<Record<SupportedLanguage, TranslationSchema>> = { en };

function getLocale(code: SupportedLanguage): TranslationSchema {
  if (loadedLocales[code]) return loadedLocales[code]!;
  let dict: TranslationSchema = en;
  switch (code) {
    case 'te':
      dict = require('./te').te;
      break;
    case 'hi':
      dict = require('./hi').hi;
      break;
    case 'ta':
      dict = require('./ta').ta;
      break;
    case 'mr':
      dict = require('./mr').mr;
      break;
    case 'ml':
      dict = require('./ml').ml;
      break;
    case 'kn':
      dict = require('./kn').kn;
      break;
    default:
      dict = en;
      break;
  }
  loadedLocales[code] = dict;
  return dict;
}

export const translations: Record<SupportedLanguage, TranslationSchema> = {
  en,
  get te() {
    return getLocale('te');
  },
  get hi() {
    return getLocale('hi');
  },
  get ta() {
    return getLocale('ta');
  },
  get mr() {
    return getLocale('mr');
  },
  get ml() {
    return getLocale('ml');
  },
  get kn() {
    return getLocale('kn');
  },
};

export { en, TranslationSchema };
