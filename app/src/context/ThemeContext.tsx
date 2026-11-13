import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChurch } from './ChurchContext';
import {
  FontSizeOption,
  FONT_SIZE_OPTIONS,
  FONT_SIZE_CONFIG,
  setGlobalFontScale,
  getGlobalFontScale,
  scaleFontSize,
  setGlobalFontFamily,
} from '../utils/FontSizeManager';

export {
  FontSizeOption,
  FONT_SIZE_OPTIONS,
  FONT_SIZE_CONFIG,
  setGlobalFontScale,
  getGlobalFontScale,
  scaleFontSize,
};

export type ThemeAppearance = 'warm_white' | 'pure_white' | 'pure_dark';
export type QuickActionsStyle = 'bento' | 'grid';
export type NavBarStyle = 'pill' | 'capsule';
// ── Font Style Options ──────────────────────────────────────
export type FontStyleOption = 'modern' | 'classic' | 'prominent';

export const FONT_STYLE_OPTIONS: { id: FontStyleOption; label: string; desc: string; family: string; preview: string }[] = [
  { id: 'modern',    label: 'Modern',    desc: 'Clean · System default',   family: Platform.OS === 'ios' ? 'System' : 'sans-serif',              preview: 'sans-serif' },
  { id: 'classic',   label: 'Classic',   desc: 'Elegant · Serif style',    family: Platform.OS === 'ios' ? 'Georgia' : 'serif',                  preview: 'serif'      },
  { id: 'prominent', label: 'Prominent', desc: 'Bold · Crisp & clear',     family: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif-medium', preview: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif-medium' },
];

export interface ThemeOption {
  id: ThemeAppearance;
  name: string;
  sub: string;
  bg: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  isDark: boolean;
  barStyle: 'light-content' | 'dark-content';
  headerGradient: readonly [string, string];
  headerPillBg: string;
  headerPillIcon: string;
  tabBarBg: string;
  tabBarBorder: string;
  tabBarActiveBg: string;
  tabBarActiveFg: string;
  tabBarInactiveFg: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'warm_white',
    name: 'Warm white',
    sub: 'System default',
    bg: '#F2EAE0',
    surface: '#FAF6F0',
    text: '#111827',
    textSecondary: '#64748B',
    border: '#E2D9CC',
    accent: '#2563EB',
    isDark: false,
    barStyle: 'light-content',
    headerGradient: ['#2265FA', '#1D4ED8'],
    headerPillBg: '#EFF6FF',
    headerPillIcon: '#2563EB',
    tabBarBg: '#FAF6F0',
    tabBarBorder: '#E2D9CC',
    tabBarActiveBg: '#2563EB',
    tabBarActiveFg: '#FFFFFF',
    tabBarInactiveFg: '#64748B',
  },
  {
    id: 'pure_white',
    name: 'Pure white',
    sub: 'Clean snow canvas',
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    accent: '#2563EB',
    isDark: false,
    barStyle: 'light-content',
    headerGradient: ['#2265FA', '#1D4ED8'],
    headerPillBg: '#EFF6FF',
    headerPillIcon: '#2563EB',
    tabBarBg: '#FFFFFF',
    tabBarBorder: '#E2E8F0',
    tabBarActiveBg: '#2563EB',
    tabBarActiveFg: '#FFFFFF',
    tabBarInactiveFg: '#64748B',
  },
  {
    id: 'pure_dark',
    name: 'Pure dark',
    sub: 'Night AMOLED',
    bg: '#000000',
    surface: '#121212',
    text: '#FFFFFF',
    textSecondary: '#A1A1AA',
    border: '#27272A',
    accent: '#38BDF8',
    isDark: true,
    barStyle: 'light-content',
    headerGradient: ['#27272A', '#18181B'],
    headerPillBg: '#27272A',
    headerPillIcon: '#FFFFFF',
    tabBarBg: '#09090B',
    tabBarBorder: '#27272A',
    tabBarActiveBg: '#38BDF8',
    tabBarActiveFg: '#000000',
    tabBarInactiveFg: '#71717A',
  },
];

