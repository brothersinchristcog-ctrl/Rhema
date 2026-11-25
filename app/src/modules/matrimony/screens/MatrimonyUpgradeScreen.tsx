import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Crown, Lock, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyPlanCarousel from '../components/MatrimonyPlanCarousel';
import { matrimonyApi } from '../services/matrimonyApi';
import { matrimonyPerf } from '../services/matrimonyPerf';
import { MatrimonyMembershipInfo, MatrimonyPlanSpec, MemberEntitlements } from '../types/matrimony';

let RazorpayCheckout: any = null;
try {
  RazorpayCheckout = require('react-native-razorpay').default;
} catch {
  RazorpayCheckout = null;
}

type PlanId = 'silver' | 'gold' | 'platinum';

const PLUM_DARK = '#8A1F52';

const DEFAULT_PLAN_SPECS: MatrimonyPlanSpec[] = [
  {
    planId: 'silver',
    tier: 'silver',
    planName: 'Silver',
    tagline: 'Essential verified connections',
    durationMonths: 3,
    priceInr: 1,
    originalPriceInr: 1,
    discountPercentage: 0,
    badgeText: 'ESSENTIAL',
    benefits: [
      'Valid for 3 months',
      'View 20 Phone Nos & DOB',
      'Send unlimited messages',
      'Shortlist up to 25 profiles',
    ],
    limits: {
      monthlyInterestLimit: -1,
      contactNumberLimit: 20,
      shortlistLimit: 25,
      messageAccess: true,
      callAccess: true,
      whatsappAccess: false,
      advancedFilters: false,
      visibilityPriority: 1,
      highlightStyle: 'none',
      prioritySupport: false,
    },
    isActive: true,
    sortOrder: 1,
  },
  {
    planId: 'gold',
    tier: 'gold',
    planName: 'Gold',
    tagline: 'Accelerated matchmaking & visibility',
    durationMonths: 6,
    priceInr: 2,
    originalPriceInr: 2,
    discountPercentage: 0,
    badgeText: 'MOST POPULAR',
    benefits: [
      'Valid for 6 months',
      'View 50 Phone Nos & DOB',
      'Send unlimited messages',
      'Unlimited Shortlists & Advanced Filters',
    ],
    limits: {
      monthlyInterestLimit: -1,
      contactNumberLimit: 50,
      shortlistLimit: -1,
      messageAccess: true,
      callAccess: true,
      whatsappAccess: false,
      advancedFilters: true,
      visibilityPriority: 2,
      highlightStyle: 'gold',
      prioritySupport: false,
    },
    isActive: true,
    sortOrder: 2,
  },
  {
    planId: 'platinum',
    tier: 'platinum',
    planName: 'Platinum',
    tagline: 'Royal unlimited access & top spotlight',
    durationMonths: 12,
    priceInr: 3,
    originalPriceInr: 3,
    discountPercentage: 0,
    badgeText: 'ROYAL ELITE',
    benefits: [
      'Valid for 12 months',
      'View unlimited Phone Nos & DOB',
      'Send unlimited messages',
      'Unlimited Shortlists & Priority Spotlight',
    ],
    limits: {
      monthlyInterestLimit: -1,
      contactNumberLimit: -1,
      shortlistLimit: -1,
      messageAccess: true,
      callAccess: true,
      whatsappAccess: false,
      advancedFilters: true,
      visibilityPriority: 3,
      highlightStyle: 'platinum',
      prioritySupport: true,
    },
    isActive: true,
    sortOrder: 3,
  },
];

function sanitizePlanBenefits(benefits: unknown, fallbackBenefits: string[]): string[] {
  if (!Array.isArray(benefits) || benefits.length === 0) return fallbackBenefits;
  const cleaned = benefits
    .map((b) => String(b || '').trim())
    .filter((b) => b.length > 0 && !b.toLowerCase().includes('whatsapp'));
  return cleaned.length > 0 ? cleaned : fallbackBenefits;
}

