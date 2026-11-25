import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Users } from 'lucide-react-native';
import { CachedImage } from '../../../components/CachedImage';

interface AvatarWithStatusProps {
  uri?: string | null;
  name?: string;
  size?: number;
  online?: boolean;
  isGroup?: boolean;
  dotColor?: string;
  dotBorderColor?: string;
  accentColor?: string;
  badgeText?: string;
}

const AVATAR_TONES = [
  '#2563EB',
  '#0F766E',
  '#7E22CE',
  '#B45309',
  '#BE123C',
  '#0369A1',
  '#4D7C0F',
];

function getToneForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function getInitials(name?: string): string {
  const clean = String(name || 'R').trim();
  if (!clean) return 'R';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export default function AvatarWithStatus({
  uri,
  name = 'Member',
  size = 50,
  online = false,
  isGroup = false,
  dotColor = '#22C55E',
  dotBorderColor = '#090B0E',
  accentColor,
  badgeText,
}: AvatarWithStatusProps) {
  const radius = size / 2;
  const bg = accentColor || getToneForName(name);
  const dotSize = Math.max(10, Math.round(size * 0.24));

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {uri ? (
        <CachedImage
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: '#1E293B',
          }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: bg,
            },
          ]}
        >
          {isGroup ? (
            <Users size={Math.round(size * 0.45)} color="#FFFFFF" strokeWidth={2.2} />
          ) : (
            <Text style={[styles.initials, { fontSize: Math.max(12, Math.round(size * 0.36)) }]}>
              {getInitials(name)}
            </Text>
          )}
        </View>
      )}

      {online ? (
        <View
          style={[
            styles.onlineDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: dotColor,
              borderColor: dotBorderColor,
            },
          ]}
        />
      ) : null}

      {badgeText ? (
        <View style={styles.livePill}>
          <Text style={styles.livePillText}>{badgeText}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  onlineDot: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 2,
  },
  livePill: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#090B0E',
  },
  livePillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
