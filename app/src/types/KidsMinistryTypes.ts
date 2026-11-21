/**
 * Rhema Church Management System
 * Kids Ministry & Sunday School Management Types
 */

export type KidsClassTier = 'nursery' | 'beginners' | 'primary' | 'junior' | 'teens' | 'mixed';
export type KidsEnrollmentStatus = 'pending' | 'approved' | 'active' | 'inactive' | 'graduated';
export type KidsCustodyStatus = 'checked_out' | 'checked_in' | 'emergency_hold';
export type KidsGender = 'male' | 'female';
export type KidsTeacherRole = 'lead_teacher' | 'assistant_teacher' | 'volunteer' | 'director';

export type KidsProgramType =
  | 'sunday_school'
  | 'vbs'
  | 'special_meeting'
  | 'bible_study'
  | 'childrens_worship'
  | 'summer_camp'
  | 'other';

export interface KidsAttendanceSession {
  id: string; // Document ID, e.g. "sess_2026-11-22_sunday_school"
  churchId: string;
  programType: KidsProgramType;
  programTitle: string; // "Sunday School", "Kingdom Champions VBS – Day 1", "Kids Prayer Night"
  date: string; // "YYYY-MM-DD"
  startTime?: string;
  endTime?: string;
  assignedTeacherIds?: string[];
  description?: string;
  targetAges?: { min: number; max: number };
  status: 'active' | 'upcoming' | 'completed';
  attendanceFinalized?: boolean;
  attendanceFinalizedAt?: any;
  attendanceFinalizedBy?: string;
  attendanceFinalizedByName?: string;
  presentCount?: number;
  absentCount?: number;
  createdAt: any;
  updatedAt: any;
}

export interface KidsTeacherRecord {
  id: string; // Firestore doc ID
  teacherId: string; // e.g. "TCH-2026-0001"
  churchId: string;
  memberId?: string;
  name: string;
  phone: string;
  email?: string;
  photoUrl?: string;
  role: KidsTeacherRole;
  assignedClassTier: KidsClassTier;
  assignedClassName: string;
  roomNumber?: string;
  safeguardingStatus: 'verified' | 'pending' | 'in_review';
  safeguardingVerifiedDate?: string;
  backgroundCheckPassed: boolean;
  faceEnrolled: boolean;
  pinCode: string; // 4-digit PIN for clock-in e.g. "2026"
  status: 'active' | 'on_leave' | 'substitute';
  attendanceCount: number;
  lastCheckInAt?: any;
  createdAt: any;
  updatedAt: any;
}

export interface KidsTeacherAttendanceRecord {
  id: string;
  programSessionId?: string;
  programType?: KidsProgramType;
  programTitle?: string;
  teacherDocId: string;
  teacherId: string;
  teacherName: string;
  date: string; // "YYYY-MM-DD"
  checkInTime: any;
  method: 'face_scan' | 'pin';
  classTier: KidsClassTier;
  className: string;
  status: 'present' | 'late' | 'substitute';
  createdAt: any;
}

export interface AuthorizedGuardian {
  id: string;
  name: string;
  relationship: 'Father' | 'Mother' | 'Grandfather' | 'Grandmother' | 'Uncle' | 'Aunt' | 'Guardian' | 'Other';
  phone: string;
  photoUrl?: string;
  isPrimaryContact: boolean;
  canPickup: boolean;
  notes?: string;
}

export interface MedicalInfo {
  hasAllergies: boolean;
  allergiesList: string[]; // e.g. ["Peanuts", "Dust", "Penicillin"]
  medicalAlertNotes?: string;
  bloodGroup?: string;
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };
}

export interface ChildRecord {
  id: string; // Firestore document ID
  childId: string; // Formatted badge ID: e.g. "KID-2026-0001"
  churchId: string;
  branchId?: string;
  familyId: string; // Links to member's accountId or household ID
  parentMemberId: string; // Member UID of enrolling parent
  parentName: string;
  parentPhone: string;
  parentEmail?: string;
  
  firstName: string;
  lastName: string;
  fullName: string;
  dob: string; // "YYYY-MM-DD"
  age: number;
  gender: KidsGender;
  
  photoUrl?: string;
  photoStoragePath?: string;
  
  // Face Recognition profile
  faceEnrolled: boolean;
  faceEnrolledAt?: any;
  faceEmbeddingVector?: number[]; // Local 128-d vector for on-device comparison
  
  // Sunday School Allocation
  assignedClassId?: string;
  assignedClassName?: string;
  assignedTier?: KidsClassTier;
  academicYear: string;
  
  // Custody & Registration Status
  enrollmentStatus: KidsEnrollmentStatus;
  custodyStatus: KidsCustodyStatus;
  currentSessionId?: string;
  activePickupCode?: string; // 6-8 character dynamic code e.g. "RK-7942"
  lastCheckInAt?: any;
  lastCheckOutAt?: any;
  
  medical: MedicalInfo;
  guardians: AuthorizedGuardian[];
  