function normalizePlans(rawPlans: MatrimonyPlanSpec[] | null | undefined): MatrimonyPlanSpec[] {
  if (!rawPlans?.length) return DEFAULT_PLAN_SPECS;
  const activeOnly = rawPlans
    .filter((p) => p.isActive !== false)
    .map((p) => {
      const fallback = DEFAULT_PLAN_SPECS.find((f) => f.tier === p.tier);
      return {
        ...p,
        planName: p.planName || fallback?.planName || p.tier,
        tagline: p.tagline || fallback?.tagline || '',
        durationMonths: p.durationMonths || fallback?.durationMonths || 3,
        benefits: sanitizePlanBenefits(p.benefits, fallback?.benefits || []),
      };
    });
  return activeOnly.length > 0 ? activeOnly : DEFAULT_PLAN_SPECS;
}

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
  const [payingPlan, setPayingPlan] = useState<PlanId | null>(null);
  const handleSelectPlan = useCallback((t: PlanId) => setSelectedPlan(t), []);

  const [plans, setPlans] = useState<MatrimonyPlanSpec[]>(() =>
    normalizePlans(matrimonyApi.getCachedPlans())
  );
  const [entitlements, setEntitlements] = useState<MemberEntitlements | null>(() =>
    matrimonyApi.getCachedEntitlements()
  );
  const [membership, setMembership] = useState<MatrimonyMembershipInfo | null>(() => {
    const cached = matrimonyApi.getCachedRegistration()?.profile?.membership;
    return cached || null;
  });

  const refreshMembership = useCallback(async (forcePlans = false) => {
    const trace = matrimonyPerf.startTrace('upgrade_screen_load', { force: forcePlans });
    const [regRes, plansRes, entRes] = await Promise.allSettled([
      matrimonyApi.startRegistration({ force: false }),
      matrimonyApi.getPlans({ force: forcePlans }),
      matrimonyApi.getMemberEntitlements({ force: forcePlans }),
    ]);
    if (regRes.status === 'fulfilled' && regRes.value?.profile?.membership) {
      setMembership(regRes.value.profile.membership);
    }
    if (plansRes.status === 'fulfilled' && plansRes.value?.plans?.length) {
      setPlans(normalizePlans(plansRes.value.plans));
    }
    if (entRes.status === 'fulfilled' && entRes.value?.entitlements) {
      setEntitlements(entRes.value.entitlements);
    }
    trace.stop(true);
  }, []);

  useEffect(() => {
    refreshMembership(true);
    const unsubPlans = matrimonyApi.subscribePlansUpdated((nextPlans) => {
      setPlans(normalizePlans(nextPlans));
    });
    const unsubFocus = navigation?.addListener?.('focus', () => {
      refreshMembership(true);
    });
    return () => {
      unsubPlans();
      unsubFocus?.();
    };
  }, [navigation, refreshMembership]);

  const activeTier =
    entitlements?.subscriptionStatus === 'active'
      ? entitlements.tier
      : membership?.status === 'active' &&
        membership.tier &&
        membership.tier !== 'free' &&
        (!membership.validUntilMs || membership.validUntilMs > Date.now())
      ? membership.tier
      : 'free';

  const payingRef = useRef(false);

  const handlePayNow = async (planSpec: MatrimonyPlanSpec) => {
    const targetPlan = planSpec.tier;
    if (payingRef.current || payingPlan) return;
    if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
      Alert.alert(
        'Payment Unavailable',
        'Razorpay checkout module is not available in this build.'
      );
      return;
    }

    setSelectedPlan(targetPlan);
    payingRef.current = true;
    setPayingPlan(targetPlan);
    try {
      const orderRes = await matrimonyApi.createUpgradeOrder(targetPlan);
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
      const durationLabel = `${planSpec.durationMonths} ${
        planSpec.durationMonths === 1 ? 'Month' : 'Months'
      }`;

      const checkoutOptions = {
        description: `Rhema Matrimony ${orderRes.planName} Plan (${durationLabel})`,
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
            targetPlan === 'platinum'
              ? '#6D28D9'
              : targetPlan === 'gold'
              ? '#D97706'
              : '#475569',
        },
      };

      const paymentResult = await RazorpayCheckout.open(checkoutOptions);
      const verifyRes = await matrimonyApi.verifyUpgradePayment({
        plan: targetPlan,
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
        `Your Rhema Matrimony ${planSpec.planName} Plan is now active. Dates of birth and contact details are unlocked!`,
        [
          {
            text: 'Explore Matches',
            onPress: () => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('MatrimonyMainTabs', { screen: 'MatrimonyMatches' });
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
      payingRef.current = false;
      setPayingPlan(null);
    }
  };

  const activeExpiryLabel =
    activeTier !== 'free' ? formatExpiryDate(membership?.validUntilMs) : null;

  const pageBg = isDark ? colors.bg : '#FAF8F8';
  const heroGradient: readonly [string, string, string] = isDark
    ? ['#1E1624', '#18141E', pageBg]
    : ['#FFF8E7', '#FFF0EE', '#FAF8F8'];
  const cardSurface = isDark ? colors.surface : '#FFFFFF';
  const dividerColor = isDark ? colors.border : '#E5E7EB';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={heroGradient[0]} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 30) }}
      >
        {/* Top Pastel Banner matching reference */}
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.heroBanner}
        >
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
                  backgroundColor: isDark ? 'rgba(217, 119, 6, 0.16)' : '#FFFFFF',
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

          <View style={styles.heroCenterBlock}>
            <View style={styles.specialOfferTitleRow}>
              <Text
                style={[
                  styles.heroMainHeading,
                  { color: colors.text, fontFamily, fontSize: scaleFont(21) },
                ]}
              >
                Upgrade
              </Text>
              <View style={styles.offerTagBadge}>
                <Text style={styles.offerTagBadgeText}>Membership</Text>
              </View>
            </View>
            <Text style={[styles.heroSubLine, { color: colors.textSecondary, fontFamily }]}>
              {activeExpiryLabel
                ? `Current plan active until ${activeExpiryLabel}. Upgrade anytime to extend benefits.`
                : 'Unlock verified contact numbers, dates of birth, and priority Christ-centered matchmaking.'}
            </Text>
          </View>
        </LinearGradient>

        <MatrimonyPlanCarousel
          plans={plans}
          selectedPlan={selectedPlan}
          onSelectPlan={handleSelectPlan}
          activeTier={activeTier}
          actionButtonLabel="Pay Now"
          loadingPlanId={payingPlan}
          onPressPlanAction={handlePayNow}
        />

        {/* Trust & Razorpay Assurance Footer */}
        <View
          style={[
            styles.trustFooterCard,
            { backgroundColor: cardSurface, borderColor: dividerColor },
          ]}
        >
          <ShieldCheck size={19} color="#16A34A" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.trustTitle, { color: colors.text, fontFamily }]}>
              100% Verified Rhema Community
            </Text>
            <View style={styles.secureInline}>
              <Lock size={11} color={colors.textSecondary} />
              <Text style={[styles.trustSub, { color: colors.textSecondary, fontFamily }]}>
                One-time payment · Secured by Razorpay (UPI, Cards & NetBanking)
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroBanner: {
    paddingBottom: 18,
  },
  topNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
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
  heroCenterBlock: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 4,
    gap: 6,
  },
  specialOfferTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroMainHeading: {
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  offerTagBadge: {
    backgroundColor: PLUM_DARK,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offerTagBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  heroSubLine: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '500',
  },
  trustFooterCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  trustTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  secureInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  trustSub: {
    fontSize: 11.5,
    lineHeight: 16,
    flex: 1,
  },
});
