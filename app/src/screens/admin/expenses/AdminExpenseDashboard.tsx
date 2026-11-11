import React, { useMemo } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Platform
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  CalendarDays, Receipt, ChevronRight, TrendingUp, AlertCircle, 
  ArrowUpRight, Clock, Layers
} from 'lucide-react-native';
import { fmt, todayISO, GroupOf, getCategoryIconComponent, GROUP_COLORS } from './AdminExpenseUtils';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  gradientColors: readonly [string, string];
  icon: any;
  isDark: boolean;
  onPress?: () => void;
}

const StatCard = ({
  label,
  value,
  sub,
  accent,
  gradientColors,
  icon: Icon,
  isDark,
  onPress
}: StatCardProps) => (
  <TouchableOpacity
    style={styles.statCardWrapper}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={0.82}
  >
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.statCard,
        {
          borderColor: isDark ? `${accent}40` : `${accent}35`,
          shadowColor: accent,
          shadowOpacity: isDark ? 0.28 : 0.12,
        }
      ]}
    >
      {/* Decorative concentric arcs in top right */}
      <Svg
        style={styles.cardWatermark}
        width={72}
        height={72}
        viewBox="0 0 72 72"
        pointerEvents="none"
      >
        <Circle cx="72" cy="0" r="26" fill="none" stroke={isDark ? "rgba(255,255,255,0.07)" : `${accent}20`} strokeWidth="1" />
        <Circle cx="72" cy="0" r="48" fill="none" stroke={isDark ? "rgba(255,255,255,0.05)" : `${accent}14`} strokeWidth="1" />
        <Circle cx="72" cy="0" r="68" fill="none" stroke={isDark ? "rgba(255,255,255,0.03)" : `${accent}08`} strokeWidth="1" />
      </Svg>

      {/* Top Row: Icon circle on left, Pill badge on right */}
      <View style={styles.statCardTopRow}>
        <View style={[styles.statIconBadge, { backgroundColor: isDark ? `${accent}25` : `${accent}18`, borderColor: isDark ? `${accent}50` : `${accent}35` }]}>
          <Icon size={15} color={accent} strokeWidth={2.4} />
        </View>
        <View style={[styles.statPill, { backgroundColor: isDark ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.85)', borderColor: isDark ? `${accent}35` : `${accent}25` }]}>
          <View style={[styles.statPillDot, { backgroundColor: accent }]} />
          <Text style={[styles.statPillText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
            {label}
          </Text>
        </View>
      </View>

      {/* Middle: Big bold value */}
      <View style={styles.statCardValueWrap}>
        <Text
          style={[styles.statCardValue, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {value}
        </Text>
      </View>

      {/* Bottom Row: Subtitle & subtle arrow button */}
      <View style={styles.statCardBottomRow}>
        <Text style={[styles.statCardSub, { color: isDark ? 'rgba(255,255,255,0.65)' : '#64748B' }]} numberOfLines={1}>
          {sub}
        </Text>
        <View style={[styles.statArrowCircle, { backgroundColor: isDark ? `${accent}22` : `${accent}15` }]}>
          <ArrowUpRight size={11} color={accent} strokeWidth={2.6} />
        </View>
      </View>
    </LinearGradient>
  </TouchableOpacity>
);

export default function AdminExpenseDashboard({
  expenses,
  goTo,
  goToRange
}: {
  expenses: any[];
  goTo: (tab: string) => void;
  goToRange: (range: string) => void;
}) {
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor
  } = useAdminTheme();

  const totals = useMemo(() => {
    const d = new Date();
    const today = d.toISOString().split('T')[0];
    const month = today.slice(0, 7);
    d.setDate(d.getDate() - 7);
    const weekAgo = d.toISOString().split('T')[0];

    let total = 0, todayTotal = 0, weekTotal = 0, monthTotal = 0;
    let totalCount = 0, todayCount = 0, weekCount = 0, monthCount = 0;
    let pendingTotal = 0, pendingCount = 0;
    const byGroup: any = { Electricity: 0, Water: 0, Food: 0, Maintenance: 0, Others: 0 };
    expenses.forEach((e) => {
      const sum = e.items.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      total += sum;
      totalCount += 1;
      
      if (e.paymentMethod === 'Pending') {
        pendingTotal += sum;
        pendingCount += 1;
      }
      
      if (e.date === today) { todayTotal += sum; todayCount += 1; }
      if (e.date >= weekAgo && e.date <= today) { weekTotal += sum; weekCount += 1; }
      if (e.date.slice(0, 7) === month) { monthTotal += sum; monthCount += 1; }
      
      e.items.forEach((i: any) => { byGroup[GroupOf(i.category)] += Number(i.amount || 0); });
    });
    return { 
      total, todayTotal, weekTotal, monthTotal, byGroup, 
      totalCount, todayCount, weekCount, monthCount, 
      pendingTotal, pendingCount 
    };
  }, [expenses]);

  const pieData = Object.entries(totals.byGroup)
    .filter(([, v]) => (v as number) > 0)
    .map(([name, value]) => ({ name, value: value as number }));
  const recent = [...expenses].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);

  const getGroupColor = (name: string) => {
    return GROUP_COLORS[name] || "#6366F1";
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Redesigned Symmetrical Top Stat Cards Grid ── */}
        <View style={styles.statGrid}>
          {/* Row 1 */}
          <View style={styles.statRow}>
            <StatCard
              label="TODAY"
              value={fmt(totals.todayTotal)}
              sub={`${totals.todayCount} ${totals.todayCount === 1 ? 'entry' : 'entries'}`}
              accent="#10B981"
              gradientColors={isDark ? ['#062319', '#0D1A15'] : ['#ECFDF5', '#F8FAFC']}
              icon={Clock}
              isDark={isDark}
              onPress={() => goToRange("today")}
            />
            <StatCard
              label="THIS WEEK"
              value={fmt(totals.weekTotal)}
              sub={`${totals.weekCount} ${totals.weekCount === 1 ? 'entry' : 'entries'}`}
              accent="#0EA5E9"
              gradientColors={isDark ? ['#071F32', '#0A151E'] : ['#F0F9FF', '#F8FAFC']}
              icon={CalendarDays}
              isDark={isDark}
              onPress={() => goToRange("week")}
            />
          </View>

          {/* Row 2 */}
          <View style={styles.statRow}>
            <StatCard
              label="THIS MONTH"
              value={fmt(totals.monthTotal)}
              sub={`${totals.monthCount} ${totals.monthCount === 1 ? 'entry' : 'entries'}`}
              accent="#8B5CF6"
              gradientColors={isDark ? ['#1A1338', '#100D1C'] : ['#F5F3FF', '#F8FAFC']}
              icon={Layers}
              isDark={isDark}
              onPress={() => goToRange("month")}
            />
            <StatCard
              label="PENDING"
              value={fmt(totals.pendingTotal)}
              sub={`${totals.pendingCount} bills due`}
              accent="#EF4444"
              gradientColors={isDark ? ['#2A0E18', '#160910'] : ['#FFF1F2', '#F8FAFC']}
              icon={AlertCircle}
              isDark={isDark}
              onPress={() => goToRange("pending")}
            />
          </View>

          {/* Row 3: Total Spent Hero Card */}
          <TouchableOpacity
            style={styles.heroCardWrapper}
            onPress={() => goToRange("all")}
            activeOpacity={0.82}
          >
            <LinearGradient
              colors={isDark ? ['#221603', '#110C02'] : ['#FFFBEB', '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.heroCard,
                {
                  borderColor: isDark ? 'rgba(245, 158, 11, 0.45)' : 'rgba(245, 158, 11, 0.35)',
                  shadowColor: '#F59E0B',
                  shadowOpacity: isDark ? 0.30 : 0.15,
                }
              ]}
            >
              {/* Decorative arcs in top right */}
              <Svg
                style={styles.heroWatermark}
                width={90}
                height={90}
                viewBox="0 0 90 90"
                pointerEvents="none"
              >
                <Circle cx="90" cy="0" r="32" fill="none" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(245,158,11,0.22)"} strokeWidth="1" />
                <Circle cx="90" cy="0" r="58" fill="none" stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(245,158,11,0.15)"} strokeWidth="1" />
                <Circle cx="90" cy="0" r="84" fill="none" stroke={isDark ? "rgba(255,255,255,0.03)" : "rgba(245,158,11,0.08)"} strokeWidth="1" />
              </Svg>

              <View style={styles.heroCardInner}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.statIconBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7', borderColor: isDark ? 'rgba(245, 158, 11, 0.50)' : '#FDE68A' }]}>
                      <TrendingUp size={15} color="#F59E0B" strokeWidth={2.4} />
                    </View>
                    <View style={[styles.statPill, { backgroundColor: isDark ? 'rgba(0,0,0,0.40)' : '#FEF3C7', borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.25)' }]}>
                      <View style={[styles.statPillDot, { backgroundColor: '#F59E0B' }]} />
                      <Text style={[styles.statPillText, { color: isDark ? '#FFFFFF' : '#92400E' }]}>
                        TOTAL SPENT
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.heroCardValue, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {fmt(totals.total)}
                  </Text>
                  <Text style={[styles.statCardSub, { color: isDark ? 'rgba(255, 255, 255, 0.65)' : '#64748B', marginTop: 3 }]}>
                    {totals.totalCount} total ledger {totals.totalCount === 1 ? 'entry' : 'entries'}
                  </Text>
                </View>
                <View style={[styles.heroArrowBtn, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.20)' : '#FEF3C7', borderColor: isDark ? 'rgba(245, 158, 11, 0.40)' : '#FDE68A' }]}>
                  <ArrowUpRight size={18} color="#F59E0B" strokeWidth={2.5} />
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Recent Entries Card ── */}
        <View
          style={[
            styles.contentCard,
            {
              backgroundColor: cardSurface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
              shadowColor: isDark ? '#000000' : '#0F172A',
            }
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardHeaderTitle, { color: primaryText }]}>Recent Entries</Text>
            <TouchableOpacity style={styles.linkBtn} onPress={() => goToRange("all")}>
              <Text style={[styles.linkBtnText, { color: isDark ? '#38BDF8' : '#0284C7' }]}>View All</Text>
              <ChevronRight size={14} color={isDark ? '#38BDF8' : '#0284C7'} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.recentList}>
            {recent.length === 0 ? (
              <Text style={[styles.emptyHint, { color: secondaryText }]}>
                No expenses recorded yet.
              </Text>
            ) : (
              recent.map((e, idx) => {
                const sum = e.items.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
                const cat = e.items[0]?.category || "Miscellaneous";
                const CatIcon = getCategoryIconComponent(cat);
                const isLast = idx === recent.length - 1;
                
                return (
                  <View
                    key={e.id}
                    style={[
                      styles.recentRow,
                      {
                        borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : borderColor,
                        borderBottomWidth: isLast ? 0 : 1
                      }
                    ]}
                  >
                    <View
                      style={[
                        styles.recentIcon,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
                        }
                      ]}
                    >
                      <CatIcon size={16} color={isDark ? '#10B981' : '#059669'} strokeWidth={2} />
                    </View>
                    <View style={styles.recentMid}>
                      <Text style={[styles.recentTitle, { color: primaryText }]} numberOfLines={1}>
                        {e.eventName ? e.eventName : (e.vendor || cat)}
                      </Text>
                      <View style={styles.recentDateRow}>
                        <Text style={[styles.recentDate, { color: secondaryText }]}>
                          {e.date}
                        </Text>
                        <Text style={[styles.recentCatPill, { color: secondaryText }]}>
                          · {cat}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.recentAmt, { color: primaryText }]}>{fmt(sum)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* ── Spend by Category Card ── */}
        <View
          style={[
            styles.contentCard,
            {
              backgroundColor: cardSurface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
              shadowColor: isDark ? '#000000' : '#0F172A',
            }
          ]}
        >
          <Text style={[styles.cardHeaderTitle, { color: primaryText }]}>Spend by Category</Text>
          
          <View style={styles.pieChartContainer}>
            <View style={styles.pieWrapper}>
              <Svg width={140} height={140} viewBox="0 0 140 140">
                {(() => {
                  let currentAngle = -Math.PI / 2;
                  const radius = 70;
                  const center = 70;
                  
                  if (!totals.total) {
                    return <Circle cx={center} cy={center} r={radius} fill={isDark ? '#27272A' : '#E2E8F0'} />;
                  }

                  return pieData.map((d) => {
                    if (d.value === 0) return null;
                    const sliceAngle = (d.value / totals.total) * 2 * Math.PI;
                    const nextAngle = currentAngle + sliceAngle;
                    
                    if (d.value === totals.total) {
                      return <Circle key={d.name} cx={center} cy={center} r={radius} fill={getGroupColor(d.name)} />;
                    }

                    const startX = center + radius * Math.cos(currentAngle);
                    const startY = center + radius * Math.sin(currentAngle);
                    const endX = center + radius * Math.cos(nextAngle);
                    const endY = center + radius * Math.sin(nextAngle);
                    const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

                    const pathData = `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

                    currentAngle = nextAngle;
                    return <Path key={d.name} d={pathData} fill={getGroupColor(d.name)} />;
                  });
                })()}
                {/* Donut Center Hole */}
                <Circle cx={70} cy={70} r={42} fill={cardSurface} />
              </Svg>
              <View style={styles.pieCenterText}>
                <Text style={[styles.pieTotalLabel, { color: secondaryText }]}>TOTAL</Text>
                <Text style={[styles.pieTotalValue, { color: primaryText }]} numberOfLines={1} adjustsFontSizeToFit>
                  {fmt(totals.total)}
                </Text>
              </View>
            </View>

            <View style={styles.pieLegend}>
              {pieData.length === 0 ? (
                <Text style={[styles.emptyHint, { color: secondaryText }]}>
                  No categorized expenses.
                </Text>
              ) : (
                pieData.map(d => {
                  const perc = totals.total ? Math.round((d.value / totals.total) * 100) : 0;
                  return (
                    <View key={d.name} style={styles.legendRow}>
                      <View style={styles.chartLegend}>
                        <View style={[styles.legendDot, { backgroundColor: getGroupColor(d.name) }]} />
                        <Text style={[styles.chartLabel, { color: primaryText }]} numberOfLines={1}>{d.name}</Text>
                      </View>
                      <Text style={[styles.chartVal, { color: secondaryText }]}>{perc}%</Text>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
    gap: 14,
  },
  statGrid: {
    flexDirection: 'column',
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statCardWrapper: {
    flex: 1,
    borderRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  statCard: {
    borderRadius: 18,
    padding: 13,
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 124,
    justifyContent: 'space-between',
  },
  cardWatermark: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  statCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
  },
  statPillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statCardValueWrap: {
    marginVertical: 2,
  },
  statCardValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  statCardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statCardSub: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  statArrowCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCardWrapper: {
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  heroCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'hidden',
  },
  heroWatermark: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  heroCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCardValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 4,
  },
  heroArrowBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  recentList: {
    flexDirection: 'column',
  },
  emptyHint: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 12,
    textAlign: 'center',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  recentIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recentMid: {
    flex: 1,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  recentDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  recentDate: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  recentCatPill: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  recentAmt: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  pieChartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  pieWrapper: {
    width: 140,
    height: 140,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieCenterText: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pieTotalLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  pieTotalValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  pieLegend: {
    flex: 1,
    marginLeft: 20,
    flexDirection: 'column',
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  chartLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  chartVal: {
    fontSize: 12,
    fontWeight: '700',
  },
});
