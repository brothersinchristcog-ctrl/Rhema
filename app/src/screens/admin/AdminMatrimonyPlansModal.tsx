import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Crown, Gift, Receipt, RefreshCw, Shield, X } from 'lucide-react-native';
import { useAdminTheme } from '../../utils/adminThemeHelper';
import {
  AdminMatrimonyPlansAndSubsResponse,
  AdminMatrimonyProfileSummary,
  MatrimonyPlanSpec,
  matrimonyApi,
} from '../../modules/matrimony';

const CORAL = '#E05A5A';
const GOLD = '#D97706';
const GREEN = '#16A34A';
const PURPLE = '#7C3AED';

type ModalTab = 'plans' | 'subscribers' | 'payments';

interface Props {
  visible: boolean;
  onClose: () => void;
  profiles?: AdminMatrimonyProfileSummary[];
}

export default function AdminMatrimonyPlansModal({ visible, onClose, profiles = [] }: Props) {
  const {
    isDark,
    screenBg,
    cardSurface,
    primaryText,
    secondaryText,
    borderColor,
    appFontFamily,
    scaleFont,
  } = useAdminTheme();

  const [activeTab, setActiveTab] = useState<ModalTab>('plans');
  const [loading, setLoading] = useState(false);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [data, setData] = useState<AdminMatrimonyPlansAndSubsResponse | null>(null);

  // Plan editor state
  const [editingPlan, setEditingPlan] = useState<MatrimonyPlanSpec | null>(null);
  const [priceStr, setPriceStr] = useState('');
  const [origPriceStr, setOrigPriceStr] = useState('');
  const [durationStr, setDurationStr] = useState('');
  const [interestLimitStr, setInterestLimitStr] = useState('');
  const [contactLimitStr, setContactLimitStr] = useState('');
  const [shortlistLimitStr, setShortlistLimitStr] = useState('');
  const [planIsActive, setPlanIsActive] = useState(true);

  // Complimentary grant state
  const [grantUid, setGrantUid] = useState('');
  const [grantTier, setGrantTier] = useState<'silver' | 'gold' | 'platinum'>('gold');
  const [grantMonthsStr, setGrantMonthsStr] = useState('3');
  const [grantNote, setGrantNote] = useState('');
  const [granting, setGranting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await matrimonyApi.adminGetPlansAndSubs();
      setData(res);
    } catch (err: any) {
      Alert.alert('Load Failed', err?.message || 'Unable to load plans and subscriptions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const startEditingPlan = (plan: MatrimonyPlanSpec) => {
    setEditingPlan(plan);
    setPriceStr(String(plan.priceInr));
    setOrigPriceStr(String(plan.originalPriceInr || plan.priceInr));
    setDurationStr(String(plan.durationMonths));
    setInterestLimitStr(String(plan.limits.monthlyInterestLimit));
    setContactLimitStr(String(plan.limits.contactNumberLimit));
    setShortlistLimitStr(String(plan.limits.shortlistLimit));
    setPlanIsActive(plan.isActive !== false);
  };

  const handleSavePlan = async () => {
    if (!editingPlan || savingPlanId) return;
    const priceInr = Math.max(1, Math.round(Number(priceStr) || editingPlan.priceInr));
    const originalPriceInr = Math.max(priceInr, Math.round(Number(origPriceStr) || priceInr));
    const durationMonths = Math.max(1, Math.min(36, Math.round(Number(durationStr) || editingPlan.durationMonths)));
    const monthlyInterestLimit = Number.isFinite(Number(interestLimitStr))
      ? Math.round(Number(interestLimitStr))
      : editingPlan.limits.monthlyInterestLimit;
    const contactNumberLimit = Number.isFinite(Number(contactLimitStr))
      ? Math.round(Number(contactLimitStr))
      : editingPlan.limits.contactNumberLimit;
    const shortlistLimit = Number.isFinite(Number(shortlistLimitStr))
      ? Math.round(Number(shortlistLimitStr))
      : editingPlan.limits.shortlistLimit;

    setSavingPlanId(editingPlan.planId);
    try {
      await matrimonyApi.adminUpsertPlan({
        planId: editingPlan.planId,
        priceInr,
        originalPriceInr,
        durationMonths,
        isActive: planIsActive,
        limits: {
          ...editingPlan.limits,
          monthlyInterestLimit,
          contactNumberLimit,
          shortlistLimit,
        },
      });
      setEditingPlan(null);
      await loadData();
      Alert.alert('Plan Updated', `${editingPlan.planName} settings saved successfully.`);
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update plan.');
    } finally {
      setSavingPlanId(null);
    }
  };

  const handleGrant = async () => {
    const targetUid = grantUid.trim();
    if (!targetUid) {
      Alert.alert('Member Required', 'Enter or select a member UID to grant complimentary access.');
      return;
    }
    const durationMonths = Math.max(1, Math.min(36, Math.round(Number(grantMonthsStr) || 3)));
    setGranting(true);
    try {
      await matrimonyApi.adminGrantComplimentarySubscription({
        targetUid,
        planId: grantTier,
        tier: grantTier,
        durationMonths,
        note: grantNote.trim() || 'Complimentary grant by Admin',
        action: 'grant',
      });
      setGrantUid('');
      setGrantNote('');
      await loadData();
      Alert.alert('Granted', `${grantTier.toUpperCase()} access (${durationMonths} mo) granted.`);
    } catch (err: any) {
      Alert.alert('Grant Failed', err?.message || 'Unable to grant subscription.');
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = (uid: string) => {
    Alert.alert(
      'Revoke Subscription',
      `Revert member ${uid.slice(0, 8)}... back to Free tier immediately?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await matrimonyApi.adminGrantComplimentarySubscription({
                targetUid: uid,
                action: 'revoke',
              });
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to revoke subscription.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (ms: number | null | undefined) => {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const profileNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      if (p?.uid && p?.displayName) map.set(p.uid, p.displayName);
    }
    return map;
  }, [profiles]);

  const nameByUid = useCallback(
    (uid: string) => profileNameMap.get(uid) || `${uid.slice(0, 10)}...`,
    [profileNameMap]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <View style={styles.headerLeft}>
            <Crown size={20} color={GOLD} />
            <Text style={[styles.headerTitle, { color: primaryText, fontFamily: appFontFamily, fontSize: scaleFont(17) }]}>
              Plans & Subscriptions
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: cardSurface, borderColor }]}
              onPress={loadData}
            >
              <RefreshCw size={17} color={primaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: cardSurface, borderColor }]}
              onPress={onClose}
            >
              <X size={18} color={primaryText} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Sub-tabs */}
        <View style={[styles.tabRow, { borderBottomColor: borderColor }]}>
          {(
            [
              { key: 'plans', label: 'Plans & Pricing' },
              { key: 'subscribers', label: `Subscribers (${data?.summary.activeCount ?? 0})` },
              { key: 'payments', label: `Payments (${data?.paymentHistory.length ?? 0})` },
            ] as { key: ModalTab; label: string }[]
          ).map((t) => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tabBtn, active && { borderBottomColor: CORAL, borderBottomWidth: 2.5 }]}
                onPress={() => setActiveTab(t.key)}
              >
                <Text
                  style={[
                    styles.tabTxt,
                    { color: active ? CORAL : secondaryText, fontWeight: active ? '800' : '600', fontFamily: appFontFamily },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={CORAL} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* KPI Summary Row */}
            {data?.summary ? (
              <View style={styles.kpiGrid}>
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.kpiVal, { color: GREEN }]}>{data.summary.activeCount}</Text>
                  <Text style={[styles.kpiLbl, { color: secondaryText }]}>Active</Text>
                </View>
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.kpiVal, { color: '#64748B' }]}>{data.summary.silverActive}</Text>
                  <Text style={[styles.kpiLbl, { color: secondaryText }]}>Silver</Text>
                </View>
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.kpiVal, { color: GOLD }]}>{data.summary.goldActive}</Text>
                  <Text style={[styles.kpiLbl, { color: secondaryText }]}>Gold</Text>
                </View>
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.kpiVal, { color: PURPLE }]}>{data.summary.platinumActive}</Text>
                  <Text style={[styles.kpiLbl, { color: secondaryText }]}>Platinum</Text>
                </View>
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.kpiVal, { color: primaryText }]}>₹{data.summary.totalRevenueInr}</Text>
                  <Text style={[styles.kpiLbl, { color: secondaryText }]}>Revenue</Text>
                </View>
              </View>
            ) : null}

            {activeTab === 'plans' ? (
              <View style={{ gap: 12 }}>
                {(data?.plans || []).map((plan) => (
                  <View key={plan.planId} style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                    <View style={styles.cardRowBetween}>
                      <View>
                        <Text style={[styles.planTitle, { color: primaryText, fontFamily: appFontFamily }]}>
                          {plan.planName} ({plan.durationMonths} mo) · ₹{plan.priceInr}
                        </Text>
                        <Text style={[styles.subText, { color: secondaryText, fontFamily: appFontFamily }]}>
                          Interests: {plan.limits.monthlyInterestLimit < 0 ? 'Unlimited' : `${plan.limits.monthlyInterestLimit}/mo`} · Contacts: {plan.limits.contactNumberLimit < 0 ? 'Unlimited' : plan.limits.contactNumberLimit} · Shortlists: {plan.limits.shortlistLimit}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.editBtn, { borderColor }]}
                        onPress={() => startEditingPlan(plan)}
                      >
                        <Text style={[styles.editBtnTxt, { color: CORAL }]}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.chipRow}>
                      <View style={[styles.chip, { backgroundColor: plan.isActive ? 'rgba(22,163,74,0.14)' : 'rgba(220,38,38,0.14)' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: plan.isActive ? GREEN : '#DC2626' }}>
                          {plan.isActive ? 'Active' : 'Disabled'}
                        </Text>
                      </View>
                      {plan.limits.advancedFilters ? (
                        <View style={[styles.chip, { backgroundColor: 'rgba(217,119,6,0.14)' }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: GOLD }}>Advanced Filters</Text>
                        </View>
                      ) : null}
                      <View style={[styles.chip, { backgroundColor: 'rgba(124,58,237,0.12)' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: PURPLE }}>
                          Priority +{plan.limits.visibilityPriority}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}

                {editingPlan ? (
                  <View style={[styles.card, { backgroundColor: cardSurface, borderColor: CORAL }]}>
                    <Text style={[styles.planTitle, { color: primaryText, marginBottom: 8 }]}>
                      Edit {editingPlan.planName} Plan
                    </Text>
                    <View style={styles.inputGrid}>
                      <View style={styles.inputCol}>
                        <Text style={[styles.lbl, { color: secondaryText }]}>Price (₹ INR)</Text>
                        <TextInput
                          value={priceStr}
                          onChangeText={setPriceStr}
                          keyboardType="numeric"
                          style={[styles.input, { color: primaryText, borderColor }]}
                        />
                      </View>
                      <View style={styles.inputCol}>
                        <Text style={[styles.lbl, { color: secondaryText }]}>Strike Price (₹)</Text>
                        <TextInput
                          value={origPriceStr}
                          onChangeText={setOrigPriceStr}
                          keyboardType="numeric"
                          style={[styles.input, { color: primaryText, borderColor }]}
                        />
                      </View>
                      <View style={styles.inputCol}>
                        <Text style={[styles.lbl, { color: secondaryText }]}>Duration (Months)</Text>
                        <TextInput
                          value={durationStr}
                          onChangeText={setDurationStr}
                          keyboardType="numeric"
                          style={[styles.input, { color: primaryText, borderColor }]}
                        />
                      </View>
                    </View>
                    <View style={styles.inputGrid}>
                      <View style={styles.inputCol}>
                        <Text style={[styles.lbl, { color: secondaryText }]}>Interests (-1 Unlim)</Text>
                        <TextInput
                          value={interestLimitStr}
                          onChangeText={setInterestLimitStr}
                          keyboardType="numbers-and-punctuation"
                          style={[styles.input, { color: primaryText, borderColor }]}
                        />
                      </View>
                      <View style={styles.inputCol}>
                        <Text style={[styles.lbl, { color: secondaryText }]}>Contacts (-1 Unlim)</Text>
                        <TextInput
                          value={contactLimitStr}
                          onChangeText={setContactLimitStr}
                          keyboardType="numbers-and-punctuation"
                          style={[styles.input, { color: primaryText, borderColor }]}
                        />
                      </View>
                      <View style={styles.inputCol}>
                        <Text style={[styles.lbl, { color: secondaryText }]}>Shortlist Limit</Text>
                        <TextInput
                          value={shortlistLimitStr}
                          onChangeText={setShortlistLimitStr}
                          keyboardType="numeric"
                          style={[styles.input, { color: primaryText, borderColor }]}
                        />
                      </View>
                    </View>
                    <View style={[styles.cardRowBetween, { marginTop: 10 }]}>
                      <Text style={{ color: primaryText, fontWeight: '700' }}>Plan Visible & Active</Text>
                      <Switch value={planIsActive} onValueChange={setPlanIsActive} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <TouchableOpacity
                        style={[styles.editBtn, { flex: 1, alignItems: 'center', borderColor }]}
                        onPress={() => setEditingPlan(null)}
                      >
                        <Text style={{ color: secondaryText, fontWeight: '700' }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.saveBtn, { flex: 1.5 }]}
                        onPress={handleSavePlan}
                        disabled={savingPlanId === editingPlan.planId}
                      >
                        {savingPlanId === editingPlan.planId ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Check size={16} color="#FFFFFF" />
                            <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Save Plan</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {activeTab === 'subscribers' ? (
              <View style={{ gap: 12 }}>
                {/* Grant Complimentary Subscription Card */}
                <View style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Gift size={17} color={CORAL} />
                    <Text style={[styles.planTitle, { color: primaryText }]}>Grant Complimentary Plan</Text>
                  </View>
                  <Text style={[styles.lbl, { color: secondaryText }]}>Member UID</Text>
                  <TextInput
                    value={grantUid}
                    onChangeText={setGrantUid}
                    placeholder="Paste user UID or tap approved member below"
                    placeholderTextColor={secondaryText}
                    style={[styles.input, { color: primaryText, borderColor, marginBottom: 8 }]}
                  />
                  {profiles.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {profiles
                          .filter((p) => p.profileStatus === 'approved')
                          .slice(0, 12)
                          .map((p) => (
                            <TouchableOpacity
                              key={p.uid}
                              style={[
                                styles.pickChip,
                                {
                                  borderColor: grantUid === p.uid ? CORAL : borderColor,
                                  backgroundColor: isDark ? '#27272A' : '#F8FAFC',
                                },
                              ]}
                              onPress={() => setGrantUid(p.uid)}
                            >
                              <Text style={{ fontSize: 11.5, color: primaryText, fontWeight: '600' }}>
                                {p.displayName}
                              </Text>
                            </TouchableOpacity>
                          ))}
                      </View>
                    </ScrollView>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    {(['silver', 'gold', 'platinum'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.tierPickBtn,
                          {
                            borderColor: grantTier === t ? CORAL : borderColor,
                            backgroundColor: grantTier === t ? 'rgba(224,90,90,0.12)' : 'transparent',
                          },
                        ]}
                        onPress={() => setGrantTier(t)}
                      >
                        <Text style={{ color: grantTier === t ? CORAL : primaryText, fontWeight: '700', fontSize: 12 }}>
                          {t.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.inputGrid}>
                    <View style={[styles.inputCol, { flex: 0.7 }]}>
                      <Text style={[styles.lbl, { color: secondaryText }]}>Months</Text>
                      <TextInput
                        value={grantMonthsStr}
                        onChangeText={setGrantMonthsStr}
                        keyboardType="numeric"
                        style={[styles.input, { color: primaryText, borderColor }]}
                      />
                    </View>
                    <View style={[styles.inputCol, { flex: 1.5 }]}>
                      <Text style={[styles.lbl, { color: secondaryText }]}>Admin Note</Text>
                      <TextInput
                        value={grantNote}
                        onChangeText={setGrantNote}
                        placeholder="Optional note"
                        placeholderTextColor={secondaryText}
                        style={[styles.input, { color: primaryText, borderColor }]}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, { marginTop: 10 }]}
                    onPress={handleGrant}
                    disabled={granting}
                  >
                    {granting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Shield size={16} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Activate Complimentary Plan</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {(data?.subscriptions || []).map((sub) => (
                  <View key={sub.uid} style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                    <View style={styles.cardRowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.planTitle, { color: primaryText }]}>
                          {nameByUid(sub.uid)} · {sub.planName}
                        </Text>
                        <Text style={[styles.subText, { color: secondaryText }]}>
                          Status: {sub.status.toUpperCase()} · {formatDate(sub.startDateMs)} → {formatDate(sub.expiryDateMs)}
                        </Text>
                        <Text style={[styles.subText, { color: secondaryText }]}>
                          Source: {sub.source} · Paid ₹{sub.amountInr} {sub.note ? `· ${sub.note}` : ''}
                        </Text>
                      </View>
                      {sub.status === 'active' ? (
                        <TouchableOpacity
                          style={[styles.editBtn, { borderColor: '#FCA5A5' }]}
                          onPress={() => handleRevoke(sub.uid)}
                        >
                          <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12 }}>Revoke</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {activeTab === 'payments' ? (
              <View style={{ gap: 10 }}>
                {(data?.paymentHistory || []).length === 0 ? (
                  <Text style={{ color: secondaryText, textAlign: 'center', marginTop: 24 }}>
                    No payment records yet.
                  </Text>
                ) : (
                  (data?.paymentHistory || []).map((pay) => (
                    <View key={pay.id} style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                      <View style={styles.cardRowBetween}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <Receipt size={17} color={GOLD} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.planTitle, { color: primaryText }]}>
                              {nameByUid(pay.uid)} · {pay.tier.toUpperCase()} · ₹{pay.amountInr}
                            </Text>
                            <Text style={[styles.subText, { color: secondaryText }]}>
                              {pay.status.toUpperCase()} ({pay.source}) · {formatDate(pay.createdAtMs)}
                            </Text>
                            {pay.paymentId ? (
                              <Text style={[styles.subText, { color: secondaryText }]} numberOfLines={1}>
                                Razorpay: {pay.paymentId}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontWeight: '800' },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
  },
  tabTxt: { fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 14, gap: 12, paddingBottom: 36 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: {
    flexGrow: 1,
    minWidth: '17%',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  kpiVal: { fontSize: 16, fontWeight: '900' },
  kpiLbl: { fontSize: 11, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 6 },
  cardRowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  planTitle: { fontSize: 14.5, fontWeight: '800' },
  subText: { fontSize: 12, lineHeight: 17 },
  editBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnTxt: { fontWeight: '700', fontSize: 12.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  inputGrid: { flexDirection: 'row', gap: 8, marginTop: 4 },
  inputCol: { flex: 1 },
  lbl: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: CORAL,
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pickChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  tierPickBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
});