  notes?: string;
  // Single Source of Truth link to Church Member registration
  memberContactId?: string; // Doc ID from `Rhema Church/{churchId}/members`
  isSyncedFromMember?: boolean;
  enrollmentSource?: 'parent_self' | 'admin' | 'teacher_direct' | 'member_sync';
  enrolledByTeacherId?: string;
  enrolledByTeacherName?: string;
  enrolledByRole?: 'teacher' | 'admin';
  parentConsentStatus?: 'confirmed' | 'pending_review';
  parentConsentConfirmed?: boolean;
  parentConsentConfirmedAt?: any;
  parentConsentConfirmedBy?: string;
  consentPermissions?: ChildConsentPermissions;
  hiddenProgramSessionIds?: string[]; // Parent-deleted attendance history entries for this child only
  approvedByAdminId?: string;
  approvedAt?: any;
  enrolledAt: any;
  updatedAt: any;
}

export interface ChildConsentPermissions {
  canLeaveClassroomIndependently: boolean;
  canLeavePremisesIndependently: boolean;
  teacherInstructions?: string;
  status: 'confirmed' | 'pending_review' | 'not_submitted';
  updatedAt?: any;
  updatedByMemberId?: string;
  updatedByName?: string;
}

export interface KidsClassRecord {
  id: string;
  classId: string;
  churchId: string;
  branchId?: string;
  name: string; // e.g. "Junior Champions"
  tier: KidsClassTier;
  ageRange: { min: number; max: number };
  roomNumber: string;
  maxCapacity: number;
  currentEnrolledCount: number;
  leadTeacherId: string;
  leadTeacherName: string;
  leadTeacherPhone?: string;
  assistantTeacherIds?: string[];
  schedule: {
    dayOfWeek: string;
    startTime: string; // "09:30"
    endTime: string;   // "11:30"
  };
  academicYear: string;
  isActive: boolean;
}

export interface KidsSessionRecord {
  id: string;
  sessionId: string;
  programSessionId?: string; // Links to KidsAttendanceSession.id
  programType?: KidsProgramType;
  programTitle?: string;
  churchId: string;
  familyId?: string;
  parentMemberId?: string;
  parentPhone?: string;
  childId: string;
  childDocId: string;
  childName: string;
  childPhotoUrl?: string;
  classId: string;
  className: string;
  teacherName?: string;
  sessionDate: string; // "YYYY-MM-DD"
  
  pickupCode: string; // "RK-7942"
  checkInTime: any;
  checkedInByMemberId: string;
  checkedInByName: string;
  checkedInMethod: 'face_scan' | 'qr_code' | 'manual';
  
  status: 'active' | 'checked_out' | 'emergency';
  checkOutTime?: any;
  checkedOutByName?: string;
  checkedOutByPhone?: string;
  verifiedByTeacherId?: string;
  
  allergyFlag: boolean;
  notes?: string;
  deletedByParent?: boolean;
}

export interface KidsAttendanceLogRecord {
  id: string;
  programSessionId?: string;
  programType?: KidsProgramType;
  programTitle?: string;
  familyId?: string;
  parentMemberId?: string;
  parentPhone?: string;
  childDocId: string;
  childId: string;
  childName: string;
  classId?: string;
  className?: string;
  classTier: KidsClassTier;
  teacherName?: string;
  sessionDate: string; // "YYYY-MM-DD"
  status?: 'present' | 'absent';
  checkInTime?: any;
  method?: 'face_scan' | 'qr_code' | 'manual';
  finalizedByMemberId?: string;
  finalizedByName?: string;
  finalizedAt?: any;
  deletedByParent?: boolean;
  createdAt: any;
}

export type KidsAttendanceDisplayStatus = 'present' | 'checked_out' | 'absent' | 'not_checked_in';

export interface KidsProgramAttendanceEntry {
  programSessionId: string;
  programType: KidsProgramType;
  programTitle: string;
  date: string; // "YYYY-MM-DD"
  startTime?: string;
  endTime?: string;
  sessionStatus: 'active' | 'upcoming' | 'completed';
  attendanceFinalized: boolean;
  attendanceStatus: KidsAttendanceDisplayStatus;
  checkInTime?: any;
  checkOutTime?: any;
  classroomName: string;
  teacherName: string;
  checkedInMethod?: string;
  pickupCode?: string;
  checkedOutByName?: string;
  custodyRecordId?: string;
}

export const KIDS_PROGRAM_LABELS: Record<KidsProgramType, string> = {
  sunday_school: 'Sunday School',
  vbs: 'Vacation Bible School (VBS)',
  special_meeting: 'Special Kids Meeting',
  bible_study: 'Bible Study Program',
  childrens_worship: "Children's Worship",
  summer_camp: 'Summer Camp',
  other: 'Special Event',
};

export interface KidsProgramVisualMeta {
  type: KidsProgramType;
  label: string;
  shortLabel: string;
  emoji: string;
  iconImage: any;
  accentColor: string;
  softBg: string;
  softBorder: string;
}

