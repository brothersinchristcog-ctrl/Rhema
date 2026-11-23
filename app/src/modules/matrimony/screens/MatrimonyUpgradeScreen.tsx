import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Check,
  Crown,
  Gem,
  Lock,
  Shield,
  ShieldCheck,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { matrimonyApi } from '../services/matrimonyApi';
import { MatrimonyMembershipInfo, MemberEntitlements } from '../types/matrimony';

let RazorpayCheckout: any = null;
try {
  RazorpayCheckout = require('react-native-razorpay').default;
} catch {
  RazorpayCheckout = null;
}

type PlanId = 'silver' | 'gold' | 'platinum';

interface TierPlanSpec {
  id: PlanId;
  name: string;
  tagline: string;
  priceInr: number;
  durationLabel: string;
  badgeText?: string;
  features: string[];
}

const TIER_PLANS: TierPlanSpec[] = [
  {
    id: 'silver',
    name: 'Silver',
    tagline: 'Essential verified connections',
    priceInr: 1,
    durationLabel: '3 Months',
    badgeText: 'ESSENTIAL',
    features: [
      'Send unlimited Interests to matching members',
      'Send unlimited personalised messages on mutual matches',
      'View up to 10 verified Contact Numbers & DOBs',
      'Call & WhatsApp unlocked contacts',
      'Shortlist up to 25 profiles',
    ],
  },
  {
    id: 'gold',
    name: 'Gold',
    tagline: 'Accelerated matchmaking & visibility',
    priceInr: 2,
    durationLabel: '6 Months',
    badgeText: 'MOST POPULAR',
    features: [
      'Send unlimited Interests & personalised messages',
      'View up to 40 verified Contact Numbers & DOBs',
      'Shortlist up to 50 profiles & Advanced Filters',
      'Higher profile visibility & compatibility insights',
      'Call & WhatsApp unlocked contacts',
    ],
  },
  {
    id: 'platinum',
    name: 'Platinum',
    tagline: 'Royal unlimited access & top spotlight',
    priceInr: 3,
    durationLabel: '12 Months',
    badgeText: 'ROYAL ELITE',
    features: [
      'Unlimited Interests, personalised messages & Contact Numbers',
      'Shortlist up to 70 profiles & Advanced Filters',
      'Highest visibility priority & Royal Platinum highlighting',
      'Call, WhatsApp & Priority customer support',
    ],
  },
];

