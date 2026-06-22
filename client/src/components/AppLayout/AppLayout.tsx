import React from 'react';
import { AppHeader } from '../AppHeader/AppHeader';
import { NavigationProvider } from '../../context/NavigationContext';
import './AppLayout.css';

interface AppLayoutProps {
  children: React.ReactNode;
  fullHeight?: boolean;
  viewportFill?: boolean;
}

export const AppLayout = ({ children, fullHeight = true, viewportFill = false }: AppLayoutProps) => {
  return (
    <NavigationProvider>
      <div className={`app-layout ${fullHeight ? 'app-layout-full' : ''} ${viewportFill ? 'app-layout-viewport-fill' : ''}`}>
        <AppHeader />
        <main className={`app-layout-main ${viewportFill ? 'app-layout-main-fill' : ''}`}>{children}</main>
      </div>
    </NavigationProvider>
  );
};
