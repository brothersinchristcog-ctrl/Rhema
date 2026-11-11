import React, { useContext, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, DeviceEventEmitter, StatusBar, Platform, Animated, Easing } from 'react-native';
import { ArrowLeft, FileText, Heart, Sun, Calendar, TrendingUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, formatCurrency } from './AdminDonationsUtils';
import { AdminTabContext } from '../../../context/AdminTabContext';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

export default function AdminDonationsDashboard({ donations = [], onNavigate }: any) {
  const { isDark } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const { setActiveTab } = useContext(AdminTabContext) || {};
  const today = new Date().toDateString();

  // Splash shimmer wave animation moving from left to right across bottom badge
  const splashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const splashLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(splashAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ])
    );
    splashLoop.start();
    return () => splashLoop.stop();
  }, [splashAnim]);

  const splashTranslateX = splashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 390],
  });

  // Calculate start dates
  const now = new Date();
  const startWeek = new Date(now);
  startWeek.setDate(now.getDate() - now.getDay()); // Sunday as start of week
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startYear = new Date(now.getFullYear(), 0, 1);

  const buckets = { today: [] as any[], week: [] as any[], month: [] as any[], year: [] as any[] };

  donations.forEach((d: any) => {
    if (!d.date) return;
    const dt = new Date(d.date);
    if (dt.toDateString() === today) buckets.today.push(d);
    if (dt >= startWeek) buckets.week.push(d);
    if (dt >= startMonth) buckets.month.push(d);
    if (dt >= startYear) buckets.year.push(d);
  });

  const getAmt = (arr: any[]) => arr.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  const todayAmt = getAmt(buckets.today);
  const todayCount = buckets.today.length;

  const weekAmt = getAmt(buckets.week);
  const weekCount = buckets.week.length;

  const monthAmt = getAmt(buckets.month);
  const monthCount = buckets.month.length;
  const monthTarget = 200000;
  const monthPercent = Math.min(100, Math.round((monthAmt / monthTarget) * 100));
  const monthToGo = Math.max(0, monthTarget - monthAmt);

  const yearAmt = getAmt(buckets.year);
  const yearCount = buckets.year.length;

  const currentMonthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ── Dynamic Trend Badges (vs yesterday, vs last week, vs last month, vs last year) ──
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayString = yesterday.toDateString();
  const yesterdayDonations = donations.filter((d: any) => d.date && new Date(d.date).toDateString() === yesterdayString);
  const yesterdayAmt = getAmt(yesterdayDonations);

  const startLastWeek = new Date(startWeek);
  startLastWeek.setDate(startWeek.getDate() - 7);
  const endLastWeek = new Date(startWeek);
  const lastWeekDonations = donations.filter((d: any) => {
    if (!d.date) return false;
    const dt = new Date(d.date);
    return dt >= startLastWeek && dt < endLastWeek;
  });
  const lastWeekAmt = getAmt(lastWeekDonations);

  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthDonations = donations.filter((d: any) => {
    if (!d.date) return false;
    const dt = new Date(d.date);
    return dt >= startLastMonth && dt < endLastMonth;
  });
  const lastMonthAmt = getAmt(lastMonthDonations);

  const startLastYear = new Date(now.getFullYear() - 1, 0, 1);
  const endLastYear = new Date(now.getFullYear(), 0, 1);
  const lastYearDonations = donations.filter((d: any) => {
    if (!d.date) return false;
    const dt = new Date(d.date);
    return dt >= startLastYear && dt < endLastYear;
  });
  const lastYearAmt = getAmt(lastYearDonations);

  const calcTrend = (current: number, previous: number) => {
    if (previous === 0) {
      if (current === 0) return { text: '0%', isUp: true };
      return { text: '↗ 100%', isUp: true };
    }
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct >= 0) {
      return { text: `↗ ${pct}%`, isUp: true };
    }
    return { text: `↘ ${Math.abs(pct)}%`, isUp: false };
  };

  const todayTrend = calcTrend(todayAmt, yesterdayAmt);
  const weekTrend = calcTrend(weekAmt, lastWeekAmt);
  const monthTrend = calcTrend(monthAmt, lastMonthAmt);
  const yearTrend = calcTrend(yearAmt, lastYearAmt);

  // ── Dynamic Today Sparkline Curve (based on donation timestamps) ──
  let morningAmt = 0;
  let noonAmt = 0;
  let eveningAmt = 0;
  buckets.today.forEach((d: any) => {
    if (!d.date) return;
    const dt = new Date(d.date);
    const hr = dt.getHours();
    const amt = Number(d.amount) || 0;
    if (hr < 12) morningAmt += amt;
    else if (hr < 18) noonAmt += amt;
    else eveningAmt += amt;
  });

  const p1 = morningAmt;
  const p2 = p1 + noonAmt;
  const p3 = p2 + eveningAmt;
  const maxTodayPoint = Math.max(p3, 1);

  // SVG height is 32, so y ranges from 26 (bottom) to 6 (top)
  const getTodayY = (val: number) => {
    if (todayAmt === 0) return 24;
    const ratio = Math.min(1, val / maxTodayPoint);
    return Math.round(26 - ratio * 18);
  };

  const y0 = getTodayY(0);
  const y1 = getTodayY(p1);
  const y2 = getTodayY(p2);
  const y3 = getTodayY(p3);

  const sparklineLinePath = `M 5,${y0} Q 45,${y1} 85,${y2} T 135,${y3}`;
  const sparklineAreaPath = `M 5,${y0} Q 45,${y1} 85,${y2} T 135,${y3} L 135,32 L 5,32 Z`;

  // Weekly breakdown by weekday (Monday=0 .. Sunday=6)
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  buckets.week.forEach((d: any) => {
    if (!d.date) return;
    const dt = new Date(d.date);
    const day = (dt.getDay() + 6) % 7; // Sunday=0 -> 6, Monday=1 -> 0
    weekdayTotals[day] += Number(d.amount) || 0;
  });
  const maxWeekdayAmt = Math.max(...weekdayTotals);
  const highestWeekdayIdx = maxWeekdayAmt > 0 ? weekdayTotals.indexOf(maxWeekdayAmt) : -1;
  const highestWeekdayName = highestWeekdayIdx >= 0 ? weekdayNames[highestWeekdayIdx] : 'Sunday';

  const weekBars = [
    { day: 'M', amt: weekdayTotals[0], isHigh: highestWeekdayIdx === 0 },
    { day: 'T', amt: weekdayTotals[1], isHigh: highestWeekdayIdx === 1 },
    { day: 'W', amt: weekdayTotals[2], isHigh: highestWeekdayIdx === 2 },
    { day: 'T', amt: weekdayTotals[3], isHigh: highestWeekdayIdx === 3 },
    { day: 'F', amt: weekdayTotals[4], isHigh: highestWeekdayIdx === 4 },
    { day: 'S', amt: weekdayTotals[5], isHigh: highestWeekdayIdx === 5 },
    { day: 'S', amt: weekdayTotals[6], isHigh: highestWeekdayIdx === 6 },
  ];

  const getWeekBarHeight = (amt: number, isHigh: boolean) => {
    if (maxWeekdayAmt > 0) {
      return Math.max(6, Math.round((amt / maxWeekdayAmt) * 30));
    }
    return 8;
  };

  // Yearly breakdown by month (Jan=0 .. Dec=11)
  const monthTotals = Array(12).fill(0);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  buckets.year.forEach((d: any) => {
    if (!d.date) return;
    const dt = new Date(d.date);
    const m = dt.getMonth();
    monthTotals[m] += Number(d.amount) || 0;
  });
  const maxMonthAmt = Math.max(...monthTotals);
  const highestMonthIdx = maxMonthAmt > 0 ? monthTotals.indexOf(maxMonthAmt) : -1;
  const highestMonthName = highestMonthIdx >= 0 ? monthNames[highestMonthIdx] : monthNames[now.getMonth()];

  const getYearBarHeight = (amt: number, isHigh: boolean) => {
    if (maxMonthAmt > 0) {
      return Math.max(5, Math.round((amt / maxMonthAmt) * 30));
    }
    return 7;
  };

  const yearBars = monthNames.map((name, i) => ({
    name,
    amt: monthTotals[i],
    isHigh: highestMonthIdx === i && maxMonthAmt > 0,
  }));

  const handleBack = () => {
    if (setActiveTab) {
      setActiveTab(0);
    }
    DeviceEventEmitter.emit('NAVIGATE_ADMIN', 0);
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />

      {/* ── Modern Centered Header (Pure Black in Dark Mode, Pure White in White Mode) ── */}
      <View
        style={[
          styles.topbar,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomWidth: 1.5,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
            paddingTop: Platform.OS === 'ios' ? 56 : 16,
            paddingBottom: 10,
            paddingHorizontal: 16,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            style={[
              styles.backBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : '#CBD5E1',
                borderWidth: 1.5,
              },
            ]}
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.4} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '800',
                color: isDark ? '#FFFFFF' : '#0F172A',
                textAlign: 'center',
              }}
              numberOfLines={1}
            >
              Donations
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: isDark ? '#94A3B8' : '#64748B',
                marginTop: 2,
                textAlign: 'center',
              }}
              numberOfLines={1}
            >
              Rhema Global Ministries
            </Text>
          </View>

          {/* Spacer to keep title centered */}
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* ── Overview Section Header (from design) ── */}
        <View style={styles.overviewHeader}>
          <Text style={[styles.overviewTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
            Overview
          </Text>
          <Text style={[styles.overviewDate, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {currentMonthYear}
          </Text>
        </View>

        <View style={styles.cardsGrid}>
          {/* ── Card 1: Today (Deep Purple Card) ── */}
          <TouchableOpacity
            style={styles.cardWrapper}
            activeOpacity={0.82}
            onPress={() => onNavigate && onNavigate('list')}
          >
            <LinearGradient
              colors={['#320B62', '#220546']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.cardBase,
                {
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#4C1D95',
                  shadowColor: '#2E0854',
                },
              ]}
            >
              {/* Concentric rings in top-right */}
              <Svg
                style={styles.concentricRings}
                width={90}
                height={90}
                viewBox="0 0 90 90"
                pointerEvents="none"
              >
                <Circle cx="90" cy="0" r="30" fill="none" stroke="rgba(255, 255, 255, 0.09)" strokeWidth="1" />
                <Circle cx="90" cy="0" r="54" fill="none" stroke="rgba(255, 255, 255, 0.07)" strokeWidth="1" />
                <Circle cx="90" cy="0" r="78" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
              </Svg>

              {/* Card Top: Sun Icon & Pill Badge */}
              <View style={styles.cardTopRow}>
                <View style={styles.todayIconBox}>
                  <Sun size={15} color="#FFFFFF" strokeWidth={2.4} />
                </View>
                <View style={styles.todayPillBadge}>
                  <Text style={styles.todayPillText}>{todayTrend.text}</Text>
                </View>
              </View>

              {/* Labels & Amount */}
              <View style={styles.metaBlock}>
                <Text style={styles.todayTitle}>Today</Text>
                <Text style={styles.todayAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {formatCurrency(todayAmt)}
                </Text>
                <Text style={styles.todaySubtitle}>vs yesterday</Text>
              </View>

              {/* Dynamic Sparkline Curve */}
              <View style={styles.sparklineWrap}>
                <Svg width="100%" height={32} viewBox="0 0 140 32">
                  <Defs>
                    <SvgLinearGradient id="todaySparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor="#FCD34D" stopOpacity="0.40" />
                      <Stop offset="100%" stopColor="#FCD34D" stopOpacity="0.0" />
                    </SvgLinearGradient>
                  </Defs>
                  {/* Dashed guide line */}
                  <Path
                    d={sparklineLinePath}
                    fill="none"
                    stroke="#FCD34D"
                    strokeWidth="1.2"
                    strokeDasharray="3,3"
                    opacity="0.30"
                  />
                  {/* Gradient Fill */}
                  <Path
                    d={sparklineAreaPath}
                    fill="url(#todaySparkGrad)"
                  />
                  {/* Main Line */}
                  <Path
                    d={sparklineLinePath}
                    fill="none"
                    stroke="#FCD34D"
                    strokeWidth="2.2"
                  />
                  {/* Point Circle */}
                  <Circle cx="135" cy={y3} r="3.5" fill="#FDE047" />
                  <Circle cx="135" cy={y3} r="1.5" fill="#FFFFFF" />
                </Svg>

                <View style={styles.timeLabelsRow}>
                  <Text style={styles.timeLabel}>6am</Text>
                  <Text style={styles.timeLabel}>12pm</Text>
                  <Text style={styles.timeLabel}>Now</Text>
                </View>
              </View>

              {/* Footer */}
              <Text style={styles.todayFooterText} numberOfLines={1}>
                {todayCount} {todayCount === 1 ? 'donation' : 'donations'} so far
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* ── Card 2: This week (White Card with 7 Bars) ── */}
          <TouchableOpacity
            style={styles.cardWrapper}
            activeOpacity={0.82}
            onPress={() => onNavigate && onNavigate('list')}
          >
            <View
              style={[
                styles.cardBase,
                {
                  backgroundColor: isDark ? '#1C1826' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#EDE9FE',
                  shadowColor: isDark ? '#000000' : '#4C1D95',
                  shadowOpacity: isDark ? 0.35 : 0.06,
                },
              ]}
            >
              {/* Card Top: Calendar Icon & Pill Badge */}
              <View style={styles.cardTopRow}>
                <View style={[styles.whiteCardIconBox, { backgroundColor: isDark ? 'rgba(168, 85, 247, 0.15)' : '#F3E8FF' }]}>
                  <Calendar size={15} color={isDark ? '#C084FC' : '#6B21A8'} strokeWidth={2.4} />
                </View>
                <View style={[styles.whiteCardPillBadge, { backgroundColor: isDark ? 'rgba(168, 85, 247, 0.15)' : '#F3E8FF' }]}>
                  <Text style={[styles.whiteCardPillText, { color: isDark ? '#C084FC' : '#6B21A8' }]}>{weekTrend.text}</Text>
                </View>
              </View>

              {/* Labels & Amount */}
              <View style={styles.metaBlock}>
                <Text style={[styles.lightCardTitle, { color: isDark ? '#E2E8F0' : '#475569' }]}>This week</Text>
                <Text style={[styles.lightCardAmount, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {formatCurrency(weekAmt)}
                </Text>
                <Text style={[styles.lightCardSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>vs last week</Text>
              </View>

              {/* 7 Weekday Bars */}
              <View style={styles.weekChartWrap}>
                <View style={styles.barsRow}>
                  {weekBars.map((b, i) => (
                    <View key={i} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: getWeekBarHeight(b.amt, b.isHigh),
                              backgroundColor: b.isHigh
                                ? (isDark ? '#A855F7' : '#300A5E')
                                : (isDark ? 'rgba(255, 255, 255, 0.16)' : '#DDD6FE'),
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.barDayText, { color: isDark ? '#94A3B8' : '#64748B' }]}>{b.day}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Footer */}
              <Text style={[styles.lightCardFooterText, { color: isDark ? '#94A3B8' : '#475569' }]} numberOfLines={1}>
                {weekCount} {weekCount === 1 ? 'donation' : 'donations'}{weekCount > 0 && maxWeekdayAmt > 0 ? ` · ${highestWeekdayName} is highest` : ''}
              </Text>
            </View>
          </TouchableOpacity>

          {/* ── Card 3: This month (White Card with Progress Donut) ── */}
          <TouchableOpacity
            style={styles.cardWrapper}
            activeOpacity={0.82}
            onPress={() => onNavigate && onNavigate('list')}
          >
            <View
              style={[
                styles.cardBase,
                {
                  backgroundColor: isDark ? '#1C1826' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#EDE9FE',
                  shadowColor: isDark ? '#000000' : '#4C1D95',
                  shadowOpacity: isDark ? 0.35 : 0.06,
                },
              ]}
            >
              {/* Card Top: Calendar Icon & Pill Badge */}
              <View style={styles.cardTopRow}>
                <View style={[styles.whiteCardIconBox, { backgroundColor: isDark ? 'rgba(168, 85, 247, 0.15)' : '#F3E8FF' }]}>
                  <Calendar size={15} color={isDark ? '#C084FC' : '#6B21A8'} strokeWidth={2.4} />
                </View>
                <View style={[styles.whiteCardPillBadge, { backgroundColor: isDark ? 'rgba(168, 85, 247, 0.15)' : '#F3E8FF' }]}>
                  <Text style={[styles.whiteCardPillText, { color: isDark ? '#C084FC' : '#6B21A8' }]}>{monthTrend.text}</Text>
                </View>
              </View>

              {/* Labels & Amount */}
              <View style={styles.metaBlock}>
                <Text style={[styles.lightCardTitle, { color: isDark ? '#E2E8F0' : '#475569' }]}>This month</Text>
                <Text style={[styles.lightCardAmount, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {formatCurrency(monthAmt)}
                </Text>
                <Text style={[styles.lightCardSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>vs last month</Text>
              </View>

              {/* Progress Donut & Target */}
              <View style={styles.donutRow}>
                <View style={styles.donutContainer}>
                  <Svg width={46} height={46} viewBox="0 0 46 46">
                    <Circle
                      cx="23"
                      cy="23"
                      r="18"
                      stroke={isDark ? 'rgba(255, 255, 255, 0.12)' : '#F1F5F9'}
                      strokeWidth="5"
                      fill="none"
                    />
                    <Circle
                      cx="23"
                      cy="23"
                      r="18"
                      stroke={isDark ? '#A855F7' : '#300A5E'}
                      strokeWidth="5"
                      strokeDasharray={113.1}
                      strokeDashoffset={113.1 * (1 - monthPercent / 100)}
                      strokeLinecap="round"
                      fill="none"
                      transform="rotate(-90 23 23)"
                    />
                  </Svg>
                  <View style={styles.donutCenter}>
                    <Text style={[styles.donutPercentText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                      {monthPercent}%
                    </Text>
                  </View>
                </View>

                <View style={styles.targetCol}>
                  <Text style={[styles.targetLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>of goal</Text>
                  <Text style={[styles.targetAmount, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>{formatCurrency(monthTarget)}</Text>
                  <Text style={[styles.targetLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>target</Text>
                </View>
              </View>

              {/* Footer */}
              <Text style={[styles.lightCardFooterText, { color: isDark ? '#94A3B8' : '#475569' }]} numberOfLines={1}>
                {monthCount} {monthCount === 1 ? 'donation' : 'donations'}{monthAmt >= monthTarget ? ' · Goal achieved!' : (monthCount > 0 ? ` · ${formatCurrency(monthToGo)} to go` : '')}
              </Text>
            </View>
          </TouchableOpacity>

          {/* ── Card 4: This year (Warm Honey Gold Card) ── */}
          <TouchableOpacity
            style={styles.cardWrapper}
            activeOpacity={0.82}
            onPress={() => onNavigate && onNavigate('list')}
          >
            <LinearGradient
              colors={['#E5B84B', '#DFB245']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.cardBase,
                {
                  borderColor: '#D4A432',
                  shadowColor: '#DFB245',
                  shadowOpacity: 0.25,
                },
              ]}
            >
              {/* Card Top: Trending Icon & Pill Badge */}
              <View style={styles.cardTopRow}>
                <View style={styles.goldCardIconBox}>
                  <TrendingUp size={15} color="#451A03" strokeWidth={2.4} />
                </View>
                <View style={styles.goldCardPillBadge}>
                  <Text style={styles.goldCardPillText}>{yearTrend.text}</Text>
                </View>
              </View>

              {/* Labels & Amount */}
              <View style={styles.metaBlock}>
                <Text style={styles.goldCardTitle}>This year</Text>
                <Text style={styles.goldCardAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {formatCurrency(yearAmt)}
                </Text>
                <Text style={styles.goldCardSubtitle}>vs last year</Text>
              </View>

              {/* 12 Monthly Bars */}
              <View style={styles.yearChartWrap}>
                <View style={styles.yearBarsRow}>
                  {yearBars.map((b, i) => (
                    <View key={i} style={styles.yearBarCol}>
                      <View
                        style={[
                          styles.yearBarFill,
                          {
                            height: getYearBarHeight(b.amt, b.isHigh),
                            backgroundColor: b.isHigh ? '#1C0F05' : 'rgba(69, 26, 3, 0.28)',
                          },
                        ]}
                      />
                    </View>
                  ))}
                </View>
                <View style={styles.yearLabelsRow}>
                  <Text style={styles.yearLabelText}>Jan</Text>
                  <Text style={styles.yearLabelText}>Jun</Text>
                  <Text style={styles.yearLabelText}>Dec</Text>
                </View>
              </View>

              {/* Footer */}
              <Text style={styles.goldCardFooterText} numberOfLines={1}>
                {yearCount} {yearCount === 1 ? 'donation' : 'donations'}{yearCount > 0 && maxMonthAmt > 0 ? ` · ${highestMonthName} is highest` : ''}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Bottom Navigation in One Long Badge with Single Cross Line & Shadow ── */}
      <View 
        style={{ 
          paddingHorizontal: 20, 
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 16) + (Platform.OS === 'android' ? 24 : 14),
        }}
      >
        <View
          style={[
            styles.longBadge,
            {
              backgroundColor: isDark ? '#FFFFFF' : '#000000',
              borderColor: isDark ? '#E2E8F0' : 'rgba(255, 255, 255, 0.15)',
              shadowColor: isDark ? '#FFFFFF' : '#000000',
              shadowOpacity: isDark ? 0.22 : 0.25,
            },
          ]}
        >
          {/* Single Cross/Angled Line with Shadow (Sweeping Left to Right) */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -12,
              bottom: -12,
              width: 28,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [
                { translateX: splashTranslateX },
                { rotate: '-25deg' },
              ],
              zIndex: 0,
            }}
          >
            {/* Soft Ambient Shadow / Glow around the single line */}
            <LinearGradient
              colors={
                isDark
                  ? ['transparent', 'rgba(0, 0, 0, 0.20)', 'transparent']
                  : ['transparent', 'rgba(255, 255, 255, 0.35)', 'transparent']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Exactly One Single Crisp Line with Shadow */}
            <View
              style={{
                width: 2.2,
                height: '100%',
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.55)' : '#FFFFFF',
                shadowColor: isDark ? '#000000' : '#FFFFFF',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.85,
                shadowRadius: 5,
                elevation: 3,
              }}
            />
          </Animated.View>

          {/* Button 1: Online Donations */}
          <TouchableOpacity
            style={styles.badgeBtn}
            onPress={() => onNavigate('give')}
            activeOpacity={0.75}
          >
            <Heart color={isDark ? '#000000' : '#FFFFFF'} size={18} strokeWidth={2.4} />
            <Text
              style={[
                styles.badgeBtnText,
                { color: isDark ? '#000000' : '#FFFFFF' },
              ]}
              numberOfLines={1}
            >
              Online Donations
            </Text>
          </TouchableOpacity>

          {/* Vertical Divider | */}
          <View
            style={[
              styles.badgeDivider,
              {
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.22)',
              },
            ]}
          />

          {/* Button 2: Offline Donations */}
          <TouchableOpacity
            style={styles.badgeBtn}
            onPress={() => onNavigate('list')}
            activeOpacity={0.75}
          >
            <FileText color={isDark ? '#000000' : '#FFFFFF'} size={18} strokeWidth={2.4} />
            <Text
              style={[
                styles.badgeBtnText,
                { color: isDark ? '#000000' : '#FFFFFF' },
              ]}
              numberOfLines={1}
            >
              Offline Donations
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topbar: {
    width: '100%',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 12,
    marginBottom: 12,
  },
  overviewTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  overviewDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
    zIndex: 2,
  },
  cardWrapper: {
    width: '48.2%',
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  cardBase: {
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 198,
    justifyContent: 'space-between',
  },
  concentricRings: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPillBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  todayPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  metaBlock: {
    marginTop: 6,
  },
  todayTitle: {
    color: '#DDD6FE',
    fontSize: 12,
    fontWeight: '600',
  },
  todayAmount: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 1,
  },
  todaySubtitle: {
    color: '#C4B5FD',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  sparklineWrap: {
    marginTop: 6,
  },
  timeLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  timeLabel: {
    color: '#DDD6FE',
    fontSize: 9.5,
    fontWeight: '500',
  },
  todayFooterText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
  },

  // White Cards (Week & Month)
  whiteCardIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whiteCardPillBadge: {
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  whiteCardPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  lightCardTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  lightCardAmount: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 1,
  },
  lightCardSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  weekChartWrap: {
    marginTop: 6,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 36,
  },
  barCol: {
    alignItems: 'center',
    gap: 3,
  },
  barTrack: {
    height: 30,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: 8,
    borderRadius: 4,
  },
  barDayText: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  lightCardFooterText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 6,
  },

  // Donut (Month)
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  donutContainer: {
    width: 46,
    height: 46,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutPercentText: {
    fontSize: 11,
    fontWeight: '800',
  },
  targetCol: {
    justifyContent: 'center',
  },
  targetLabel: {
    fontSize: 9.5,
    fontWeight: '500',
  },
  targetAmount: {
    fontSize: 11.5,
    fontWeight: '800',
  },

  // Gold Card (Year)
  goldCardIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(69, 26, 3, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldCardPillBadge: {
    backgroundColor: 'rgba(69, 26, 3, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  goldCardPillText: {
    color: '#451A03',
    fontSize: 10,
    fontWeight: '700',
  },
  goldCardTitle: {
    color: '#5C3806',
    fontSize: 12,
    fontWeight: '600',
  },
  goldCardAmount: {
    color: '#1C0F05',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 1,
  },
  goldCardSubtitle: {
    color: '#784307',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  yearChartWrap: {
    marginTop: 6,
  },
  yearBarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 32,
  },
  yearBarCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 32,
  },
  yearBarFill: {
    width: 5,
    borderRadius: 2.5,
  },
  yearLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingHorizontal: 2,
  },
  yearLabelText: {
    color: '#5C3806',
    fontSize: 9.5,
    fontWeight: '600',
  },
  goldCardFooterText: {
    color: '#5C3806',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 6,
  },

  longBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 30,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  badgeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    gap: 8,
    zIndex: 1,
  },
  badgeDivider: {
    width: 1.5,
    height: 22,
    borderRadius: 1,
    marginHorizontal: 4,
    zIndex: 1,
  },
  badgeBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
});