export const ACCENT_PALETTE = [
  { id: 'church', color: '#0F766E', label: 'Space default' },
  { id: 'emerald', color: '#2A7B6E', label: 'Emerald' },
  { id: 'blue', color: '#2563EB', label: 'Classic Blue' },
  { id: 'indigo', color: '#4338CA', label: 'Royal Indigo' },
  { id: 'purple', color: '#7E22CE', label: 'Deep Purple' },
  { id: 'rose', color: '#881337', label: 'Berry Rose' },
  { id: 'coral', color: '#EF4444', label: 'Warm Coral' },
  { id: 'amber', color: '#B45309', label: 'Warm Amber' },
  { id: 'forest', color: '#4D7C0F', label: 'Forest Moss' },
  { id: 'cyan', color: '#0E7490', label: 'Ocean Cyan' },
  { id: 'slate', color: '#475569', label: 'Charcoal Slate' },
];

interface ThemeContextType {
  mode: ThemeAppearance;
  appearance: ThemeAppearance;
  setAppearance: (mode: ThemeAppearance) => Promise<void>;
  currentThemeOption: ThemeOption;
  accentColor: string;
  setAccentColor: (color: string) => Promise<void>;
  quickActionsStyle: QuickActionsStyle;
  setQuickActionsStyle: (style: QuickActionsStyle) => Promise<void>;
  navBarStyle: NavBarStyle;
  setNavBarStyle: (style: NavBarStyle) => Promise<void>;
  fontSize: FontSizeOption;
  fontSizePx: number;
  fontScale: number;
  setFontSize: (size: FontSizeOption) => Promise<void>;
  fontStyle: FontStyleOption;
  setFontStyle: (style: FontStyleOption) => Promise<void>;
  scaleFont: (size: number) => number;
  isDark: boolean;
  toggleTheme: () => void;
  colors: any;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeChurch } = useChurch();
  const systemScheme = useColorScheme();

  const [appearance, setAppearanceState] = useState<ThemeAppearance>('warm_white');
  const [accentColor, setAccentColorState] = useState<string>('#2563EB');
  const [quickActionsStyle, setQuickActionsStyleState] = useState<QuickActionsStyle>('bento');
  const [navBarStyle, setNavBarStyleState] = useState<NavBarStyle>('capsule');
  const [fontSize, setFontSizeState] = useState<FontSizeOption>('medium');
  const [fontStyle, setFontStyleState] = useState<FontStyleOption>('modern');

  // Load saved appearance preference on app launch
  useEffect(() => {
    (async () => {
      try {
        const savedAppearance = await AsyncStorage.getItem('user_theme_appearance');
        if (savedAppearance && THEME_OPTIONS.some(o => o.id === savedAppearance)) {
          setAppearanceState(savedAppearance as ThemeAppearance);
        } else {
          const legacy = await AsyncStorage.getItem('user_theme');
          if (legacy === 'dark') {
            setAppearanceState('pure_dark');
          } else {
            setAppearanceState('warm_white');
          }
        }

        const savedAccent = await AsyncStorage.getItem('user_accent_color');
        if (savedAccent) {
          setAccentColorState(savedAccent);
        }

        const savedQA = await AsyncStorage.getItem('user_quick_actions_style');
        if (savedQA === 'bento' || savedQA === 'grid') {
          setQuickActionsStyleState(savedQA as QuickActionsStyle);
        }

        const savedNav = await AsyncStorage.getItem('user_navbar_style');
        if (savedNav === 'pill' || savedNav === 'capsule') {
          setNavBarStyleState(savedNav as NavBarStyle);
        }

        const savedFontStyle = await AsyncStorage.getItem('user_font_style');
        if (savedFontStyle === 'modern' || savedFontStyle === 'classic' || savedFontStyle === 'prominent') {
          setFontStyleState(savedFontStyle as FontStyleOption);
          const opt = FONT_STYLE_OPTIONS.find(o => o.id === savedFontStyle) || FONT_STYLE_OPTIONS[0];
          setGlobalFontFamily(opt.family);
        } else {
          // Default to Modern (system sans-serif)
          const opt = FONT_STYLE_OPTIONS[0];
          setGlobalFontFamily(opt.family);
        }

        const savedFontSize = await AsyncStorage.getItem('user_font_size');
        if (savedFontSize === 'small' || savedFontSize === 'medium' || savedFontSize === 'large') {
          setFontSizeState(savedFontSize as FontSizeOption);
          setGlobalFontScale(FONT_SIZE_CONFIG[savedFontSize as FontSizeOption].scale);
        } else {
          setFontSizeState('medium');
          setGlobalFontScale(1.0);
        }
      } catch (e) {
        // Fallback to warm white default
      }
    })();
  }, []);

  const setAppearance = async (newMode: ThemeAppearance) => {
    setAppearanceState(newMode);
    try {
      await AsyncStorage.setItem('user_theme_appearance', newMode);
      await AsyncStorage.setItem('user_theme', newMode === 'pure_dark' ? 'dark' : 'light');
    } catch (e) {}
  };

  const setAccentColor = async (color: string) => {
    setAccentColorState(color);
    try {
      await AsyncStorage.setItem('user_accent_color', color);
    } catch (e) {}
  };

  const setQuickActionsStyle = async (style: QuickActionsStyle) => {
    setQuickActionsStyleState(style);
    try {
      await AsyncStorage.setItem('user_quick_actions_style', style);
    } catch (e) {}
  };

  const setNavBarStyle = async (style: NavBarStyle) => {
    setNavBarStyleState(style);
    try {
      await AsyncStorage.setItem('user_navbar_style', style);
    } catch (e) {}
  };

  const setFontStyle = async (style: FontStyleOption) => {
    setFontStyleState(style);
    const opt = FONT_STYLE_OPTIONS.find(o => o.id === style) || FONT_STYLE_OPTIONS[0];
    setGlobalFontFamily(opt.family);
    try { await AsyncStorage.setItem('user_font_style', style); } catch (e) {}
  };
  const setFontSize = async (size: FontSizeOption) => {
    setFontSizeState(size);
    const cfg = FONT_SIZE_CONFIG[size] || FONT_SIZE_CONFIG.medium;
    setGlobalFontScale(cfg.scale);
    try {
      await AsyncStorage.setItem('user_font_size', size);
    } catch (e) {}
  };

  const currentThemeOption = THEME_OPTIONS.find(o => o.id === appearance) || THEME_OPTIONS[0];
  const isDark = currentThemeOption.isDark;

  const toggleTheme = () => {
    const nextMode: ThemeAppearance = isDark ? 'warm_white' : 'pure_dark';
    setAppearance(nextMode);
  };

  // Base dynamic theme colors
  let primary = activeChurch?.theme?.primaryColor || currentThemeOption.accent;
  let accent = accentColor || activeChurch?.theme?.secondaryColor || currentThemeOption.accent;
  let textColor = currentThemeOption.text;

  const colors = {
    primary,
    accent,
    gold: '#E8C46E',
    background: currentThemeOption.bg,
    bg: currentThemeOption.bg,
    surface: currentThemeOption.surface,
    text: textColor,
    textSecondary: currentThemeOption.textSecondary,
    border: currentThemeOption.border,
    header: primary,
    card: currentThemeOption.surface,
    barStyle: currentThemeOption.barStyle,
    headerGradient: currentThemeOption.headerGradient,
    headerPillBg: currentThemeOption.headerPillBg,
    headerPillIcon: currentThemeOption.headerPillIcon,
    tabBarBg: currentThemeOption.tabBarBg,
    tabBarBorder: currentThemeOption.tabBarBorder,
    tabBarActiveBg: accentColor || currentThemeOption.tabBarActiveBg,
    tabBarActiveFg: currentThemeOption.tabBarActiveFg,
    tabBarInactiveFg: currentThemeOption.tabBarInactiveFg,
  };

  return (
    <ThemeContext.Provider
      value={{
        mode: appearance,
        appearance,
        setAppearance,
        currentThemeOption,
        accentColor,
        setAccentColor,
        quickActionsStyle,
        setQuickActionsStyle,
        navBarStyle,
        setNavBarStyle,
        fontSize,
        fontSizePx: (FONT_SIZE_CONFIG[fontSize] || FONT_SIZE_CONFIG.medium).px,
        fontScale: (FONT_SIZE_CONFIG[fontSize] || FONT_SIZE_CONFIG.medium).scale,
        fontStyle,
        setFontStyle,
        setFontSize,
        scaleFont: (size: number) => Math.round(size * (FONT_SIZE_CONFIG[fontSize] || FONT_SIZE_CONFIG.medium).scale),
        isDark,
        toggleTheme,
        colors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