function formatExpiryDate(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  try {
    return new Date(ms).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export default function MatrimonyUpgradeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('gold');
  const [paying, setPaying] = useState(false);
  const [plans, setPlans] = useState<TierPlanSpec[]>(TIER_PLANS);
  const [entitlements, setEntitlements] = useState<MemberEntitlements | null>(null);
  const [membership, setMembership] = useState<MatrimonyMembershipInfo | null>(() => {
    const cached = matrimonyApi.getCachedRegistration()?.profile?.membership;
    return cached || null;
  });

  const refreshMembership = useCallback(async () => {
    const [regRes, plansRes, entRes] = await Promise.allSettled([
      matrimonyApi.startRegistration({ force: true }),
      matrimonyApi.getPlans(),
      matrimonyApi.getMemberEntitlements(),
    ]);
    if (regRes.status === 'fulfilled' && regRes.value?.profile?.membership) {
      setMembership(regRes.value.profile.membership);
    }
    if (plansRes.status === 'fulfilled' && plansRes.value?.plans?.length) {
      const dynamicPlans: TierPlanSpec[] = plansRes.value.plans
        .filter((p) => p.isActive !== false)
        .map((p) => {
          const fallback = TIER_PLANS.find((f) => f.id === p.tier);
          return {
            id: p.tier,
            name: p.planName || fallback?.name || p.tier,
            tagline: p.tagline || fallback?.tagline || '',
            priceInr: p.priceInr,
            durationLabel: `${p.durationMonths} ${p.durationMonths === 1 ? 'Month' : 'Months'}`,
            badgeText: p.badgeText || fallback?.badgeText || '',
            features:
              Array.isArray(p.benefits) && p.benefits.length > 0
                ? p.benefits
                : fallback?.features || [],
          };
        });
      if (dynamicPlans.length > 0) {
        setPlans(dynamicPlans);
      }
    }
    if (entRes.status === 'fulfilled' && entRes.value?.entitlements) {
      setEntitlements(entRes.value.entitlements);
    }
  }, []);

  useEffect(() => {
    refreshMembership();
  }, [refreshMembership]);

  const activeTier =
    entitlements?.subscriptionStatus === 'active'
      ? entitlements.tier
      : membership?.status === 'active' &&
        membership.tier &&
        membership.tier !== 'free' &&
        (!membership.validUntilMs || membership.validUntilMs > Date.now())
      ? membership.tier
      : 'free';

  const currentSpec = plans.find((p) => p.id === selectedPlan) || plans[0] || TIER_PLANS[1];

  const handlePayNow = async () => {
    if (paying) return;
    if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
      Alert.alert(
        'Payment Unavailable',
        'Razorpay checkout module is not available in this build.'
      );
      return;
    }

    setPaying(true);
    try {
      const orderRes = await matrimonyApi.createUpgradeOrder(selectedPlan);
      if (!orderRes?.orderId || !orderRes?.keyId) {
        throw new Error('Could not create payment order.');
      }

      const regProfile = matrimonyApi.getCachedRegistration()?.profile;
      const contactInfo = matrimonyApi.getCachedRegistration()?.contactInfo;
      const prefillName =
        contactInfo?.fullName ||
        regProfile?.displayName ||
        (member as any)?.displayName ||
        'Rhema Member';
      const prefillEmail = contactInfo?.email || user?.email || '';
      const prefillPhone = contactInfo?.phone || user?.phoneNumber || (member as any)?.phone || '';

      const checkoutOptions = {
        description: `Rhema Matrimony ${orderRes.planName} Plan (${currentSpec.durationLabel})`,
        currency: orderRes.currency || 'INR',
        key: orderRes.keyId,
        amount: orderRes.amount,
        name: 'Rhema Matrimony',
        order_id: orderRes.orderId,
        prefill: {
          email: prefillEmail,
          contact: prefillPhone,
          name: prefillName,
        },
        theme: {
          color:
            selectedPlan === 'platinum'
              ? '#4C1D95'
              : selectedPlan === 'gold'
              ? '#D97706'
              : '#475569',
        },
      };

      const paymentResult = await RazorpayCheckout.open(checkoutOptions);
      const verifyRes = await matrimonyApi.verifyUpgradePayment({
        plan: selectedPlan,
        razorpay_payment_id: paymentResult.razorpay_payment_id,
        razorpay_order_id: paymentResult.razorpay_order_id,
        razorpay_signature: paymentResult.razorpay_signature,
      });

      if (verifyRes?.membership) {
        setMembership(verifyRes.membership);
      }
      if (verifyRes?.entitlements) {
        setEntitlements(verifyRes.entitlements);
      } else {
        matrimonyApi
          .getMemberEntitlements()
          .then((r) => r?.entitlements && setEntitlements(r.entitlements))
          .catch(() => undefined);
      }

      Alert.alert(
        'Welcome to Premium!',
        `Your Rhema Matrimony ${currentSpec.name} Plan is now active. Dates of birth and contact details are unlocked!`,
        [
          {
            text: 'Explore Matches',
            onPress: () => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('MatrimonyMatches');
              }
            },
          },
        ]
      );
    } catch (err: any) {
      const desc = String(err?.description || err?.message || '');
      if (
        err?.code === 0 ||
        err?.code === 2 ||
        desc.toLowerCase().includes('cancel')
      ) {
        Alert.alert('Payment Cancelled', 'Your upgrade payment was cancelled.');
      } else {
        Alert.alert('Payment Failed', desc || 'Unable to complete membership upgrade.');
      }
    } finally {
      setPaying(false);
    }
  };

  const renderTierCard = (plan: TierPlanSpec, layerIndex: number) => {
    const isSelected = selectedPlan === plan.id;
    const isCurrentActive = activeTier === plan.id;
    const isPlatinum = plan.id === 'platinum';
    const isGold = plan.id === 'gold';

    const cardGradient: readonly [string, string, string] = isPlatinum
      ? ['#140C28', '#2A134B', '#41184B']
      : isGold
      ? isDark
        ? ['#2E210A', '#3D2A0B', '#231908']
        : ['#FFFDF5', '#FEF3C7', '#FDE68A']
      : isDark
      ? ['#1E293B', '#273549', '#192231']
      : ['#FFFFFF', '#F8FAFC', '#E2E8F0'];

    const borderColor = isSelected
      ? isPlatinum
        ? '#F59E0B'
        : isGold
        ? '#D97706'
        : '#64748B'
      : isPlatinum
      ? 'rgba(251, 191, 36, 0.42)'
      : isGold
      ? isDark
        ? 'rgba(217, 119, 6, 0.45)'
        : '#FCD34D'
      : isDark
      ? '#334155'
      : '#CBD5E1';

    const titleColor = isPlatinum ? '#FEF3C7' : isDark ? '#F8FAFC' : '#0F172A';
    const subColor = isPlatinum
      ? '#DDD6FE'
      : isGold
      ? isDark
        ? '#FDE68A'
        : '#92400E'
      : colors.textSecondary;
    const featureColor = isPlatinum ? '#F3E8FF' : isDark ? '#E2E8F0' : '#1E293B';
    const priceColor = isPlatinum ? '#FBBF24' : isGold ? '#B45309' : isDark ? '#E2E8F0' : '#334155';
    const checkBg = isPlatinum
      ? 'rgba(251, 191, 36, 0.2)'
      : isGold
      ? isDark
        ? 'rgba(217, 119, 6, 0.22)'
        : '#FEF3C7'
      : isDark
      ? '#334155'
      : '#E2E8F0';
    const checkColor = isPlatinum ? '#FBBF24' : isGold ? '#D97706' : isDark ? '#94A3B8' : '#475569';

    const emblemColors: readonly [string, string] = isPlatinum
      ? ['#F59E0B', '#D97706']
      : isGold
      ? ['#FBBF24', '#B45309']
      : ['#94A3B8', '#475569'];

    const badgeBg = isPlatinum
      ? '#F59E0B'
      : isGold
      ? '#B45309'
      : isDark
      ? '#475569'
      : '#64748B';

    const TierIcon = isPlatinum ? Gem : isGold ? Crown : Shield;

    return (
      <TouchableOpacity
        key={plan.id}
        activeOpacity={0.92}
        onPress={() => setSelectedPlan(plan.id)}
        style={[
          styles.tierCardOuter,
          {
            borderColor,
            borderWidth: isSelected ? 2 : 1.2,
            shadowColor: isPlatinum ? '#6D28D9' : isGold ? '#D97706' : '#0F172A',
            shadowOpacity: isSelected ? 0.24 : 0.08,
            elevation: isSelected ? 6 : 2,
          },
        ]}
      >
        <LinearGradient
          colors={cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tierCardInner}
        >
          {/* Top Row: Layer badge + Active badge + Selection Radio */}
          <View style={styles.tierTopMetaRow}>
            <View style={styles.tierBadgesGroup}>
              <View style={[styles.layerChip, { backgroundColor: badgeBg }]}>
                <Text style={styles.layerChipText}>
                  {`TIER ${layerIndex + 1} · ${plan.badgeText}`}
                </Text>
              </View>
              {isCurrentActive ? (
                <View style={styles.activePlanChip}>
                  <Check size={11} color="#FFFFFF" strokeWidth={3} />
                  <Text style={styles.activePlanChipText}>Active</Text>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.radioOuter,
                {
                  borderColor: isSelected
                    ? isPlatinum
                      ? '#FBBF24'
                      : isGold
                      ? '#D97706'
                      : '#475569'
                    : isPlatinum
                    ? 'rgba(255,255,255,0.45)'
                    : '#94A3B8',
                  backgroundColor: isSelected
                    ? isPlatinum
                      ? '#F59E0B'
                      : isGold
                      ? '#D97706'
                      : '#475569'
                    : 'transparent',
                },
              ]}
            >
              {isSelected ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
          </View>

          {/* Plan Header Row: Emblem + Name + Price */}
          <View style={styles.tierHeaderRow}>
            <LinearGradient
              colors={emblemColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tierEmblem}
            >
              <TierIcon size={22} color="#FFFFFF" strokeWidth={2.2} />
            </LinearGradient>

            <View style={{ flex: 1 }}>
              <Text style={[styles.tierName, { color: titleColor, fontFamily, fontSize: scaleFont(20) }]}>
                {plan.name}
              </Text>
              <Text style={[styles.tierTagline, { color: subColor, fontFamily }]}>
                {plan.tagline}
              </Text>
            </View>

            <View style={styles.priceBox}>
              <Text style={[styles.priceValue, { color: priceColor, fontFamily }]}>
                {`₹${plan.priceInr}`}
              </Text>
              <Text style={[styles.priceDuration, { color: subColor, fontFamily }]}>
                {plan.durationLabel}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.tierDivider,
              {
                backgroundColor: isPlatinum
                  ? 'rgba(251, 191, 36, 0.22)'
                  : isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(15, 23, 42, 0.08)',
              },
            ]}
          />

          {/* Features Checklist */}
          <View style={styles.featuresList}>
            {plan.features.map((feat) => (
              <View key={feat} style={styles.featureRow}>
                <View style={[styles.featureCheckCircle, { backgroundColor: checkBg }]}>
                  <Check size={12} color={checkColor} strokeWidth={2.8} />
                </View>
                <Text style={[styles.featureText, { color: featureColor, fontFamily }]}>
                  {feat}
                </Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const activeExpiryLabel =
    activeTier !== 'free' ? formatExpiryDate(membership?.validUntilMs) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      {/* Clean Top App Bar */}
      <View style={styles.topNavBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>

        <View
          style={[
            styles.currentTierBadge,
            {
              backgroundColor: isDark ? 'rgba(217, 119, 6, 0.16)' : '#FFFBEB',
              borderColor: isDark ? 'rgba(251, 191, 36, 0.45)' : '#F59E0B',
            },
          ]}
        >
          <Crown size={13} color={isDark ? '#FBBF24' : '#B45309'} />
          <Text
            style={[
              styles.currentTierText,
              { color: isDark ? '#FDE68A' : '#92400E', fontFamily },
            ]}
          >
            {activeTier === 'free'
              ? 'Free Member'
              : `${activeTier.charAt(0).toUpperCase() + activeTier.slice(1)} Member`}
          </Text>
        </View>
      </View>

      {/* 3-Layer Tier Selection */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cleanHeroTextWrap}>
          <Text style={[styles.heroTitle, { color: colors.text, fontFamily, fontSize: scaleFont(24) }]}>
            Upgrade Your Membership
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary, fontFamily }]}>
            {activeExpiryLabel
              ? `Current plan active until ${activeExpiryLabel}. Upgrade anytime to extend benefits.`
              : 'Unlock verified contact numbers, dates of birth, and priority Christ-centered matchmaking.'}
          </Text>
        </View>

        <View style={styles.sectionPromptRow}>
          <Text style={[styles.sectionPromptTitle, { color: colors.text, fontFamily }]}>
            Choose a Membership Plan
          </Text>
          <Text style={[styles.sectionPromptSub, { color: colors.textSecondary, fontFamily }]}>
            One-time payment · Instant activation
          </Text>
        </View>

        {entitlements ? (
          <View
            style={[
              styles.trustCard,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
                paddingVertical: 10,
              },
            ]}
          >
            <Shield size={17} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.trustTitle, { color: colors.text, fontFamily, fontSize: 12.5 }]}>
                {`Current Plan: ${entitlements.planName} · Interests Left: ${
                  entitlements.interestsRemaining < 0
                    ? 'Unlimited'
                    : `${entitlements.interestsRemaining}/${entitlements.monthlyInterestLimit}`
                }`}
              </Text>
              <Text style={[styles.trustSub, { color: colors.textSecondary, fontFamily, fontSize: 11.5 }]}>
                {`Contacts: ${
                  entitlements.contactNumberLimit === 0
                    ? 'Locked'
                    : entitlements.contactNumberLimit < 0
                    ? 'Unlimited'
                    : `${entitlements.contactNumbersRemaining}/${entitlements.contactNumberLimit} left`
                } · Shortlists: up to ${entitlements.shortlistLimit}`}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.cardsStack}>
          {plans.map((plan, idx) => renderTierCard(plan, idx))}
        </View>

        {/* Trust Assurance Footer */}
        <View
          style={[
            styles.trustCard,
            {
              backgroundColor: colors.surface,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
            },
          ]}
        >
          <ShieldCheck size={20} color="#16A34A" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.trustTitle, { color: colors.text, fontFamily }]}>
              100% Verified Rhema Community
            </Text>
            <Text style={[styles.trustSub, { color: colors.textSecondary, fontFamily }]}>
              No auto-renewal surprises. Payments are encrypted & verified via Razorpay.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Luxury Checkout Footer */}
      <View
        style={[
          styles.checkoutFooter,
          {
            backgroundColor: colors.surface,
            borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.checkoutSummaryRow}>
          <View>
            <Text style={[styles.selectedSummaryTitle, { color: colors.text, fontFamily }]}>
              {`${currentSpec.name} Membership · ${currentSpec.durationLabel}`}
            </Text>
            <View style={styles.secureNoteRow}>
              <Lock size={11} color={colors.textSecondary} />
              <Text style={[styles.secureNoteText, { color: colors.textSecondary, fontFamily }]}>
                Secured by Razorpay · UPI · Cards · NetBanking
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.selectedSummaryPrice,
              {
                color:
                  selectedPlan === 'platinum'
                    ? '#7C3AED'
                    : selectedPlan === 'gold'
                    ? '#B45309'
                    : colors.text,
                fontFamily,
              },
            ]}
          >
            {`₹${currentSpec.priceInr}`}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          disabled={paying}
          onPress={handlePayNow}
          style={[styles.payCtaWrap, paying && { opacity: 0.72 }]}
        >
          <LinearGradient
            colors={
              selectedPlan === 'platinum'
                ? ['#3B0764', '#6D28D9', '#9333EA']
                : selectedPlan === 'gold'
                ? ['#B45309', '#D97706', '#F59E0B']
                : ['#334155', '#475569', '#64748B']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.payCtaBtn}
          >
            {paying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Crown size={18} color="#FFFFFF" />
                <Text style={[styles.payCtaText, { fontFamily }]}>
                  {`Upgrade to ${currentSpec.name} • ₹${currentSpec.priceInr}`}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  currentTierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 18,
  },
  currentTierText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cleanHeroTextWrap: {
    gap: 6,
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  heroTitle: {
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 26,
    gap: 14,
  },
  sectionPromptRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionPromptTitle: {
    fontSize: 16.5,
    fontWeight: '800',
  },
  sectionPromptSub: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardsStack: {
    gap: 14,
  },
  tierCardOuter: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
  },
  tierCardInner: {
    padding: 16,
    gap: 12,
  },
  tierTopMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierBadgesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  layerChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  layerChipText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  activePlanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16A34A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  activePlanChipText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tierEmblem: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierName: {
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  tierTagline: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 1,
  },
  priceBox: {
    alignItems: 'flex-end',
  },
  priceValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  priceDuration: {
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: -2,
  },
  tierDivider: {
    height: 1,
  },
  featuresList: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  featureCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  trustCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  trustTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  trustSub: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  checkoutFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  checkoutSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedSummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  secureNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  secureNoteText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  selectedSummaryPrice: {
    fontSize: 22,
    fontWeight: '900',
  },
  payCtaWrap: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  payCtaBtn: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payCtaText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
});
