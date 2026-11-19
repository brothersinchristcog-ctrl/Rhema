import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Flag, ShieldAlert, X } from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { matrimonyApi } from '../services/matrimonyApi';

const CORAL_RED = '#E04B5A';

const REPORT_CATEGORIES = [
  'Fake or Misleading Profile',
  'Inappropriate Photos / Content',
  'Harassment or Abusive Behavior',
  'Spam or Scam',
  'Already Married / Misrepresentation',
  'Other',
];

interface MatrimonyReportModalProps {
  visible: boolean;
  targetUid: string;
  targetName: string;
  targetCode?: string;
  source?: 'profile' | 'chat';
  onClose: () => void;
  onReported?: (hidden: boolean) => void;
}

export default function MatrimonyReportModal({
  visible,
  targetUid,
  targetName,
  targetCode,
  source = 'profile',
  onClose,
  onReported,
}: MatrimonyReportModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [category, setCategory] = useState<string>(REPORT_CATEGORIES[0]);
  const [reason, setReason] = useState('');
  const [alsoHide, setAlsoHide] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory(REPORT_CATEGORIES[0]);
      setReason('');
      setAlsoHide(false);
      setSubmitting(false);
    }
  }, [visible, targetUid]);

  const dividerColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  const handleSubmit = async () => {
    if (!targetUid) return;
    if (category === 'Other' && !reason.trim()) {
      Alert.alert('Details Required', 'Please describe the issue when selecting Other.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await matrimonyApi.reportProfile({
        targetUid,
        category,
        reason: reason.trim() || category,
        source,
        alsoHide,
      });
      onClose();
      onReported?.(Boolean(res.hidden));
      Alert.alert(
        'Report Submitted',
        `Thank you. Your report on ${targetName} has been attached to their profile for Church Administration review.`
      );
    } catch (err: any) {
      Alert.alert('Unable to Submit Report', err?.message || 'Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bg,
              paddingBottom: Math.max(insets.bottom + 16, 24),
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: dividerColor }]}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Flag size={16} color={CORAL_RED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text, fontFamily }]}>
                  Report Profile
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily }]} numberOfLines={1}>
                  {targetName}
                  {targetCode ? ` • ${targetCode}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}
          >
            <View
              style={[
                styles.infoNote,
                {
                  backgroundColor: isDark ? 'rgba(217,119,6,0.14)' : '#FFFBEB',
                  borderColor: isDark ? 'rgba(217,119,6,0.35)' : '#FDE68A',
                },
              ]}
            >
              <ShieldAlert size={16} color="#D97706" />
              <Text
                style={[
                  styles.infoNoteText,
                  { color: isDark ? '#FDE68A' : '#92400E', fontFamily },
                ]}
              >
                Reports are confidentially reviewed by Church Administration and attached to this member&apos;s Matrimony profile.
              </Text>
            </View>

            <Text style={[styles.label, { color: colors.text, fontFamily }]}>
              Select a reason
            </Text>

            <View style={styles.chipGrid}>
              {REPORT_CATEGORIES.map((item) => {
                const selected = category === item;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected
                          ? isDark
                            ? 'rgba(224,75,90,0.22)'
                            : '#FFF1F2'
                          : colors.surface,
                        borderColor: selected ? CORAL_RED : dividerColor,
                      },
                    ]}
                    onPress={() => setCategory(item)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: selected ? CORAL_RED : colors.text,
                          fontWeight: selected ? '700' : '500',
                          fontFamily,
                        },
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.text, fontFamily }]}>
              Additional details {category === 'Other' ? '(Required)' : '(Optional)'}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: dividerColor,
                  color: colors.text,
                  fontFamily,
                },
              ]}
              placeholder="Share details that will help Church Administration review this profile..."
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={450}
              value={reason}
              onChangeText={setReason}
            />

            <TouchableOpacity
              style={styles.hideRow}
              activeOpacity={0.8}
              onPress={() => setAlsoHide((prev) => !prev)}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: alsoHide ? CORAL_RED : dividerColor,
                    backgroundColor: alsoHide ? CORAL_RED : 'transparent',
                  },
                ]}
              >
                {alsoHide ? <Check size={13} color="#FFFFFF" strokeWidth={2.8} /> : null}
              </View>
              <Text style={[styles.hideLabel, { color: colors.text, fontFamily }]}>
                Also hide this profile from my matches
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: dividerColor }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: dividerColor }]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary, fontFamily }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={[styles.submitText, { fontFamily }]}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '86%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(224,75,90,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16.5, fontWeight: '800' },
  subtitle: { fontSize: 12.5, marginTop: 1 },
  closeBtn: { padding: 4 },
  body: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoNoteText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '500' },
  label: { fontSize: 13.5, fontWeight: '700', marginTop: 2 },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.2,
  },
  chipText: { fontSize: 12.5 },
  input: {
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 12,
    minHeight: 88,
    textAlignVertical: 'top',
    fontSize: 13.5,
  },
  hideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hideLabel: { fontSize: 13.5, fontWeight: '600', flex: 1 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.2,
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '700' },
  submitBtn: {
    flex: 1.5,
    backgroundColor: CORAL_RED,
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
});
