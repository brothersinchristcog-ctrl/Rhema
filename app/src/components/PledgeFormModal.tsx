import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, Check, CheckSquare, Square, X, HeartHandshake } from 'lucide-react-native';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import { useTheme } from '../context/ThemeContext';
import FirestoreService, { ScheduleEvent } from '../services/FirestoreService';
import { RHEMA_CHURCH_ID, RHEMA_CHURCH_NAME, RHEMA_ROOT_COLLECTION } from '../constants/ChurchConfig';

export type PledgeFrequency = 'weekly' | 'monthly' | 'yearly' | 'event_wise';

export interface SavedPledgePayload {
  id: string;
  pledgeAmount: number;
  category: string;
  frequency: PledgeFrequency;
  eventId?: string;
  eventTitle?: string;
}

interface PledgeFormModalProps {
  visible: boolean;
  onClose: () => void;
  initialAmount?: string;
  initialCategory?: string;
  onPledgeCreated?: (pledge: SavedPledgePayload) => void;
  onPayFirstInstallment?: (pledge: SavedPledgePayload) => void;
}

const PLEDGE_CATEGORIES = ['Tithe', 'Offering', 'Building', 'Missions', 'Special', 'Event', 'Other'];
const AMOUNT_PRESETS = [500, 1000, 2500, 5000];
const FREQUENCIES: { id: PledgeFrequency; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'event_wise', label: 'Event-wise' },
];

const toYmd = (d: Date) => d.toISOString().slice(0, 10);

const addDaysYmd = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toYmd(d);
};

const addMonthsYmd = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return toYmd(d);
};

const isValidYmd = (val: string) => /^\d{4}-\d{2}-\d{2}$/.test(val.trim()) && !isNaN(new Date(`${val.trim()}T00:00:00Z`).getTime());