const KIDS_PROGRAM_3D_ICONS = {
  sunday_school: require('../../assets/kids_cat_lessons.png'),
  vbs: require('../../assets/gallery_3d_church.png'),
  special_meeting: require('../../assets/3d_party_popper.png'),
  childrens_worship: require('../../assets/gallery_3d_stage.png'),
  summer_camp: require('../../assets/gallery_3d_fireworks.png'),
  bible_study: require('../../assets/3d_daily_verse.png'),
  other: require('../../assets/3d_events.png'),
} as const;

/**
 * Returns consistent visual theme tokens (3D icon, labels, accent colors) across all Kids Ministry program types.
 */
export function getKidsProgramVisual(
  programType?: KidsProgramType | string,
  isDark: boolean = false
): KidsProgramVisualMeta {
  switch (programType) {
    case 'vbs':
      return {
        type: 'vbs',
        label: 'Vacation Bible School (VBS)',
        shortLabel: 'VBS',
        emoji: '☀️',
        iconImage: KIDS_PROGRAM_3D_ICONS.vbs,
        accentColor: isDark ? '#FB923C' : '#EA580C',
        softBg: isDark ? 'rgba(249, 115, 22, 0.16)' : '#FFF7ED',
        softBorder: isDark ? 'rgba(251, 146, 60, 0.35)' : '#FED7AA',
      };
    case 'special_meeting':
      return {
        type: 'special_meeting',
        label: 'Special Kids Meeting',
        shortLabel: 'Special',
        emoji: '✨',
        iconImage: KIDS_PROGRAM_3D_ICONS.special_meeting,
        accentColor: isDark ? '#C084FC' : '#7C3AED',
        softBg: isDark ? 'rgba(139, 92, 246, 0.16)' : '#F5F3FF',
        softBorder: isDark ? 'rgba(192, 132, 252, 0.35)' : '#DDD6FE',
      };
    case 'childrens_worship':
      return {
        type: 'childrens_worship',
        label: "Children's Worship",
        shortLabel: 'Worship',
        emoji: '🎵',
        iconImage: KIDS_PROGRAM_3D_ICONS.childrens_worship,
        accentColor: isDark ? '#F472B6' : '#DB2777',
        softBg: isDark ? 'rgba(236, 72, 153, 0.16)' : '#FDF2F8',
        softBorder: isDark ? 'rgba(244, 114, 182, 0.35)' : '#FBCFE8',
      };
    case 'summer_camp':
      return {
        type: 'summer_camp',
        label: 'Summer Camp',
        shortLabel: 'Camps',
        emoji: '⛺',
        iconImage: KIDS_PROGRAM_3D_ICONS.summer_camp,
        accentColor: isDark ? '#34D399' : '#059669',
        softBg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
        softBorder: isDark ? 'rgba(52, 211, 153, 0.35)' : '#A7F3D0',
      };
    case 'bible_study':
      return {
        type: 'bible_study',
        label: 'Bible Study Program',
        shortLabel: 'Bible Study',
        emoji: '📜',
        iconImage: KIDS_PROGRAM_3D_ICONS.bible_study,
        accentColor: isDark ? '#60A5FA' : '#2563EB',
        softBg: isDark ? 'rgba(59, 130, 246, 0.16)' : '#EFF6FF',
        softBorder: isDark ? 'rgba(96, 165, 250, 0.35)' : '#BFDBFE',
      };
    case 'other':
      return {
        type: 'other',
        label: 'Special Event',
        shortLabel: 'Other',
        emoji: '🎯',
        iconImage: KIDS_PROGRAM_3D_ICONS.other,
        accentColor: isDark ? '#94A3B8' : '#475569',
        softBg: isDark ? 'rgba(148, 163, 184, 0.16)' : '#F8FAFC',
        softBorder: isDark ? 'rgba(148, 163, 184, 0.32)' : '#CBD5E1',
      };
    case 'sunday_school':
    default:
      return {
        type: 'sunday_school',
        label: 'Sunday School',
        shortLabel: 'Sunday School',
        emoji: '📖',
        iconImage: KIDS_PROGRAM_3D_ICONS.sunday_school,
        accentColor: isDark ? '#FBBF24' : '#D97706',
        softBg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FFFBEB',
        softBorder: isDark ? 'rgba(251, 191, 36, 0.35)' : '#FDE68A',
      };
  }
}

/**
 * Resolves unified consent & release permissions for a child record across Member View, Admin, and Scanners.
 */
