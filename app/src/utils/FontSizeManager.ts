import React from 'react';
import { StyleSheet, TextStyle, Platform } from 'react-native';
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
  { id: 'small', label: 'Small', px: 15, scale: 0.9375, displayTitle: 'Small (Aa)', displaySub: '' },
  { id: 'medium', label: 'Medium', px: 16, scale: 1.0, displayTitle: 'Medium (Aa)', displaySub: '' },
  { id: 'large', label: 'Large', px: 20, scale: 1.25, displayTitle: 'Large (Aa)', displaySub: '' }
];

export const FONT_SIZE_CONFIG: Record<FontSizeOption, FontSizeItem> = {
  small: FONT_SIZE_OPTIONS[0],
  medium: FONT_SIZE_OPTIONS[1],
  large: FONT_SIZE_OPTIONS[2],
};

let currentScale = 1.0;
let currentFontFamily: string | undefined = Platform.OS === 'ios' ? 'System' : 'sans-serif';
let isInstalled = false;

// Vector icon fonts - NEVER touch or scale these
const ICON_FONT_FAMILIES = /ionicons|material|feather|font-?awesome|glyph|entypo|evilicons|antdesign|octicons|zocial|simpleline/i;

// Decorative script/cursive fonts (like signature Pacifico greeting in HomeScreen)
// These should NEVER be overridden by the global font style picker
const PRESERVED_DECORATIVE_FONTS = /pacifico|snell|alexbrush|borel|caveat|damion|sacramento|satisfy|yellowtail|applehello|dancingscript|mrdafoe/i;

export const setGlobalFontScale = (scale: number) => {
  currentScale = scale;
};

export const getGlobalFontScale = (): number => {
  return currentScale;
};

export const setGlobalFontFamily = (family: string | undefined) => {
  currentFontFamily = family;
};

export const getGlobalFontFamily = (): string | undefined => {
  return currentFontFamily;
};

export const scaleFontSize = (fontSize: number, scale: number = currentScale): number => {
  if (scale === 1.0) return fontSize;
  return Math.round(fontSize * scale);
};

/**
 * Intercepts React Native Text & TextInput rendering globally.
 * Applies font size scaling AND font family override across the entire app.
 */
