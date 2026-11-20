import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  StatusBar,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  X,
  Phone,
  Mail,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  HeartPulse,
  Calendar,
  BookOpen,
  Users,
  FileText,
  CheckCircle,
  Clock,
  KeyRound,
  Trash2,
} from 'lucide-react-native';
import { ChildRecord } from '../../../../types/KidsMinistryTypes';
import { useAdminTheme } from '../../../../utils/adminThemeHelper';
import { formatDateDisplay } from '../../../../utils/DateUtils';

interface Props {
  visible: boolean;
  child: ChildRecord | null;
  onClose: () => void;
  onDeleteRequest?: (child: ChildRecord) => void;
}

const formatFamilyCode = (familyId?: string): string => {
  if (!familyId) return '—';
  const trimmed = familyId.trim();
  if (trimmed.length <= 14) return trimmed;
  return `FAM-${trimmed.slice(-6).toUpperCase()}`;
};

const formatTimestamp = (val: any): string => {
  if (!val) return '—';
  try {
    const date = typeof val?.toDate === 'function' ? val.toDate() : new Date(val);
    if (isNaN(date.getTime())) return String(val);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
};

const formatEnumLabel = (val?: string): string => {
  if (!val) return '—';
  return val
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

export default function ChildProfileDetailModal({
  visible,
  child,
  onClose,
  onDeleteRequest,
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

  if (!child) return null;

  const initials = `${(child.firstName || child.fullName || 'K').charAt(0)}${
    child.lastName ? child.lastName.charAt(0) : ''
  }`.toUpperCase();

  const callPhone = (phone?: string, label?: string) => {
    if (!phone) {
      Alert.alert('No Phone Number', `No phone number recorded for ${label || 'this contact'}.`);
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Call Failed', `Unable to initiate call to ${phone}`);
    });
  };

  const custodyBadge = (() => {
    switch (child.custodyStatus) {
      case 'checked_in':
        return { label: 'Checked In', color: '#10B981', bg: 'rgba(16, 185, 129, 0.14)' };
      case 'emergency_hold':
        return { label: 'Emergency Hold', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.14)' };
      default:
        return { label: 'Checked Out', color: '#64748B', bg: isDark ? 'rgba(148, 163, 184, 0.14)' : '#F1F5F9' };
    }
  })();

  const enrollmentBadge = (() => {
    if (child.enrollmentStatus === 'active' || child.enrollmentStatus === 'approved') {
      return { label: formatEnumLabel(child.enrollmentStatus), color: '#2563EB', bg: 'rgba(37, 99, 235, 0.14)' };
    }
    if (child.enrollmentStatus === 'pending') {
      return { label: 'Pending Review', color: '#D97706', bg: 'rgba(245, 158, 11, 0.14)' };
    }
    return { label: formatEnumLabel(child.enrollmentStatus), color: secondaryText, bg: secondarySurface };
  })();

  const hasAllergies = Boolean(child.medical?.hasAllergies && child.medical?.allergiesList?.length);
  const emergencyContact = child.medical?.emergencyContact;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

          {/* Header Bar */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.iconBtn, { backgroundColor: secondarySurface, borderColor }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={primaryText} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
                Child Profile
              </Text>
              <Text style={[styles.headerSub, { color: secondaryText }]} numberOfLines={1}>
                {child.childId || 'Rhema Kids Member'}
              </Text>
            </View>

            {onDeleteRequest ? (
              <TouchableOpacity
                onPress={() => onDeleteRequest(child)}
                style={styles.deleteBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Trash2 size={17} color="#EF4444" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Hero Profile Card */}
            <View style={[styles.card, { backgroundColor: cardSurface, borderColor }, !isDark && styles.lightShadow]}>
              <View style={styles.heroTopRow}>
                {child.photoUrl ? (
                  <Image source={{ uri: child.photoUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={[styles.childFullName, { color: primaryText }]}>{child.fullName}</Text>
                  <Text style={[styles.childSubMeta, { color: secondaryText }]}>
                    Age {child.age ?? '—'} · {child.gender === 'male' ? 'Boy' : child.gender === 'female' ? 'Girl' : '—'}
                    {child.dob ? ` · DOB: ${formatDateDisplay(child.dob)}` : ''}
                  </Text>

                  <View style={styles.badgeWrap}>
                    <View style={[styles.pillBadge, { backgroundColor: enrollmentBadge.bg }]}>
                      <Text style={[styles.pillBadgeText, { color: enrollmentBadge.color }]}>
                        {enrollmentBadge.label}
                      </Text>
                    </View>
                    <View style={[styles.pillBadge, { backgroundColor: custodyBadge.bg }]}>
                      <Text style={[styles.pillBadgeText, { color: custodyBadge.color }]}>
                        {custodyBadge.label}
                      </Text>
                    </View>
                    {child.faceEnrolled && (
                      <View style={[styles.pillBadge, { backgroundColor: 'rgba(16, 185, 129, 0.14)' }]}>
                        <Text style={[styles.pillBadgeText, { color: '#10B981' }]}>Face Scan Ready ✓</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {child.activePickupCode ? (
                <View style={[styles.pickupCodeBanner, { backgroundColor: secondarySurface, borderColor }]}>
                  <KeyRound size={15} color="#D97706" />
                  <Text style={[styles.pickupCodeLabel, { color: secondaryText }]}>Active Pickup Code:</Text>
                  <Text style={styles.pickupCodeVal}>{child.activePickupCode}</Text>
                </View>
              ) : null}
            </View>

            {/* Quick Facts Grid */}
            <View style={[styles.card, { backgroundColor: cardSurface, borderColor }, !isDark && styles.lightShadow]}>
              <View style={styles.sectionHeaderRow}>
                <BookOpen size={15} color="#2563EB" />
                <Text style={[styles.sectionTitle, { color: primaryText }]}>Sunday School & Enrollment</Text>
              </View>

              <DetailRow label="Child ID" value={child.childId || '—'} primaryText={primaryText} secondaryText={secondaryText} borderColor={borderColor} />
              <DetailRow label="Assigned Classroom" value={child.assignedClassName || 'Unassigned'} primaryText={primaryText} secondaryText={secondaryText} borderColor={borderColor} />
              <DetailRow label="Age Tier" value={formatEnumLabel(child.assignedTier)} primaryText={primaryText} secondaryText={secondaryText} borderColor={borderColor} />
              <DetailRow label="Enrollment Source" value={formatEnumLabel(child.enrollmentSource || 'parent_self')} primaryText={primaryText} secondaryText={secondaryText} borderColor={borderColor} />
              {child.enrolledByTeacherName ? (
                <DetailRow
                  label="Enrolled By"
                  value={`${child.enrolledByTeacherName}${child.enrolledByRole ? ` (${formatEnumLabel(child.enrolledByRole)})` : ''}`}
                  primaryText={primaryText}
                  secondaryText={secondaryText}
                  borderColor={borderColor}
                />
              ) : null}
              <DetailRow
                label="Parent Consent"
                value={
                  child.parentConsentStatus === 'pending_review'
                    ? 'Pending Parent Review'
                    : child.parentConsentConfirmed
                    ? 'Confirmed'
                    : 'Verified'
                }
                primaryText={primaryText}
                secondaryText={secondaryText}
                borderColor={borderColor}
              />
              <DetailRow
                label="Enrolled Date"
                value={formatTimestamp(child.enrolledAt)}
                primaryText={primaryText}
                secondaryText={secondaryText}
                borderColor={borderColor}
                isLast
              />
            </View>

            {/* Primary Parent & Household */}
            <View style={[styles.card, { backgroundColor: cardSurface, borderColor }, !isDark && styles.lightShadow]}>
              <View style={styles.sectionHeaderRow}>
                <Users size={15} color="#7C3AED" />
                <Text style={[styles.sectionTitle, { color: primaryText }]}>Primary Parent & Household</Text>
              </View>

              <DetailRow label="Parent / Guardian" value={child.parentName || '—'} primaryText={primaryText} secondaryText={secondaryText} borderColor={borderColor} />
              <View style={[styles.detailRow, { borderBottomColor: borderColor, alignItems: 'center' }]}>
                <Text style={[styles.detailLabel, { color: secondaryText }]}>Parent Phone</Text>
                <View style={styles.detailValueCol}>
                  {child.parentPhone ? (
                    <TouchableOpacity
                      style={[styles.inlineCallPill, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}
                      onPress={() => callPhone(child.parentPhone, child.parentName)}
                      activeOpacity={0.8}
                    >
                      <Phone size={12} color="#10B981" />
                      <Text style={[styles.inlineCallText, { color: '#10B981' }]}>{child.parentPhone}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.inlineCallText, { color: secondaryText }]}>Not provided</Text>
                  )}
                </View>
              </View>
              {child.parentEmail ? (
                <DetailRow label="Parent Email" value={child.parentEmail} primaryText={primaryText} secondaryText={secondaryText} borderColor={borderColor} />
              ) : null}
              <DetailRow label="Household / Family ID" value={formatFamilyCode(child.familyId)} primaryText={primaryText} secondaryText={secondaryText} borderColor={borderColor} />
              <DetailRow
                label="Household Sync"
                value={child.memberContactId || child.isSyncedFromMember ? 'Linked to Member Directory' : 'Kids Roster Record'}
                primaryText={primaryText}
                secondaryText={secondaryText}
                borderColor={borderColor}
                isLast
              />
            </View>

            {/* Medical & Emergency Care */}
            <View style={[styles.card, { backgroundColor: cardSurface, borderColor }, !isDark && styles.lightShadow]}>
              <View style={styles.sectionHeaderRow}>
                <HeartPulse size={15} color="#EF4444" />
                <Text style={[styles.sectionTitle, { color: primaryText }]}>Medical & Emergency Care</Text>
              </View>

              {hasAllergies ? (
                <View style={styles.allergyAlertBox}>
                  <AlertTriangle size={16} color="#EF4444" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.allergyAlertTitle}>Allergies Reported</Text>
                    <Text style={[styles.allergyAlertList, { color: primaryText }]}>
                      {child.medical.allergiesList.join(', ')}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.safeMedicalBox, { backgroundColor: secondarySurface, borderColor }]}>
                  <CheckCircle size={15} color="#10B981" />
                  <Text style={[styles.safeMedicalText, { color: secondaryText }]}>No known allergies recorded</Text>
                </View>
              )}

              <DetailRow
                label="Blood Group"
                value={child.medical?.bloodGroup || 'Not recorded'}
                primaryText={primaryText}
                secondaryText={secondaryText}
                borderColor={borderColor}
              />
              {child.medical?.medicalAlertNotes ? (
                <DetailRow
                  label="Medical Notes"
                  value={child.medical.medicalAlertNotes}
                  primaryText={primaryText}
                  secondaryText={secondaryText}
                  borderColor={borderColor}
                />
              ) : null}
              <DetailRow
                label="Emergency Contact"
                value={
                  emergencyContact?.name
                    ? `${emergencyContact.name}${emergencyContact.relationship ? ` (${emergencyContact.relationship})` : ''}`
                    : child.parentName || '—'
                }
                primaryText={primaryText}
                secondaryText={secondaryText}
                borderColor={borderColor}
              />
              <View style={[styles.detailRow, { borderBottomWidth: 0, alignItems: 'center' }]}>
                <Text style={[styles.detailLabel, { color: secondaryText }]}>Emergency Phone</Text>
                <View style={styles.detailValueCol}>
                  {(emergencyContact?.phone || child.parentPhone) ? (
                    <TouchableOpacity
                      style={[styles.inlineCallPill, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}
                      onPress={() =>
                        callPhone(
                          emergencyContact?.phone || child.parentPhone,
                          emergencyContact?.name || child.parentName
                        )
                      }
                      activeOpacity={0.8}
                    >
                      <Phone size={12} color="#EF4444" />
                      <Text style={[styles.inlineCallText, { color: '#EF4444' }]}>
                        {emergencyContact?.phone || child.parentPhone}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.inlineCallText, { color: secondaryText }]}>—</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Authorized Pickup Guardians */}
            <View style={[styles.card, { backgroundColor: cardSurface, borderColor }, !isDark && styles.lightShadow]}>
              <View style={styles.sectionHeaderRow}>
                <ShieldCheck size={15} color="#10B981" />
                <Text style={[styles.sectionTitle, { color: primaryText }]}>
                  Authorized Pickups ({child.guardians?.length || 0})
                </Text>
              </View>

              {!child.guardians || child.guardians.length === 0 ? (
                <Text style={[styles.emptyNotesText, { color: secondaryText }]}>
                  Primary parent ({child.parentName || 'Guardian'}) is authorized for pickup.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {child.guardians.map((g, idx) => (
                    <View
                      key={g.id || idx}
                      style={[styles.guardianCard, { backgroundColor: secondarySurface, borderColor }]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.guardianTopLine}>
                          <Text style={[styles.guardianName, { color: primaryText }]}>{g.name}</Text>
                          <View style={[styles.relPill, { backgroundColor: cardSurface, borderColor }]}>
                            <Text style={[styles.relPillText, { color: secondaryText }]}>{g.relationship}</Text>
                          </View>
                          {g.isPrimaryContact && (
                            <View style={[styles.relPill, { backgroundColor: 'rgba(37, 99, 235, 0.14)', borderColor: 'transparent' }]}>
                              <Text style={[styles.relPillText, { color: '#2563EB' }]}>Primary</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.guardianSub, { color: secondaryText }]}>
                          {g.canPickup ? 'Authorized for Checkout' : 'Emergency Contact Only'}
                          {g.notes ? ` · ${g.notes}` : ''}
                        </Text>
                      </View>
                      {g.phone ? (
                        <TouchableOpacity
                          style={[styles.callCircleBtn, { backgroundColor: 'rgba(16, 185, 129, 0.14)' }]}
                          onPress={() => callPhone(g.phone, g.name)}
                        >
                          <Phone size={15} color="#10B981" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Notes */}
            {child.notes ? (
              <View style={[styles.card, { backgroundColor: cardSurface, borderColor }, !isDark && styles.lightShadow]}>
                <View style={styles.sectionHeaderRow}>
                  <FileText size={15} color="#D97706" />
                  <Text style={[styles.sectionTitle, { color: primaryText }]}>Teacher & Ministry Notes</Text>
                </View>
                <Text style={[styles.notesBody, { color: primaryText }]}>{child.notes}</Text>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  primaryText,
  secondaryText,
  borderColor,
  isLast = false,
}: {
  label: string;
  value: string;
  primaryText: string;
  secondaryText: string;
  borderColor: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.detailRow, { borderBottomColor: borderColor }, isLast && { borderBottomWidth: 0 }]}>
      <Text style={[styles.detailLabel, { color: secondaryText }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: primaryText }]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  lightShadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarImage: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E2E8F0',
  },
  avatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  childFullName: {
    fontSize: 19,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
  },
  childSubMeta: {
    fontSize: 12.5,
    marginTop: 2,
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  pillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  pickupCodeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 4,
  },
  pickupCodeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  pickupCodeVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#D97706',
    marginLeft: 'auto',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  detailLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 0.95,
  },
  detailValue: {
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1.25,
    textAlign: 'right',
  },
  detailValueCol: {
    flex: 1.25,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  inlineCallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  inlineCallText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  allergyAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 10,
    padding: 10,
  },
  allergyAlertTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#EF4444',
  },
  allergyAlertList: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 1,
  },
  safeMedicalBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  safeMedicalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  guardianCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  guardianTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  guardianName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  relPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  relPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  guardianSub: {
    fontSize: 11.5,
    marginTop: 3,
  },
  callCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyNotesText: {
    fontSize: 12,
  },
  notesBody: {
    fontSize: 13,
    lineHeight: 19,
  },
});
