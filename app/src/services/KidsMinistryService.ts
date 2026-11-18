import firestore from '@react-native-firebase/firestore';
import { RHEMA_CHURCH_ID, RHEMA_ROOT_COLLECTION } from '../constants/ChurchConfig';
import FirestoreService from './FirestoreService';
import {
  ChildRecord,
  KidsClassRecord,
  KidsClassTier,
  calculateChildAge,
  getRecommendedClassTier,
  formatChildId,
  generateDynamicPickupCode,
} from '../types/KidsMinistryTypes';

/**
 * Sanitizes an object before writing to Firestore.
 * Strips undefined properties recursively.
 */
function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeForFirestore) as any;
  }
  if (typeof data === 'object') {
    if (
      (data as any).constructor &&
      ((data as any).constructor.name === 'FieldValue' ||
        (data as any).constructor.name === 'Timestamp' ||
        data instanceof Date)
    ) {
      return data;
    }
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        clean[k] = sanitizeForFirestore(v);
      }
    }
    return clean as any;
  }
  return data;
}

class KidsMinistryService {
  private getDb() {
    return firestore();
  }

  private getKidsCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_children');
  }

  private getClassesCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_classes');
  }

  /**
   * Retrieves all children enrolled under a given family/household ID.
   */
  async getChildrenByFamily(churchId?: string, familyId?: string): Promise<ChildRecord[]> {
    if (!familyId) return [];
    try {
      const snap = await this.getKidsCollection(churchId)
        .where('familyId', '==', familyId)
        .orderBy('enrolledAt', 'desc')
        .get();

      return snap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
    } catch (error) {
      console.warn('KidsMinistryService.getChildrenByFamily error:', error);
      // Fallback without orderBy in case composite index is building
      const fallbackSnap = await this.getKidsCollection(churchId)
        .where('familyId', '==', familyId)
        .get();
      return fallbackSnap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
    }
  }

  /**
   * Realtime listener for children belonging to a family.
   */
  subscribeToFamilyChildren(
    churchId: string,
    familyId: string,
    callback: (children: ChildRecord[]) => void
  ): () => void {
    if (!familyId) {
      callback([]);
      return () => {};
    }
    return this.getKidsCollection(churchId)
      .where('familyId', '==', familyId)
      .onSnapshot(
        snap => {
          if (!snap) {
            callback([]);
            return;
          }
          const children: ChildRecord[] = snap.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as any),
          }));
          callback(children);
        },
        err => {
          console.error('subscribeToFamilyChildren error:', err);
        }
      );
  }

  /**
   * Realtime listener for all children in the church (Admin View).
   */
  subscribeToAllChildren(
    churchId: string,
    callback: (children: ChildRecord[]) => void
  ): () => void {
    return this.getKidsCollection(churchId)
      .orderBy('enrolledAt', 'desc')
      .onSnapshot(
        snap => {
          if (!snap) {
            callback([]);
            return;
          }
          const list: ChildRecord[] = snap.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as any),
          }));
          callback(list);
        },
        () => {
          // Fallback without order
          this.getKidsCollection(churchId).onSnapshot(snap => {
            if (!snap) return callback([]);
            callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
          });
        }
      );
  }

  /**
   * Registers a new child in Sunday School.
   * Auto-assigns the recommended tier, calculates age, and generates formatted Child ID.
   */
  async registerChild(
    churchId: string,
    data: {
      familyId: string;
      parentMemberId: string;
      parentName: string;
      parentPhone: string;
      parentEmail?: string;
      firstName: string;
      lastName: string;
      dob: string;
      gender: 'male' | 'female';
      photoUrl?: string;
      allergiesList?: string[];
      medicalNotes?: string;
      bloodGroup?: string;
      guardians?: any[];
      emergencyContact?: { name: string; phone: string; relationship: string };
      notes?: string;
    }
  ): Promise<ChildRecord> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const collectionRef = this.getKidsCollection(cId);

    // Calculate age & recommended class tier
    const age = calculateChildAge(data.dob);
    const recommended = getRecommendedClassTier(age);

    // Determine sequence number for formatted ID e.g. "KID-2026-0001"
    const countSnap = await collectionRef.get();
    const childId = formatChildId(countSnap.size + 1);

    const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
    const now = firestore.FieldValue.serverTimestamp();

    const newRecord: Omit<ChildRecord, 'id'> = {
      childId,
      churchId: cId,
      familyId: data.familyId,
      parentMemberId: data.parentMemberId,
      parentName: data.parentName || '',
      parentPhone: data.parentPhone || '',
      parentEmail: data.parentEmail || '',

      firstName: data.firstName.trim(),
      lastName: (data.lastName || '').trim(),
      fullName,
      dob: data.dob,
      age,
      gender: data.gender,

      photoUrl: data.photoUrl || '',
      faceEnrolled: !!data.photoUrl,
      faceEnrolledAt: data.photoUrl ? now : null,

      assignedTier: recommended.tier,
      assignedClassName: recommended.displayName,
      academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,

      enrollmentStatus: 'approved', // Auto-approved for verified church family
      custodyStatus: 'checked_out',

      medical: {
        hasAllergies: !!(data.allergiesList && data.allergiesList.length > 0),
        allergiesList: data.allergiesList || [],
        medicalAlertNotes: data.medicalNotes || '',
        bloodGroup: data.bloodGroup || '',
        emergencyContact: data.emergencyContact || {
          name: data.parentName,
          phone: data.parentPhone,
          relationship: 'Parent',
        },
      },

      guardians: data.guardians && data.guardians.length > 0
        ? data.guardians
        : [
            {
              id: data.parentMemberId || 'p1',
              name: data.parentName,
              relationship: 'Father',
              phone: data.parentPhone,
              isPrimaryContact: true,
              canPickup: true,
            },
          ],

      notes: data.notes || '',
      enrolledAt: now,
      updatedAt: now,
    };

    const docRef = await collectionRef.add(sanitizeForFirestore(newRecord));
    return {
      id: docRef.id,
      ...newRecord,
    };
  }

  /**
   * Updates an existing child's profile or custody settings.
   */
  async updateChildProfile(
    churchId: string,
    childDocId: string,
    updates: Partial<ChildRecord>
  ): Promise<void> {
    const cleanUpdates = sanitizeForFirestore({
      ...updates,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    await this.getKidsCollection(churchId).doc(childDocId).update(cleanUpdates);
  }

  /**
   * Deletes a child registration.
   */
  async deleteChild(churchId: string, childDocId: string): Promise<void> {
    await this.getKidsCollection(churchId).doc(childDocId).delete();
  }

  /**
   * Reads existing family members from the user's account WITHOUT touching or disturbing their data.
   */
  async getExistingFamilyMembers(churchId: string, accountId: string): Promise<any[]> {
    try {
      return await FirestoreService.getRelatedContacts(churchId || RHEMA_CHURCH_ID, accountId);
    } catch (e) {
      console.warn('Could not load related contacts for family:', e);
      return [];
    }
  }

  /**
   * Fetches or automatically initializes the standard 5 Sunday School Classes if empty.
   */
  async getOrInitKidsClasses(churchId?: string): Promise<KidsClassRecord[]> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const classesRef = this.getClassesCollection(cId);
    const snap = await classesRef.get();

    if (!snap.empty) {
      return snap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
    }

    // Initialize Default 5 Tiers
    const defaults: Omit<KidsClassRecord, 'id'>[] = [
      {
        classId: 'CLASS-NURSERY',
        churchId: cId,
        name: 'Nursery Angels',
        tier: 'nursery',
        ageRange: { min: 0, max: 2 },
        roomNumber: 'Room 101',
        maxCapacity: 15,
        currentEnrolledCount: 0,
        leadTeacherId: '',
        leadTeacherName: 'Pastor & Volunteers',
        schedule: { dayOfWeek: 'Sunday', startTime: '09:30', endTime: '11:30' },
        academicYear: '2026-2027',
        isActive: true,
      },
      {
        classId: 'CLASS-BEGINNERS',
        churchId: cId,
        name: 'Beginners Kingdom',
        tier: 'beginners',
        ageRange: { min: 3, max: 5 },
        roomNumber: 'Room 102',
        maxCapacity: 20,
        currentEnrolledCount: 0,
        leadTeacherId: '',
        leadTeacherName: 'Sis. Jayanthi Admin',
        schedule: { dayOfWeek: 'Sunday', startTime: '09:30', endTime: '11:30' },
        academicYear: '2026-2027',
        isActive: true,
      },
      {
        classId: 'CLASS-PRIMARY',
        churchId: cId,
        name: 'Primary Stars',
        tier: 'primary',
        ageRange: { min: 6, max: 8 },
        roomNumber: 'Room 201',
        maxCapacity: 25,
        currentEnrolledCount: 0,
        leadTeacherId: '',
        leadTeacherName: 'Bro. Sunil Babu',
        schedule: { dayOfWeek: 'Sunday', startTime: '09:30', endTime: '11:30' },
        academicYear: '2026-2027',
        isActive: true,
      },
      {
        classId: 'CLASS-JUNIOR',
        churchId: cId,
        name: 'Junior Champions',
        tier: 'junior',
        ageRange: { min: 9, max: 12 },
        roomNumber: 'Room 204',
        maxCapacity: 25,
        currentEnrolledCount: 0,
        leadTeacherId: '',
        leadTeacherName: 'Bro. Rajesh Yeddula',
        schedule: { dayOfWeek: 'Sunday', startTime: '09:30', endTime: '11:30' },
        academicYear: '2026-2027',
        isActive: true,
      },
      {
        classId: 'CLASS-TEENS',
        churchId: cId,
        name: 'Teens for Christ',
        tier: 'teens',
        ageRange: { min: 13, max: 17 },
        roomNumber: 'Youth Hall',
        maxCapacity: 30,
        currentEnrolledCount: 0,
        leadTeacherId: '',
        leadTeacherName: 'Youth Pastor',
        schedule: { dayOfWeek: 'Sunday', startTime: '09:30', endTime: '11:30' },
        academicYear: '2026-2027',
        isActive: true,
      },
    ];

    const results: KidsClassRecord[] = [];
    for (const item of defaults) {
      const docRef = await classesRef.add(sanitizeForFirestore(item));
      results.push({ id: docRef.id, ...item });
    }
    return results;
  }
}

export default new KidsMinistryService();
