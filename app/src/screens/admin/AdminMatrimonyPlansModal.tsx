import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  Gift,
  Plus,
  Receipt,
  Share2,
  Shield,
  Trash2,
} from 'lucide-react-native';
import { useAdminTheme } from '../../utils/adminThemeHelper';
import {
  AdminMatrimonyPlansAndSubsResponse,
  AdminMatrimonyProfileSummary,
  AdminPaymentHistoryItem,
  MatrimonyPlanSpec,
  MatrimonyPlanCarousel,
  matrimonyApi,
} from '../../modules/matrimony';

const CORAL = '#E05A5A';
const GOLD = '#D97706';
const GREEN = '#16A34A';
const PURPLE = '#7C3AED';
const REVENUE_3D_ICON = require('../../../assets/matrimony_revenue_3d.png');

const MONTH_PRESETS = [1, 3, 6, 9, 12, 24] as const;
const DISCOUNT_PRESETS = [0, 10, 20, 30, 40, 50, 60] as const;

type ModalTab = 'plans' | 'subscribers' | 'payments';

interface Props {
  visible: boolean;
  onClose: () => void;
  profiles?: AdminMatrimonyProfileSummary[];
}

export default function AdminMatrimonyPlansModal({ visible, onClose, profiles = [] }: Props) {
  const insets = useSafeAreaInsets();
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
  const [subscriberFilter, setSubscriberFilter] = useState<'active' | 'expired'>('active');
  const [selectedKpiTier, setSelectedKpiTier] = useState<'all' | 'silver' | 'gold' | 'platinum'>('all');
  const [grantModalVisible, setGrantModalVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentHistoryItem | null>(null);
  const [exportingInvoice, setExportingInvoice] = useState<'share' | 'download' | null>(null);
  const [selectedCarouselTier, setSelectedCarouselTier] = useState<'silver' | 'gold' | 'platinum'>('gold');
  const [loading, setLoading] = useState(false);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [data, setData] = useState<AdminMatrimonyPlansAndSubsResponse | null>(null);

  // Full-screen plan editor state
  const [editingPlan, setEditingPlan] = useState<MatrimonyPlanSpec | null>(null);
  const [planNameStr, setPlanNameStr] = useState('');
  const [taglineStr, setTaglineStr] = useState('');
  const [badgeTextStr, setBadgeTextStr] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [origPriceStr, setOrigPriceStr] = useState('');
  const [discountStr, setDiscountStr] = useState('0');
  const [durationStr, setDurationStr] = useState('');
  const [benefitsDraft, setBenefitsDraft] = useState<string[]>([]);
  const [interestUnlimited, setInterestUnlimited] = useState(true);
  const [interestLimitStr, setInterestLimitStr] = useState('');
  const [contactUnlimited, setContactUnlimited] = useState(false);
  const [contactLimitStr, setContactLimitStr] = useState('');
  const [shortlistUnlimited, setShortlistUnlimited] = useState(false);
  const [shortlistLimitStr, setShortlistLimitStr] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState(false);
  const [messageAccess, setMessageAccess] = useState(true);
  const [callAccess, setCallAccess] = useState(true);
  const [prioritySupport, setPrioritySupport] = useState(false);
  const [visibilityPriority, setVisibilityPriority] = useState(1);
  const [highlightStyle, setHighlightStyle] = useState<'none' | 'gold' | 'platinum'>('none');
  const [planIsActive, setPlanIsActive] = useState(true);

  // Complimentary grant state
  const [grantUid, setGrantUid] = useState('');
  const [grantSearchQuery, setGrantSearchQuery] = useState('');
  const [grantProfiles, setGrantProfiles] = useState<AdminMatrimonyProfileSummary[]>([]);
  const [grantProfilesLoading, setGrantProfilesLoading] = useState(false);
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

  useEffect(() => {
    if (!grantModalVisible) return;
    let cancelled = false;
    const q = grantSearchQuery.trim();
    const timer = setTimeout(async () => {
      setGrantProfilesLoading(true);
      try {
        const res = await matrimonyApi.getAdminProfiles('approved', q || undefined);
        if (!cancelled && Array.isArray(res?.profiles)) {
          setGrantProfiles(res.profiles);
        }
      } catch {
        // Fallback to parent profiles prop
      } finally {
        if (!cancelled) setGrantProfilesLoading(false);
      }
    }, q ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [grantModalVisible, grantSearchQuery]);

  const startEditingPlan = (plan: MatrimonyPlanSpec) => {
    const orig = Math.max(plan.priceInr, plan.originalPriceInr || plan.priceInr);
    const derivedDisc =
      typeof plan.discountPercentage === 'number' && plan.discountPercentage >= 0
        ? plan.discountPercentage
        : orig > plan.priceInr
        ? Math.round(((orig - plan.priceInr) / orig) * 100)
        : 0;

    setEditingPlan(plan);
    setPlanNameStr(plan.planName || '');
    setTaglineStr(plan.tagline || '');
    setBadgeTextStr(plan.badgeText || '');
    setPriceStr(String(plan.priceInr));
    setOrigPriceStr(String(orig));
    setDiscountStr(String(derivedDisc));
    setDurationStr(String(plan.durationMonths || 3));
    setBenefitsDraft(
      Array.isArray(plan.benefits) && plan.benefits.length > 0 ? [...plan.benefits] : ['']
    );
    const intLim = plan.limits.monthlyInterestLimit;
    setInterestUnlimited(intLim < 0);
    setInterestLimitStr(intLim < 0 ? '50' : String(intLim));
    const conLim = plan.limits.contactNumberLimit;
    setContactUnlimited(conLim < 0);
    setContactLimitStr(conLim < 0 ? '50' : String(conLim));
    const shortLim = plan.limits.shortlistLimit ?? 25;
    setShortlistUnlimited(shortLim < 0);
    setShortlistLimitStr(shortLim < 0 ? '25' : String(shortLim));
    setAdvancedFilters(Boolean(plan.limits.advancedFilters));
    setMessageAccess(plan.limits.messageAccess !== false);
    setCallAccess(plan.limits.callAccess !== false);
    setPrioritySupport(Boolean(plan.limits.prioritySupport));
    setVisibilityPriority(Number(plan.limits.visibilityPriority || 0));
    setHighlightStyle(plan.limits.highlightStyle || 'none');
    setPlanIsActive(plan.isActive !== false);
  };

  // Bi-directional offer math handlers
  const handleOriginalPriceChange = (val: string) => {
    setOrigPriceStr(val);
    const orig = Number(val);
    const sell = Number(priceStr);
    if (Number.isFinite(orig) && orig > 0 && Number.isFinite(sell) && sell > 0) {
      if (orig > sell) {
        setDiscountStr(String(Math.min(95, Math.round(((orig - sell) / orig) * 100))));
      } else {
        setDiscountStr('0');
      }
    }
  };

  const handleSellingPriceChange = (val: string) => {
    setPriceStr(val);
    const sell = Number(val);
    const orig = Number(origPriceStr);
    if (Number.isFinite(sell) && sell > 0 && Number.isFinite(orig) && orig > 0) {
      if (orig > sell) {
        setDiscountStr(String(Math.min(95, Math.round(((orig - sell) / orig) * 100))));
      } else {
        setDiscountStr('0');
      }
    }
  };

  const applyDiscountPercentage = (pctRaw: number | string) => {
    const cleanStr = typeof pctRaw === 'number' ? String(pctRaw) : pctRaw;
    setDiscountStr(cleanStr);
    const pct = Number(pctRaw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 95) return;
    const baseOrig = Math.max(1, Number(origPriceStr) || Number(priceStr) || 1);
    if (!origPriceStr || Number(origPriceStr) <= 0) {
      setOrigPriceStr(String(baseOrig));
    }
    const nextPrice = pct === 0 ? baseOrig : Math.max(1, Math.round(baseOrig * (1 - pct / 100)));
    setPriceStr(String(nextPrice));
  };

  const handleSelectDurationMonths = (months: number) => {
    setDurationStr(String(months));
    const unit = months === 1 ? 'month' : 'months';
    setBenefitsDraft((prev) =>
      prev.map((line) =>
        /^valid for\s+\d+\s+months?/i.test(line.trim())
          ? `Valid for ${months} ${unit}`
          : line
      )
    );
  };

  const applyLimitsToBenefitLines = (
    lines: string[],
    opts?: {
      months?: number;
      contactUnlimited?: boolean;
      contactLimit?: number;
      shortlistUnlimited?: boolean;
      shortlistLimit?: number;
      advancedFilters?: boolean;
      prioritySupport?: boolean;
    }
  ): string[] => {
    const months = Math.max(
      1,
      Math.min(36, Math.round(opts?.months ?? (Number(durationStr) || 3)))
    );
    const monthLabel = months === 1 ? 'month' : 'months';
    const isContactUnlim = opts?.contactUnlimited ?? contactUnlimited;
    const contactVal = Math.max(
      0,
      Math.round(opts?.contactLimit ?? (Number(contactLimitStr) || 20))
    );
    const isShortlistUnlim = opts?.shortlistUnlimited ?? shortlistUnlimited;
    const shortlistVal = Math.max(
      1,
      Math.round(opts?.shortlistLimit ?? (Number(shortlistLimitStr) || 25))
    );
    const hasAdv = opts?.advancedFilters ?? advancedFilters;
    const hasPrio = opts?.prioritySupport ?? prioritySupport;

    const phoneLine = isContactUnlim
      ? 'View unlimited Phone Nos & DOB'
      : `View ${contactVal} Phone Nos & DOB`;
    const shortlistBase = isShortlistUnlim
      ? 'Unlimited Shortlists'
      : `Shortlist up to ${shortlistVal} profiles`;
    const shortlistLine =
      editingPlan?.tier === 'platinum' || hasPrio
        ? `${shortlistBase} & Priority Spotlight`
        : hasAdv
        ? `${shortlistBase} & Advanced Filters`
        : shortlistBase;

    let updatedValid = false;
    let updatedPhone = false;
    let updatedShortlist = false;
    const mapped = lines.map((line) => {
      const trimmed = line.trim();
      if (/^valid for\s+\d+\s+months?/i.test(trimmed)) {
        updatedValid = true;
        return `Valid for ${months} ${monthLabel}`;
      }
      if (/^view\s+(\d+|unlimited)\s+phone/i.test(trimmed)) {
        updatedPhone = true;
        return phoneLine;
      }
      if (/^(shortlist\s+up\s+to\s+\d+|unlimited\s+shortlists?)/i.test(trimmed)) {
        updatedShortlist = true;
        return shortlistLine;
      }
      return line;
    });
    if (!updatedValid) mapped.unshift(`Valid for ${months} ${monthLabel}`);
    if (!updatedPhone) mapped.push(phoneLine);
    if (!updatedShortlist) mapped.push(shortlistLine);
    return mapped;
  };

  const syncMonthsAndContactsIntoBenefits = () => {
    setBenefitsDraft((prev) => applyLimitsToBenefitLines(prev));
  };

  const handleSavePlan = async () => {
    if (!editingPlan || savingPlanId) return;
    const priceInr = Math.max(1, Math.round(Number(priceStr) || editingPlan.priceInr));
    const originalPriceInr = Math.max(priceInr, Math.round(Number(origPriceStr) || priceInr));
    const discountPercentage =
      originalPriceInr > priceInr
        ? Math.min(
            95,
            Math.max(
              0,
              Math.round(
                Number.isFinite(Number(discountStr)) && Number(discountStr) > 0
                  ? Number(discountStr)
                  : ((originalPriceInr - priceInr) / originalPriceInr) * 100
              )
            )
          )
        : 0;
    const durationMonths = Math.max(
      1,
      Math.min(36, Math.round(Number(durationStr) || editingPlan.durationMonths || 3))
    );
    const monthlyInterestLimit = interestUnlimited
      ? -1
      : Math.max(1, Math.round(Number(interestLimitStr) || 20));
    const contactNumberLimit = contactUnlimited
      ? -1
      : Math.max(0, Math.round(Number(contactLimitStr) || 20));
    const shortlistLimit = shortlistUnlimited
      ? -1
      : Math.max(1, Math.round(Number(shortlistLimitStr) || 25));

    const rawBenefits = benefitsDraft
      .map((b) => b.trim())
      .filter((b) => b.length > 0 && !b.toLowerCase().includes('whatsapp'));

    if (rawBenefits.length === 0) {
      Alert.alert('Benefits Required', 'Please keep at least one feature line for this plan card.');
      return;
    }

    const cleanBenefits = applyLimitsToBenefitLines(rawBenefits, {
      months: durationMonths,
      contactUnlimited,
      contactLimit: contactUnlimited ? 20 : contactNumberLimit,
      shortlistUnlimited,
      shortlistLimit: shortlistUnlimited ? 25 : shortlistLimit,
      advancedFilters,
      prioritySupport,
    });

    setSavingPlanId(editingPlan.planId);
    try {
      const res = await matrimonyApi.adminUpsertPlan({
        planId: editingPlan.planId,
        planName: planNameStr.trim() || editingPlan.planName,
        tagline: taglineStr.trim() || editingPlan.tagline,
        badgeText: badgeTextStr.trim(),
        priceInr,
        originalPriceInr,
        discountPercentage,
        durationMonths,
        benefits: cleanBenefits,
        isActive: planIsActive,
        limits: {
          ...editingPlan.limits,
          monthlyInterestLimit,
          contactNumberLimit,
          shortlistLimit,
          advancedFilters,
          messageAccess,
          callAccess,
          whatsappAccess: false,
          prioritySupport,
          visibilityPriority,
          highlightStyle,
        },
      });
      if (res?.plan) {
        setData((prev) => {
          if (!prev) return prev;
          const idx = prev.plans.findIndex(
            (p) => p.planId === res.plan.planId || p.tier === res.plan.tier
          );
          const nextPlans = (
            idx >= 0
              ? prev.plans.map((p, i) => (i === idx ? res.plan : p))
              : [...prev.plans, res.plan]
          ).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
          return { ...prev, plans: nextPlans };
        });
      }
      const savedTier = editingPlan.tier;
      const savedName = planNameStr.trim() || editingPlan.planName;
      setSelectedCarouselTier(savedTier);
      setEditingPlan(null);
      loadData();
      Alert.alert(
        'Plan Published',
        `${savedName} updated! Rhema Matrimony Upgrade screen now reflects these live settings.`
      );
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update plan.');
    } finally {
      setSavingPlanId(null);
    }
  };

  const getProfileCode = (p: AdminMatrimonyProfileSummary): string =>
    String(p.matrimonyId || p.profileCode || `RM${p.uid.slice(0, 7).toUpperCase()}`)
      .trim()
      .toUpperCase();

  const mergedGrantCandidates = (() => {
    const map = new Map<string, AdminMatrimonyProfileSummary>();
    [...grantProfiles, ...profiles].forEach((p) => {
      if (p?.uid && p.profileStatus === 'approved' && !map.has(p.uid)) {
        map.set(p.uid, p);
      }
    });
    const q = grantSearchQuery.trim().toLowerCase();
    const list = Array.from(map.values());
    if (!q) return list;
    return list.filter((p) => {
      const code = getProfileCode(p).toLowerCase();
      const name = String(p.displayName || '').toLowerCase();
      return name.includes(q) || code.includes(q) || p.uid.toLowerCase().includes(q);
    });
  })();

  const selectedGrantProfile = (() => {
    if (!grantUid) return null;
    return (
      grantProfiles.find((p) => p.uid === grantUid) ||
      profiles.find((p) => p.uid === grantUid) ||
      null
    );
  })();

  const handleGrant = async () => {
    const queryTrim = grantSearchQuery.trim();
    const queryUpper = queryTrim.toUpperCase();
    const exactMatch =
      !grantUid && queryTrim
        ? mergedGrantCandidates.find(
            (p) => getProfileCode(p) === queryUpper || p.uid === queryTrim
          )
        : null;
    const targetIdentifier = (grantUid || exactMatch?.uid || queryTrim).trim();
    if (!targetIdentifier) {
      Alert.alert(
        'Member Required',
        'Search by member name or paste their Rhema Matrimony Profile ID (e.g. RM...) to select a member.'
      );
      return;
    }
    const durationMonths = Math.max(1, Math.min(36, Math.round(Number(grantMonthsStr) || 3)));
    setGranting(true);
    try {
      await matrimonyApi.adminGrantComplimentarySubscription({
        targetUid: targetIdentifier,
        planId: grantTier,
        tier: grantTier,
        durationMonths,
        note: grantNote.trim() || 'Complimentary grant by Admin',
        action: 'grant',
      });
      setGrantUid('');
      setGrantSearchQuery('');
      setGrantNote('');
      setGrantModalVisible(false);
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

  const formatDateTime = (ms: number | null | undefined) => {
    if (!ms) return '—';
    const d = new Date(ms);
    return `${d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })} · ${d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  const profileByUidMap = useMemo(() => {
    const map = new Map<string, AdminMatrimonyProfileSummary>();
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      if (p?.uid && !map.has(p.uid)) map.set(p.uid, p);
    }
    for (let i = 0; i < grantProfiles.length; i++) {
      const p = grantProfiles[i];
      if (p?.uid) map.set(p.uid, p);
    }
    return map;
  }, [grantProfiles, profiles]);

  const subscriptionByUidMap = useMemo(() => {
    const map = new Map<string, any>();
    const subs = data?.subscriptions || [];
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      if (s?.uid && !map.has(s.uid)) map.set(s.uid, s);
    }
    return map;
  }, [data?.subscriptions]);

  const findProfileByUid = useCallback(
    (uid: string) => profileByUidMap.get(uid) || null,
    [profileByUidMap]
  );

  const findSubscriptionByUid = useCallback(
    (uid: string) => subscriptionByUidMap.get(uid) || null,
    [subscriptionByUidMap]
  );

  const nameByUid = useCallback(
    (uid: string, fallbackName?: string | null) => {
      if (fallbackName && fallbackName.trim()) return fallbackName.trim();
      const subName = subscriptionByUidMap.get(uid)?.memberName;
      if (subName && subName.trim()) return subName.trim();
      const found = profileByUidMap.get(uid);
      return found?.displayName || `${uid.slice(0, 10)}...`;
    },
    [profileByUidMap, subscriptionByUidMap]
  );

  const codeByUid = (uid: string, fallbackCode?: string | null) => {
    if (fallbackCode && fallbackCode.trim()) return fallbackCode.trim().toUpperCase();
    const subCode = findSubscriptionByUid(uid)?.memberProfileCode;
    if (subCode && subCode.trim()) return subCode.trim().toUpperCase();
    const found = findProfileByUid(uid);
    if (found) return getProfileCode(found);
    return `RM${uid.slice(0, 7).toUpperCase()}`;
  };

  const cityByUid = (uid: string, fallbackCity?: string | null) => {
    if (fallbackCity && fallbackCity.trim()) return fallbackCity.trim();
    const subCity = findSubscriptionByUid(uid)?.memberCity;
    if (subCity && subCity.trim()) return subCity.trim();
    const found = findProfileByUid(uid);
    if (found?.location) {
      const parts = [found.location.village, found.location.city, found.location.state]
        .map((v) => String(v || '').trim())
        .filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i);
      if (parts.length > 0) return parts.slice(0, 2).join(', ');
    }
    return '—';
  };

  const phoneByUid = (uid: string, fallbackPhone?: string | null) => {
    if (fallbackPhone && fallbackPhone.trim()) return fallbackPhone.trim();
    const subPhone = findSubscriptionByUid(uid)?.memberPhone;
    if (subPhone && subPhone.trim()) return subPhone.trim();
    return '—';
  };

  const escapeHtml = (val: string) =>
    val
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const handleExportInvoice = async (
    mode: 'share' | 'download',
    params: {
      invoiceNo: string;
      issuedDateStr: string;
      statusText: string;
      isPaid: boolean;
      memberName: string;
      profileCode: string;
      mobileNumber: string;
      cityLocation: string;
      planLabel: string;
      durationText: string;
      activatedOn: string;
      expiresOn: string;
      validityStatus: string;
      amountInr: number;
      paymentMode: string;
      paymentId: string | null;
      orderId: string | null;
      note: string | null;
    }
  ) => {
    if (exportingInvoice) return;
    setExportingInvoice(mode);
    try {
      const amountFormatted = `₹${Number(params.amountInr || 0).toLocaleString('en-IN')}`;
      const statusColor = params.isPaid ? '#15803D' : '#6D28D9';
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
  body { margin: 0; padding: 28px; background: #FFFFFF; color: #0F172A; }
  .a4-sheet { background: #FFFFFF; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 20px; border-bottom: 1.5px solid #CBD5E1; }
  .brand-title { font-size: 18px; font-weight: 800; color: #0F172A; margin: 0; letter-spacing: 0.4px; }
  .brand-sub { font-size: 11.5px; color: #475569; margin: 3px 0 0; line-height: 1.45; }
  .inv-right { text-align: right; }
  .inv-heading { font-size: 16px; font-weight: 800; letter-spacing: 1.5px; color: #0F172A; margin: 0 0 6px; }
  .inv-meta { font-size: 11.5px; color: #334155; line-height: 1.55; }
  .status-txt { font-weight: 800; color: ${statusColor}; }
  .section { padding: 16px 20px; border-bottom: 1px solid #E2E8F0; }
  .section-title { font-size: 10.5px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 10px; border-bottom: 1px solid #E2E8F0; padding-bottom: 5px; }
  .kv-table { width: 100%; border-collapse: collapse; }
  .kv-table td { padding: 4px 0; font-size: 12.5px; vertical-align: top; }
  .kv-lbl { color: #475569; width: 145px; font-weight: 600; }
  .kv-col { color: #64748B; width: 14px; text-align: center; }
  .kv-val { color: #0F172A; font-weight: 700; text-align: left; }
  .items-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .items-table th { text-align: left; font-size: 10.5px; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; padding: 9px 10px; background: #F1F5F9; border-top: 1px solid #CBD5E1; border-bottom: 1px solid #CBD5E1; }
  .items-table th.center, .items-table td.center { text-align: center; }
  .items-table th.right, .items-table td.right { text-align: right; }
  .items-table td { padding: 10px; font-size: 12.5px; border-bottom: 1px solid #CBD5E1; }
  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 12px; }
  .totals-table { width: 250px; border-collapse: collapse; }
  .totals-grand td { border-top: 1.5px solid #0F172A; border-bottom: 1.5px solid #0F172A; padding: 8px 4px; font-size: 14px; font-weight: 900; color: #0F172A; }
  .footer { padding: 18px 20px; font-size: 10.5px; color: #64748B; text-align: center; }
</style>
</head>
<body>
  <div class="a4-sheet">
    <div class="doc-header">
      <div>
        <p class="brand-title">RHEMA MATRIMONY</p>
        <p class="brand-sub">Rhema Global Ministries<br/>Official Membership Invoice</p>
      </div>
      <div class="inv-right">
        <p class="inv-heading">INVOICE</p>
        <div class="inv-meta">
          <div>Invoice No: <strong>${escapeHtml(params.invoiceNo)}</strong></div>
          <div>Issued Date: <strong>${escapeHtml(params.issuedDateStr)}</strong></div>
          <div>Status: <span class="status-txt">${escapeHtml(params.statusText)}</span></div>
        </div>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Billed To (Member Details)</p>
      <table class="kv-table">
        <tr><td class="kv-lbl">Member Name</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.memberName)}</td></tr>
        <tr><td class="kv-lbl">Profile ID</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.profileCode)}</td></tr>
        <tr><td class="kv-lbl">Mobile Number</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.mobileNumber)}</td></tr>
        <tr><td class="kv-lbl">Village / City</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.cityLocation)}</td></tr>
      </table>
    </div>

    <div class="section">
      <p class="section-title">Plan &amp; Validity</p>
      <table class="kv-table">
        <tr><td class="kv-lbl">Membership Plan</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.planLabel)} Plan</td></tr>
        <tr><td class="kv-lbl">Duration</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.durationText)}</td></tr>
        <tr><td class="kv-lbl">Activated On</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.activatedOn)}</td></tr>
        <tr><td class="kv-lbl">Expires On</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.expiresOn)}</td></tr>
        <tr><td class="kv-lbl">Validity Status</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.validityStatus)}</td></tr>
      </table>
    </div>

    <div class="section">
      <p class="section-title">Fee Summary</p>
      <table class="items-table">
        <thead>
          <tr><th>Description</th><th class="center">Period</th><th class="right">Amount (INR)</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${escapeHtml(params.planLabel)} Membership</strong></td>
            <td class="center">${escapeHtml(params.durationText)}</td>
            <td class="right"><strong>${escapeHtml(amountFormatted)}</strong></td>
          </tr>
        </tbody>
      </table>
      <div class="totals-wrap">
        <table class="totals-table">
          <tr class="totals-grand"><td>Total ${params.isPaid ? 'Paid' : 'Amount'}</td><td style="text-align:right;">${escapeHtml(amountFormatted)} INR</td></tr>
        </table>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Transaction Reference</p>
      <table class="kv-table">
        <tr><td class="kv-lbl">Payment Mode</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.paymentMode)}</td></tr>
        ${params.paymentId ? `<tr><td class="kv-lbl">Transaction ID</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.paymentId)}</td></tr>` : ''}
        ${params.orderId ? `<tr><td class="kv-lbl">Order ID</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.orderId)}</td></tr>` : ''}
        ${params.note ? `<tr><td class="kv-lbl">Remarks</td><td class="kv-col">:</td><td class="kv-val">${escapeHtml(params.note)}</td></tr>` : ''}
      </table>
    </div>

    <div class="footer">
      This is a computer-generated official invoice issued by Rhema Global Ministries.
    </div>
  </div>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html });
      const safeCode = params.profileCode.replace(/[^a-zA-Z0-9_-]/g, '');
      const safeInv = params.invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '');
      const fileName = `Rhema_Matrimony_${safeCode}_${safeInv}.pdf`;
      const targetDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
      const newUri = `${targetDir}${fileName}`;
      await FileSystem.moveAsync({ from: uri, to: newUri });

      if (mode === 'share') {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(newUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Share Membership Invoice',
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('Unavailable', 'Sharing is not available on this device.');
        }
        return;
      }

      if (Platform.OS === 'android') {
        try {
          await MediaLibrary.requestPermissionsAsync().catch(() => undefined);
          if (FileSystem.StorageAccessFramework) {
            const permissions =
              await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
                'content://com.android.externalstorage.documents/document/primary%3ADownload'
              );
            if (permissions.granted) {
              const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
                permissions.directoryUri,
                fileName,
                'application/pdf'
              );
              const base64 = await FileSystem.readAsStringAsync(newUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
              await FileSystem.writeAsStringAsync(destUri, base64, {
                encoding: FileSystem.EncodingType.Base64,
              });
              Alert.alert('Downloaded', `Invoice saved as "${fileName}".`);
              return;
            }
          }
        } catch (err) {
          console.warn('Android SAF invoice save fallback:', err);
        }
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save Membership Invoice',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Invoice PDF saved to: ${newUri}`);
      }
    } catch (err: any) {
      Alert.alert('Invoice Error', err?.message || 'Unable to generate membership invoice.');
    } finally {
      setExportingInvoice(null);
    }
  };

  // Live preview math for editor screen
  const previewSell = Math.max(1, Math.round(Number(priceStr) || 0));
  const previewOrig = Math.max(previewSell, Math.round(Number(origPriceStr) || previewSell));
  const previewMonths = Math.max(1, Math.min(36, Math.round(Number(durationStr) || 1)));
  const previewSavings = Math.max(0, previewOrig - previewSell);
  const previewDiscountPct =
    previewOrig > previewSell
      ? Math.min(95, Math.round(((previewOrig - previewSell) / previewOrig) * 100))
      : 0;
  const previewMonthly = Math.round(previewSell / previewMonths);

  const allSubscriptions = data?.subscriptions || [];
  const tierFilteredSubscriptions =
    selectedKpiTier === 'all'
      ? allSubscriptions
      : allSubscriptions.filter((s) => String(s.tier || '').toLowerCase() === selectedKpiTier);
  const activeSubscribers = tierFilteredSubscriptions.filter((s) => s.status === 'active');
  const expiredSubscribers = tierFilteredSubscriptions.filter((s) => s.status !== 'active');
  const displayedSubscribers =
    subscriberFilter === 'active' ? activeSubscribers : expiredSubscribers;

  const allPayments = data?.paymentHistory || [];
  const displayedPayments =
    selectedKpiTier === 'all'
      ? allPayments
      : allPayments.filter(
          (pay) => String(pay.tier || pay.planId || '').toLowerCase() === selectedKpiTier
        );

  const selectedTierLabel =
    selectedKpiTier === 'all'
      ? ''
      : `${selectedKpiTier.charAt(0).toUpperCase() + selectedKpiTier.slice(1)} `;

  const displayedRevenueInr =
    selectedKpiTier === 'all'
      ? Number(data?.summary?.totalRevenueInr || 0)
      : allPayments.reduce((sum, pay) => {
          const amt = Number(pay.amountInr || 0);
          if (
            pay.status === 'captured' &&
            amt > 0 &&
            String(pay.tier || pay.planId || '').toLowerCase() === selectedKpiTier
          ) {
            return sum + amt;
          }
          return sum;
        }, 0);

  const revenueKickerText =
    selectedKpiTier === 'all'
      ? 'TOTAL REVENUE'
      : `${selectedKpiTier.toUpperCase()} REVENUE`;
  const revenueSubLabel =
    selectedKpiTier === 'all'
      ? 'Captured Matrimony memberships'
      : `Captured ${selectedKpiTier.charAt(0).toUpperCase() + selectedKpiTier.slice(1)} plan payments`;

  const revenueTheme =
    selectedKpiTier === 'gold'
      ? {
          colors: (isDark
            ? ['rgba(217,119,6,0.24)', 'rgba(245,158,11,0.12)', 'rgba(30,41,59,0.88)']
            : ['#FEF3C7', '#FFFBEB', '#FFFFFF']) as [string, string, string],
          borderColor: isDark ? 'rgba(251,191,36,0.34)' : '#FDE68A',
          kickerColor: isDark ? '#FCD34D' : '#B45309',
        }
      : selectedKpiTier === 'platinum'
      ? {
          colors: (isDark
            ? ['rgba(124,58,237,0.24)', 'rgba(139,92,246,0.12)', 'rgba(30,41,59,0.88)']
            : ['#F3E8FF', '#EEF2FF', '#FFFFFF']) as [string, string, string],
          borderColor: isDark ? 'rgba(196,181,253,0.34)' : '#DDD6FE',
          kickerColor: isDark ? '#C4B5FD' : PURPLE,
        }
      : selectedKpiTier === 'silver'
      ? {
          colors: (isDark
            ? ['rgba(148,163,184,0.24)', 'rgba(71,85,105,0.14)', 'rgba(30,41,59,0.88)']
            : ['#F1F5F9', '#F8FAFC', '#FFFFFF']) as [string, string, string],
          borderColor: isDark ? 'rgba(148,163,184,0.35)' : '#CBD5E1',
          kickerColor: isDark ? '#CBD5E1' : '#475569',
        }
      : {
          colors: (isDark
            ? ['rgba(22,163,74,0.18)', 'rgba(217,119,6,0.12)', 'rgba(30,41,59,0.85)']
            : ['#ECFDF5', '#FEFCE8', '#FFFFFF']) as [string, string, string],
          borderColor: isDark ? 'rgba(74,222,128,0.28)' : '#BBF7D0',
          kickerColor: isDark ? '#86EFAC' : '#15803D',
        };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor, minHeight: 60 }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.editorBackBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color={primaryText} />
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              {
                flex: 1,
                textAlign: 'center',
                color: primaryText,
                fontFamily: appFontFamily,
                fontSize: scaleFont(17),
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            Plans & Subscriptions
          </Text>
          {activeTab === 'subscribers' ? (
            <TouchableOpacity
              style={styles.headerGrantBtn}
              onPress={() => setGrantModalVisible(true)}
              activeOpacity={0.85}
            >
              <Gift size={15} color="#FFFFFF" />
              <Text style={styles.headerGrantBtnTxt}>Grant Plan</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 30 }} />
          )}
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
            {/* KPI Badges + Revenue Card (Subscribers & Payments tabs only so Plans & Pricing gets full height) */}
            {activeTab !== 'plans' && data?.summary ? (
              <View style={styles.kpiSectionWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.kpiBadgeRow}
                >
                  {(
                    [
                      { key: 'all' as const, label: 'Active', count: data.summary.activeCount },
                      { key: 'silver' as const, label: 'Silver', count: data.summary.silverActive },
                      { key: 'gold' as const, label: 'Gold', count: data.summary.goldActive },
                      { key: 'platinum' as const, label: 'Platinum', count: data.summary.platinumActive },
                    ]
                  ).map((badge) => {
                    const selected = selectedKpiTier === badge.key;
                    return (
                      <TouchableOpacity
                        key={badge.key}
                        activeOpacity={0.82}
                        onPress={() =>
                          setSelectedKpiTier((prev) =>
                            badge.key === 'all'
                              ? 'all'
                              : prev === badge.key
                              ? 'all'
                              : badge.key
                          )
                        }
                        style={[
                          styles.kpiBadgePill,
                          {
                            backgroundColor: selected
                              ? isDark
                                ? '#F8FAFC'
                                : '#1E293B'
                              : cardSurface,
                            borderColor: selected
                              ? isDark
                                ? '#F8FAFC'
                                : '#1E293B'
                              : borderColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.kpiBadgeLbl,
                            {
                              color: selected
                                ? isDark
                                  ? '#0F172A'
                                  : '#FFFFFF'
                                : primaryText,
                              fontWeight: selected ? '800' : '600',
                              fontFamily: appFontFamily,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {`${badge.label} (${badge.count})`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <LinearGradient
                  colors={revenueTheme.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.revenueLongCard,
                    {
                      borderColor: revenueTheme.borderColor,
                    },
                  ]}
                >
                  <View style={styles.revenueLeftRow}>
                    <Image
                      source={REVENUE_3D_ICON}
                      style={styles.revenueImgIcon}
                      resizeMode="contain"
                    />

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.revenueKicker,
                          { color: revenueTheme.kickerColor },
                        ]}
                      >
                        {revenueKickerText}
                      </Text>
                      <Text
                        style={[
                          styles.revenueAmountHero,
                          { color: primaryText, fontFamily: appFontFamily },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {`₹${displayedRevenueInr.toLocaleString('en-IN')}`}
                      </Text>
                      <Text
                        style={[styles.revenueSubText, { color: secondaryText }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {revenueSubLabel}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            ) : null}

            {/* Tab 1: Exact Carousel Preview Matching Upgrade Screen + Full-Screen Edit */}
            {activeTab === 'plans' ? (
              <View style={{ marginHorizontal: -14, paddingTop: 4 }}>
                <Text
                  style={[
                    styles.previewHintText,
                    { color: secondaryText, fontFamily: appFontFamily },
                  ]}
                >
                  Live Upgrade Screen Preview · Tap Edit Plan on any card to customize pricing, offers & duration
                </Text>

                <MatrimonyPlanCarousel
                  plans={data?.plans || []}
                  selectedPlan={selectedCarouselTier}
                  onSelectPlan={setSelectedCarouselTier}
                  actionButtonLabel="Edit Plan"
                  showInactiveBadge
                  onPressPlanAction={startEditingPlan}
                />
              </View>
            ) : null}

            {activeTab === 'subscribers' ? (
              <View style={{ gap: 12 }}>
                {/* Nested Active / Expired tabs */}
                <View
                  style={[
                    styles.nestedSubTabsWrap,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                      borderColor,
                    },
                  ]}
                >
                  {(
                    [
                      {
                        key: 'active' as const,
                        label: `Active (${activeSubscribers.length})`,
                        accent: GREEN,
                      },
                      {
                        key: 'expired' as const,
                        label: `Expired (${expiredSubscribers.length})`,
                        accent: '#DC2626',
                      },
                    ]
                  ).map((subTab) => {
                    const selected = subscriberFilter === subTab.key;
                    return (
                      <TouchableOpacity
                        key={subTab.key}
                        activeOpacity={0.85}
                        onPress={() => setSubscriberFilter(subTab.key)}
                        style={[
                          styles.nestedSubTabBtn,
                          selected && {
                            backgroundColor: cardSurface,
                            borderColor: subTab.accent,
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.nestedSubTabTxt,
                            {
                              color: selected ? subTab.accent : secondaryText,
                              fontWeight: selected ? '800' : '600',
                              fontFamily: appFontFamily,
                            },
                          ]}
                        >
                          {subTab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {displayedSubscribers.length === 0 ? (
                  <View style={[styles.card, { backgroundColor: cardSurface, borderColor, alignItems: 'center', paddingVertical: 26 }]}>
                    <Text style={{ color: secondaryText, fontSize: 13.5, fontWeight: '600', fontFamily: appFontFamily }}>
                      {subscriberFilter === 'active'
                        ? `No active ${selectedTierLabel}subscribers right now.`
                        : `No expired ${selectedTierLabel}subscribers yet.`}
                    </Text>
                  </View>
                ) : (
                  displayedSubscribers.map((sub) => {
                    const isSubActive = sub.status === 'active';
                    return (
                      <View key={sub.uid} style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                        <View style={styles.cardRowBetween}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <Text style={[styles.planTitle, { color: primaryText }]}>
                                {nameByUid(sub.uid, sub.memberName)} · {sub.planName}
                              </Text>
                              <View
                                style={[
                                  styles.statusPill,
                                  {
                                    backgroundColor: isSubActive
                                      ? isDark
                                        ? 'rgba(22,163,74,0.22)'
                                        : '#DCFCE7'
                                      : isDark
                                      ? 'rgba(220,38,38,0.22)'
                                      : '#FEE2E2',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statusPillTxt,
                                    { color: isSubActive ? GREEN : '#DC2626' },
                                  ]}
                                >
                                  {isSubActive ? 'ACTIVE' : 'EXPIRED'}
                                </Text>
                              </View>
                            </View>
                            <Text style={[styles.subText, { color: secondaryText, marginTop: 2 }]}>
                              {formatDate(sub.startDateMs)} → {formatDate(sub.expiryDateMs)}
                            </Text>
                            <Text style={[styles.subText, { color: secondaryText }]}>
                              Source: {sub.source} · Paid ₹{sub.amountInr} {sub.note ? `· ${sub.note}` : ''}
                            </Text>
                          </View>
                          {isSubActive ? (
                            <TouchableOpacity
                              style={[styles.editBtn, { borderColor: '#FCA5A5' }]}
                              onPress={() => handleRevoke(sub.uid)}
                            >
                              <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12 }}>Revoke</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}

            {activeTab === 'payments' ? (
              <View style={{ gap: 10 }}>
                {displayedPayments.length === 0 ? (
                  <Text style={{ color: secondaryText, textAlign: 'center', marginTop: 24 }}>
                    {`No ${selectedTierLabel}payment records yet.`}
                  </Text>
                ) : (
                  displayedPayments.map((pay) => {
                    const tierLabel = (pay.tier || pay.planId || 'PLAN').toUpperCase();
                    const dateMs = pay.createdAtMs || pay.startDateMs;
                    return (
                      <TouchableOpacity
                        key={pay.id}
                        activeOpacity={0.82}
                        onPress={() => setSelectedPayment(pay)}
                        style={[styles.card, { backgroundColor: cardSurface, borderColor }]}
                      >
                        <View style={styles.cardRowBetween}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                            <Receipt size={17} color={GOLD} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.planTitle, { color: primaryText }]}>
                                {nameByUid(pay.uid, pay.memberName)} · {tierLabel} · ₹{pay.amountInr.toLocaleString('en-IN')}
                              </Text>
                              <Text style={[styles.subText, { color: secondaryText }]}>
                                {pay.status.toUpperCase()} ({pay.source}) · {formatDate(dateMs)}
                              </Text>
                              {pay.paymentId ? (
                                <Text style={[styles.subText, { color: secondaryText }]} numberOfLines={1}>
                                  Razorpay: {pay.paymentId}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                          <ChevronRight size={17} color={secondaryText} />
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ) : null}
          </ScrollView>
        )}

        {/* Full-Screen Plan Editor Modal */}
        <Modal
          visible={Boolean(editingPlan)}
          animationType="slide"
          onRequestClose={() => setEditingPlan(null)}
        >
          <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: borderColor, backgroundColor: cardSurface }]}>
              <TouchableOpacity
                onPress={() => setEditingPlan(null)}
                style={styles.editorBackBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ArrowLeft size={22} color={primaryText} />
              </TouchableOpacity>
              <Text
                style={[
                  styles.headerTitle,
                  { flex: 1, marginLeft: 8, color: primaryText, fontFamily: appFontFamily, fontSize: scaleFont(17) },
                ]}
              >
                {`Edit ${editingPlan?.planName || ''} Plan`}
              </Text>
              <View
                style={[
                  styles.chip,
                  { backgroundColor: planIsActive ? 'rgba(22,163,74,0.14)' : 'rgba(220,38,38,0.14)' },
                ]}
              >
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: planIsActive ? GREEN : '#DC2626' }}>
                  {planIsActive ? 'Active' : 'Hidden'}
                </Text>
              </View>
            </View>

            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 32 }}
              >
                {/* Redesigned Live Offer Calculation Card */}
                <View
                  style={[
                    styles.offerSummaryCard,
                    {
                      backgroundColor: cardSurface,
                      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E2E8F0',
                    },
                  ]}
                >
                  <LinearGradient
                    colors={['#8A1F52', '#64173D']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.offerHeaderGradient}
                  >
                    <View>
                      <Text style={styles.offerHeaderTitle}>LIVE OFFER CALCULATION</Text>
                      <Text style={styles.offerHeaderSub}>
                        {`${planNameStr.trim() || editingPlan?.planName || ''} · ${previewMonths} ${
                          previewMonths === 1 ? 'Month' : 'Months'
                        }`}
                      </Text>
                    </View>
                  </LinearGradient>

                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(138,31,82,0.16)', 'rgba(30,27,38,0.6)']
                        : ['#FFF5F7', '#FFF8F1']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.offerHeroBody}
                  >
                    <View>
                      <Text style={[styles.offerHeroLbl, { color: secondaryText }]}>
                        Member Pays
                      </Text>
                      <View style={styles.offerPriceLine}>
                        <Text style={[styles.offerPriceHero, { color: primaryText }]}>
                          {`₹${previewSell.toLocaleString('en-IN')}`}
                        </Text>
                        {previewOrig > previewSell ? (
                          <Text style={[styles.offerMrpStrike, { color: secondaryText }]}>
                            {`₹${previewOrig.toLocaleString('en-IN')}`}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {previewSavings > 0 ? (
                      <View style={styles.savingsTagRow}>
                        <Svg width={22} height={30} viewBox="0 0 22 30">
                          <Path
                            d="M22 0 L10 0 Q7.5 0 6 2 L1 12.5 Q0 15 1 17.5 L6 28 Q7.5 30 10 30 L22 30 Z"
                            fill="#7C1848"
                          />
                          <Circle cx={10.5} cy={15} r={2.8} fill={isDark ? '#2B1726' : '#FFF6F4'} />
                          <Path
                            d="M0 12.5 C4 12.5, 7 13.8, 8.5 15 C7 16.5, 4 17.5, 0 17"
                            stroke={isDark ? '#CBD5E1' : '#475569'}
                            strokeWidth={1.3}
                            fill="none"
                          />
                        </Svg>
                        <View style={styles.savingsTagBody}>
                          <Text style={styles.savingsTagText}>
                            {`Saves ₹${previewSavings.toLocaleString('en-IN')}`}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </LinearGradient>

                  <View
                    style={[
                      styles.offerMetricsStrip,
                      {
                        borderTopColor: borderColor,
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.03)'
                          : '#F8FAFC',
                      },
                    ]}
                  >
                    <View style={styles.offerMetricCell}>
                      <Text style={[styles.offerMetricLbl, { color: secondaryText }]}>
                        Monthly Rate
                      </Text>
                      <Text style={[styles.offerMetricVal, { color: primaryText }]}>
                        {`₹${previewMonthly.toLocaleString('en-IN')}/mo`}
                      </Text>
                    </View>
                    <View style={[styles.offerMetricDivider, { backgroundColor: borderColor }]} />
                    <View style={styles.offerMetricCell}>
                      <Text style={[styles.offerMetricLbl, { color: secondaryText }]}>
                        Validity
                      </Text>
                      <Text style={[styles.offerMetricVal, { color: primaryText }]}>
                        {`${previewMonths} ${previewMonths === 1 ? 'Month' : 'Months'}`}
                      </Text>
                    </View>
                    <View style={[styles.offerMetricDivider, { backgroundColor: borderColor }]} />
                    <View style={styles.offerMetricCell}>
                      <Text style={[styles.offerMetricLbl, { color: secondaryText }]}>
                        Discount
                      </Text>
                      <Text
                        style={[
                          styles.offerMetricVal,
                          {
                            color:
                              previewDiscountPct > 0
                                ? isDark
                                  ? '#4ADE80'
                                  : GREEN
                                : secondaryText,
                          },
                        ]}
                      >
                        {previewDiscountPct > 0 ? `${previewDiscountPct}% OFF` : '0%'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 1. Months Selection */}
                <View style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.sectionHead, { color: primaryText }]}>Duration (Months Selection)</Text>
                  <View style={styles.presetPillsWrap}>
                    {MONTH_PRESETS.map((mo) => {
                      const active = Number(durationStr) === mo;
                      return (
                        <TouchableOpacity
                          key={mo}
                          style={[
                            styles.presetChip,
                            {
                              borderColor: active ? CORAL : borderColor,
                              backgroundColor: active ? 'rgba(224,90,90,0.12)' : 'transparent',
                            },
                          ]}
                          onPress={() => handleSelectDurationMonths(mo)}
                        >
                          <Text
                            style={{
                              fontSize: 12.5,
                              fontWeight: active ? '800' : '600',
                              color: active ? CORAL : primaryText,
                            }}
                          >
                            {mo === 1 ? '1 Mo' : `${mo} Mos`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.lbl, { color: secondaryText }]}>Custom Duration (1–36 Months)</Text>
                    <TextInput
                      value={durationStr}
                      onChangeText={(txt) => {
                        setDurationStr(txt);
                        const num = Math.round(Number(txt));
                        if (Number.isFinite(num) && num >= 1 && num <= 36) {
                          const unit = num === 1 ? 'month' : 'months';
                          setBenefitsDraft((prev) =>
                            prev.map((line) =>
                              /^valid for\s+\d+\s+months?/i.test(line.trim())
                                ? `Valid for ${num} ${unit}`
                                : line
                            )
                          );
                        }
                      }}
                      keyboardType="numeric"
                      style={[styles.input, { color: primaryText, borderColor }]}
                    />
                  </View>
                </View>

                {/* 2. Pricing & Offer Calculations */}
                <View style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.sectionHead, { color: primaryText }]}>Pricing & Discount Offer</Text>
                  <View style={styles.inputGrid}>
                    <View style={styles.inputCol}>
                      <Text style={[styles.lbl, { color: secondaryText }]}>Original Price (₹)</Text>
                      <TextInput
                        value={origPriceStr}
                        onChangeText={handleOriginalPriceChange}
                        keyboardType="numeric"
                        placeholder="e.g. 5500"
                        placeholderTextColor={secondaryText}
                        style={[styles.input, { color: primaryText, borderColor }]}
                      />
                    </View>
                    <View style={styles.inputCol}>
                      <Text style={[styles.lbl, { color: secondaryText }]}>Offer Price (₹)</Text>
                      <TextInput
                        value={priceStr}
                        onChangeText={handleSellingPriceChange}
                        keyboardType="numeric"
                        placeholder="e.g. 3200"
                        placeholderTextColor={secondaryText}
                        style={[styles.input, { color: primaryText, borderColor }]}
                      />
                    </View>
                    <View style={[styles.inputCol, { flex: 0.72 }]}>
                      <Text style={[styles.lbl, { color: secondaryText }]}>Discount %</Text>
                      <TextInput
                        value={discountStr}
                        onChangeText={(txt) => applyDiscountPercentage(txt)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={secondaryText}
                        style={[styles.input, { color: primaryText, borderColor }]}
                      />
                    </View>
                  </View>

                  <Text style={[styles.lbl, { color: secondaryText, marginTop: 10 }]}>
                    Quick Offer Discount %
                  </Text>
                  <View style={styles.presetPillsWrap}>
                    {DISCOUNT_PRESETS.map((pct) => {
                      const active = previewDiscountPct === pct;
                      return (
                        <TouchableOpacity
                          key={pct}
                          style={[
                            styles.presetChip,
                            {
                              borderColor: active ? GREEN : borderColor,
                              backgroundColor: active ? 'rgba(22,163,74,0.12)' : 'transparent',
                            },
                          ]}
                          onPress={() => applyDiscountPercentage(pct)}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: active ? '800' : '600',
                              color: active ? GREEN : primaryText,
                            }}
                          >
                            {pct === 0 ? 'No Offer' : `${pct}% OFF`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 3. Card Display & Identity */}
                <View style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.sectionHead, { color: primaryText }]}>Plan Display & Visibility</Text>
                  <View style={styles.inputGrid}>
                    <View style={styles.inputCol}>
                      <Text style={[styles.lbl, { color: secondaryText }]}>Plan Name</Text>
                      <TextInput
                        value={planNameStr}
                        onChangeText={setPlanNameStr}
                        style={[styles.input, { color: primaryText, borderColor }]}
                      />
                    </View>
                    <View style={styles.inputCol}>
                      <Text style={[styles.lbl, { color: secondaryText }]}>Top Badge (Platinum)</Text>
                      <TextInput
                        value={badgeTextStr}
                        onChangeText={setBadgeTextStr}
                        placeholder="e.g. ROYAL ELITE"
                        placeholderTextColor={secondaryText}
                        style={[styles.input, { color: primaryText, borderColor }]}
                      />
                    </View>
                  </View>
                  <View style={[styles.cardRowBetween, { marginTop: 10 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: primaryText, fontWeight: '700', fontSize: 13.5 }}>
                        Visible & Active in Upgrade Screen
                      </Text>
                      <Text style={{ color: secondaryText, fontSize: 11.5 }}>
                        Turn off to temporarily hide this plan from members
                      </Text>
                    </View>
                    <Switch value={planIsActive} onValueChange={setPlanIsActive} />
                  </View>
                </View>

                {/* 4. Card Bullet Lines (Live on Upgrade Screen) */}
                <View style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={styles.cardRowBetween}>
                    <Text style={[styles.sectionHead, { color: primaryText, marginBottom: 0 }]}>
                      Card Benefits Text
                    </Text>
                    <TouchableOpacity
                      style={[styles.inlineMiniBtn, { borderColor: CORAL }]}
                      onPress={syncMonthsAndContactsIntoBenefits}
                    >
                      <Text style={{ color: CORAL, fontSize: 11.5, fontWeight: '700' }}>
                        Sync Months & Contacts
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ gap: 8, marginTop: 8 }}>
                    {benefitsDraft.map((line, idx) => (
                      <View key={idx} style={styles.benefitEditRow}>
                        <TextInput
                          value={line}
                          onChangeText={(txt) =>
                            setBenefitsDraft((prev) => prev.map((v, i) => (i === idx ? txt : v)))
                          }
                          placeholder={`Feature line ${idx + 1}`}
                          placeholderTextColor={secondaryText}
                          style={[styles.input, { flex: 1, color: primaryText, borderColor }]}
                        />
                        {benefitsDraft.length > 1 ? (
                          <TouchableOpacity
                            style={[styles.trashBtn, { borderColor }]}
                            onPress={() =>
                              setBenefitsDraft((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            <Trash2 size={15} color="#DC2626" />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  {benefitsDraft.length < 10 ? (
                    <TouchableOpacity
                      style={[styles.addLineBtn, { borderColor }]}
                      onPress={() => setBenefitsDraft((prev) => [...prev, ''])}
                    >
                      <Plus size={15} color={CORAL} />
                      <Text style={{ color: CORAL, fontWeight: '700', fontSize: 12.5 }}>
                        Add Benefit Line
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* 5. Entitlement Limits & Access */}
                <View style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.sectionHead, { color: primaryText }]}>Plan Limits & Access</Text>

                  <View style={styles.limitRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: primaryText, fontWeight: '700', fontSize: 13 }}>
                        Phone Nos & DOB Limit
                      </Text>
                      <Text style={{ color: secondaryText, fontSize: 11.5 }}>
                        {contactUnlimited ? 'Unlimited contact unlocks' : 'Max verified contacts allowed'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: secondaryText, fontSize: 11.5, fontWeight: '700' }}>
                        Unlim
                      </Text>
                      <Switch
                        value={contactUnlimited}
                        onValueChange={(val) => {
                          setContactUnlimited(val);
                          setBenefitsDraft((prev) =>
                            applyLimitsToBenefitLines(prev, { contactUnlimited: val })
                          );
                        }}
                      />
                      {!contactUnlimited ? (
                        <TextInput
                          value={contactLimitStr}
                          onChangeText={(txt) => {
                            setContactLimitStr(txt);
                            const num = Math.round(Number(txt));
                            if (Number.isFinite(num) && num >= 0) {
                              setBenefitsDraft((prev) =>
                                applyLimitsToBenefitLines(prev, {
                                  contactUnlimited: false,
                                  contactLimit: num,
                                })
                              );
                            }
                          }}
                          keyboardType="numeric"
                          style={[styles.input, styles.limitMiniInput, { color: primaryText, borderColor }]}
                        />
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.limitRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: primaryText, fontWeight: '700', fontSize: 13 }}>
                        Monthly Interests Limit
                      </Text>
                      <Text style={{ color: secondaryText, fontSize: 11.5 }}>
                        {interestUnlimited ? 'Unlimited monthly interests' : 'Max interests per month'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: secondaryText, fontSize: 11.5, fontWeight: '700' }}>
                        Unlim
                      </Text>
                      <Switch value={interestUnlimited} onValueChange={setInterestUnlimited} />
                      {!interestUnlimited ? (
                        <TextInput
                          value={interestLimitStr}
                          onChangeText={setInterestLimitStr}
                          keyboardType="numeric"
                          style={[styles.input, styles.limitMiniInput, { color: primaryText, borderColor }]}
                        />
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.limitRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: primaryText, fontWeight: '700', fontSize: 13 }}>
                        Shortlist Profile Limit
                      </Text>
                      <Text style={{ color: secondaryText, fontSize: 11.5 }}>
                        {shortlistUnlimited ? 'Unlimited shortlisted profiles' : 'Max shortlisted profiles'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: secondaryText, fontSize: 11.5, fontWeight: '700' }}>
                        Unlim
                      </Text>
                      <Switch
                        value={shortlistUnlimited}
                        onValueChange={(val) => {
                          setShortlistUnlimited(val);
                          setBenefitsDraft((prev) =>
                            applyLimitsToBenefitLines(prev, { shortlistUnlimited: val })
                          );
                        }}
                      />
                      {!shortlistUnlimited ? (
                        <TextInput
                          value={shortlistLimitStr}
                          onChangeText={(txt) => {
                            setShortlistLimitStr(txt);
                            const num = Math.round(Number(txt));
                            if (Number.isFinite(num) && num >= 1) {
                              setBenefitsDraft((prev) =>
                                applyLimitsToBenefitLines(prev, {
                                  shortlistUnlimited: false,
                                  shortlistLimit: num,
                                })
                              );
                            }
                          }}
                          keyboardType="numeric"
                          style={[styles.input, styles.limitMiniInput, { color: primaryText, borderColor }]}
                        />
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.switchListWrap}>
                    <View style={styles.cardRowBetween}>
                      <Text style={{ color: primaryText, fontWeight: '600', fontSize: 13 }}>
                        Advanced Filters Access
                      </Text>
                      <Switch
                        value={advancedFilters}
                        onValueChange={(val) => {
                          setAdvancedFilters(val);
                          setBenefitsDraft((prev) =>
                            applyLimitsToBenefitLines(prev, { advancedFilters: val })
                          );
                        }}
                      />
                    </View>
                    <View style={styles.cardRowBetween}>
                      <Text style={{ color: primaryText, fontWeight: '600', fontSize: 13 }}>
                        Mutual Match Messaging Access
                      </Text>
                      <Switch value={messageAccess} onValueChange={setMessageAccess} />
                    </View>
                    <View style={styles.cardRowBetween}>
                      <Text style={{ color: primaryText, fontWeight: '600', fontSize: 13 }}>
                        Priority Customer Support
                      </Text>
                      <Switch
                        value={prioritySupport}
                        onValueChange={(val) => {
                          setPrioritySupport(val);
                          setBenefitsDraft((prev) =>
                            applyLimitsToBenefitLines(prev, { prioritySupport: val })
                          );
                        }}
                      />
                    </View>
                  </View>

                  <Text style={[styles.lbl, { color: secondaryText, marginTop: 10 }]}>
                    Search & Match Visibility Boost
                  </Text>
                  <View style={styles.presetPillsWrap}>
                    {[0, 1, 2, 3].map((prio) => {
                      const active = visibilityPriority === prio;
                      return (
                        <TouchableOpacity
                          key={prio}
                          style={[
                            styles.presetChip,
                            {
                              borderColor: active ? PURPLE : borderColor,
                              backgroundColor: active ? 'rgba(124,58,237,0.12)' : 'transparent',
                            },
                          ]}
                          onPress={() => setVisibilityPriority(prio)}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: active ? '800' : '600',
                              color: active ? PURPLE : primaryText,
                            }}
                          >
                            {`Priority +${prio}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.lbl, { color: secondaryText, marginTop: 10 }]}>
                    Card Highlight Style
                  </Text>
                  <View style={styles.presetPillsWrap}>
                    {(['none', 'gold', 'platinum'] as const).map((hs) => {
                      const active = highlightStyle === hs;
                      return (
                        <TouchableOpacity
                          key={hs}
                          style={[
                            styles.presetChip,
                            {
                              borderColor: active ? GOLD : borderColor,
                              backgroundColor: active ? 'rgba(217,119,6,0.12)' : 'transparent',
                            },
                          ]}
                          onPress={() => setHighlightStyle(hs)}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: active ? '800' : '600',
                              color: active ? GOLD : primaryText,
                            }}
                          >
                            {hs.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>

              {/* Sticky Save Footer */}
              <View
                style={[
                  styles.editorFooter,
                  {
                    backgroundColor: cardSurface,
                    borderTopColor: borderColor,
                    paddingBottom: Math.max(insets.bottom + 10, 14),
                  },
                ]}
              >
                <TouchableOpacity
                  style={[styles.editBtn, { flex: 0.9, alignItems: 'center', paddingVertical: 12, borderColor }]}
                  onPress={() => setEditingPlan(null)}
                >
                  <Text style={{ color: secondaryText, fontWeight: '700', fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { flex: 1.6, paddingVertical: 12 }]}
                  onPress={handleSavePlan}
                  disabled={savingPlanId === editingPlan?.planId}
                >
                  {savingPlanId === editingPlan?.planId ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Check size={17} color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14.5 }}>
                        Save & Publish Plan
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* Grant Complimentary Plan Modal */}
        <Modal
          visible={grantModalVisible}
          animationType="slide"
          onRequestClose={() => setGrantModalVisible(false)}
        >
          <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: borderColor, backgroundColor: cardSurface, minHeight: 60 }]}>
              <TouchableOpacity
                onPress={() => setGrantModalVisible(false)}
                style={styles.editorBackBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ArrowLeft size={22} color={primaryText} />
              </TouchableOpacity>
              <Text
                style={[
                  styles.headerTitle,
                  {
                    flex: 1,
                    textAlign: 'center',
                    color: primaryText,
                    fontFamily: appFontFamily,
                    fontSize: scaleFont(17),
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Grant Complimentary Plan
              </Text>
              <View style={{ width: 30 }} />
            </View>

            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 32 }}
              >
                <View style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.lbl, { color: secondaryText }]}>
                    Find Member (Name or Rhema Matrimony Profile ID)
                  </Text>
                  <TextInput
                    value={grantSearchQuery}
                    onChangeText={(txt) => {
                      setGrantSearchQuery(txt);
                      const trimmed = txt.trim();
                      if (!trimmed) {
                        setGrantUid('');
                        return;
                      }
                      const upper = trimmed.toUpperCase();
                      const exact = [...grantProfiles, ...profiles].find(
                        (p) =>
                          p?.uid &&
                          (getProfileCode(p) === upper || p.uid === trimmed)
                      );
                      setGrantUid(exact ? exact.uid : '');
                    }}
                    placeholder="Search name or paste Profile ID (e.g. RM...)"
                    placeholderTextColor={secondaryText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, { color: primaryText, borderColor, marginBottom: 8 }]}
                  />
                  {grantProfilesLoading && mergedGrantCandidates.length === 0 ? (
                    <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={CORAL} />
                    </View>
                  ) : mergedGrantCandidates.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {mergedGrantCandidates.map((p) => {
                          const code = getProfileCode(p);
                          const isSelected = grantUid === p.uid;
                          return (
                            <TouchableOpacity
                              key={p.uid}
                              style={[
                                styles.pickChip,
                                {
                                  borderColor: isSelected ? CORAL : borderColor,
                                  backgroundColor: isSelected
                                    ? 'rgba(224,90,90,0.14)'
                                    : isDark
                                    ? '#27272A'
                                    : '#F8FAFC',
                                },
                              ]}
                              onPress={() => {
                                setGrantUid(p.uid);
                                setGrantSearchQuery(code);
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11.5,
                                  color: isSelected ? CORAL : primaryText,
                                  fontWeight: isSelected ? '800' : '600',
                                }}
                              >
                                {`${p.displayName} · ${code}`}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  ) : (
                    <Text style={{ fontSize: 11.5, color: secondaryText, marginBottom: 10 }}>
                      {grantSearchQuery.trim()
                        ? 'No matching approved member found locally — backend will still check Profile ID on activate.'
                        : 'No approved members loaded yet.'}
                    </Text>
                  )}
                  {selectedGrantProfile ? (
                    <View
                      style={{
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        marginBottom: 10,
                        backgroundColor: isDark ? 'rgba(22,163,74,0.16)' : '#F0FDF4',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(74,222,128,0.3)' : '#BBF7D0',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: isDark ? '#86EFAC' : GREEN,
                        }}
                      >
                        {`Selected: ${selectedGrantProfile.displayName} (${getProfileCode(selectedGrantProfile)})`}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={[styles.lbl, { color: secondaryText }]}>Select Plan Tier</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
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
                    style={[styles.saveBtn, { marginTop: 14, paddingVertical: 12 }]}
                    onPress={handleGrant}
                    disabled={granting}
                  >
                    {granting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Shield size={16} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                          Activate Complimentary Plan
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* Membership Invoice Modal */}
        <Modal
          visible={Boolean(selectedPayment)}
          animationType="slide"
          onRequestClose={() => setSelectedPayment(null)}
        >
          {selectedPayment ? (() => {
            const tierKey = String(
              selectedPayment.tier || selectedPayment.planId || 'silver'
            ).toLowerCase();
            const matchedPlan = (data?.plans || []).find(
              (p) => p.tier === tierKey || p.planId === selectedPayment.planId
            );
            const matchedSub = allSubscriptions.find((s) => s.uid === selectedPayment.uid);
            const planLabel =
              selectedPayment.planName ||
              matchedPlan?.planName ||
              (tierKey ? tierKey.charAt(0).toUpperCase() + tierKey.slice(1) : 'Plan');
            const takenMs =
              selectedPayment.startDateMs ||
              selectedPayment.createdAtMs ||
              matchedSub?.startDateMs ||
              null;
            const durationMonths =
              selectedPayment.durationMonths ||
              matchedSub?.durationMonths ||
              matchedPlan?.durationMonths ||
              null;
            const durationText = durationMonths
              ? `${durationMonths} ${durationMonths === 1 ? 'Month' : 'Months'}`
              : '—';
            const expiresMs =
              selectedPayment.expiryDateMs ||
              (matchedSub && matchedSub.tier === tierKey ? matchedSub.expiryDateMs : null) ||
              (takenMs && durationMonths
                ? takenMs + durationMonths * 30 * 24 * 60 * 60 * 1000
                : null);
            const isExpired = Boolean(expiresMs && expiresMs <= Date.now());
            const daysRemaining =
              expiresMs && expiresMs > Date.now()
                ? Math.max(1, Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000)))
                : 0;
            const isPaid = selectedPayment.status === 'captured';
            const statusStampText = isPaid
              ? 'PAID'
              : selectedPayment.status === 'complimentary'
              ? 'COMPLIMENTARY'
              : selectedPayment.status.toUpperCase();
            const paymentModeText =
              selectedPayment.source === 'admin_complimentary'
                ? 'Complimentary Grant (Church Admin)'
                : 'Online Payment (Razorpay)';
            const invoiceNo = `INV-${String(
              selectedPayment.paymentId || selectedPayment.id || '000000'
            )
              .slice(-8)
              .toUpperCase()}`;
            const issuedDateStr = formatDate(takenMs);
            const memberName = nameByUid(selectedPayment.uid, selectedPayment.memberName);
            const profileCode = codeByUid(selectedPayment.uid, selectedPayment.memberProfileCode);
            const mobileNumber = phoneByUid(selectedPayment.uid, selectedPayment.memberPhone);
            const cityLocation = cityByUid(selectedPayment.uid, selectedPayment.memberCity);
            const validityStatusText = expiresMs
              ? isExpired
                ? 'Expired'
                : `Active (${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left)`
              : '—';
            const amountNum = Number(selectedPayment.amountInr || 0);
            const amountFormatted = `₹${amountNum.toLocaleString('en-IN')}`;
            const invoicePayload = {
              invoiceNo,
              issuedDateStr,
              statusText: statusStampText,
              isPaid,
              memberName,
              profileCode,
              mobileNumber,
              cityLocation,
              planLabel,
              durationText,
              activatedOn: formatDateTime(takenMs),
              expiresOn: formatDate(expiresMs),
              validityStatus: validityStatusText,
              amountInr: amountNum,
              paymentMode: paymentModeText,
              paymentId: selectedPayment.paymentId,
              orderId: selectedPayment.orderId,
              note: selectedPayment.note || null,
            };

            const invShareBtnBg = isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC';

            return (
              <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]} edges={['top']}>
                <View style={[styles.header, { borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF', minHeight: 56 }]}>
                  <TouchableOpacity
                    onPress={() => setSelectedPayment(null)}
                    style={styles.editorBackBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ArrowLeft size={22} color="#0F172A" />
                  </TouchableOpacity>
                  <Text
                    style={[
                      styles.headerTitle,
                      {
                        flex: 1,
                        textAlign: 'center',
                        color: '#0F172A',
                        fontFamily: appFontFamily,
                        fontSize: scaleFont(17),
                      },
                    ]}
                    numberOfLines={1}
                  >
                    Membership Invoice
                  </Text>
                  <View style={{ width: 30 }} />
                </View>

                <ScrollView
                  style={{ flex: 1, backgroundColor: '#FFFFFF' }}
                  contentContainerStyle={{ flexGrow: 1, paddingBottom: 24, backgroundColor: '#FFFFFF' }}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Full-Screen A4 Sheet Paper */}
                  <View style={styles.a4Sheet}>

                    {/* A4 Header */}
                    <View style={styles.a4DocHeader}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.a4BrandTitle}>RHEMA MATRIMONY</Text>
                        <Text style={styles.a4BrandSub}>Rhema Global Ministries</Text>
                        <Text style={styles.a4BrandSub}>Official Membership Invoice</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.a4Heading}>INVOICE</Text>
                        <Text style={styles.a4MetaLine}>{`No: ${invoiceNo}`}</Text>
                        <Text style={styles.a4MetaLine}>{`Date: ${issuedDateStr}`}</Text>
                        <Text style={styles.a4MetaLine}>
                          Status:{' '}
                          <Text
                            style={{
                              fontWeight: '800',
                              color: isPaid ? '#15803D' : '#6D28D9',
                            }}
                          >
                            {statusStampText}
                          </Text>
                        </Text>
                      </View>
                    </View>

                    {/* Section 1: Billed To */}
                    <View style={styles.a4Section}>
                      <Text style={styles.a4SectionHeading}>BILLED TO (MEMBER DETAILS)</Text>
                      <View style={styles.a4KvTable}>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Member Name</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text style={styles.a4KvVal}>{memberName}</Text>
                        </View>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Profile ID</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text style={styles.a4KvVal}>{profileCode}</Text>
                        </View>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Mobile Number</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text style={styles.a4KvVal} selectable>{mobileNumber}</Text>
                        </View>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Village / City</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text style={styles.a4KvVal}>{cityLocation}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Section 2: Plan & Validity */}
                    <View style={styles.a4Section}>
                      <Text style={styles.a4SectionHeading}>PLAN & VALIDITY</Text>
                      <View style={styles.a4KvTable}>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Membership Plan</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text style={styles.a4KvVal}>{`${planLabel} Plan`}</Text>
                        </View>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Duration</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text style={styles.a4KvVal}>{durationText}</Text>
                        </View>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Activated On</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text style={styles.a4KvVal}>{formatDateTime(takenMs)}</Text>
                        </View>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Expires On</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text style={styles.a4KvVal}>{formatDate(expiresMs)}</Text>
                        </View>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Validity Status</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text
                            style={[
                              styles.a4KvVal,
                              { color: expiresMs ? (isExpired ? '#B91C1C' : '#15803D') : '#0F172A' },
                            ]}
                          >
                            {validityStatusText}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Section 3: Itemized Fee Table */}
                    <View style={styles.a4Section}>
                      <Text style={styles.a4SectionHeading}>FEE SUMMARY</Text>
                      <View style={styles.a4ItemTableHeader}>
                        <Text style={[styles.a4ItemTh, { flex: 1 }]}>DESCRIPTION</Text>
                        <Text style={[styles.a4ItemTh, { width: 68, textAlign: 'center' }]}>PERIOD</Text>
                        <Text style={[styles.a4ItemTh, { width: 72, textAlign: 'right' }]}>AMOUNT</Text>
                      </View>
                      <View style={styles.a4ItemTableRow}>
                        <Text style={[styles.a4ItemTd, { flex: 1, fontWeight: '700' }]}>
                          {`${planLabel} Membership`}
                        </Text>
                        <Text style={[styles.a4ItemTd, { width: 68, textAlign: 'center' }]}>
                          {durationText}
                        </Text>
                        <Text style={[styles.a4ItemTd, { width: 72, textAlign: 'right', fontWeight: '700' }]}>
                          {amountFormatted}
                        </Text>
                      </View>

                      <View style={styles.a4TotalsOuter}>
                        <View style={styles.a4TotalsBox}>
                          <View style={styles.a4GrandTotalLine}>
                            <Text style={styles.a4GrandTotalLbl}>
                              {isPaid ? 'Total Paid' : 'Total Amount'}
                            </Text>
                            <Text style={styles.a4GrandTotalVal}>{`${amountFormatted} INR`}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Section 4: Transaction Reference */}
                    <View style={styles.a4Section}>
                      <Text style={styles.a4SectionHeading}>TRANSACTION REFERENCE</Text>
                      <View style={styles.a4KvTable}>
                        <View style={styles.a4KvRow}>
                          <Text style={styles.a4KvLbl}>Payment Mode</Text>
                          <Text style={styles.a4KvColon}>:</Text>
                          <Text style={styles.a4KvVal}>{paymentModeText}</Text>
                        </View>
                        {selectedPayment.paymentId ? (
                          <View style={styles.a4KvRow}>
                            <Text style={styles.a4KvLbl}>Transaction ID</Text>
                            <Text style={styles.a4KvColon}>:</Text>
                            <Text style={styles.a4KvVal} selectable>{selectedPayment.paymentId}</Text>
                          </View>
                        ) : null}
                        {selectedPayment.orderId ? (
                          <View style={styles.a4KvRow}>
                            <Text style={styles.a4KvLbl}>Order Reference</Text>
                            <Text style={styles.a4KvColon}>:</Text>
                            <Text style={styles.a4KvVal} selectable>{selectedPayment.orderId}</Text>
                          </View>
                        ) : null}
                        {selectedPayment.note ? (
                          <View style={styles.a4KvRow}>
                            <Text style={styles.a4KvLbl}>Remarks</Text>
                            <Text style={styles.a4KvColon}>:</Text>
                            <Text style={styles.a4KvVal}>{selectedPayment.note}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* A4 Document Footer */}
                    <View style={styles.a4Footer}>
                      <Text style={styles.a4FooterTxt}>
                        This is a computer-generated official invoice issued by Rhema Global Ministries.
                      </Text>
                    </View>
                  </View>
                </ScrollView>

                {/* Share & Download Footer */}
                <View
                  style={[
                    styles.editorFooter,
                    {
                      backgroundColor: cardSurface,
                      borderTopColor: borderColor,
                      paddingBottom: Math.max(insets.bottom + 10, 14),
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.invoiceShareBtn,
                      {
                        borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#CBD5E1',
                        backgroundColor: invShareBtnBg,
                      },
                    ]}
                    onPress={() => handleExportInvoice('share', invoicePayload)}
                    disabled={Boolean(exportingInvoice)}
                    activeOpacity={0.85}
                  >
                    {exportingInvoice === 'share' ? (
                      <ActivityIndicator size="small" color={primaryText} />
                    ) : (
                      <>
                        <Share2 size={17} color={primaryText} />
                        <Text style={{ color: primaryText, fontWeight: '800', fontSize: 14 }}>
                          Share Invoice
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, { flex: 1, paddingVertical: 12 }]}
                    onPress={() => handleExportInvoice('download', invoicePayload)}
                    disabled={Boolean(exportingInvoice)}
                    activeOpacity={0.85}
                  >
                    {exportingInvoice === 'download' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Download size={17} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                          Download PDF
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            );
          })() : null}
        </Modal>
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
  editorBackBtn: { padding: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerGrantBtn: {
    height: 36,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: CORAL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerGrantBtnTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  nestedSubTabsWrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 6,
  },
  nestedSubTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nestedSubTabTxt: {
    fontSize: 12.5,
  },
  statusPill: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusPillTxt: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
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
  kpiSectionWrap: { gap: 10 },
  kpiBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kpiBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  kpiBadgeLbl: { fontSize: 12.5 },
  revenueLongCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  revenueLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  revenueImgIcon: {
    width: 60,
    height: 60,
  },
  revenueKicker: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  revenueAmountHero: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 1,
  },
  revenueSubText: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
  },
  previewHintText: {
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  card: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 6 },
  cardRowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  planTitle: { fontSize: 14.5, fontWeight: '800' },
  sectionHead: { fontSize: 14.5, fontWeight: '800', marginBottom: 6 },
  a4Sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  a4DocHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1.2,
    borderBottomColor: '#CBD5E1',
  },
  a4BrandTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.4,
  },
  a4BrandSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    fontWeight: '500',
  },
  a4Heading: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  a4MetaLine: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
    marginTop: 1.5,
  },
  a4Section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  a4SectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.8,
    paddingBottom: 5,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  a4KvTable: {
    gap: 5,
  },
  a4KvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  a4KvLbl: {
    width: 116,
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  a4KvColon: {
    width: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  a4KvVal: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  a4ItemTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  a4ItemTh: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.4,
  },
  a4ItemTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  a4ItemTd: {
    fontSize: 12,
    color: '#0F172A',
  },
  a4TotalsOuter: {
    alignItems: 'flex-end',
    marginTop: 10,
  },
  a4TotalsBox: {
    width: 210,
  },
  a4GrandTotalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: '#0F172A',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  a4GrandTotalLbl: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  a4GrandTotalVal: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  a4Footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  a4FooterTxt: {
    fontSize: 10.5,
    color: '#64748B',
    textAlign: 'center',
  },
  invoiceShareBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  subText: { fontSize: 12, lineHeight: 17 },
  editBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  chip: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  offerSummaryCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  offerHeaderGradient: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  offerHeaderTitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  offerHeaderSub: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  offerBadgePill: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  offerBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  offerHeroBody: {
    paddingHorizontal: 15,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  offerHeroLbl: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  offerPriceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
  },
  offerPriceHero: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  offerMrpStrike: {
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  savingsTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savingsTagBody: {
    height: 30,
    backgroundColor: '#7C1848',
    paddingLeft: 1,
    paddingRight: 11,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    justifyContent: 'center',
  },
  savingsTagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  offerMetricsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  offerMetricCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  offerMetricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 26,
  },
  offerMetricLbl: {
    fontSize: 11,
    fontWeight: '600',
  },
  offerMetricVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  presetPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    borderWidth: 1.2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inputGrid: { flexDirection: 'row', gap: 8, marginTop: 4 },
  inputCol: { flex: 1 },
  lbl: { fontSize: 11.5, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13.5,
  },
  inlineMiniBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  benefitEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trashBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLineBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 10,
  },
  limitMiniInput: {
    width: 68,
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  switchListWrap: {
    marginTop: 6,
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.28)',
  },
  editorFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: 1,
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