export const installGlobalFontScaling = () => {
  if (isInstalled) return;
  isInstalled = true;

  // Pre-load saved preferences so first render is correct
  AsyncStorage.getItem('user_font_size')
    .then((saved) => {
      if (saved === 'small') currentScale = 0.9375;
      else if (saved === 'large') currentScale = 1.25;
      else currentScale = 1.0;
    })
    .catch(() => {});

  AsyncStorage.getItem('user_font_style')
    .then((saved) => {
      if (saved === 'classic') {
        currentFontFamily = Platform.OS === 'ios' ? 'Georgia' : 'serif';
      } else if (saved === 'prominent') {
        currentFontFamily = Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif-medium';
      } else {
        // Modern (default)
        currentFontFamily = Platform.OS === 'ios' ? 'System' : 'sans-serif';
      }
    })
    .catch(() => {});

  try {
    const ReactNative = require('react-native');
    const OriginalText = ReactNative.Text;
    if (!OriginalText) return;

    const PatchedText = React.forwardRef<any, any>(function ScaledText(props: any, ref: any) {
      const mergedProps = ref !== undefined ? { ...props, ref } : props;

      if (!props) return React.createElement(OriginalText, mergedProps);

      // skipFontScaling = explicit opt-out from ALL global overrides (used by Aa preview badges)
      if (props.skipFontScaling) return React.createElement(OriginalText, mergedProps);

      const flatStyle = StyleSheet.flatten(props.style) as TextStyle | undefined;

      // Never touch icon / glyph fonts
      if (flatStyle?.fontFamily && ICON_FONT_FAMILIES.test(flatStyle.fontFamily)) {
        return React.createElement(OriginalText, mergedProps);
      }

      const overrides: Record<string, any> = {};

      // ── 1. Font family override ────────────────────────────────────────────
      // Apply the user's chosen typeface to all Text elements, EXCEPT special
      // decorative cursive/script fonts like Pacifico used on the greeting.
      if (currentFontFamily) {
        const isPreserved = flatStyle?.fontFamily && PRESERVED_DECORATIVE_FONTS.test(flatStyle.fontFamily);
        if (!isPreserved) {
          overrides.fontFamily = currentFontFamily;
        }
      }

      // ── 2. Font size scaling ───────────────────────────────────────────────
      // If fixedFontSize or skipFontSizeScaling is true, skip size scaling while keeping font style override
      const isFixedSize = props.fixedFontSize || props.skipFontSizeScaling || props.allowFontScaling === false;
      if (!isFixedSize && currentScale !== 1.0 && flatStyle && typeof flatStyle.fontSize === 'number') {
        if (flatStyle.fontSize > 10.5) {
          let effectiveScale = currentScale;
          // Dampen very large headings so they don't overflow on small screens
          if (flatStyle.fontSize >= 28 && currentScale > 1.0) {
            effectiveScale = 1.0 + (currentScale - 1.0) * 0.55;
          }
          overrides.fontSize = Math.round(flatStyle.fontSize * effectiveScale);
          if (typeof flatStyle.lineHeight === 'number') {
            overrides.lineHeight = Math.round(flatStyle.lineHeight * effectiveScale);
          }
        }
      }

      // Strip custom props so native Text doesn't receive unrecognised props
      const { fixedFontSize, skipFontSizeScaling, ...cleanProps } = mergedProps;

      // Nothing to override — pass through unchanged
      if (Object.keys(overrides).length === 0) {
        return React.createElement(OriginalText, cleanProps);
      }

      const newStyle = Array.isArray(props.style)
        ? [...props.style, overrides]
        : [props.style, overrides];

      return React.createElement(OriginalText, { ...cleanProps, style: newStyle });
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
      if (TextModule) TextModule.default = PatchedText;
    } catch (_) {}

    // 3. Backward compatibility
    try {
      (OriginalText as any).render = PatchedText;
    } catch (_) {}

    // ── Patch TextInput so all inputs also follow app font style & size ──
    const OriginalTextInput = ReactNative.TextInput;
    if (OriginalTextInput) {
      const PatchedTextInput = React.forwardRef<any, any>(function ScaledTextInput(props: any, ref: any) {
        const mergedProps = ref !== undefined ? { ...props, ref } : props;
        if (!props || props.skipFontScaling) {
          return React.createElement(OriginalTextInput, mergedProps);
        }

        const flatStyle = StyleSheet.flatten(props.style) as TextStyle | undefined;
        const overrides: Record<string, any> = {};

        if (currentFontFamily) {
          const isPreserved = flatStyle?.fontFamily && PRESERVED_DECORATIVE_FONTS.test(flatStyle.fontFamily);
          if (!isPreserved) {
            overrides.fontFamily = currentFontFamily;
          }
        }

        const isFixedSize = props.fixedFontSize || props.skipFontSizeScaling || props.allowFontScaling === false;
        if (!isFixedSize && currentScale !== 1.0 && flatStyle && typeof flatStyle.fontSize === 'number') {
          if (flatStyle.fontSize > 10.5) {
            let effectiveScale = currentScale;
            if (flatStyle.fontSize >= 28 && currentScale > 1.0) {
              effectiveScale = 1.0 + (currentScale - 1.0) * 0.55;
            }
            overrides.fontSize = Math.round(flatStyle.fontSize * effectiveScale);
          }
        }

        const { fixedFontSize, skipFontSizeScaling, ...cleanProps } = mergedProps;
        if (Object.keys(overrides).length === 0) {
          return React.createElement(OriginalTextInput, cleanProps);
        }

        const newStyle = Array.isArray(props.style)
          ? [...props.style, overrides]
          : [props.style, overrides];

        return React.createElement(OriginalTextInput, { ...cleanProps, style: newStyle });
      });

      (PatchedTextInput as any).displayName = 'TextInput';
      Object.assign(PatchedTextInput, OriginalTextInput);

      try {
        Object.defineProperty(ReactNative, 'TextInput', {
          configurable: true,
          enumerable: true,
          get: () => PatchedTextInput,
          set: (v) => { (ReactNative as any)._TextInput = v; },
        });
      } catch (_) {
        (ReactNative as any).TextInput = PatchedTextInput;
      }

      try {
        const TextInputModule = require('react-native/Libraries/Components/TextInput/TextInput');
        if (TextInputModule) TextInputModule.default = PatchedTextInput;
      } catch (_) {}
    }

  } catch (err) {
    console.warn('installGlobalFontScaling failed:', err);
  }
};

// Auto-run once on module import
installGlobalFontScaling();
