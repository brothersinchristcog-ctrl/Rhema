/**
 * Rhema Church Management System
 * Kids Ministry & Sunday School Management Types
 */

export type KidsClassTier = 'nursery' | 'beginners' | 'primary' | 'junior' | 'teens';
export type KidsEnrollmentStatus = 'pending' | 'approved' | 'active' | 'inactive' | 'graduated';
export type KidsCustodyStatus = 'checked_out' | 'checked_in' | 'emergency_hold';
export type KidsGender = 'male' | 'female';

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
 * Calculates accurate age in years from "YYYY-MM-DD" date string.
 */
export function calculateChildAge(dob: string): number {
  if (!dob) return 0;
  const birthDate = new Date(dob);
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
