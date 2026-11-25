import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import { MatrimonyPlanSpec } from '../types/matrimony';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 68, 326);
const CARD_GAP = 14;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;
const SIDE_PADDING = Math.max(16, (SCREEN_WIDTH - CARD_WIDTH) / 2);

const PLUM_DARK = '#8A1F52';
const CORAL_CTA = '#EC525B';
const PURPLE_OUTLINE = '#7C3AED';
const DISCOUNT_GREEN = '#15803D';

export type MatrimonyCarouselTierId = 'silver' | 'gold' | 'platinum';

interface Props {
  plans: MatrimonyPlanSpec[];
  selectedPlan: MatrimonyCarouselTierId;
  onSelectPlan: (tier: MatrimonyCarouselTierId) => void;
  activeTier?: string;
  actionButtonLabel?: string | ((plan: MatrimonyPlanSpec) => string);
  loadingPlanId?: string | null;
  disabled?: boolean;
  showInactiveBadge?: boolean;
  onPressPlanAction: (plan: MatrimonyPlanSpec) => void;
}

export default React.memo(function MatrimonyPlanCarousel({
  plans,
  selectedPlan,
  onSelectPlan,
  activeTier,
  actionButtonLabel = 'Pay Now',
  loadingPlanId = null,
  disabled = false,
  showInactiveBadge = false,
  onPressPlanAction,
}: Props) {
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;
  const carouselRef = useRef<ScrollView>(null);
  const lastScrolledTargetRef = useRef<string>('');
  const isUserDraggingRef = useRef<boolean>(false);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToTier = (tier: MatrimonyCarouselTierId, index?: number) => {
    const idx =
      typeof index === 'number' && index >= 0
        ? index
        : plans.findIndex((p) => p.tier === tier);
    if (idx < 0) return;
    const key = `${plans.map((p) => p.tier).join(',')}:${tier}`;
    lastScrolledTargetRef.current = key;
    isProgrammaticScrollRef.current = true;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    carouselRef.current?.scrollTo({ x: idx * SNAP_INTERVAL, animated: true });
    scrollTimeoutRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 500);
  };

  useEffect(() => {
    if (!plans.length) return;
    const idx = plans.findIndex((p) => p.tier === selectedPlan);
    if (idx < 0) return;
    const key = `${plans.map((p) => p.tier).join(',')}:${selectedPlan}`;
    if (lastScrolledTargetRef.current === key) return;
    scrollToTier(selectedPlan, idx);
  }, [plans, selectedPlan]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleSelectPlanTab = (tier: MatrimonyCarouselTierId, index: number) => {
    if (selectedPlan === tier) return;
    onSelectPlan(tier);
    scrollToTier(tier, index);
  };

  const handleScrollBeginDrag = () => {
    isUserDraggingRef.current = true;
    isProgrammaticScrollRef.current = false;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
  };

  const handleCarouselScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isUserDraggingRef.current || isProgrammaticScrollRef.current) {
      return;
    }
    const offsetX = e.nativeEvent.contentOffset.x;
    const idx = Math.max(0, Math.min(plans.length - 1, Math.round(offsetX / SNAP_INTERVAL)));
    const nextPlan = plans[idx];
    if (nextPlan && nextPlan.tier !== selectedPlan) {
      const key = `${plans.map((p) => p.tier).join(',')}:${nextPlan.tier}`;
      lastScrolledTargetRef.current = key;
      onSelectPlan(nextPlan.tier);
    }
    isUserDraggingRef.current = false;
  };

  const cardSurface = isDark ? colors.surface : '#FFFFFF';
  const cardHeaderBg = isDark ? '#1E293B' : '#EFF1F5';
  const dividerColor = isDark ? colors.border : '#E5E7EB';

  const renderPlanTab = (plan: MatrimonyPlanSpec, index: number) => {
    const isSelected = selectedPlan === plan.tier;
    const isPlatinum = plan.tier === 'platinum';
    const topFloatingLabel =
      isPlatinum
        ? plan.discountPercentage && plan.discountPercentage > 0
          ? `${plan.discountPercentage}% OFF`
          : plan.badgeText || ''
        : '';
    const durationLabel = `${plan.durationMonths} ${plan.durationMonths === 1 ? 'Month' : 'Months'}`;

    return (
      <View key={plan.planId || plan.tier} style={styles.tabSlot}>
        {topFloatingLabel ? (
          <LinearGradient
            colors={['#8B5CF6', '#6D28D9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tabFloatingPill}
          >
            <Text style={styles.tabFloatingText} numberOfLines={1}>
              {topFloatingLabel}
            </Text>
          </LinearGradient>
        ) : null}

        <Pressable
          onPress={() => handleSelectPlanTab(plan.tier, index)}
          style={[
            styles.planTabPill,
            {
              backgroundColor: isSelected ? PLUM_DARK : cardSurface,
              borderColor: isSelected
                ? PLUM_DARK
                : isPlatinum
                ? PURPLE_OUTLINE
                : dividerColor,
              borderWidth: isPlatinum && !isSelected ? 1.5 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.planTabName,
              {
                color: isSelected ? '#FFFFFF' : colors.text,
                fontFamily,
              },
            ]}
            numberOfLines={1}
          >
            {plan.planName}
          </Text>
          <Text
            style={[
              styles.planTabSub,
              {
                color: isSelected
                  ? 'rgba(255,255,255,0.9)'
                  : isPlatinum
                  ? isDark
                    ? '#C4B5FD'
                    : '#5B21B6'
                  : colors.textSecondary,
                fontFamily,
              },
            ]}
            numberOfLines={1}
          >
            {durationLabel}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderPlanCard = (plan: MatrimonyPlanSpec, index: number) => {
    const isCurrentActive = activeTier === plan.tier;
    const isSelected = selectedPlan === plan.tier;
    const isDisabledPlan = showInactiveBadge && plan.isActive === false;
    const isLoadingThis = loadingPlanId === plan.tier || loadingPlanId === plan.planId;
    const hasDiscount =
      Boolean(plan.discountPercentage && plan.discountPercentage > 0) &&
      Boolean(plan.originalPriceInr && plan.originalPriceInr > plan.priceInr);
    const monthlyApprox =
      plan.durationMonths > 0 && plan.priceInr >= plan.durationMonths
        ? Math.round(plan.priceInr / plan.durationMonths)
        : null;
    const ctaText =
      typeof actionButtonLabel === 'function' ? actionButtonLabel(plan) : actionButtonLabel;

    return (
      <Pressable
        key={plan.planId || plan.tier}
        onPress={() => {
          if (!isSelected) {
            handleSelectPlanTab(plan.tier, index);
          }
        }}
        style={[
          styles.carouselCard,
          {
            width: CARD_WIDTH,
            backgroundColor: cardSurface,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
            shadowColor: '#0F172A',
          },
        ]}
      >
        <View style={[styles.cardHeaderBand, { backgroundColor: cardHeaderBg }]}>
          <View style={styles.cardTitleRow}>
            <Text
              style={[
                styles.cardPlanTitle,
                { color: colors.text, fontFamily, fontSize: scaleFont(19) },
              ]}
            >
              {plan.planName}
            </Text>
            {isCurrentActive ? (
              <View style={styles.activeChip}>
                <Check size={10} color="#FFFFFF" strokeWidth={3} />
                <Text style={styles.activeChipText}>Active</Text>
              </View>
            ) : isDisabledPlan ? (
              <View style={[styles.activeChip, { backgroundColor: '#DC2626' }]}>
                <Text style={styles.activeChipText}>Hidden</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.cardBody}>
          {hasDiscount ? (
            <View style={styles.offerLineRow}>
              <Text
                style={[
                  styles.offerAccent,
                  { color: isDark ? '#4ADE80' : DISCOUNT_GREEN, fontFamily },
                ]}
              >
                {`${plan.discountPercentage}% OFF!`}
              </Text>
              <Text style={[styles.offerMuted, { color: colors.text, fontFamily }]}>
                {'  Valid for today'}
              </Text>
            </View>
          ) : null}

          <View style={[styles.priceMainRow, !monthlyApprox && { marginBottom: 16 }]}>
            {hasDiscount && plan.originalPriceInr ? (
              <Text
                style={[
                  styles.originalPriceStrike,
                  { color: colors.textSecondary, fontFamily },
                ]}
              >
                {`₹${plan.originalPriceInr.toLocaleString('en-IN')}`}
              </Text>
            ) : null}
            <Text
              style={[
                styles.cardPriceBig,
                { color: colors.text, fontFamily, fontSize: scaleFont(30) },
              ]}
            >
              {`₹${plan.priceInr.toLocaleString('en-IN')}`}
            </Text>
          </View>

          {monthlyApprox ? (
            <View
              style={[
                styles.monthlyRibbonPill,
                {
                  backgroundColor: isDark ? 'rgba(236,82,91,0.16)' : '#FDF0F0',
                  borderColor: isDark ? 'rgba(236,82,91,0.28)' : '#F8D7DA',
                },
              ]}
            >
              <Text
                style={[
                  styles.monthlyRibbonText,
                  { color: isDark ? '#FCA5A5' : '#334155', fontFamily },
                ]}
              >
                {`₹${monthlyApprox.toLocaleString('en-IN')} per month`}
              </Text>
            </View>
          ) : null}

          <View style={styles.featuresWrap}>
            {(plan.benefits || []).map((feat, idx) => (
              <View key={`${idx}-${feat}`} style={styles.featureItemRow}>
                <Check size={15} color={CORAL_CTA} strokeWidth={2.6} style={{ marginTop: 2 }} />
                <Text
                  style={[
                    styles.featureItemText,
                    { color: isDark ? '#E2E8F0' : '#1E293B', fontFamily },
                  ]}
                >
                  {feat}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={disabled || Boolean(loadingPlanId)}
            onPress={() => onPressPlanAction(plan)}
            style={[
              styles.cardPayBtn,
              (disabled || Boolean(loadingPlanId)) && { opacity: 0.72 },
            ]}
          >
            {isLoadingThis ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={[styles.cardPayBtnText, { fontFamily }]}>{ctaText}</Text>
            )}
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  };

  return (
    <View>
      <View style={styles.tabsRow}>{plans.map((p, i) => renderPlanTab(p, i))}</View>

      <ScrollView
        ref={carouselRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={SNAP_INTERVAL}
        snapToAlignment="start"
        onScrollBeginDrag={handleScrollBeginDrag}
        onMomentumScrollEnd={handleCarouselScrollEnd}
        onScrollEndDrag={(e) => {
          if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.1) {
            handleCarouselScrollEnd(e);
          }
        }}
        contentContainerStyle={{
          paddingHorizontal: SIDE_PADDING,
          paddingTop: 10,
          paddingBottom: 14,
          gap: CARD_GAP,
        }}
      >
        {plans.map((plan, index) => renderPlanCard(plan, index))}
      </ScrollView>

      <View style={styles.dotsRow}>
        {plans.map((p) => {
          const active = p.tier === selectedPlan;
          return (
            <View
              key={p.planId || p.tier}
              style={[
                styles.dotPill,
                {
                  width: active ? 20 : 6,
                  backgroundColor: active
                    ? isDark
                      ? '#F8FAFC'
                      : '#1E293B'
                    : isDark
                    ? '#475569'
                    : '#CBD5E1',
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 8,
  },
  tabSlot: {
    flex: 1,
    position: 'relative',
  },
  tabFloatingPill: {
    position: 'absolute',
    top: -11,
    alignSelf: 'center',
    zIndex: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabFloatingText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  planTabPill: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTabName: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  planTabSub: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  carouselCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 5,
  },
  cardHeaderBand: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 13,
    alignItems: 'center',
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardPlanTitle: {
    fontWeight: '800',
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#16A34A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  cardBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
  },
  offerLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  offerAccent: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  offerMuted: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  priceMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  originalPriceStrike: {
    fontSize: 18,
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  cardPriceBig: {
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  monthlyRibbonPill: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 18,
  },
  monthlyRibbonText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  featuresWrap: {
    gap: 11,
    marginBottom: 20,
  },
  featureItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  featureItemText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
  },
  cardPayBtn: {
    height: 46,
    borderRadius: 23,
    backgroundColor: CORAL_CTA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPayBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
    marginBottom: 16,
  },
  dotPill: {
    height: 6,
    borderRadius: 3,
  },
});
