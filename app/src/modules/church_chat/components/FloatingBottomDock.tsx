import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Plus } from 'lucide-react-native';
import { ChatThemePalette } from '../constants/chatTheme';

interface FloatingBottomDockProps {
  onPressPlus: () => void;
  bottomInset: number;
  palette: ChatThemePalette;
}

export default function FloatingBottomDock({
  onPressPlus,
  bottomInset,
  palette,
}: FloatingBottomDockProps) {
  const dockBottom = Math.max(bottomInset + 10, Platform.OS === 'ios' ? 24 : 16);

  return (
    <View style={[styles.wrapper, { bottom: dockBottom }]} pointerEvents="box-none">
      {/* Detached Circular Glass '+' Action Button */}
      <TouchableOpacity
        style={[
          styles.plusBtn,
          {
            borderColor: palette.glassBorder,
            backgroundColor: palette.glassStrong,
          },
        ]}
        onPress={onPressPlus}
        activeOpacity={0.85}
      >
        <BlurView intensity={50} tint={palette.blurTint} style={styles.plusBlur}>
          <Plus size={24} color={palette.text} strokeWidth={2.2} />
        </BlurView>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 16,
    alignItems: 'flex-end',
    zIndex: 40,
  },
  plusBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
  plusBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
