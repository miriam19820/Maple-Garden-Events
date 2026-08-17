import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getTranslator, type Locale } from '@shared/i18n';
import { applyDocumentLocale, loadStoredLocale, saveLocale } from './languageStorage';
import { I18nContext, type I18nContextValue } from './I18nContext';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = loadStoredLocale();
    applyDocumentLocale(initial);
    return initial;
  });

  const setLocale = useCallback((next: Locale) => {
    saveLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      ...getTranslator(locale),
      setLocale,
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
