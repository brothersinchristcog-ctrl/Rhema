import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { ChatThemePalette } from '../constants/chatTheme';
import { ChatTypingUser } from '../types/chat';
import AvatarWithStatus from './AvatarWithStatus';

interface TypingIndicatorBubbleProps {
  typingUsers: ChatTypingUser[];
  isGroup: boolean;
  roomAvatar?: string | null;
  palette: ChatThemePalette;
  fontFamily?: string;
  scaleFont: (s: number) => number;
}

export default function TypingIndicatorBubble({
  typingUsers,
  isGroup,
  roomAvatar,
  palette,
  fontFamily,
  scaleFont,
}: TypingIndicatorBubbleProps) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  const isVisible = typingUsers.length > 0;

  useEffect(() => {
    if (!isVisible) return;

    const createDotAnim = (val: Animated.Value, delayMs: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(val, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.delay(360 - delayMs),
        ])
      );

    const a1 = createDotAnim(dot1, 0);
    const a2 = createDotAnim(dot2, 140);
    const a3 = createDotAnim(dot3, 280);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
      dot1.setValue(0);
      dot2.setValue(0);
      dot3.setValue(0);
    };
  }, [isVisible, dot1, dot2, dot3]);

  if (!isVisible) return null;

  const leadUser = typingUsers[0];
  const label = isGroup
    ? typingUsers.length === 1
      ? `${leadUser.name.split(/\s+/)[0]} is typing`
      : `${typingUsers.length} members typing`
    : undefined;

  const dotStyle = (anim: Animated.Value) => ({
    backgroundColor: palette.timestampGreen,
    opacity: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 1],
    }),
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  });

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.avatarCol}>
          <AvatarWithStatus
            uri={!isGroup ? roomAvatar : undefined}
            name={leadUser.name}
            size={28}
            dotBorderColor={palette.bg}
          />
        </View>

        <View
          style={[
            styles.bubble,
            {
              backgroundColor: palette.incomingBubbleBg,
              borderColor: palette.incomingBubbleBorder,
            },
          ]}
        >
          {label ? (
            <Text
              style={[
                styles.senderLabel,
                { color: palette.timestampGreen, fontFamily, fontSize: scaleFont(11.5) },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          ) : null}

          <View style={styles.dotsRow}>
            <Animated.View style={[styles.dot, dotStyle(dot1)]} />
            <Animated.View style={[styles.dot, dotStyle(dot2)]} />
            <Animated.View style={[styles.dot, dotStyle(dot3)]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  avatarCol: {
    width: 32,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bubble: {
    borderRadius: 20,
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  senderLabel: {
    fontWeight: '600',
    marginBottom: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 14,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
