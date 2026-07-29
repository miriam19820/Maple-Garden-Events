import { createContext } from 'react';
import type { Locale, Translator } from '@shared/i18n';

export type I18nContextValue = Translator & {
  setLocale: (locale: Locale) => void;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
