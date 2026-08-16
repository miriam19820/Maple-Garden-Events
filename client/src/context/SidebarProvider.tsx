import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadUiPrefs, saveUiPrefs } from '../utils/uiPrefs';
import { SidebarContext } from './sidebarContext';

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = loadUiPrefs().sidebarOpen ?? false;
    return saved && !isMobileViewport();
  });

  useEffect(() => {
    saveUiPrefs({ sidebarOpen: isOpen });
  }, [isOpen]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');

    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsOpen(false);
      }
    };

    media.addEventListener('change', handleViewportChange);
    return () => media.removeEventListener('change', handleViewportChange);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
    }),
    [isOpen, open, close, toggle],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
