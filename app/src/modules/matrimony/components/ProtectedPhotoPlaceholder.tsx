import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../../context/ThemeContext';

const CORAL_TEXT = '#C94A58';
const MOCKUP_MEN_IMG = require('../../../../assets/matrimony_viewall_men.jpg');
const MOCKUP_WOMEN_IMG = require('../../../../assets/matrimony_viewall_women.jpg');

function isFemale(raw?: string | null): boolean {
  const s = String(raw || '').trim().toLowerCase();
  return s === 'female' || s === 'f' || s === 'woman' || s === 'bride' || s === 'girl';
}

interface ProtectedPhotoPlaceholderProps {
  gender?: string | null;
  compact?: boolean;
  requestStatus?: 'pending' | 'approved' | 'declined' | null;
  busy?: boolean;
  onRequestPhoto?: () => void;
  fontFamily?: string;
}

export default function ProtectedPhotoPlaceholder({
  gender,
  compact = false,
  requestStatus,
  busy = false,
  onRequestPhoto,
  fontFamily,
}: ProtectedPhotoPlaceholderProps) {
  const { isDark } = useTheme();
  const female = isFemale(gender);
  const bg = isDark ? '#334155' : '#C2C2C2';
  const isPending = requestStatus === 'pending';

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Image
        source={female ? MOCKUP_WOMEN_IMG : MOCKUP_MEN_IMG}
        style={styles.mockupImage}
        resizeMode="cover"
      />

      {compact ? (
        <View style={styles.compactPillWrap} pointerEvents="none">
          <View style={[styles.compactPill, isPending && styles.compactPillSent]}>
            <Text
              style={[
                styles.compactPillText,
                isPending && styles.compactPillTextSent,
                { fontFamily },
              ]}
              numberOfLines={1}
            >
              {isPending ? 'Requested' : 'Protected'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.centerOverlay} pointerEvents="box-none">
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={busy || isPending || !onRequestPhoto}
            onPress={onRequestPhoto}
            style={[
              styles.requestPillBtn,
              isPending && styles.requestPillBtnSent,
            ]}
          >
            <Text
              style={[
                styles.requestPillText,
                isPending && styles.requestPillTextSent,
                { fontFamily },
              ]}
              numberOfLines={2}
            >
              {isPending
                ? 'Photo request sent'
                : 'Photo is protected. Request to view photo'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  mockupImage: {
    width: '100%',
    height: '100%',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  requestPillBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 4,
    maxWidth: '92%',
  },
  requestPillBtnSent: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  requestPillText: {
    color: CORAL_TEXT,
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  requestPillTextSent: {
    color: '#15803D',
  },
  compactPillWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  compactPill: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  compactPillSent: {
    backgroundColor: 'rgba(240,253,244,0.95)',
    borderColor: '#86EFAC',
  },
  compactPillText: {
    color: CORAL_TEXT,
    fontSize: 10,
    fontWeight: '700',
  },
  compactPillTextSent: {
    color: '#15803D',
  },
});