export default function PledgeFormModal({
  visible,
  onClose,
  initialAmount = '1000',
  initialCategory = 'Tithe',
  onPledgeCreated,
  onPayFirstInstallment,
}: PledgeFormModalProps) {
  const { user, member } = useAuth();
  const { activeChurch, churchId } = useChurch();
  const { isDark, colors } = useTheme();
  const effectiveChurchId = churchId || activeChurch?.id || RHEMA_CHURCH_ID;
  const churchName = activeChurch?.name?.trim() || RHEMA_CHURCH_NAME;

  const [amount, setAmount] = useState(initialAmount || '1000');
  const [category, setCategory] = useState(
    PLEDGE_CATEGORIES.includes(initialCategory) ? initialCategory : 'Tithe'
  );
  const [customPurpose, setCustomPurpose] = useState('');
  const [frequency, setFrequency] = useState<PledgeFrequency>('monthly');
  const [startDate, setStartDate] = useState(toYmd(new Date()));
  const [endDate, setEndDate] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);

  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const memberName =
    member?.name ||
    [member?.firstName, member?.lastName].filter(Boolean).join(' ').trim() ||
    user?.displayName ||
    'Member';
  const memberPhone = member?.phone || user?.phoneNumber || '';
  const memberEmail = member?.email || user?.email || '';

  useEffect(() => {
    if (!visible) return;
    setAmount(initialAmount || '1000');
    if (PLEDGE_CATEGORIES.includes(initialCategory)) {
      setCategory(initialCategory);
    }
    setConsentConfirmed(false);
    setStartDate(toYmd(new Date()));
  }, [visible, initialAmount, initialCategory]);

  useEffect(() => {
    if (!visible || frequency !== 'event_wise') return;
    let mounted = true;
    setLoadingEvents(true);
    FirestoreService.getEvents()
      .then((list) => {
        if (!mounted) return;
        const sorted = [...(list || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        setEvents(sorted);
        if (sorted.length > 0 && !selectedEventId) {
          setSelectedEventId(sorted[0].id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoadingEvents(false);
      });
    return () => {
      mounted = false;
    };
  }, [visible, frequency]);

  const bg = isDark ? '#09090B' : colors.background || '#FAF7F2';
  const cardBg = isDark ? '#18181B' : colors.surface || '#FFFFFF';
  const borderCol = isDark ? '#27272A' : colors.border || '#E2E8F0';
  const textPrimary = isDark ? '#FFFFFF' : colors.text || '#0F172A';
  const textSecondary = isDark ? '#A1A1AA' : colors.textSecondary || '#64748B';
  const accent = isDark ? '#FCD34D' : colors.accent || '#0F766E';

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;

  const handleSubmit = async () => {
    if (!user?.uid) {
      Alert.alert('Sign In Required', 'Please sign in to submit a pledge.');
      return;
    }

    const numAmt = parseFloat(amount);
    if (!Number.isFinite(numAmt) || numAmt < 1) {
      Alert.alert('Invalid Amount', 'Please enter a pledge amount of at least ₹1.');
      return;
    }

    if (!isValidYmd(startDate)) {
      Alert.alert('Invalid Start Date', 'Please enter Start Date in YYYY-MM-DD format.');
      return;
    }

    if (endDate.trim() && !isValidYmd(endDate)) {
      Alert.alert('Invalid End Date', 'Please enter End Date in YYYY-MM-DD format or leave blank.');
      return;
    }

    if (endDate.trim() && endDate.trim() < startDate.trim()) {
      Alert.alert('Date Range Error', 'End Date cannot be earlier than Start Date.');
      return;
    }

    if (frequency === 'event_wise' && !selectedEvent) {
      Alert.alert('Select Event', 'Please select a church event for an Event-wise pledge.');
      return;
    }

    if (!consentConfirmed) {
      Alert.alert('Confirmation Required', 'Please confirm the pledge commitment checkbox before submitting.');
      return;
    }

    const finalCategory =
      category === 'Other' && customPurpose.trim()
        ? `Other: ${customPurpose.trim()}`
        : category;

    const eventDateYmd =
      frequency === 'event_wise' && selectedEvent?.date && isValidYmd(selectedEvent.date)
        ? selectedEvent.date.slice(0, 10)
        : '';

    const consentText =
      `I commit ₹${numAmt.toLocaleString('en-IN')} (${frequency.replace('_', '-')}) towards ${finalCategory} and agree to receive reminders. No automatic payment is charged without my explicit payment or Autopay authorization.`;

    setSubmitting(true);
    try {
      const pledgePayload: Record<string, any> = {
        churchId: effectiveChurchId,
        appId: effectiveChurchId,
        appName: churchName,
        memberUid: user.uid,
        memberName,
        memberPhone,
        memberEmail,
        givingGroup: finalCategory.toLowerCase().includes('tithe') ? 'Tithe' : 'Pledge',
        category: finalCategory,
        purpose: customPurpose.trim(),
        frequency,
        eventId: frequency === 'event_wise' ? selectedEvent?.id || null : null,
        eventTitle: frequency === 'event_wise' ? selectedEvent?.title || selectedEvent?.name || null : null,
        eventDate: eventDateYmd || null,
        pledgeAmount: numAmt,
        installmentAmount: numAmt,
        receivedAmount: 0,
        pendingAmount: numAmt,
        currency: 'INR',
        startDate: startDate.trim(),
        endDate: endDate.trim() || null,
        nextDueDate: eventDateYmd || startDate.trim(),
        reminderEnabled,
        linkedDonationIds: [],
        consentConfirmed: true,
        consentText,
        consentAcceptedAt: firestore.FieldValue.serverTimestamp(),
        status: 'active',
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await firestore()
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(effectiveChurchId)
        .collection('pledges')
        .add(pledgePayload);

      const savedPledge: SavedPledgePayload = {
        id: docRef.id,
        pledgeAmount: numAmt,
        category: finalCategory,
        frequency,
        eventId: frequency === 'event_wise' ? selectedEvent?.id : undefined,
        eventTitle: frequency === 'event_wise' ? (selectedEvent?.title || selectedEvent?.name) : undefined,
      };

      onPledgeCreated?.(savedPledge);

      Alert.alert(
        'Pledge Recorded',
        `Your ₹${numAmt.toLocaleString('en-IN')} ${finalCategory} pledge has been saved. Remember: pledges remain pending until payment is completed.`,
        [
          {
            text: 'Done',
            onPress: onClose,
          },
          ...(onPayFirstInstallment
            ? [
                {
                  text: 'Pay Now',
                  onPress: () => {
                    onClose();
                    onPayFirstInstallment(savedPledge);
                  },
                },
              ]
            : []),
        ]
      );
    } catch (err: any) {
      console.error('Failed to save pledge:', err);
      Alert.alert('Error', err?.message || 'Unable to save pledge. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: bg, borderColor: borderCol }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderCol }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.headerIcon, { backgroundColor: isDark ? 'rgba(252,211,77,0.14)' : '#FEF3C7' }]}>
                <HeartHandshake size={20} color={isDark ? '#FCD34D' : '#92400E'} />
              </View>
              <View>
                <Text style={[styles.title, { color: textPrimary }]}>Make a Faith Pledge</Text>
                <Text style={[styles.subtitle, { color: textSecondary }]}>Commitment tracked until payment</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Pledge Amount */}
            <Text style={[styles.label, { color: textSecondary }]}>PLEDGE AMOUNT (₹)</Text>
            <View style={styles.presetRow}>
              {AMOUNT_PRESETS.map((preset) => {
                const active = amount === String(preset);
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.presetChip,
                      { backgroundColor: cardBg, borderColor: active ? accent : borderCol },
                      active && { backgroundColor: isDark ? 'rgba(252,211,77,0.15)' : '#FEF3C7' },
                    ]}
                    onPress={() => setAmount(String(preset))}
                  >
                    <Text style={[styles.presetText, { color: active ? accent : textPrimary }]}>
                      ₹{preset.toLocaleString('en-IN')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.inputBox, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <Text style={[styles.rupeePrefix, { color: textSecondary }]}>₹</Text>
              <TextInput
                style={[styles.amountInput, { color: textPrimary }]}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                placeholder="Enter pledge amount"
                placeholderTextColor={textSecondary}
              />
            </View>

            {/* Category / Purpose */}
            <Text style={[styles.label, { color: textSecondary, marginTop: 14 }]}>PLEDGE PURPOSE / CATEGORY</Text>
            <View style={styles.chipWrap}>
              {PLEDGE_CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.choiceChip,
                      { backgroundColor: cardBg, borderColor: active ? accent : borderCol },
                      active && { backgroundColor: isDark ? 'rgba(252,211,77,0.15)' : '#FEF3C7' },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.choiceTxt, { color: active ? accent : textPrimary }]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={[styles.textInput, { backgroundColor: cardBg, borderColor: borderCol, color: textPrimary }]}
              value={customPurpose}
              onChangeText={setCustomPurpose}
              placeholder="Optional note or purpose (e.g., Building Fund pledge)"
              placeholderTextColor={textSecondary}
            />

            {/* Payment & Reminder Frequency */}
            <Text style={[styles.label, { color: textSecondary, marginTop: 14 }]}>REMINDER & PAYMENT FREQUENCY</Text>
            <View style={styles.chipWrap}>
              {FREQUENCIES.map((freq) => {
                const active = frequency === freq.id;
                return (
                  <TouchableOpacity
                    key={freq.id}
                    style={[
                      styles.choiceChip,
                      { backgroundColor: cardBg, borderColor: active ? accent : borderCol },
                      active && { backgroundColor: isDark ? 'rgba(252,211,77,0.15)' : '#FEF3C7' },
                    ]}
                    onPress={() => setFrequency(freq.id)}
                  >
                    <Text style={[styles.choiceTxt, { color: active ? accent : textPrimary }]}>{freq.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Event-wise picker */}
            {frequency === 'event_wise' && (
              <View style={[styles.eventBox, { backgroundColor: cardBg, borderColor: borderCol }]}>
                <Text style={[styles.subLabel, { color: textPrimary }]}>Select Church Event</Text>
                {loadingEvents ? (
                  <ActivityIndicator size="small" color={accent} style={{ marginVertical: 10 }} />
                ) : events.length === 0 ? (
                  <Text style={{ color: textSecondary, fontSize: 12 }}>
                    No events available. You can set a Start Date below.
                  </Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
                    {events.map((ev) => {
                      const active = selectedEventId === ev.id;
                      return (
                        <TouchableOpacity
                          key={ev.id}
                          style={[
                            styles.eventChip,
                            { backgroundColor: bg, borderColor: active ? accent : borderCol },
                          ]}
                          onPress={() => setSelectedEventId(ev.id)}
                        >
                          <Text style={[styles.eventTitle, { color: active ? accent : textPrimary }]} numberOfLines={1}>
                            {ev.title || ev.name}
                          </Text>
                          {!!ev.date && (
                            <Text style={{ color: textSecondary, fontSize: 11 }}>{ev.date}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Start Date & End Date */}
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: textSecondary }]}>START DATE</Text>
                <View style={[styles.dateInputWrap, { backgroundColor: cardBg, borderColor: borderCol }]}>
                  <Calendar size={14} color={textSecondary} />
                  <TextInput
                    style={[styles.dateInput, { color: textPrimary }]}
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={textSecondary}
                  />
                </View>
                <View style={styles.quickDateRow}>
                  <TouchableOpacity onPress={() => setStartDate(toYmd(new Date()))}>
                    <Text style={[styles.quickDateLink, { color: accent }]}>Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setStartDate(addDaysYmd(7))}>
                    <Text style={[styles.quickDateLink, { color: accent }]}>+7d</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: textSecondary }]}>END DATE (OPTIONAL)</Text>
                <View style={[styles.dateInputWrap, { backgroundColor: cardBg, borderColor: borderCol }]}>
                  <Calendar size={14} color={textSecondary} />
                  <TextInput
                    style={[styles.dateInput, { color: textPrimary }]}
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="Optional"
                    placeholderTextColor={textSecondary}
                  />
                </View>
                <View style={styles.quickDateRow}>
                  <TouchableOpacity onPress={() => setEndDate(addMonthsYmd(3))}>
                    <Text style={[styles.quickDateLink, { color: accent }]}>+3M</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEndDate(addMonthsYmd(12))}>
                    <Text style={[styles.quickDateLink, { color: accent }]}>+1Yr</Text>
                  </TouchableOpacity>
                  {!!endDate && (
                    <TouchableOpacity onPress={() => setEndDate('')}>
                      <Text style={[styles.quickDateLink, { color: '#ef4444' }]}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Member Details */}
            <View style={[styles.memberSummaryBox, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <Text style={[styles.label, { color: textSecondary, marginBottom: 4 }]}>MEMBER DETAILS</Text>
              <Text style={[styles.memberTxt, { color: textPrimary }]}>{memberName}</Text>
              {!!memberPhone && <Text style={{ color: textSecondary, fontSize: 12 }}>{memberPhone}</Text>}
              {!!memberEmail && <Text style={{ color: textSecondary, fontSize: 12 }}>{memberEmail}</Text>}
            </View>

            {/* Automatic Reminders Toggle */}
            <TouchableOpacity
              style={[styles.checkRow, { backgroundColor: cardBg, borderColor: borderCol }]}
              onPress={() => setReminderEnabled((prev) => !prev)}
              activeOpacity={0.8}
            >
              {reminderEnabled ? <CheckSquare size={20} color="#10b981" /> : <Square size={20} color={textSecondary} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkTitle, { color: textPrimary }]}>Send Automatic Push Reminders</Text>
                <Text style={{ color: textSecondary, fontSize: 11, marginTop: 2 }}>
                  Personal notifications sent directly to your device before each due date.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Explicit Pledge Consent Confirmation */}
            <TouchableOpacity
              style={[
                styles.checkRow,
                {
                  backgroundColor: consentConfirmed
                    ? isDark
                      ? 'rgba(16,185,129,0.12)'
                      : '#ECFDF5'
                    : cardBg,
                  borderColor: consentConfirmed ? '#10b981' : borderCol,
                },
              ]}
              onPress={() => setConsentConfirmed((prev) => !prev)}
              activeOpacity={0.8}
            >
              {consentConfirmed ? <CheckSquare size={20} color="#10b981" /> : <Square size={20} color={textSecondary} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkTitle, { color: textPrimary }]}>Consent Confirmation *</Text>
                <Text style={{ color: textSecondary, fontSize: 11, lineHeight: 16, marginTop: 2 }}>
                  I confirm this voluntary pledge commitment. A pledge is not counted as a completed donation and no automatic debit happens without my separate authorization.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: isDark ? '#FCD34D' : '#0F172A' },
                (!consentConfirmed || submitting) && { opacity: 0.55 },
              ]}
              onPress={handleSubmit}
              disabled={!consentConfirmed || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
              ) : (
                <>
                  <Check size={18} color={isDark ? '#000' : '#fff'} />
                  <Text style={[styles.submitTxt, { color: isDark ? '#000' : '#fff' }]}>
                    Submit Pledge Commitment
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  closeBtn: { padding: 6 },
  scrollBody: { padding: 20, paddingBottom: 32 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginBottom: 8 },
  subLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  presetChip: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  presetText: { fontSize: 13, fontWeight: '700' },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  rupeePrefix: { fontSize: 20, fontWeight: '700', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '800' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  choiceChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  choiceTxt: { fontSize: 12, fontWeight: '700' },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 13 },
  eventBox: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  eventChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 200 },
  eventTitle: { fontSize: 12, fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 14 },
  dateInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 44,
  },
  dateInput: { flex: 1, fontSize: 13, fontWeight: '600' },
  quickDateRow: { flexDirection: 'row', gap: 12, marginTop: 5, paddingLeft: 2 },
  quickDateLink: { fontSize: 11, fontWeight: '700' },
  memberSummaryBox: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  memberTxt: { fontSize: 14, fontWeight: '700' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  checkTitle: { fontSize: 13, fontWeight: '700' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    marginTop: 6,
  },
  submitTxt: { fontSize: 15, fontWeight: '800' },
});
