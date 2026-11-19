import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';

const ORANGE = '#EA580C';
const LETTERS = ['R', 'H', 'E', 'M', 'A'];

const STEP_ROUTES: Record<number, string> = {
  1: 'MatrimonyBasicDetails',
  2: 'MatrimonyPersonalDetails',
  3: 'MatrimonyReligiousDetails',
  4: 'MatrimonyLocationDetails',
  5: 'MatrimonyProfessionalDetails',
};

interface MatrimonyProgressBarProps {
  /** 1-based index: 1 = R, 2 = H, 3 = E, 4 = M, 5 = A */
  currentStep: 1 | 2 | 3 | 4 | 5;
}

export default function MatrimonyProgressBar({ currentStep }: MatrimonyProgressBarProps) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark, fontStyle } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const handleStepPress = (stepNum: number) => {
    if (stepNum === currentStep || stepNum > currentStep) return;
    const targetRoute = STEP_ROUTES[stepNum];
    if (targetRoute) {
      navigation.navigate(targetRoute, route?.params);
    }
  };

  return (
    <View style={styles.container}>
      {LETTERS.map((letter, idx) => {
        const stepNum = idx + 1;
        const isCompleted = stepNum < currentStep;
        const isActive = stepNum === currentStep;
        const isClickable = isCompleted;

        return (
          <React.Fragment key={letter}>
            <TouchableOpacity
              disabled={!isClickable}
              onPress={() => handleStepPress(stepNum)}
              activeOpacity={0.75}
              style={[
                styles.circle,
                {
                  backgroundColor: isCompleted
                    ? ORANGE
                    : isActive
                    ? isDark
                      ? 'rgba(234, 88, 12, 0.22)'
                      : 'rgba(234, 88, 12, 0.14)'
                    : colors.surface,
                  borderColor: isCompleted || isActive ? ORANGE : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.letter,
                  {
                    fontFamily,
                    color: isCompleted
                      ? '#FFFFFF'
                      : isActive
                      ? ORANGE
                      : colors.textSecondary,
                  },
                ]}
              >
                {letter}
              </Text>
            </TouchableOpacity>

            {idx < LETTERS.length - 1 && (
              <View
                style={[
                  styles.connector,
                  {
                    backgroundColor: stepNum < currentStep ? ORANGE : colors.border,
                  },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontSize: 13,
    fontWeight: '800',
  },
  connector: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
    borderRadius: 1,
  },
});