export function resolveChildConsentInfo(child: ChildRecord | null | undefined): {
  status: 'confirmed' | 'pending_review' | 'not_submitted';
  isConfirmed: boolean;
  canLeaveClassroomIndependently: boolean;
  canLeavePremisesIndependently: boolean;
  teacherInstructions: string;
  updatedAt: any;
  authorizedPickups: AuthorizedGuardian[];
} {
  if (!child) {
    return {
      status: 'not_submitted',
      isConfirmed: false,
      canLeaveClassroomIndependently: false,
      canLeavePremisesIndependently: false,
      teacherInstructions: '',
      updatedAt: null,
      authorizedPickups: [],
    };
  }

  const perms = child.consentPermissions;
  const legacyPending = child.parentConsentStatus === 'pending_review';
  const status: 'confirmed' | 'pending_review' | 'not_submitted' = legacyPending
    ? 'pending_review'
    : perms?.status
    ? perms.status
    : child.parentConsentConfirmed === true || child.parentConsentStatus === 'confirmed'
    ? 'confirmed'
    : child.enrollmentSource === 'parent_self' && Boolean(child.guardians?.length)
    ? 'confirmed'
    : 'not_submitted';

  return {
    status,
    isConfirmed: status === 'confirmed',
    canLeaveClassroomIndependently: Boolean(perms?.canLeaveClassroomIndependently),
    canLeavePremisesIndependently: Boolean(perms?.canLeavePremisesIndependently),
    teacherInstructions: (perms?.teacherInstructions ?? child.notes ?? '').trim(),
    updatedAt: perms?.updatedAt || child.parentConsentConfirmedAt || child.updatedAt || child.enrolledAt,
    authorizedPickups: (child.guardians || []).filter(g => g.canPickup !== false),
  };
}

/**
 * Calculates accurate age in years from "YYYY-MM-DD" or "DD-MM-YYYY" date string.
 */
export function calculateChildAge(dob: string): number {
  if (!dob) return 0;
  let birthDate: Date;
  if (/^\d{2}-\d{2}-\d{4}$/.test(dob)) {
    const parts = dob.split('-').map(Number);
    birthDate = new Date(parts[2], parts[1] - 1, parts[0]);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const parts = dob.split('-').map(Number);
    birthDate = new Date(parts[0], parts[1] - 1, parts[2]);
  } else {
    birthDate = new Date(dob);
  }
  if (isNaN(birthDate.getTime())) return 0;
  
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Maps a child's age to the recommended Sunday School Tier.
 */
export function getRecommendedClassTier(age: number): {
  tier: KidsClassTier;
  displayName: string;
  ageRange: string;
  roomDefault: string;
} {
  if (age <= 2) {
    return { tier: 'nursery', displayName: 'Nursery Angels', ageRange: '0–2 yrs', roomDefault: 'Room 101' };
  } else if (age <= 5) {
    return { tier: 'beginners', displayName: 'Beginners Kingdom', ageRange: '3–5 yrs', roomDefault: 'Room 102' };
  } else if (age <= 8) {
    return { tier: 'primary', displayName: 'Primary Stars', ageRange: '6–8 yrs', roomDefault: 'Room 201' };
  } else if (age <= 12) {
    return { tier: 'junior', displayName: 'Junior Champions', ageRange: '9–12 yrs', roomDefault: 'Room 204' };
  } else {
    return { tier: 'teens', displayName: 'Teens for Christ', ageRange: '13–17 yrs', roomDefault: 'Youth Hall' };
  }
}

/**
 * Checks whether a child of a given age is eligible to join a Sunday School classroom.
 * Mixed Age Group ('mixed') classrooms accept children of all age groups.
 */
export function isChildEligibleForClass(
  childAge: number,
  cls: Pick<KidsClassRecord, 'tier' | 'ageRange'>
): boolean {
  if (cls.tier === 'mixed') return true;
  if (cls.ageRange && typeof cls.ageRange.min === 'number' && typeof cls.ageRange.max === 'number') {
    return childAge >= cls.ageRange.min && childAge <= cls.ageRange.max;
  }
  return getRecommendedClassTier(childAge).tier === cls.tier;
}

/**
 * Resolves the lesson tierGuide key for a child.
 * Mixed Age Group students receive the age-matched curriculum guide for their age.
 */
export function resolveLessonTierKey(
  assignedTier: KidsClassTier | undefined,
  childAge: number
): Exclude<KidsClassTier, 'mixed'> {
  if (assignedTier && assignedTier !== 'mixed') {
    return assignedTier;
  }
  const rec = getRecommendedClassTier(childAge).tier;
  return rec === 'mixed' ? 'primary' : rec;
}

/**
 * Generates formatted Child ID e.g. "KID-2026-0042".
 */
export function formatChildId(counter: number, year?: number): string {
  const currentYear = year || new Date().getFullYear();
  const padded = String(counter).padStart(4, '0');
  return `KID-${currentYear}-${padded}`;
}

/**
 * Generates dynamic 6-character pickup code e.g. "RK-7942".
 */
export function generateDynamicPickupCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Unambiguous chars (no 0, 1, I, O)
  let random = '';
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `RK-${random}`;
}

// ==========================================
// PHASE 5: BIBLE LEARNING CENTER MODELS
// ==========================================

export interface KidsBibleStoryPage {
  pageNumber: number;
  heading: string;
  textEnglish: string;
  textTelugu: string;
  illustrationEmoji: string;
  imageUrl?: string;
}

