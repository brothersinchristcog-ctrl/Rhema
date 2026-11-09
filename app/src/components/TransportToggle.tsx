import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '../theme/Theme';
import { useTheme } from '../context/ThemeContext';
import { TransportMode } from '../types/event';

const modes: { key: TransportMode; icon: string; label: string }[] = [
  { key: 'car',  icon: 'car-outline',    label: 'Car'  },
  { key: 'bike', icon: 'bicycle-outline', label: 'Bike' },
  { key: 'bus',  icon: 'bus-outline',     label: 'Bus'  },
];

export const TransportToggle = ({
  value, onChange
}: { value: TransportMode; onChange: (m: TransportMode) => void }) => {
  const { isDark } = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
      {modes.map(m => {
        const isActive = value === m.key;
        return (
          <TouchableOpacity
            key={m.key}
            onPress={() => onChange(m.key)}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 6, paddingVertical: 10,
              borderRadius: radius.sm,
              borderWidth: isActive ? 2 : 1,
              borderColor: isActive 
                ? (isDark ? '#FFFFFF' : '#000000') 
                : (isDark ? '#27272A' : '#E2E8F0'),
              backgroundColor: isActive 
                ? (isDark ? '#27272A' : '#F1F5F9') 
                : (isDark ? '#18181B' : '#FFFFFF'),
            }}
          >
            <Ionicons
              name={m.icon as any}
              size={16}
              color={isActive 
                ? (isDark ? '#FFFFFF' : '#000000') 
                : (isDark ? '#A1A1AA' : '#64748B')}
            />
            <Text style={{
              fontSize: 12,
              color: isActive 
                ? (isDark ? '#FFFFFF' : '#000000') 
                : (isDark ? '#A1A1AA' : '#64748B'),
              fontWeight: isActive ? '700' : '500'
            }}>
              {m.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default TransportToggle;
