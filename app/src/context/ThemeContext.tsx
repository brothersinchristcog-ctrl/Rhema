import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChurch } from './ChurchContext';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  colors: any;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeChurch } = useChurch();
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('light'); // Default to light mode (#FAF7F2)

  useEffect(() => {
    AsyncStorage.setItem('user_theme', 'light').catch(() => {});
  }, []);

  const toggleTheme = async () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    await AsyncStorage.setItem('user_theme', newMode);
  };

  const isDark = false;

  // Base Defaults (Rhema White Cream theme)
  let primary = '#1a2d5a';
  let accent = '#c0392b';
  let backgroundColor = '#FAF7F2';
  let textColor = '#111827';

  // Override with Church Theme if available (always keep #FAF7F2 White Cream background)
  if (activeChurch?.theme) {
    primary = activeChurch.theme.primaryColor || primary;
    accent = activeChurch.theme.secondaryColor || accent;
    if (activeChurch.theme.textColor) {
      textColor = activeChurch.theme.textColor;
    }
  }

  const colors = {
    primary,
    accent,
    gold: '#fbbf24',
    
    // Dynamic Colors
    background: backgroundColor,
    surface: isDark ? '#1e293b' : '#ffffff',
    text: textColor,
    textSecondary: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? '#334155' : '#e2e8f0',
    header: primary,
    card: isDark ? '#1e293b' : '#ffffff',
  };

  return (
    <ThemeContext.Provider value={{ mode, isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