export interface KidsBibleStory {
  id: string;
  storyId: string;
  churchId: string;
  title: string;
  titleTelugu: string;
  scriptureRef: string;
  theme: string;
  coverEmoji: string;
  coverImageUrl?: string;
  readTime: string;
  summary: string;
  summaryTelugu: string;
  storyContent?: string;
  storyContentTelugu?: string;
  pages: KidsBibleStoryPage[];
  reflectionQuestions: Array<{
    questionEnglish: string;
    questionTelugu: string;
  }>;
  audioNarrationUrl?: string;
  isPublished?: boolean;
  ageGroup?: string;
  createdAt: any;
  updatedAt: any;
}

export interface KidsQuizQuestion {
  id: string;
  questionEnglish: string;
  questionTelugu: string;
  options: string[];
  optionsTelugu?: string[];
  correctIndex: number;
  explanation: string;
  explanationTelugu?: string;
}

export interface KidsQuiz {
  id: string;
  quizId: string;
  churchId: string;
  title: string;
  titleTelugu: string;
  scriptureRef: string;
  pointsReward: number;
  badgeReward: string;
  coverEmoji: string;
  thumbnailUrl?: string;
  estimatedMinutes?: number;
  sourceDocumentName?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  ageGroup?: string;
  isPublished?: boolean;
  questions: KidsQuizQuestion[];
  createdAt: any;
  updatedAt?: any;
}

export interface KidsWorshipSong {
  id: string;
  songId: string;
  churchId: string;
  title: string;
  titleTelugu: string;
  category: 'action_song' | 'praise' | 'hymn' | 'action_dance';
  youtubeVideoId: string;
  audioUrl?: string;
  audioFileName?: string;
  thumbnailUrl?: string;
  lyricsTelugu: string;
  lyricsEnglish: string;
  duration: string;
  coverEmoji: string;
  isPublished?: boolean;
  createdAt: any;
  updatedAt?: any;
}

export interface KidsMemoryVerse {
  id: string;
  weekNumber: number;
  scriptureRef: string;
  scriptureRefTelugu: string;
  verseEnglish: string;
  verseTelugu: string;
  theme: string;
  audioPronunciationUrl?: string;
  scrambleWords: string[];
}

// ─── PHASE 6: 52-WEEK BILINGUAL CURRICULUM TYPES ───────────────

export type CurriculumQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type CurriculumMode = '52_week' | 'custom';

export interface KidsCurriculumTierGuide {
  tier: KidsClassTier;
  tierName: string;
  focusAge: string;
  objective: string;
  objectiveTelugu: string;
  activityName: string;
  activityInstructions: string;
  activityInstructionsTelugu: string;
  discussionQuestions: string[];
}

export interface KidsCurriculumLesson {
  id: string; // Document ID e.g. "week_42" or "custom_..."
  type?: CurriculumMode; // '52_week' (default) | 'custom'
  weekNumber: number; // 1 to 52 for 52_week, or sequence number for custom
  scheduledDate?: string; // "YYYY-MM-DD" for custom lessons or cached calculated date
  quarter: CurriculumQuarter;
  quarterTheme: string; // e.g. "Q3: Courage & Great Kings"
  title: string; // e.g. "David and Goliath: Giant-Slaying Faith"
  titleTelugu: string; // e.g. "దావీదు మరియు గొల్యాతు: విశ్వాసంతో జయించుట"
  scriptureRef: string; // "1 Samuel 17:1-50"
  scriptureRefTelugu: string; // "1 సమూయేలు 17:1-50"
  bigIdea: string; // "The battle belongs to the Lord!"
  bigIdeaTelugu: string; // "యుద్ధము యెహోవాదే; ఆయన మనకు విజయాన్ని అనుగ్రహించును!"
  
  // Weekly Memory Verse
  memoryVerse: {
    reference: string;
    referenceTelugu: string;
    verseEnglish: string;
    verseTelugu: string;
  };

  // Connected learning materials
  storyId?: string;
  quizId?: string;
  songId?: string;
  customStorySummary?: string;
  customActivityNotes?: string;

  // Teacher preparation schedule
  teacherPrep: {
    prayerFocus: string;
    prayerFocusTelugu: string;
    suppliesNeeded: string[];
    schedule: Array<{
      timeMinutes: number;
      segment: string;
      description: string;
    }>;
  };

  // Tier-differentiated lesson plans
  tierGuides: {
    nursery: KidsCurriculumTierGuide;
    beginners: KidsCurriculumTierGuide;
    primary: KidsCurriculumTierGuide;
    junior: KidsCurriculumTierGuide;
    teens: KidsCurriculumTierGuide;
    mixed?: KidsCurriculumTierGuide;
  };

  isCurrentWeek?: boolean;
  academicYear: string; // e.g. "2026-2027"
  createdAt?: any;
  updatedAt?: any;
}

