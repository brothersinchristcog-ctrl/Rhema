import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Bell,
  Download,
  Filter,
  HeartHandshake,
  Repeat,
  Search,
  Users,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import functions from '@react-native-firebase/functions';
import { useAdminTheme } from '../../../utils/adminThemeHelper';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID, RHEMA_CHURCH_NAME } from '../../../constants/ChurchConfig';
import { formatCurrency, formatDate } from './AdminDonationsUtils';

interface AdminDonationsReportsProps {
  donations: any[];
  pledges: any[];
  onNavigate: (tab: string, data?: any) => void;
}

export default function AdminDonationsReports({
  donations = [],
  pledges = [],
  onNavigate,
}: AdminDonationsReportsProps) {
  const { isDark } = useAdminTheme();
  const { activeChurch, churchId } = useChurch();
  const effectiveChurchId = churchId || activeChurch?.id || RHEMA_CHURCH_ID;
  const insets = useSafeAreaInsets();

  const [reportTab, setReportTab] = useState<'donations' | 'pledges'>('donations');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  // Donation Report Filters (#3)
  const [donationPeriod, setDonationPeriod] = useState<'all' | 'weekly' | 'monthly' | 'yearly'>('all');
  const [appFilter, setAppFilter] = useState<string>('All');
  const [gatewayFilter, setGatewayFilter] = useState<'All' | 'Razorpay' | 'Offline'>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'one_time' | 'recurring'>('All');
  const [groupFilter, setGroupFilter] = useState<string>('All');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberKey, setSelectedMemberKey] = useState<string>('All');

  // Pledge Report Filters (#6)
  const [pledgeFreqFilter, setPledgeFreqFilter] = useState<'all' | 'weekly' | 'monthly' | 'yearly' | 'event_wise'>('all');
  const [pledgeStatusFilter, setPledgeStatusFilter] = useState<string>('all');
  const [pledgeEventFilter, setPledgeEventFilter] = useState<string>('All');
  const [pledgeMemberSearch, setPledgeMemberSearch] = useState('');

  const bg = isDark ? '#000000' : '#F8FAFC';
  const cardBg = isDark ? '#18181B' : '#FFFFFF';
  const borderCol = isDark ? 'rgba(255,255,255,0.12)' : '#CBD5E1';
  const subtleBg = isDark ? '#27272A' : '#F1F5F9';
  const textPrimary = isDark ? '#FFFFFF' : '#0F172A';
  const textSecondary = isDark ? '#A1A1AA' : '#64748B';
  const accent = isDark ? '#FCD34D' : '#0F766E';

  const normalizedDonations = useMemo(() => {
    return (donations || []).map((d: any) => {
      const hasRazorpay =
        d.paymentGateway === 'Razorpay' ||
        d.paymentMethod === 'Razorpay' ||
        Boolean(d.paymentId || d.orderId || d.subscriptionId);
      const gateway = d.paymentGateway || (hasRazorpay ? 'Razorpay' : 'Offline');
      const appLabel =
        d.appName ||
        (d.sourceChannel === 'admin_portal'
          ? 'Admin Portal'
          : d.churchId
          ? `${activeChurch?.name || RHEMA_CHURCH_NAME}`
          : hasRazorpay
          ? RHEMA_CHURCH_NAME
          : 'Admin Portal');
      const rawCat = String(d.category || d.type || 'Offering');
      const group =
        d.givingGroup ||
        (d.pledgeId ? 'Pledge' : rawCat.toLowerCase().includes('tithe') ? 'Tithe' : 'Offering');
      const memberLabel = String(d.userName || d.donorName || d.name || 'Anonymous').trim();
      const memberKey = String(d.userId || d.phone || d.donorPhone || memberLabel).trim();

      return {
        ...d,
        _gateway: gateway,
        _appLabel: appLabel,
        _recurringType: d.recurringType === 'recurring' || Boolean(d.subscriptionId) ? 'recurring' : 'one_time',
        _group: group,
        _category: rawCat,
        _memberLabel: memberLabel,
        _memberPhone: String(d.phone || d.donorPhone || '').trim(),
        _memberKey: memberKey,
        _amount: Number(d.amount) || 0,
        _dateStr: d.date || d.createdDate || '',
      };
    });
  }, [donations, activeChurch?.name]);

  const appOptions = useMemo(() => {
    const unique = Array.from(new Set(normalizedDonations.map((d) => d._appLabel).filter(Boolean)));
    return ['All', ...unique];
  }, [normalizedDonations]);

  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    normalizedDonations.forEach((d) => {
      if (!map.has(d._memberKey)) {
        map.set(d._memberKey, d._memberLabel);
      }
    });
    return [{ key: 'All', label: 'All Members' }, ...Array.from(map.entries()).map(([key, label]) => ({ key, label }))];
  }, [normalizedDonations]);

  const filteredDonations = useMemo(() => {
    const now = new Date();
    const startWeek = new Date(now);
    startWeek.setDate(now.getDate() - now.getDay());
    startWeek.setHours(0, 0, 0, 0);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startYear = new Date(now.getFullYear(), 0, 1);
    const q = memberSearch.trim().toLowerCase();

    return normalizedDonations.filter((d) => {
      if (donationPeriod !== 'all') {
        const dt = new Date(d._dateStr);
        if (isNaN(dt.getTime())) return false;
        if (donationPeriod === 'weekly' && dt < startWeek) return false;
        if (donationPeriod === 'monthly' && dt < startMonth) return false;
        if (donationPeriod === 'yearly' && dt < startYear) return false;
      }
      if (appFilter !== 'All' && d._appLabel !== appFilter) return false;
      if (gatewayFilter !== 'All' && d._gateway !== gatewayFilter) return false;
      if (typeFilter !== 'All' && d._recurringType !== typeFilter) return false;
      if (groupFilter !== 'All' && d._group !== groupFilter) return false;
      if (selectedMemberKey !== 'All' && d._memberKey !== selectedMemberKey) return false;
      if (q) {
        const hay = `${d._memberLabel} ${d._memberPhone} ${d._category} ${d.paymentId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    normalizedDonations,
    donationPeriod,
    appFilter,
    gatewayFilter,
    typeFilter,
    groupFilter,
    selectedMemberKey,
    memberSearch,
  ]);

  const donationMetrics = useMemo(() => {
    let total = 0;
    let oneTime = 0;
    let recurring = 0;
    let razorpay = 0;
    let offline = 0;

    filteredDonations.forEach((d) => {
      total += d._amount;
      if (d._recurringType === 'recurring') recurring += d._amount;
      else oneTime += d._amount;
      if (d._gateway === 'Razorpay') razorpay += d._amount;
      else offline += d._amount;
    });

    return { total, oneTime, recurring, razorpay, offline, count: filteredDonations.length };
  }, [filteredDonations]);

  // Pledge options & filters (#6)
  const pledgeEvents = useMemo(() => {
    const names = Array.from(
      new Set(pledges.map((p) => String(p.eventTitle || '').trim()).filter(Boolean))
    );
    return ['All', ...names];
  }, [pledges]);

  const filteredPledges = useMemo(() => {
    const q = pledgeMemberSearch.trim().toLowerCase();
    return (pledges || []).filter((p) => {
      const freq = String(p.frequency || 'monthly').toLowerCase();
      const st = String(p.status || 'active').toLowerCase();
      if (pledgeFreqFilter !== 'all' && freq !== pledgeFreqFilter) return false;
      if (pledgeStatusFilter !== 'all' && st !== pledgeStatusFilter) return false;
      if (pledgeEventFilter !== 'All' && String(p.eventTitle || '') !== pledgeEventFilter) return false;
      if (q) {
        const hay = `${p.memberName || ''} ${p.memberPhone || ''} ${p.category || ''} ${p.eventTitle || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pledges, pledgeFreqFilter, pledgeStatusFilter, pledgeEventFilter, pledgeMemberSearch]);

  const pledgeMetrics = useMemo(() => {
    let totalPledged = 0;
    let totalReceived = 0;
    let totalPending = 0;

    filteredPledges.forEach((p) => {
      const committed = Number(p.pledgeAmount || 0);
      const received = Number(p.receivedAmount || 0);
      const pending = Math.max(0, Number(p.pendingAmount ?? committed - received));
      totalPledged += committed;
      totalReceived += received;
      if (String(p.status || '').toLowerCase() !== 'cancelled') {
        totalPending += pending;
      }
    });

    const pct = totalPledged > 0 ? Math.min(100, Math.round((totalReceived / totalPledged) * 100)) : 0;
    return { totalPledged, totalReceived, totalPending, pct, count: filteredPledges.length };
  }, [filteredPledges]);

  const handleTriggerReminders = async () => {
    setSendingReminders(true);
    try {
      const fn = functions().app.functions('asia-south1').httpsCallable('triggerPledgeRemindersManual');
      const res = await fn({ churchId: effectiveChurchId });
      const data = (res.data || {}) as any;
      Alert.alert(
        'Reminders Processed',
        `Checked ${data.pledgesChecked ?? 0} pledges · Sent ${data.pledgeRemindersSent ?? 0} pledge reminders and ${data.mandateRemindersSent ?? 0} recurring alerts.`
      );
    } catch (err: any) {
      Alert.alert('Reminder Error', err?.message || 'Unable to run pledge reminder sweep.');
    } finally {
      setSendingReminders(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const isDonationsReport = reportTab === 'donations';
      const rowsHtml = isDonationsReport
        ? filteredDonations
            .map(
              (d) => `
              <tr>
                <td>${formatDate(d._dateStr)}</td>
                <td>${d._memberLabel}</td>
                <td>${d._category} (${d._group})</td>
                <td>${d._gateway}</td>
                <td>${d._recurringType === 'recurring' ? 'Recurring' : 'One-Time'}</td>
                <td style="text-align:right;font-weight:700;">${formatCurrency(d._amount)}</td>
              </tr>`
            )
            .join('')
        : filteredPledges
            .map((p) => {
              const committed = Number(p.pledgeAmount || 0);
              const received = Number(p.receivedAmount || 0);
              const pending = Math.max(0, Number(p.pendingAmount ?? committed - received));
              return `
              <tr>
                <td>${p.memberName || 'Member'}</td>
                <td>${p.category || 'Pledge'}${p.eventTitle ? ` (${p.eventTitle})` : ''}</td>
                <td>${String(p.frequency || 'monthly').toUpperCase()}</td>
                <td style="text-align:right;">${formatCurrency(committed)}</td>
                <td style="text-align:right;color:#059669;">${formatCurrency(received)}</td>
                <td style="text-align:right;color:#D97706;">${formatCurrency(pending)}</td>
                <td>${String(p.status || 'active').toUpperCase()}</td>
              </tr>`;
            })
            .join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #0F172A; }
              h1 { margin: 0 0 4px; font-size: 20px; }
              p.sub { margin: 0 0 16px; color: #64748B; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
              th, td { border: 1px solid #CBD5E1; padding: 8px; text-align: left; }
              th { background: #F1F5F9; font-weight: 700; }
            </style>
          </head>
          <body>
            <h1>${activeChurch?.name || RHEMA_CHURCH_NAME} — ${isDonationsReport ? 'Donation Report' : 'Pledge Report'}</h1>
            <p class="sub">Generated on ${new Date().toLocaleDateString('en-IN')}</p>
            <table>
              <thead>
                ${
                  isDonationsReport
                    ? '<tr><th>Date</th><th>Member</th><th>Category</th><th>Gateway</th><th>Type</th><th style="text-align:right;">Amount</th></tr>'
                    : '<tr><th>Member</th><th>Category</th><th>Frequency</th><th style="text-align:right;">Pledged</th><th style="text-align:right;">Received</th><th style="text-align:right;">Pending</th><th>Status</th></tr>'
                }
              </thead>
              <tbody>${rowsHtml || '<tr><td colspan="7">No matching records</td></tr>'}</tbody>
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Report PDF' });
      } else {
        Alert.alert('PDF Ready', 'Report saved locally.');
      }
    } catch (err) {
      console.error('Export PDF error:', err);
      Alert.alert('Export Failed', 'Could not export report PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Top Bar */}
      <View
        style={[
          styles.topbar,
          {
            backgroundColor: cardBg,
            borderBottomColor: borderCol,
            paddingTop: Platform.OS === 'ios' ? 54 : Math.max(insets.top, 16),
          },
        ]}
      >
        <TouchableOpacity onPress={() => onNavigate('dashboard')} style={styles.iconBtn}>
          <ArrowLeft size={22} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: textPrimary }]}>Donation & Pledge Reports</Text>
        <TouchableOpacity onPress={handleExportPdf} disabled={exportingPdf} style={styles.iconBtn}>
          {exportingPdf ? <ActivityIndicator size="small" color={accent} /> : <Download size={20} color={accent} />}
        </TouchableOpacity>
      </View>

      {/* Main Report Switcher */}
      <View style={[styles.segmentBar, { backgroundColor: cardBg, borderColor: borderCol }]}>
        <TouchableOpacity
          style={[styles.segmentBtn, reportTab === 'donations' && { backgroundColor: isDark ? '#FCD34D' : '#0F172A' }]}
          onPress={() => setReportTab('donations')}
        >
          <Text style={[styles.segmentTxt, { color: reportTab === 'donations' ? (isDark ? '#000' : '#fff') : textSecondary }]}>
            Donations ({filteredDonations.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, reportTab === 'pledges' && { backgroundColor: isDark ? '#FCD34D' : '#0F172A' }]}
          onPress={() => setReportTab('pledges')}
        >
          <Text style={[styles.segmentTxt, { color: reportTab === 'pledges' ? (isDark ? '#000' : '#fff') : textSecondary }]}>
            Pledges ({filteredPledges.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {reportTab === 'donations' ? (
          <>
            {/* Summary Totals Card */}
            <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <Text style={[styles.summaryLabel, { color: textSecondary }]}>FILTERED DONATIONS TOTAL</Text>
              <Text style={[styles.summaryBigAmt, { color: accent }]}>{formatCurrency(donationMetrics.total)}</Text>
              <View style={[styles.metricsGrid, { borderTopColor: borderCol }]}>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricSubLbl, { color: textSecondary }]}>Razorpay</Text>
                  <Text style={[styles.metricSubVal, { color: textPrimary }]}>{formatCurrency(donationMetrics.razorpay)}</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricSubLbl, { color: textSecondary }]}>Offline</Text>
                  <Text style={[styles.metricSubVal, { color: textPrimary }]}>{formatCurrency(donationMetrics.offline)}</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricSubLbl, { color: textSecondary }]}>Recurring</Text>
                  <Text style={[styles.metricSubVal, { color: '#10b981' }]}>{formatCurrency(donationMetrics.recurring)}</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricSubLbl, { color: textSecondary }]}>One-Time</Text>
                  <Text style={[styles.metricSubVal, { color: textPrimary }]}>{formatCurrency(donationMetrics.oneTime)}</Text>
                </View>
              </View>
            </View>

            {/* Search Member */}
            <View style={[styles.searchBox, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <Search size={16} color={textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: textPrimary }]}
                value={memberSearch}
                onChangeText={setMemberSearch}
                placeholder="Filter member name, phone, category, or Payment ID..."
                placeholderTextColor={textSecondary}
              />
            </View>

            {/* Period Filter */}
            <Text style={[styles.filterHeading, { color: textSecondary }]}>PERIOD</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {(['all', 'weekly', 'monthly', 'yearly'] as const).map((p) => {
                const active = donationPeriod === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.chip, { backgroundColor: cardBg, borderColor: active ? accent : borderCol }]}
                    onPress={() => setDonationPeriod(p)}
                  >
                    <Text style={[styles.chipTxt, { color: active ? accent : textPrimary }]}>
                      {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Gateway & Recurring Type Filters */}
            <Text style={[styles.filterHeading, { color: textSecondary }]}>PAYMENT GATEWAY & SCHEDULE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {(['All', 'Razorpay', 'Offline'] as const).map((gw) => {
                const active = gatewayFilter === gw;
                return (
                  <TouchableOpacity
                    key={gw}
                    style={[styles.chip, { backgroundColor: cardBg, borderColor: active ? accent : borderCol }]}
                    onPress={() => setGatewayFilter(gw)}
                  >
                    <Text style={[styles.chipTxt, { color: active ? accent : textPrimary }]}>
                      {gw === 'All' ? 'All Gateways' : gw}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {(['All', 'one_time', 'recurring'] as const).map((tp) => {
                const active = typeFilter === tp;
                return (
                  <TouchableOpacity
                    key={tp}
                    style={[styles.chip, { backgroundColor: cardBg, borderColor: active ? '#10b981' : borderCol }]}
                    onPress={() => setTypeFilter(tp)}
                  >
                    <Text style={[styles.chipTxt, { color: active ? '#10b981' : textPrimary }]}>
                      {tp === 'All' ? 'All Types' : tp === 'recurring' ? 'Recurring' : 'One-Time'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* App-wise & Group Filters */}
            <Text style={[styles.filterHeading, { color: textSecondary }]}>APP-WISE & CATEGORY GROUP</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {appOptions.map((ap) => {
                const active = appFilter === ap;
                return (
                  <TouchableOpacity
                    key={`app-${ap}`}
                    style={[styles.chip, { backgroundColor: cardBg, borderColor: active ? accent : borderCol }]}
                    onPress={() => setAppFilter(ap)}
                  >
                    <Text style={[styles.chipTxt, { color: active ? accent : textPrimary }]}>
                      {ap === 'All' ? 'All Apps' : ap}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {['All', 'Tithe', 'Offering', 'Pledge'].map((grp) => {
                const active = groupFilter === grp;
                return (
                  <TouchableOpacity
                    key={`grp-${grp}`}
                    style={[styles.chip, { backgroundColor: cardBg, borderColor: active ? '#3b82f6' : borderCol }]}
                    onPress={() => setGroupFilter(grp)}
                  >
                    <Text style={[styles.chipTxt, { color: active ? '#3b82f6' : textPrimary }]}>
                      {grp === 'All' ? 'All Groups' : grp}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Member-wise Quick Chips */}
            <Text style={[styles.filterHeading, { color: textSecondary }]}>MEMBER-WISE FILTER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {memberOptions.slice(0, 20).map((m) => {
                const active = selectedMemberKey === m.key;
                return (
                  <TouchableOpacity
                    key={`mem-${m.key}`}
                    style={[styles.chip, { backgroundColor: cardBg, borderColor: active ? accent : borderCol }]}
                    onPress={() => setSelectedMemberKey(m.key)}
                  >
                    <Text style={[styles.chipTxt, { color: active ? accent : textPrimary }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Donation Items */}
            {filteredDonations.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                <Filter size={32} color={textSecondary} />
                <Text style={{ color: textSecondary, marginTop: 8 }}>No donations match the selected filters.</Text>
              </View>
            ) : (
              filteredDonations.slice(0, 100).map((d, idx) => (
                <View key={d.id || idx} style={[styles.itemCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                  <View style={styles.itemRowTop}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.itemTitle, { color: textPrimary }]}>{d._memberLabel}</Text>
                      <Text style={{ color: textSecondary, fontSize: 12, marginTop: 2 }}>
                        {d._category} · {d._group} · {formatDate(d._dateStr)}
                      </Text>
                    </View>
                    <Text style={[styles.itemAmt, { color: accent }]}>{formatCurrency(d._amount)}</Text>
                  </View>
                  <View style={styles.tagRow}>
                    <View style={[styles.tagPill, { backgroundColor: subtleBg }]}>
                      <Text style={[styles.tagTxt, { color: textPrimary }]}>{d._gateway}</Text>
                    </View>
                    <View style={[styles.tagPill, { backgroundColor: subtleBg }]}>
                      <Text style={[styles.tagTxt, { color: d._recurringType === 'recurring' ? '#10b981' : textSecondary }]}>
                        {d._recurringType === 'recurring' ? 'Recurring' : 'One-Time'}
                      </Text>
                    </View>
                    <View style={[styles.tagPill, { backgroundColor: subtleBg }]}>
                      <Text style={[styles.tagTxt, { color: textSecondary }]}>{d._appLabel}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          <>
            {/* Pledge Summary Totals */}
            <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.summaryLabel, { color: textSecondary }]}>PLEDGE FULFILLMENT REPORT</Text>
                <TouchableOpacity
                  style={[styles.reminderTriggerBtn, { backgroundColor: isDark ? 'rgba(252,211,77,0.14)' : '#FEF3C7', borderColor: borderCol }]}
                  onPress={handleTriggerReminders}
                  disabled={sendingReminders}
                >
                  {sendingReminders ? (
                    <ActivityIndicator size="small" color={accent} />
                  ) : (
                    <>
                      <Bell size={13} color={isDark ? '#FCD34D' : '#92400E'} />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#FCD34D' : '#92400E' }}>
                        Send Due Reminders
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={[styles.summaryBigAmt, { color: accent, marginTop: 8 }]}>
                {pledgeMetrics.pct}% Fulfilled
              </Text>

              <View style={[styles.metricsGrid, { borderTopColor: borderCol }]}>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricSubLbl, { color: textSecondary }]}>Pledged</Text>
                  <Text style={[styles.metricSubVal, { color: textPrimary }]}>{formatCurrency(pledgeMetrics.totalPledged)}</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricSubLbl, { color: textSecondary }]}>Received</Text>
                  <Text style={[styles.metricSubVal, { color: '#10b981' }]}>{formatCurrency(pledgeMetrics.totalReceived)}</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={[styles.metricSubLbl, { color: textSecondary }]}>Pending</Text>
                  <Text style={[styles.metricSubVal, { color: '#f59e0b' }]}>{formatCurrency(pledgeMetrics.totalPending)}</Text>
                </View>
              </View>
            </View>

            {/* Pledge Member Search */}
            <View style={[styles.searchBox, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <Users size={16} color={textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: textPrimary }]}
                value={pledgeMemberSearch}
                onChangeText={setPledgeMemberSearch}
                placeholder="Search pledge by member name, phone, or event..."
                placeholderTextColor={textSecondary}
              />
            </View>

            {/* Frequency Filters (#6 Weekly / Monthly / Yearly / Event-wise) */}
            <Text style={[styles.filterHeading, { color: textSecondary }]}>FREQUENCY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {[
                { id: 'all' as const, label: 'All' },
                { id: 'weekly' as const, label: 'Weekly' },
                { id: 'monthly' as const, label: 'Monthly' },
                { id: 'yearly' as const, label: 'Yearly' },
                { id: 'event_wise' as const, label: 'Event-wise' },
              ].map((fq) => {
                const active = pledgeFreqFilter === fq.id;
                return (
                  <TouchableOpacity
                    key={fq.id}
                    style={[styles.chip, { backgroundColor: cardBg, borderColor: active ? accent : borderCol }]}
                    onPress={() => setPledgeFreqFilter(fq.id)}
                  >
                    <Text style={[styles.chipTxt, { color: active ? accent : textPrimary }]}>{fq.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Event-wise Filter */}
            {pledgeEvents.length > 1 && (
              <>
                <Text style={[styles.filterHeading, { color: textSecondary }]}>EVENT-WISE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {pledgeEvents.map((ev) => {
                    const active = pledgeEventFilter === ev;
                    return (
                      <TouchableOpacity
                        key={ev}
                        style={[styles.chip, { backgroundColor: cardBg, borderColor: active ? '#3b82f6' : borderCol }]}
                        onPress={() => setPledgeEventFilter(ev)}
                      >
                        <Text style={[styles.chipTxt, { color: active ? '#3b82f6' : textPrimary }]}>
                          {ev === 'All' ? 'All Events' : ev}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Status Filters */}
            <Text style={[styles.filterHeading, { color: textSecondary }]}>PLEDGE STATUS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {['all', 'active', 'partially_paid', 'fulfilled', 'overdue', 'cancelled'].map((st) => {
                const active = pledgeStatusFilter === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[styles.chip, { backgroundColor: cardBg, borderColor: active ? accent : borderCol }]}
                    onPress={() => setPledgeStatusFilter(st)}
                  >
                    <Text style={[styles.chipTxt, { color: active ? accent : textPrimary }]}>
                      {st === 'all' ? 'All Statuses' : st.replace('_', ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Pledge Report Rows */}
            {filteredPledges.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                <HeartHandshake size={32} color={textSecondary} />
                <Text style={{ color: textSecondary, marginTop: 8 }}>No pledges match the selected filters.</Text>
              </View>
            ) : (
              filteredPledges.map((p) => {
                const committed = Number(p.pledgeAmount || 0);
                const received = Number(p.receivedAmount || 0);
                const pending = Math.max(0, Number(p.pendingAmount ?? committed - received));
                const st = String(p.status || 'active').toLowerCase();
                const stColor =
                  st === 'fulfilled'
                    ? '#10b981'
                    : st === 'cancelled'
                    ? '#ef4444'
                    : st === 'overdue'
                    ? '#f59e0b'
                    : '#3b82f6';

                return (
                  <View
                    key={p.id}
                    style={[
                      styles.itemCard,
                      { backgroundColor: cardBg, borderColor: borderCol, borderLeftWidth: 4, borderLeftColor: stColor },
                    ]}
                  >
                    <View style={styles.itemRowTop}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[styles.itemTitle, { color: textPrimary }]}>{p.memberName || 'Member'}</Text>
                        <Text style={{ color: textSecondary, fontSize: 12, marginTop: 2 }}>
                          {p.category || 'Pledge'} · {String(p.frequency || 'monthly').replace('_', '-').toUpperCase()}
                          {p.eventTitle ? ` · ${p.eventTitle}` : ''}
                        </Text>
                        {!!p.nextDueDate && (
                          <Text style={{ color: textSecondary, fontSize: 11, marginTop: 2 }}>
                            Next Due: {p.nextDueDate}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.tagPill, { backgroundColor: subtleBg }]}>
                        <Text style={[styles.tagTxt, { color: stColor }]}>{st.replace('_', ' ').toUpperCase()}</Text>
                      </View>
                    </View>

                    <View style={[styles.metricsGrid, { borderTopColor: borderCol, marginTop: 10 }]}>
                      <View style={styles.metricCell}>
                        <Text style={[styles.metricSubLbl, { color: textSecondary }]}>Pledged</Text>
                        <Text style={[styles.metricSubVal, { color: textPrimary }]}>{formatCurrency(committed)}</Text>
                      </View>
                      <View style={styles.metricCell}>
                        <Text style={[styles.metricSubLbl, { color: textSecondary }]}>Received</Text>
                        <Text style={[styles.metricSubVal, { color: '#10b981' }]}>{formatCurrency(received)}</Text>
                      </View>
                      <View style={styles.metricCell}>
                        <Text style={[styles.metricSubLbl, { color: textSecondary }]}>Pending</Text>
                        <Text style={[styles.metricSubVal, { color: pending > 0 ? '#f59e0b' : '#10b981' }]}>
                          {formatCurrency(pending)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconBtn: { padding: 8 },
  topTitle: { fontSize: 17, fontWeight: '800' },
  segmentBar: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 8,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segmentTxt: { fontSize: 13, fontWeight: '800' },
  scrollBody: { paddingHorizontal: 16, paddingBottom: 40 },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  summaryLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  summaryBigAmt: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  metricsGrid: { flexDirection: 'row', borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  metricCell: { flex: 1 },
  metricSubLbl: { fontSize: 10, fontWeight: '700' },
  metricSubVal: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 13 },
  filterHeading: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 6, marginTop: 2 },
  chipRow: { gap: 8, paddingBottom: 12 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipTxt: { fontSize: 12, fontWeight: '700' },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  itemRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemTitle: { fontSize: 15, fontWeight: '800' },
  itemAmt: { fontSize: 16, fontWeight: '800' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tagPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagTxt: { fontSize: 10, fontWeight: '800' },
  reminderTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
});
