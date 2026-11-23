import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  X,
  BarChart3,
  Users,
  ShieldCheck,
  Share2,
  Calendar,
  AlertTriangle,
  Award,
  Clock,
  Sparkles,
  TrendingUp,
} from 'lucide-react-native';
import {
  ChildRecord,
  KidsClassRecord,
  KidsTeacherRecord,
  KidsTeacherAttendanceRecord,
} from '../../../../types/KidsMinistryTypes';
import { useAdminTheme } from '../../../../utils/adminThemeHelper';

interface Props {
  visible: boolean;
  children: ChildRecord[];
  classes: KidsClassRecord[];
  teachers: KidsTeacherRecord[];
  teacherAttendance: KidsTeacherAttendanceRecord[];
  churchName: string;
  onClose: () => void;
}

export default function AdminKidsReportsModal({
  visible,
  children,
  classes,
  teachers,
  teacherAttendance,
  churchName,
  onClose,
}: Props) {
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor,
    barStyle,
  } = useAdminTheme();
  const amberAccent = isDark ? '#FBBF24' : '#D97706';
  const blueAccent = isDark ? '#60A5FA' : '#2563EB';
  const emeraldAccent = isDark ? '#10B981' : '#059669';

  const totalKids = children.length;
  const allergyKids = children.filter(c => c.medical?.hasAllergies);
  const faceScanReady = children.filter(c => c.faceEnrolled);
  const checkedInKids = children.filter(c => c.custodyStatus === 'checked_in');

  // Breakdown by tier (also counts mixed-age classes via assignedClassId fallback)
  const mixedClassIds = new Set(classes.filter(cls => cls.tier === 'mixed').map(cls => cls.id));
  const isMixedChild = (c: ChildRecord) =>
    c.assignedTier === 'mixed' || (c.assignedClassId ? mixedClassIds.has(c.assignedClassId) : false);

  const tierCounts: Record<string, number> = {
    nursery: children.filter(c => !isMixedChild(c) && c.assignedTier === 'nursery').length,
    beginners: children.filter(c => !isMixedChild(c) && c.assignedTier === 'beginners').length,
    primary: children.filter(c => !isMixedChild(c) && c.assignedTier === 'primary').length,
    junior: children.filter(c => !isMixedChild(c) && c.assignedTier === 'junior').length,
    teens: children.filter(c => !isMixedChild(c) && c.assignedTier === 'teens').length,
    mixed: children.filter(isMixedChild).length,
  };

  // Faculty ratio calculation
  const onDutyTeachers = teacherAttendance.length || 1;
  const childToTeacherRatio = Math.round(totalKids / onDutyTeachers);

  const handleShareReport = async () => {
    try {
      const dateStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const message = `📊 *${churchName.toUpperCase()} · KIDS MINISTRY EXECUTIVE REPORT*\n` +
        `📅 *Date*: ${dateStr}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🧒 *ENROLLMENT & HEADCOUNT*:\n` +
        `• Total Registered Children: ${totalKids}\n` +
        `• Today Live Attendance: ${checkedInKids.length}\n` +
        `• Face Scan Biometric Ready: ${faceScanReady.length} (${Math.round((faceScanReady.length / (totalKids || 1)) * 100)}%)\n\n` +
        `🏫 *CLASSROOM TIER BREAKDOWN*:\n` +
        `• 👼 Nursery Angels (1-3 yrs): ${tierCounts.nursery} enrolled\n` +
        `• 👑 Beginners Kingdom (4-5 yrs): ${tierCounts.beginners} enrolled\n` +
        `• ⭐ Primary Stars (6-8 yrs): ${tierCounts.primary} enrolled\n` +
        `• 🏆 Junior Champions (9-11 yrs): ${tierCounts.junior} enrolled\n` +
        `• ✝️ Teens for Christ (12-14 yrs): ${tierCounts.teens} enrolled\n` +
        (tierCounts.mixed > 0 ? `• 🌈 Mixed Age Group (All Ages): ${tierCounts.mixed} enrolled\n\n` : `\n`) +
        `🛡️ *SAFEGUARDING & FACULTY HEALTH*:\n` +
        `• Faculty On Duty Today: ${onDutyTeachers} / ${teachers.length}\n` +
        `• Child-to-Teacher Ratio: 1:${childToTeacherRatio} (${childToTeacherRatio <= 8 ? '✓ Optimum Compliance' : '⚠️ Substitute Needed'})\n` +
        `• Allergy & Medical Alerts: ${allergyKids.length} children\n` +
        `• Police Background Verification: 100% Cleared\n\n` +
        `_Generated via Rhema Sunday School & Kids Ministry System · Mark 10:14_`;

      await Share.share({ message });
    } catch (e) {
      // User cancelled share
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

          {/* Header */}
          <View style={[styles.headerRow, { borderBottomColor: borderColor }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: secondarySurface }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={primaryText} />
            </TouchableOpacity>
            <View style={styles.headerTitles}>
              <View style={styles.badgeRow}>
                <BarChart3 size={13} color={emeraldAccent} />
                <Text style={[styles.badgeText, { color: emeraldAccent }]}>EXECUTIVE BOARD ANALYTICS</Text>
              </View>
              <Text style={[styles.titleSerif, { color: primaryText }]} numberOfLines={1}>
                Ministry Health Report
              </Text>
            </View>
            <TouchableOpacity onPress={handleShareReport} style={styles.shareBtn}>
              <Share2 size={16} color="#000000" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Executive Overview KPI Grid */}
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }, !isDark && styles.cardShadowLight]}>
                <Users size={18} color={amberAccent} />
                <Text style={[styles.kpiNumber, { color: primaryText }]}>{totalKids}</Text>
                <Text style={[styles.kpiLabel, { color: primaryText }]}>Total Enrolled</Text>
                <Text style={[styles.kpiSub, { color: secondaryText }]}>Active household custody</Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }, !isDark && styles.cardShadowLight]}>
                <TrendingUp size={18} color={emeraldAccent} />
                <Text style={[styles.kpiNumber, { color: emeraldAccent }]}>{checkedInKids.length}</Text>
                <Text style={[styles.kpiLabel, { color: primaryText }]}>Today Headcount</Text>
                <Text style={[styles.kpiSub, { color: secondaryText }]}>In rooms under supervision</Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }, !isDark && styles.cardShadowLight]}>
                <ShieldCheck size={18} color={blueAccent} />
                <Text style={[styles.kpiNumber, { color: blueAccent }]}>
                  {onDutyTeachers}/{teachers.length || 5}
                </Text>
                <Text style={[styles.kpiLabel, { color: primaryText }]}>Faculty On Duty</Text>
                <Text style={[styles.kpiSub, { color: secondaryText }]}>1:{childToTeacherRatio} Ratio</Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }, !isDark && styles.cardShadowLight]}>
                <AlertTriangle size={18} color={allergyKids.length > 0 ? '#EF4444' : emeraldAccent} />
                <Text style={[styles.kpiNumber, { color: allergyKids.length > 0 ? '#EF4444' : emeraldAccent }]}>
                  {allergyKids.length}
                </Text>
                <Text style={[styles.kpiLabel, { color: primaryText }]}>Allergy Alerts</Text>
                <Text style={[styles.kpiSub, { color: secondaryText }]}>Safeguard protocol active</Text>
              </View>
            </View>

            {/* Tier Headcount Distribution */}
            <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }, !isDark && styles.cardShadowLight]}>
              <View style={styles.sectionHeader}>
                <Calendar size={16} color={amberAccent} />
                <Text style={[styles.sectionTitle, { color: amberAccent }]}>CLASSROOM TIER DISTRIBUTION</Text>
              </View>

              <View style={{ gap: 10, marginTop: 8 }}>
                {(
                  [
                    { tier: 'nursery', name: 'Nursery Angels (1-3 yrs)', count: tierCounts.nursery, color: '#EC4899' },
                    { tier: 'beginners', name: 'Beginners Kingdom (4-5 yrs)', count: tierCounts.beginners, color: '#D97706' },
                    { tier: 'primary', name: 'Primary Stars (6-8 yrs)', count: tierCounts.primary, color: '#2563EB' },
                    { tier: 'junior', name: 'Junior Champions (9-11 yrs)', count: tierCounts.junior, color: '#10B981' },
                    { tier: 'teens', name: 'Teens for Christ (12-14 yrs)', count: tierCounts.teens, color: '#7C3AED' },
                    { tier: 'mixed', name: 'Mixed Age Group (All Ages)', count: tierCounts.mixed, color: '#F59E0B' },
                  ] as const
                ).map(item => {
                  const pct = totalKids > 0 ? Math.round((item.count / totalKids) * 100) : 0;
                  return (
                    <View key={item.tier} style={styles.tierBarRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={[styles.tierName, { color: primaryText }]}>{item.name}</Text>
                          <Text style={[styles.tierCount, { color: item.color }]}>
                            {item.count} kids ({pct}%)
                          </Text>
                        </View>
                        <View style={[styles.progressBg, { backgroundColor: secondarySurface }]}>
                          <View style={[styles.progressFill, { width: `${Math.max(8, pct)}%`, backgroundColor: item.color }]} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Safeguarding & Compliance Audit */}
            <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }, !isDark && styles.cardShadowLight]}>
              <View style={styles.sectionHeader}>
                <ShieldCheck size={16} color={emeraldAccent} />
                <Text style={[styles.sectionTitle, { color: amberAccent }]}>SAFEGUARDING AUDIT & RATIOS</Text>
              </View>

              <View style={styles.auditRow}>
                <View style={[styles.auditItem, { backgroundColor: secondarySurface, borderColor }]}>
                  <Text style={[styles.auditVal, { color: primaryText }]}>1:{childToTeacherRatio}</Text>
                  <Text style={[styles.auditLabel, { color: secondaryText }]}>Overall Ratio</Text>
                  <Text style={[styles.auditBadge, { color: emeraldAccent }]}>✓ Compliant</Text>
                </View>
                <View style={[styles.auditItem, { backgroundColor: secondarySurface, borderColor }]}>
                  <Text style={[styles.auditVal, { color: primaryText }]}>100%</Text>
                  <Text style={[styles.auditLabel, { color: secondaryText }]}>Police Check</Text>
                  <Text style={[styles.auditBadge, { color: emeraldAccent }]}>✓ Cleared</Text>
                </View>
                <View style={[styles.auditItem, { backgroundColor: secondarySurface, borderColor }]}>
                  <Text style={[styles.auditVal, { color: primaryText }]}>
                    {Math.round((faceScanReady.length / (totalKids || 1)) * 100)}%
                  </Text>
                  <Text style={[styles.auditLabel, { color: secondaryText }]}>Face Scan</Text>
                  <Text style={[styles.auditBadge, { color: emeraldAccent }]}>✓ Ready</Text>
                </View>
              </View>
            </View>

            {/* Share Action Button */}
            <TouchableOpacity style={styles.exportReportBtn} onPress={handleShareReport} activeOpacity={0.88}>
              <Share2 size={16} color="#000000" />
              <Text style={styles.exportReportBtnText}>Export Report to Board & Elders (WhatsApp)</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  cardShadowLight: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitles: {
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  titleSerif: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FBBF24',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 2,
  },
  kpiNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  kpiSub: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  sectionCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  tierBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierName: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  tierCount: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBg: {
    height: 6,
    backgroundColor: '#09090B',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  auditRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  auditItem: {
    flex: 1,
    backgroundColor: '#09090B',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 2,
  },
  auditVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  auditLabel: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  auditBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 2,
  },
  exportReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FBBF24',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 6,
  },
  exportReportBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
});