// ─── PHASE 9: KIDS EVENTS, VBS & REWARDS/CERTIFICATES ─────────

export interface KidsVBSHouse {
  id: string; // e.g. "house_red"
  name: string; // e.g. "Red Warriors"
  nameTelugu: string; // "ఎరుపు వీరులు"
  color: string; // "#EF4444"
  score: number;
  memberCount: number;
}

export interface KidsVBSEventRecord {
  id: string;
  eventId: string;
  churchId: string;
  title: string;
  titleTelugu: string;
  themeVerse: string;
  themeVerseTelugu: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'active' | 'completed';
  houses: KidsVBSHouse[];
  totalRegistered: number;
  createdAt: any;
  updatedAt: any;
}

export interface KidsBadge {
  id: string;
  title: string;
  titleTelugu: string;
  description: string;
  emoji: string;
  color: string;
  pointsRequired: number;
  category: 'attendance' | 'scripture' | 'quiz' | 'craft' | 'vbs';
}

export interface KidsCertificateData {
  childName: string;
  childId: string;
  eventName: string;
  eventNameTelugu: string;
  tierOrHouse: string;
  dateIssued: string;
  academicYear: string;
  directorName: string;
  directorTitle?: string;
  pastorName: string;
  pastorTitle?: string;
  churchName: string;
  verse: string;
  verseTelugu: string;
}

export interface KidsCertificateSettings {
  directorName: string;
  directorTitle?: string;
  pastorName: string;
  pastorTitle?: string;
  churchName?: string;
  updatedAt?: any;
}

export interface KidsCurriculumConfig {
  mode?: CurriculumMode; // '52_week' | 'custom'
  is52WeekEnabled?: boolean; // Toggle to enable/disable the 52-Week Curriculum Plan
  officialLaunchDate?: string | null; // "YYYY-MM-DD" e.g. "2026-12-06"
  isLaunched: boolean;
  manualOverrideWeek?: number | null; // Admin can manually override any week if needed
  customActiveLessonId?: string | null; // Admin-selected active custom lesson ID
  updatedAt?: any;
}

/**
 * Formats a Date object as "YYYY-MM-DD" in local timezone.
 */
export function toIsoDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns today (if Sunday) or the upcoming Sunday as "YYYY-MM-DD".
 */
export function getNextSundayDateString(fromDate: Date = new Date()): string {
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const dayOfWeek = d.getDay(); // 0 = Sunday
  if (dayOfWeek !== 0) {
    d.setDate(d.getDate() + (7 - dayOfWeek));
  }
  return toIsoDateString(d);
}

/**
 * Calculates the calendar date ("YYYY-MM-DD") for a given week number (1-52)
 * based on the confirmed curriculum start date.
 */
export function getCurriculumWeekDate(
  startDateStr?: string | null,
  weekNumber: number = 1
): string | null {
  if (!startDateStr) return null;
  const parts = startDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + Math.max(0, weekNumber - 1) * 7);
  return toIsoDateString(date);
}

/**
 * Formats "YYYY-MM-DD" into "DD MMM YYYY" (e.g. "22 Nov 2026") for clean display.
 */
export function formatCurriculumDateDisplay(dateStr?: string | null): string {
  if (!dateStr) return 'Not Scheduled';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = months[parseInt(month, 10) - 1] || month;
  return `${day} ${monthLabel} ${year}`;
}

/**
 * Separates the curriculum list into 52-week lessons and custom weekly lessons.
 */
export function splitCurriculumLessons(lessons: KidsCurriculumLesson[]): {
  fiftyTwoWeekLessons: KidsCurriculumLesson[];
  customLessons: KidsCurriculumLesson[];
} {
  const fiftyTwoWeekLessons: KidsCurriculumLesson[] = [];
  const customLessons: KidsCurriculumLesson[] = [];

  for (const l of lessons) {
    if (l.type === 'custom') {
      customLessons.push(l);
    } else {
      fiftyTwoWeekLessons.push(l);
    }
  }

  fiftyTwoWeekLessons.sort((a, b) => (a.weekNumber || 0) - (b.weekNumber || 0));
  customLessons.sort((a, b) => {
    const dateA = a.scheduledDate || '9999-12-31';
    const dateB = b.scheduledDate || '9999-12-31';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.weekNumber || 0) - (b.weekNumber || 0);
  });

  return { fiftyTwoWeekLessons, customLessons };
}

/**
 * Calculates the current active curriculum week based on the Church Admin's official launch date.
 * If Rhema has not officially launched yet, it stays on Week 1.
 * Once launched, it automatically progresses to Week 2, 3, 4 every following Sunday.
 */
