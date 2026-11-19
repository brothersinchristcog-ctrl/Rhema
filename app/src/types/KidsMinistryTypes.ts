/**
 * Rhema Church Management System
 * Kids Ministry & Sunday School Management Types
 */

export type KidsClassTier = 'nursery' | 'beginners' | 'primary' | 'junior' | 'teens';
export type KidsEnrollmentStatus = 'pending' | 'approved' | 'active' | 'inactive' | 'graduated';
export type KidsCustodyStatus = 'checked_out' | 'checked_in' | 'emergency_hold';
export type KidsGender = 'male' | 'female';
export type KidsTeacherRole = 'lead_teacher' | 'assistant_teacher' | 'volunteer' | 'director';

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
  
  medical: MedicalInfo;
  guardians: AuthorizedGuardian[];
  
  notes?: string;
  // Single Source of Truth link to Church Member registration
  memberContactId?: string; // Doc ID from `Rhema Church/{churchId}/members`
  isSyncedFromMember?: boolean;
  approvedByAdminId?: string;
  approvedAt?: any;
  enrolledAt: any;
  updatedAt: any;
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
  churchId: string;
  childId: string;
  childDocId: string;
  childName: string;
  childPhotoUrl?: string;
  classId: string;
  className: string;
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
  id: string; // Document ID e.g. "week_42"
  weekNumber: number; // 1 to 52
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
  pastorName: string;
  churchName: string;
  verse: string;
  verseTelugu: string;
}

export interface KidsCurriculumConfig {
  officialLaunchDate?: string | null; // "YYYY-MM-DD" e.g. "2026-12-06"
  isLaunched: boolean;
  manualOverrideWeek?: number | null; // Admin can manually override any week if needed
  updatedAt?: any;
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
  if (parts.length !== 3) return 1;
  const launchDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();

  // If today is before launch date, stay on Week 1 standby
  if (today < launchDate) return 1;

  const diffMs = today.getTime() - launchDate.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const weekNumber = 1 + diffWeeks;
  return Math.min(Math.max(1, weekNumber), 52);
}
