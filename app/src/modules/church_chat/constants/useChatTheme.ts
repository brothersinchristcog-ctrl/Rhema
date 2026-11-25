import { useMemo } from 'react';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { getChatThemePalette } from '../constants/chatTheme';

export function useChatTheme() {
  const { appearance, accentColor, isDark, fontStyle, scaleFont, colors } = useTheme();

  const palette = useMemo(
    () => getChatThemePalette(appearance, accentColor, isDark),
    [appearance, accentColor, isDark]
  );

  const fontFamily = useMemo(
    () => FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family,
    [fontStyle]
  );

  return {
    palette,
    fontFamily,
    scaleFont,
    colors,
    isDark: palette.isDark,
    appearance,
    accentColor,
  };
}