export function calculateCurriculumWeek(config?: KidsCurriculumConfig | null): number {
  if (!config) return 1;
  if (config.manualOverrideWeek && config.manualOverrideWeek >= 1 && config.manualOverrideWeek <= 52) {
    return config.manualOverrideWeek;
  }
  if (!config.isLaunched || !config.officialLaunchDate) {
    return 1;
  }

  const parts = config.officialLaunchDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 1;
  const launchDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // If today is before launch date, stay on Week 1 standby
  if (today < launchDate) return 1;

  const diffMs = today.getTime() - launchDate.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const diffWeeks = Math.floor(diffDays / 7);
  const weekNumber = 1 + diffWeeks;
  return Math.min(Math.max(1, weekNumber), 52);
}

/**
 * Resolves the single active lesson & mode to display in Admin summary and Member View.
 */
export function resolveActiveCurriculumLesson(params: {
  config?: KidsCurriculumConfig | null;
  lessons: KidsCurriculumLesson[];
}): {
  lesson: KidsCurriculumLesson | null;
  mode: CurriculumMode;
  activeDate: string | null;
} {
  const { config, lessons } = params;
  const { fiftyTwoWeekLessons, customLessons } = splitCurriculumLessons(lessons);
  const is52WeekActive =
    config?.is52WeekEnabled !== undefined
      ? config.is52WeekEnabled
      : config?.mode !== 'custom';

  if (!is52WeekActive) {
    let activeCustom: KidsCurriculumLesson | null = null;
    if (config?.customActiveLessonId) {
      activeCustom = customLessons.find(l => l.id === config.customActiveLessonId) || null;
    }
    if (!activeCustom) {
      activeCustom = customLessons.find(l => l.isCurrentWeek) || null;
    }
    if (!activeCustom && customLessons.length > 0) {
      const todayIso = toIsoDateString(new Date());
      // Exact match for today first, else nearest upcoming, else latest past
      activeCustom =
        customLessons.find(l => l.scheduledDate === todayIso) ||
        customLessons.find(l => (l.scheduledDate || '') >= todayIso) ||
        customLessons[customLessons.length - 1] ||
        null;
    }
    return {
      lesson: activeCustom,
      mode: 'custom',
      activeDate: activeCustom?.scheduledDate || null,
    };
  }

  const weekNum = calculateCurriculumWeek(config);
  const active52 =
    fiftyTwoWeekLessons.find(l => l.weekNumber === weekNum) ||
    fiftyTwoWeekLessons.find(l => l.isCurrentWeek) ||
    fiftyTwoWeekLessons[0] ||
    null;

  const activeDate =
    active52 && config?.officialLaunchDate
      ? getCurriculumWeekDate(config.officialLaunchDate, active52.weekNumber)
      : null;

  return {
    lesson: active52,
    mode: '52_week',
    activeDate,
  };
}

/**
 * Resolves a child's program-by-program attendance entries without ever mixing sessions.
 */
