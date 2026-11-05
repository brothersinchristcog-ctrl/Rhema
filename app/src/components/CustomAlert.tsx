import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Animated, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { spacing, radius, typography, shadow } from '../theme/Theme';
import { useTheme } from '../context/ThemeContext';

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

interface CustomAlertProps {
  visible?: boolean;
  title?: string;
  message?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  buttons?: AlertButton[];
  onClose?: () => void;
}

export interface CustomAlertRef {
  alert: (title: string, message: string, buttons?: AlertButton[], type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const CustomAlert = forwardRef<CustomAlertRef, CustomAlertProps>((props, ref) => {
  const { colors, isDark } = useTheme();

  // Internal state for imperative usage
  const [internalVisible, setInternalVisible] = useState(false);
  const [internalTitle, setInternalTitle] = useState('');
  const [internalMessage, setInternalMessage] = useState('');
  const [internalType, setInternalType] = useState<'success' | 'error' | 'warning' | 'info'>('info');
  const [internalButtons, setInternalButtons] = useState<AlertButton[] | undefined>(undefined);

  const visible = props.visible !== undefined ? props.visible : internalVisible;
  const title = props.title !== undefined ? props.title : internalTitle;
  const message = props.message !== undefined ? props.message : internalMessage;
  const type = props.type !== undefined ? props.type : internalType;
  const buttons = props.buttons !== undefined ? props.buttons : internalButtons;

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    alert: (t: string, m: string, b?: AlertButton[], ty?: 'success' | 'error' | 'warning' | 'info') => {
      setInternalTitle(t);
      setInternalMessage(m);
      if (b) setInternalButtons(b);
      else setInternalButtons(undefined);
      if (ty) setInternalType(ty);
      else {
        // Auto-detect success/error from title
        if (t.toLowerCase().includes('success') || t.includes('విజయం')) setInternalType('success');
        else if (t.toLowerCase().includes('error') || t.toLowerCase().includes('fail')) setInternalType('error');
        else setInternalType('info');
      }
      setInternalVisible(true);
    }
  }));

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true })
    ]).start(() => {
      setInternalVisible(false);
      if (props.onClose) props.onClose();
    });
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      fadeAnim.setValue(0);
    }
  }, [visible]);

  const getIcon = () => {
    switch (type) {
      case 'success': return <Ionicons name="checkmark-circle" size={54} color="#22C55E" />;
      case 'error': return <Ionicons name="close-circle" size={54} color="#EF4444" />;
      case 'warning': return <Ionicons name="warning" size={54} color="#F59E0B" />;
      default: return <Ionicons name="information-circle" size={54} color={isDark ? '#38BDF8' : '#0284C7'} />;
    }
  };

  const getIconBgColor = () => {
    switch (type) {
      case 'success': return isDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7';
      case 'error': return isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2';
      case 'warning': return isDark ? 'rgba(245, 158, 11, 0.16)' : '#FEF3C7';
      default: return isDark ? 'rgba(56, 189, 248, 0.16)' : '#E0F2FE';
    }
  };

  const getIconBorderColor = () => {
    switch (type) {
      case 'success': return isDark ? 'rgba(34, 197, 94, 0.32)' : '#BBF7D0';
      case 'error': return isDark ? 'rgba(239, 68, 68, 0.32)' : '#FECACA';
      case 'warning': return isDark ? 'rgba(245, 158, 11, 0.32)' : '#FDE68A';
      default: return isDark ? 'rgba(56, 189, 248, 0.32)' : '#BAE6FD';
    }
  };

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="none"
      statusBarTranslucent={true}
      onRequestClose={handleClose}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View style={[
          styles.alertBox,
          {
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderWidth: 1.5,
            borderColor: isDark ? '#3F3F46' : '#E2E8F0',
            transform: [{ scale: scaleAnim }]
          }
        ]}>
          
          <View style={[styles.iconContainer, { backgroundColor: getIconBgColor(), borderWidth: 1, borderColor: getIconBorderColor() }]}>
            {getIcon()}
          </View>

          <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>{title}</Text>
          <Text style={[styles.message, { color: isDark ? '#E4E4E7' : '#475569' }]}>{message}</Text>

          <View style={styles.buttonContainer}>
            {buttons && buttons.length > 0 ? (
              buttons.map((btn, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    { backgroundColor: isDark ? '#FFFFFF' : '#0F172A', shadowColor: '#000' },
                    btn.style === 'cancel' && { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderWidth: 1, borderColor: isDark ? '#3F3F46' : '#E2E8F0', shadowOpacity: 0, elevation: 0 },
                    btn.style === 'destructive' && { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
                    buttons.length === 2 && styles.buttonHalf
                  ]}
                  onPress={() => {
                    handleClose();
                    if (btn.onPress) {
                      setTimeout(() => {
                        btn.onPress!();
                      }, 100);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.buttonText,
                    { color: isDark ? '#0F172A' : '#FFFFFF' },
                    btn.style === 'cancel' && { color: isDark ? '#E4E4E7' : '#0F172A' },
                    btn.style === 'destructive' && { color: '#FFFFFF' }
                  ]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <TouchableOpacity 
                style={[styles.button, { backgroundColor: isDark ? '#FFFFFF' : '#0F172A', shadowColor: '#000' }]} 
                onPress={handleClose} 
                activeOpacity={0.85}
              >
                <Text style={[styles.buttonText, { color: isDark ? '#0F172A' : '#FFFFFF' }]}>OK</Text>
              </TouchableOpacity>
            )}
          </View>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
});

export const globalAlertRef = React.createRef<CustomAlertRef>();

export const AppAlert = {
  alert: (title: string, message: string, buttons?: AlertButton[], type?: 'success' | 'error' | 'warning' | 'info') => {
    if (globalAlertRef.current) {
      globalAlertRef.current.alert(title, message, buttons, type);
    } else {
      Alert.alert(title, message, buttons as any);
    }
  }
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl
  },
  alertBox: {
    width: width - spacing.xl * 2,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  iconContainer: {
    marginBottom: 20,
    padding: 20,
    borderRadius: 50,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.sm,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800'
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
    fontSize: 15
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    gap: spacing.md
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 100, // Pill shape
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4
  },
  buttonHalf: {
    flex: 1
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center'
  }
});
