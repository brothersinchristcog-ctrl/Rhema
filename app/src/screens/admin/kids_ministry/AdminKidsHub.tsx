import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Users,
  Calendar,
  Shield,
  Search,
  X,
  Plus,
  Camera,
  Sparkles,
  Award,
  ChevronRight,
  AlertTriangle,
  UserCheck,
  CheckCircle,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import KidsMinistryService from '../../../services/KidsMinistryService';
import { ChildRecord, KidsClassRecord } from '../../../types/KidsMinistryTypes';
import EnrollChildModal from '../../kids_ministry/components/EnrollChildModal';

const { width } = Dimensions.get('window');

export default function AdminKidsHub({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const churchId = member?.churchId || 'rhema';

  // Tabs: 'overview' | 'children' | 'classes' | 'curriculum'
  const [activeTab, setActiveTab] = useState<'overview' | 'children' | 'classes' | 'curriculum'>('overview');
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [classes, setClasses] = useState<KidsClassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  // Load children and classes
  useEffect(() => {
    // 1. Fetch / Init default 5 Sunday School Classes
    KidsMinistryService.getOrInitKidsClasses(churchId).then(classList => {
      setClasses(classList);
    });

    // 2. Realtime listener for all enrolled children
    const unsubscribe = KidsMinistryService.subscribeToAllChildren(churchId, list => {
      setChildren(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [churchId]);

  // Search filter for children roster
  const filteredChildren = useMemo(() => {
    if (!searchQuery.trim()) return children;
    const q = searchQuery.toLowerCase().trim();
    return children.filter(c => {
      const name = (c.fullName || '').toLowerCase();
      const id = (c.childId || '').toLowerCase();
      const parent = (c.parentName || '').toLowerCase();
      const phone = (c.parentPhone || '').replace(/\D/g, '');
      const cls = (c.assignedClassName || '').toLowerCase();
      return name.includes(q) || id.includes(q) || parent.includes(q) || phone.includes(q) || cls.includes(q);
    });
  }, [children, searchQuery]);

  const handleDeleteChild = (childDocId: string, name: string) => {
    Alert.alert(
      'Remove Registration',
      `Are you sure you want to remove ${name} from Sunday School?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.deleteChild(churchId, childDocId);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not delete child');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* ── TOP NAV HEADER ── */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={styles.headerTitleSerif}>Kids Ministry Hub</Text>
          <Text style={styles.headerSubtitle}>Sunday School & Child Safety Administration</Text>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowEnrollModal(true)}
          activeOpacity={0.8}
        >
          <Plus size={14} color="#000000" strokeWidth={2.8} />
          <Text style={styles.addBtnText}>Enroll</Text>
        </TouchableOpacity>
      </View>

      {/* ── TAB PILLS (MATCHING CARE CELLS PILLS) ── */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'overview' && styles.tabPillActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabPillText, activeTab === 'overview' && styles.tabPillTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'children' && styles.tabPillActive]}
          onPress={() => setActiveTab('children')}
        >
          <Text style={[styles.tabPillText, activeTab === 'children' && styles.tabPillTextActive]}>
            Children ({children.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'classes' && styles.tabPillActive]}
          onPress={() => setActiveTab('classes')}
        >
          <Text style={[styles.tabPillText, activeTab === 'classes' && styles.tabPillTextActive]}>
            Classes ({classes.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'curriculum' && styles.tabPillActive]}
          onPress={() => setActiveTab('curriculum')}
        >
          <Text style={[styles.tabPillText, activeTab === 'curriculum' && styles.tabPillTextActive]}>
            Curriculum
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── CONTENT BODY ── */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#FBBF24" />
          <Text style={styles.loadingText}>Loading Kids Ministry records...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* ==================================================== */}
          {/* TAB 1: OVERVIEW METRICS                              */}
          {/* ==================================================== */}
          {activeTab === 'overview' && (
            <>
              {/* 4 Key Performance Indicators */}
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiNumber}>{children.length}</Text>
                  <Text style={styles.kpiLabel}>Enrolled Children</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={[styles.kpiNumber, { color: '#34D399' }]}>
                    {children.filter(c => c.custodyStatus === 'checked_in').length}
                  </Text>
                  <Text style={styles.kpiLabel}>Checked-In Today</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={[styles.kpiNumber, { color: '#FBBF24' }]}>5</Text>
                  <Text style={styles.kpiLabel}>Sunday Classes</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={[styles.kpiNumber, { color: '#60A5FA' }]}>
                    {children.filter(c => c.faceEnrolled).length}
                  </Text>
                  <Text style={styles.kpiLabel}>Face Scan Ready</Text>
                </View>
              </View>

              {/* Management Portals Navigation */}
              <View style={{ gap: 10, marginTop: 4 }}>
                <Text style={styles.sectionHeading}>MANAGEMENT PORTALS</Text>

                <TouchableOpacity
                  style={styles.portalCard}
                  onPress={() => setActiveTab('children')}
                  activeOpacity={0.8}
                >
                  <View style={styles.portalIconBox}>
                    <Users size={20} color="#FBBF24" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.portalTitle}>Children Roster & Guardian Verification</Text>
                    <Text style={styles.portalSub}>View emergency alerts, medical notes & authorized pickup lists</Text>
                  </View>
                  <ChevronRight size={18} color="#6B7280" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.portalCard}
                  onPress={() => setActiveTab('classes')}
                  activeOpacity={0.8}
                >
                  <View style={styles.portalIconBox}>
                    <Calendar size={20} color="#60A5FA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.portalTitle}>Sunday School Classrooms & Capacities</Text>
                    <Text style={styles.portalSub}>Nursery to Teens tiers, teacher assignments & room limits</Text>
                  </View>
                  <ChevronRight size={18} color="#6B7280" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.portalCard}
                  onPress={() => setActiveTab('curriculum')}
                  activeOpacity={0.8}
                >
                  <View style={styles.portalIconBox}>
                    <Sparkles size={20} color="#F472B6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.portalTitle}>52-Week Curriculum & AI Studio</Text>
                    <Text style={styles.portalSub}>Bilingual Telugu & English lessons, quizzes & crafts</Text>
                  </View>
                  <ChevronRight size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ==================================================== */}
          {/* TAB 2: CHILDREN ROSTER                               */}
          {/* ==================================================== */}
          {activeTab === 'children' && (
            <>
              {/* Search Bar */}
              <View style={styles.searchBar}>
                <Search size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Filter children by name, phone, or ID..."
                  placeholderTextColor="#6B7280"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <X size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>

              {filteredChildren.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>No children found matching "{searchQuery}"</Text>
                </View>
              ) : (
                filteredChildren.map(c => (
                  <View key={c.id} style={styles.childCard}>
                    <View style={styles.childCardHeader}>
                      <View style={styles.avatarWrap}>
                        <View style={styles.avatarCircle}>
                          <Text style={styles.avatarInitials}>
                            {c.firstName.charAt(0)}{c.lastName ? c.lastName.charAt(0) : ''}
                          </Text>
                        </View>
                        {c.faceEnrolled && (
                          <View style={styles.faceCheckDot}>
                            <Text style={{ fontSize: 8, color: '#FFFFFF' }}>✓</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                          <Text style={styles.childNameSerif}>{c.fullName}</Text>
                          <View style={styles.idBadge}>
                            <Text style={styles.idBadgeText}>{c.childId}</Text>
                          </View>
                        </View>

                        <Text style={styles.childMeta}>
                          Age: {c.age} · {c.gender === 'male' ? 'Boy' : 'Girl'} · {c.assignedClassName || 'Class'}
                        </Text>

                        {/* Medical Alert Tag */}
                        {c.medical?.hasAllergies && (
                          <View style={styles.allergyTag}>
                            <AlertTriangle size={10} color="#F87171" />
                            <Text style={styles.allergyTagText}>
                              {c.medical.allergiesList.join(', ')}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Delete / Edit Button */}
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteChild(c.id, c.fullName)}
                      >
                        <X size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.childCardDivider} />

                    <View style={styles.guardianRow}>
                      <Text style={styles.guardianText} numberOfLines={1}>
                        Parent: {c.parentName} ({c.parentPhone || 'No phone'})
                      </Text>
                      <View style={styles.pickupPill}>
                        <Text style={styles.pickupPillText}>
                          {c.guardians ? c.guardians.length : 1} Pickups
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ==================================================== */}
          {/* TAB 3: CLASSES (5 TIERS)                             */}
          {/* ==================================================== */}
          {activeTab === 'classes' && (
            <View style={{ gap: 12 }}>
              {classes.map(cls => {
                const enrolledInClass = children.filter(c => c.assignedTier === cls.tier).length;
                return (
                  <View key={cls.id} style={styles.classCard}>
                    <View style={styles.classCardHeader}>
                      <div>
                        <View style={styles.tierTag}>
                          <Text style={styles.tierTagText}>
                            Age {cls.ageRange.min}–{cls.ageRange.max} yrs
                          </Text>
                        </View>
                        <Text style={styles.classTitle}>{cls.name}</Text>
                        <Text style={styles.classSchedule}>
                          {cls.roomNumber} · {cls.schedule.dayOfWeek}s {cls.schedule.startTime}
                        </Text>
                      </div>

                      <View style={styles.capacityBadge}>
                        <Text style={styles.capacityText}>
                          {enrolledInClass} / {cls.maxCapacity}
                        </Text>
                        <Text style={styles.capacitySub}>Enrolled</Text>
                      </View>
                    </View>

                    <View style={styles.childCardDivider} />

                    <View style={styles.classFooter}>
                      <Text style={styles.teacherName}>Lead: {cls.leadTeacherName}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setSearchQuery(cls.name);
                          setActiveTab('children');
                        }}
                      >
                        <Text style={styles.viewRosterLink}>View Roster ({enrolledInClass}) &rsaquo;</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ==================================================== */}
          {/* TAB 4: 52-WEEK CURRICULUM                            */}
          {/* ==================================================== */}
          {activeTab === 'curriculum' && (
            <View style={{ gap: 12 }}>
              <View style={styles.curriculumHero}>
                <Sparkles size={20} color="#FBBF24" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.curriculumHeroTitle}>52-Week Bilingual Curriculum</Text>
                  <Text style={styles.curriculumHeroSub}>Telugu & English Scripture Lessons for 2026-2027</Text>
                </View>
              </View>

              <View style={styles.lessonCard}>
                <View style={styles.lessonHeader}>
                  <Text style={styles.lessonWeek}>WEEK 42 · CURRENT LESSON</Text>
                  <Text style={styles.approvedBadge}>✓ Approved by Director</Text>
                </View>
                <Text style={styles.lessonTitle}>David and Goliath (దైర్యము / Courage)</Text>
                <Text style={styles.lessonRef}>1 Samuel 17 · 1 సమూయేలు 17</Text>
                <Text style={styles.lessonVerse}>
                  "యుద్ధము యెహోవాదే; ఆయన మిమ్మును మా చేతికి అప్పగించును." — 1 Sam 17:47
                </Text>
              </View>

              <View style={styles.lessonCard}>
                <View style={styles.lessonHeader}>
                  <Text style={styles.lessonWeek}>WEEK 43 · NEXT SUNDAY</Text>
                  <Text style={styles.approvedBadge}>✓ Approved</Text>
                </View>
                <Text style={styles.lessonTitle}>Daniel in the Lions' Den (విశ్వాసము / Faith)</Text>
                <Text style={styles.lessonRef}>Daniel 6 · దానియేలు 6</Text>
                <Text style={styles.lessonVerse}>
                  "నా దేవుడు తన దూతను పంపి సింహముల నోళ్లు మూయించెను." — Dan 6:22
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── ENROLL CHILD MODAL ── */}
      {showEnrollModal && (
        <EnrollChildModal
          visible={showEnrollModal}
          onClose={() => setShowEnrollModal(false)}
          churchId={churchId}
          member={member}
          onChildEnrolled={() => {
            // Realtime updates
          }}
        />
      )}
    </View>
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    alignItems: 'center',
  },
  headerTitleSerif: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  addBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#121215',
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  tabPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  tabPillText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  tabPillTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: (width - 50) / 2,
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
  },
  kpiNumber: {
    fontSize: 26,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#FFFFFF',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    fontWeight: '500',
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  portalCard: {
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  portalIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  portalSub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  searchBar: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    padding: 0,
  },
  emptyCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyCardText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  childCard: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 10,
  },
  childCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  faceCheckDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#18181B',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  childNameSerif: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  idBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  idBadgeText: {
    fontSize: 9,
    color: '#93C5FD',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  childMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  allergyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  allergyTagText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '700',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childCardDivider: {
    height: 1,
    backgroundColor: '#27272A',
  },
  guardianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guardianText: {
    fontSize: 11,
    color: '#9CA3AF',
    flex: 1,
  },
  pickupPill: {
    backgroundColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pickupPillText: {
    color: '#D4D4D8',
    fontSize: 10,
    fontWeight: '600',
  },
  classCard: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 10,
  },
  classCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tierTag: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  tierTagText: {
    color: '#93C5FD',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  classTitle: {
    fontSize: 17,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  classSchedule: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  capacityBadge: {
    alignItems: 'flex-end',
  },
  capacityText: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '900',
    color: '#34D399',
  },
  capacitySub: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  classFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teacherName: {
    fontSize: 11,
    color: '#D4D4D8',
    fontWeight: '500',
  },
  viewRosterLink: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '700',
  },
  curriculumHero: {
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  curriculumHeroTitle: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  curriculumHeroSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  lessonCard: {
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 6,
  },
  lessonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lessonWeek: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#FBBF24',
    letterSpacing: 1.2,
  },
  approvedBadge: {
    fontSize: 10,
    color: '#34D399',
    fontWeight: '600',
  },
  lessonTitle: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  lessonRef: {
    fontSize: 11,
    color: '#93C5FD',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  lessonVerse: {
    fontSize: 12,
    color: '#D1D5DB',
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 4,
  },
});