export function buildChildProgramAttendanceEntries(params: {
  child: ChildRecord | null | undefined;
  programSessions: KidsAttendanceSession[];
  custodyRecords: KidsSessionRecord[];
  attendanceLogs: KidsAttendanceLogRecord[];
  classes: KidsClassRecord[];
  teachers: KidsTeacherRecord[];
}): KidsProgramAttendanceEntry[] {
  const { child, programSessions, custodyRecords, attendanceLogs, classes, teachers } = params;
  if (!child) return [];

  // Enforce strict per-child filtering by unique ID and skip parent-deleted history entries.
  const belongsToChild = (rec: { childDocId?: string; childId?: string }): boolean => {
    if (rec.childDocId) return rec.childDocId === child.id;
    if (rec.childId && child.childId) return rec.childId === child.childId;
    return false;
  };
  const hiddenSessionIds = new Set(child.hiddenProgramSessionIds || []);
  const childCustodyRecords = custodyRecords.filter(r => belongsToChild(r) && !r.deletedByParent);
  const childAttendanceLogs = attendanceLogs.filter(l => belongsToChild(l) && !l.deletedByParent);

  const assignedClass =
    classes.find(c => child.assignedClassId && c.id === child.assignedClassId) ||
    classes.find(c => child.assignedTier && c.tier === child.assignedTier) ||
    null;

  const teacherMap = new Map<string, KidsTeacherRecord>();
  for (const t of teachers) {
    if (t.id) teacherMap.set(t.id, t);
    if (t.memberId) teacherMap.set(t.memberId, t);
  }

  const resolveFacultyName = (
    sess?: KidsAttendanceSession,
    custody?: KidsSessionRecord,
    attLog?: KidsAttendanceLogRecord
  ): string => {
    if (custody?.teacherName) return custody.teacherName;
    if (attLog?.teacherName) return attLog.teacherName;
    if (sess?.assignedTeacherIds && sess.assignedTeacherIds.length > 0) {
      const names = sess.assignedTeacherIds
        .map(tid => teacherMap.get(tid)?.name)
        .filter((n): n is string => Boolean(n && n.trim()));
      if (names.length > 0) return names.join(', ');
    }
    if (custody?.checkedInByName) return custody.checkedInByName;
    if (assignedClass?.leadTeacherName) return assignedClass.leadTeacherName;
    return 'Sunday School Faculty';
  };

  const matchedCustodyIds = new Set<string>();
  const matchedLogIds = new Set<string>();
  const entries: KidsProgramAttendanceEntry[] = [];

  for (const sess of programSessions) {
    if (hiddenSessionIds.has(sess.id)) continue;
    const custody = childCustodyRecords.find(r => {
      if (r.programSessionId && r.programSessionId === sess.id) return true;
      return !r.programSessionId && r.sessionDate === sess.date && sess.programType === 'sunday_school';
    });
    if (custody) matchedCustodyIds.add(custody.id);

    const attLog = childAttendanceLogs.find(l => {
      if (l.programSessionId && l.programSessionId === sess.id) return true;
      return !l.programSessionId && l.sessionDate === sess.date && sess.programType === 'sunday_school';
    });
    if (attLog) matchedLogIds.add(attLog.id);

    const isFinalized = Boolean(sess.attendanceFinalized);
    let attendanceStatus: KidsAttendanceDisplayStatus = 'not_checked_in';
    if (custody) {
      attendanceStatus = custody.status === 'checked_out' ? 'checked_out' : 'present';
    } else if (attLog && attLog.status !== 'absent') {
      attendanceStatus = 'present';
    } else if (isFinalized) {
      attendanceStatus = 'absent';
    }

    entries.push({
      programSessionId: sess.id,
      programType: sess.programType || 'sunday_school',
      programTitle: sess.programTitle || KIDS_PROGRAM_LABELS[sess.programType || 'sunday_school'] || 'Program',
      date: sess.date,
      startTime: sess.startTime,
      endTime: sess.endTime,
      sessionStatus: sess.status || 'active',
      attendanceFinalized: isFinalized,
      attendanceStatus,
      checkInTime: custody?.checkInTime || (attLog?.status !== 'absent' ? attLog?.checkInTime : undefined),
      checkOutTime: custody?.checkOutTime,
      classroomName:
        custody?.className ||
        attLog?.className ||
        assignedClass?.name ||
        child.assignedClassName ||
        'Sunday School Classroom',
      teacherName: resolveFacultyName(sess, custody, attLog),
      checkedInMethod: custody?.checkedInMethod || attLog?.method,
      pickupCode: custody?.status === 'active' ? custody.pickupCode : undefined,
      checkedOutByName: custody?.checkedOutByName,
      custodyRecordId: custody?.id,
    });
  }

  // Include any legacy custody/attendance records that predate kids_program_sessions
  for (const custody of childCustodyRecords) {
    if (matchedCustodyIds.has(custody.id)) continue;
    const key = custody.programSessionId || `legacy_${custody.sessionDate}_${custody.programType || 'sunday_school'}`;
    if (hiddenSessionIds.has(key)) continue;
    if (entries.some(e => e.programSessionId === key)) continue;

    entries.push({
      programSessionId: key,
      programType: custody.programType || 'sunday_school',
      programTitle: custody.programTitle || KIDS_PROGRAM_LABELS[custody.programType || 'sunday_school'] || 'Sunday School',
      date: custody.sessionDate,
      sessionStatus: 'completed',
      attendanceFinalized: true,
      attendanceStatus: custody.status === 'checked_out' ? 'checked_out' : 'present',
      checkInTime: custody.checkInTime,
      checkOutTime: custody.checkOutTime,
      classroomName: custody.className || assignedClass?.name || child.assignedClassName || 'Sunday School',
      teacherName: resolveFacultyName(undefined, custody, undefined),
      checkedInMethod: custody.checkedInMethod,
      pickupCode: custody.status === 'active' ? custody.pickupCode : undefined,
      checkedOutByName: custody.checkedOutByName,
      custodyRecordId: custody.id,
    });
  }

  for (const log of childAttendanceLogs) {
    if (matchedLogIds.has(log.id)) continue;
    const key = log.programSessionId || `legacy_${log.sessionDate}_${log.programType || 'sunday_school'}`;
    if (hiddenSessionIds.has(key)) continue;
    if (entries.some(e => e.programSessionId === key)) continue;

    // Respect rule: never mark absent without finalized session unless the record explicitly represents a finalized absent log
    const isAbsentLog = log.status === 'absent' && Boolean(log.finalizedAt);
    entries.push({
      programSessionId: key,
      programType: log.programType || 'sunday_school',
      programTitle: log.programTitle || KIDS_PROGRAM_LABELS[log.programType || 'sunday_school'] || 'Sunday School',
      date: log.sessionDate,
      sessionStatus: 'completed',
      attendanceFinalized: true,
      attendanceStatus: isAbsentLog ? 'absent' : 'present',
      checkInTime: isAbsentLog ? undefined : log.checkInTime,
      classroomName: log.className || assignedClass?.name || child.assignedClassName || 'Sunday School',
      teacherName: resolveFacultyName(undefined, undefined, log),
      checkedInMethod: log.method,
    });
  }

  // Sort descending by date so newest sessions appear first
  entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return entries;
}
