import React from 'react';
import { StyleSheet, TextStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
 * Intercepts React Native Text rendering globally so every text element
 * in the entire app scales automatically based on the user's selected preference.
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

  try {
    const ReactNative = require('react-native');
    const OriginalText = ReactNative.Text;
    if (!OriginalText) return;

    const PatchedText = React.forwardRef<any, any>(function ScaledText(props: any, ref: any) {
      const mergedProps = ref !== undefined ? { ...props, ref } : props;

      if (!props || currentScale === 1.0 || props.skipFontScaling) {
        return React.createElement(OriginalText, mergedProps);
      }

      const flatStyle = StyleSheet.flatten(props.style) as TextStyle | undefined;

      // Never alter vector icon fonts
      if (flatStyle && flatStyle.fontFamily && ICON_FONT_FAMILIES.test(flatStyle.fontFamily)) {
        return React.createElement(OriginalText, mergedProps);
      }

      // Scale explicit fontSize
      if (flatStyle && typeof flatStyle.fontSize === 'number') {
        // Protect micro-badges, tab bar labels, and tiny counter pills (<= 10.5px) from clipping
        if (flatStyle.fontSize <= 10.5) {
          return React.createElement(OriginalText, mergedProps);
        }

        // Apply smooth dampening for very large titles (>= 28px) so headings fit every mobile screen
        let effectiveScale = currentScale;
        if (flatStyle.fontSize >= 28 && currentScale > 1.0) {
          effectiveScale = 1.0 + (currentScale - 1.0) * 0.55;
        }

        const scaledFontSize = Math.round(flatStyle.fontSize * effectiveScale);
        const scaledLineHeight = typeof flatStyle.lineHeight === 'number'
          ? Math.round(flatStyle.lineHeight * effectiveScale)
          : undefined;

        const overrideStyle = scaledLineHeight !== undefined
          ? { fontSize: scaledFontSize, lineHeight: scaledLineHeight }
          : { fontSize: scaledFontSize };

        const newStyle = Array.isArray(props.style)
          ? [...props.style, overrideStyle]
          : [props.style, overrideStyle];

        return React.createElement(OriginalText, { ...mergedProps, style: newStyle });
      }

      return React.createElement(OriginalText, mergedProps);
    });

    (PatchedText as any).displayName = 'Text';
    Object.assign(PatchedText, OriginalText);

    // 1. Redefine getter on ReactNative
    try {
      Object.defineProperty(ReactNative, 'Text', {
        configurable: true,
        enumerable: true,
        get: () => PatchedText,
        set: (v) => { (ReactNative as any)._Text = v; },
      });
    } catch (_) {
      (ReactNative as any).Text = PatchedText;
    }

    // 2. Patch require('react-native/Libraries/Text/Text').default if available
    try {
      const TextModule = require('react-native/Libraries/Text/Text');
      if (TextModule) {
        TextModule.default = PatchedText;
      }
    } catch (_) {}

    // 3. Backward compatibility with older Text.render monkeypatching
    try {
      (OriginalText as any).render = PatchedText;
    } catch (_) {}
  } catch (err) {
    console.warn('installGlobalFontScaling failed:', err);
  }
};

// Auto-run once on module import
installGlobalFontScaling();
