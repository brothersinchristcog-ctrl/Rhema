import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

interface UnreadMessagesDividerProps {
  label?: string;
  lineColor?: string;
  pillBgColor?: string;
  pillBorderColor?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  containerStyle?: ViewStyle;
  onLayout?: (event: any) => void;
}

const UnreadMessagesDivider = React.forwardRef<View, UnreadMessagesDividerProps>(
  (
    {
      label = 'Unread Messages',
      lineColor = 'rgba(255, 255, 255, 0.16)',
      pillBgColor = 'rgba(255, 255, 255, 0.1)',
      pillBorderColor = 'rgba(255, 255, 255, 0.18)',
      textColor = '#E2E8F0',
      fontFamily,
      fontSize = 11.5,
      containerStyle,
      onLayout,
    },
    ref
  ) => {
    return (
      <View ref={ref} onLayout={onLayout} style={[styles.container, containerStyle]}>
        <View style={[styles.line, { backgroundColor: lineColor }]} />
        <View
          style={[
            styles.pill,
            {
              backgroundColor: pillBgColor,
              borderColor: pillBorderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.label,
              {
                color: textColor,
                fontSize,
                ...(fontFamily ? { fontFamily } : {}),
              },
            ]}
          >
            {label}
          </Text>
        </View>
        <View style={[styles.line, { backgroundColor: lineColor }]} />
      </View>
    );
  }
);

UnreadMessagesDivider.displayName = 'UnreadMessagesDivider';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth > 0 ? Math.max(1, StyleSheet.hairlineWidth) : 1,
    opacity: 0.75,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});

export default UnreadMessagesDivider;
