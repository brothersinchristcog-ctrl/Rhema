import { Text, StyleSheet, TextStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare module 'react-native' {
  interface TextProps {
    skipFontScaling?: boolean;
  }
}

export type FontSizeOption = 'small' | 'medium' | 'large';

export interface FontSizeItem {
  id: FontSizeOption;
  label: string;
  px: number;
  scale: number;
  displayTitle: string;
  displaySub: string;
}

export const FONT_SIZE_OPTIONS: FontSizeItem[] = [
  { id: 'small', label: 'Small', px: 14, scale: 0.875, displayTitle: 'Small (Aa)', displaySub: '14 px' },
  { id: 'medium', label: 'Medium', px: 16, scale: 1.0, displayTitle: 'Medium (Aa)', displaySub: '16 px' },
  { id: 'large', label: 'Large', px: 20, scale: 1.25, displayTitle: 'Large (Aa)', displaySub: '20 px' },
];

export const FONT_SIZE_CONFIG: Record<FontSizeOption, FontSizeItem> = {
  small: FONT_SIZE_OPTIONS[0],
  medium: FONT_SIZE_OPTIONS[1],
  large: FONT_SIZE_OPTIONS[2],
};

let currentScale = 1.0;
let isInstalled = false;

// Vector icon fonts to preserve (do not scale icon glyph sizes)
const ICON_FONT_FAMILIES = /ionicons|material|feather|font-?awesome|glyph|entypo|evilicons|antdesign|octicons|zocial|simpleline/i;

export const setGlobalFontScale = (scale: number) => {
  currentScale = scale;
};

export const getGlobalFontScale = (): number => {
  return currentScale;
};

export const scaleFontSize = (fontSize: number, scale: number = currentScale): number => {
  if (scale === 1.0) return fontSize;
  return Math.round(fontSize * scale);
};

/**
 * Monkey-patches React Native Text.render to automatically and globally apply
 * the selected font size scaling to every text element in the app.
 */
export const installGlobalFontScaling = () => {
  if (isInstalled) return;
  isInstalled = true;

  // Pre-load from AsyncStorage on initial evaluation
  AsyncStorage.getItem('user_font_size')
    .then((saved) => {
      if (saved === 'small') currentScale = 0.875;
      else if (saved === 'large') currentScale = 1.25;
      else currentScale = 1.0;
    })
    .catch(() => {});

  const originalRender = (Text as any).render;
  if (!originalRender) return;

  (Text as any).render = function (props: any, ref: any) {
    if (!props || currentScale === 1.0 || props.skipFontScaling) {
      return originalRender.call(this, props, ref);
    }

    const flatStyle = StyleSheet.flatten(props.style) as TextStyle | undefined;

    // Never alter vector icon fonts
    if (flatStyle && flatStyle.fontFamily && ICON_FONT_FAMILIES.test(flatStyle.fontFamily)) {
      return originalRender.call(this, props, ref);
    }

    // Scale explicit fontSize
    if (flatStyle && typeof flatStyle.fontSize === 'number') {
      const originalFontSize = flatStyle.fontSize;
      // Protect micro-badges from clipping
      if (originalFontSize <= 9) {
        return originalRender.call(this, props, ref);
      }

      const scaledFontSize = Math.round(originalFontSize * currentScale);
      const newStyle: any = { ...flatStyle, fontSize: scaledFontSize };

      if (typeof flatStyle.lineHeight === 'number') {
        newStyle.lineHeight = Math.round(flatStyle.lineHeight * currentScale);
      }

      return originalRender.call(this, { ...props, style: newStyle }, ref);
    }

    // Scale default font size (14px in React Native)
    if (!flatStyle || flatStyle.fontSize === undefined) {
      const scaledDefault = Math.round(14 * currentScale);
      const newStyle = flatStyle ? { ...flatStyle, fontSize: scaledDefault } : { fontSize: scaledDefault };
      return originalRender.call(this, { ...props, style: newStyle }, ref);
    }

    return originalRender.call(this, props, ref);
  };
};

// Auto-install on module import
installGlobalFontScaling();

