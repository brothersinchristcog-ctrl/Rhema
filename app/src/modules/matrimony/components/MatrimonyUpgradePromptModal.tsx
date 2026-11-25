import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageSquare, User, X } from 'lucide-react-native';
import { useTheme } from '../../../context/ThemeContext';
import MatrimonyCachedImage from './MatrimonyCachedImage';
import ProtectedPhotoPlaceholder from './ProtectedPhotoPlaceholder';
import { MatrimonyMatchCandidate } from '../types/matrimony';

interface MatrimonyUpgradePromptModalProps {
  visible: boolean;
  candidate: MatrimonyMatchCandidate | null;
  viewerPhoto?: string | null;
  fontFamily?: string;
  onClose: () => void;
  onContinue: () => void;
}

const CORAL_CTA = '#EC525B';

export default function MatrimonyUpgradePromptModal({
  visible,
  candidate,
  viewerPhoto,
  fontFamily,
  onClose,
  onContinue,
}: MatrimonyUpgradePromptModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  if (!candidate) return null;

  const maskedContactLine = candidate.maskedPhone
    ? `Chat / Call ${candidate.maskedPhone}`
    : 'Chat / Call directly';

  const sheetGradientColors: readonly [string, string, string] = isDark
    ? ['#1E293B', '#0F172A', '#0F172A']
    : ['#FFF2EB', '#FFF9F5', '#FFFFFF'];

  const featureCardBg = isDark ? '#1E293B' : '#FFFFFF';
  const featureCardBorder = isDark ? colors.border : '#F1E6DF';
  const iconCircleBg = isDark ? '#334155' : '#F3F4F6';
  const iconColor = isDark ? '#CBD5E1' : '#64748B';
  const avatarRingColor = isDark ? '#1E293B' : '#FFFFFF';

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />

        <LinearGradient
          colors={sheetGradientColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.7 }}
          style={[
            styles.sheetContainer,
            { paddingBottom: Math.max(insets.bottom + 16, 24) },
          ]}
        >
          {/* Top-right Close */}
          <View style={styles.topRow}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={22} color={isDark ? '#CBD5E1' : '#334155'} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Overlapping Dual Avatars */}
          <View style={styles.avatarsRow}>
            <View
              style={[
                styles.avatarCircle,
                {
                  borderColor: avatarRingColor,
                  backgroundColor: isDark ? '#334155' : '#E2E8F0',
                  zIndex: 2,
                },
              ]}
            >
              {viewerPhoto ? (
                <MatrimonyCachedImage
                  uri={viewerPhoto}
                  recyclingKey="viewer_self_avatar"
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <User size={34} color="#94A3B8" />
                </View>
              )}
            </View>

            <View
              style={[
                styles.avatarCircle,
                styles.secondAvatarOverlap,
                {
                  borderColor: avatarRingColor,
                  backgroundColor: isDark ? '#334155' : '#E2E8F0',
                  zIndex: 1,
                },
              ]}
            >
              {candidate.signedProfilePhoto ? (
                <MatrimonyCachedImage
                  uri={candidate.signedProfilePhoto}
                  recyclingKey={`upgrade_modal_${candidate.uid}`}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : candidate.isPhotoProtected ? (
                <ProtectedPhotoPlaceholder
                  gender={candidate.gender}
                  compact
                  requestStatus={candidate.photoRequestStatus}
                  fontFamily={fontFamily}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <User size={34} color="#94A3B8" />
                </View>
              )}
            </View>
          </View>

          {/* Title & Candidate Prompt */}
          <Text style={[styles.title, { color: colors.text, fontFamily }]}>
            Upgrade to Paid Membership
          </Text>

          <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily }]}>
            {maskedContactLine}
            {'\n'}
            to connect with {candidate.displayName}
          </Text>

          {/* Features Header */}
          <Text style={[styles.sectionHeading, { color: colors.text, fontFamily }]}>
            Paid membership lets you
          </Text>

          {/* Features Box */}
          <View
            style={[
              styles.featuresCard,
              {
                backgroundColor: featureCardBg,
                borderColor: featureCardBorder,
              },
            ]}
          >
            <View style={styles.featureRow}>
              <View style={[styles.featureIconCircle, { backgroundColor: iconCircleBg }]}>
                <User size={16} color={iconColor} strokeWidth={2} />
              </View>
              <Text style={[styles.featureText, { color: colors.text, fontFamily }]}>
                View contact numbers and call directly
              </Text>
            </View>

            <View style={styles.featureRow}>
              <View style={[styles.featureIconCircle, { backgroundColor: iconCircleBg }]}>
                <MessageSquare size={16} color={iconColor} strokeWidth={2} />
              </View>
              <Text style={[styles.featureText, { color: colors.text, fontFamily }]}>
                Send personalised messages
              </Text>
            </View>
          </View>

          {/* Continue CTA */}
          <TouchableOpacity
            style={styles.continueBtn}
            activeOpacity={0.88}
            onPress={onContinue}
          >
            <Text style={[styles.continueBtnText, { fontFamily }]}>Continue</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.56)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheetContainer: {
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  closeBtn: {
    padding: 4,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  secondAvatarOverlap: {
    marginLeft: -16,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  sectionHeading: {
    fontSize: 15.5,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 22,
    marginBottom: 14,
  },
  featuresCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  featureIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '500',
  },
  continueBtn: {
    marginTop: 22,
    height: 48,
    borderRadius: 24,
    backgroundColor: CORAL_CTA,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CORAL_CTA,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
});
