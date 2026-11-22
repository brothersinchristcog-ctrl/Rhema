import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Archive, MessageCircle, Plus, Users, UsersRound } from 'lucide-react-native';
import { ChatThemePalette } from '../constants/chatTheme';

export type DockSection = 'chats' | 'groups' | 'directory' | 'archived';

interface FloatingBottomDockProps {
  activeSection: DockSection;
  onSelectSection: (section: DockSection) => void;
  onPressPlus: () => void;
  bottomInset: number;
  palette: ChatThemePalette;
}

export default function FloatingBottomDock({
  activeSection,
  onSelectSection,
  onPressPlus,
  bottomInset,
  palette,
}: FloatingBottomDockProps) {
  const dockBottom = Math.max(bottomInset + 10, Platform.OS === 'ios' ? 24 : 16);

  const navItems: { key: DockSection; Icon: any }[] = [
    { key: 'chats', Icon: MessageCircle },
    { key: 'groups', Icon: UsersRound },
    { key: 'directory', Icon: Users },
    { key: 'archived', Icon: Archive },
  ];

  return (
    <View style={[styles.wrapper, { bottom: dockBottom }]} pointerEvents="box-none">
      {/* Left Frosted Glass Pill Dock */}
      <View
        style={[
          styles.dockOuter,
          {
            borderColor: palette.glassBorder,
            backgroundColor: palette.glassBg,
          },
        ]}
      >
        <BlurView intensity={45} tint={palette.blurTint} style={styles.blurInner}>
          {navItems.map(({ key, Icon }) => {
            const focused = activeSection === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.dockTab,
                  focused && {
                    backgroundColor: palette.isDark
                      ? 'rgba(255, 255, 255, 0.16)'
                      : palette.accent,
                  },
                ]}
                onPress={() => onSelectSection(key)}
                activeOpacity={0.8}
              >
                <Icon
                  size={20}
                  color={
                    focused
                      ? palette.isDark
                        ? '#FFFFFF'
                        : '#FFFFFF'
                      : palette.textSecondary
                  }
                  strokeWidth={focused ? 2.4 : 2}
                />
              </TouchableOpacity>
            );
          })}
        </BlurView>
      </View>

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
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 40,
  },
  dockOuter: {
    flex: 1,
    marginRight: 12,
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
  blurInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  dockTab: {
    width: 46,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
