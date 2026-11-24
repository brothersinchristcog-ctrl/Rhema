import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import { getProfileSubjectFromContext } from '../utils/profileSubject';

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
  const subjectCopy = getProfileSubjectFromContext(
    route?.params?.draftData,
    route?.params?.initialData
  );

  const handleStepPress = (stepNum: number) => {
    if (stepNum === currentStep || stepNum > currentStep) return;
    const targetRoute = STEP_ROUTES[stepNum];
    if (targetRoute) {
      navigation.navigate(targetRoute, route?.params);
    }
  };

  return (
    <View style={styles.wrapper}>
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

      {subjectCopy.forBadgeText ? (
        <View
          style={[
            styles.forBadge,
            {
              backgroundColor: isDark
                ? 'rgba(234, 88, 12, 0.18)'
                : 'rgba(234, 88, 12, 0.10)',
              borderColor: isDark ? 'rgba(253, 186, 116, 0.35)' : '#FDBA74',
            },
          ]}
        >
          <Text
            style={[
              styles.forBadgeText,
              {
                color: isDark ? '#FDBA74' : '#C2410C',
                fontFamily,
              },
            ]}
          >
            {subjectCopy.forBadgeText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  forBadge: {
    marginTop: 2,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  forBadgeText: {
    fontSize: 12,
    fontWeight: '700',
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
