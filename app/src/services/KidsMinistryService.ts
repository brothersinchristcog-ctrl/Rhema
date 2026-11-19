import firestore from '@react-native-firebase/firestore';
import { RHEMA_CHURCH_ID, RHEMA_ROOT_COLLECTION } from '../constants/ChurchConfig';
import FirestoreService from './FirestoreService';
import {
  ChildRecord,
  KidsClassRecord,
  KidsClassTier,
  KidsTeacherRecord,
  KidsTeacherAttendanceRecord,
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  KidsMemoryVerse,
  KidsCurriculumLesson,
  CurriculumQuarter,
  KidsVBSEventRecord,
  KidsBadge,
  KidsCertificateData,
  KidsVBSHouse,
  calculateChildAge,
  getRecommendedClassTier,
  formatChildId,
  generateDynamicPickupCode,
  KidsCurriculumConfig,
  calculateCurriculumWeek,
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

  private getSessionsCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_sessions');
  }

  private getAttendanceCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_attendance');
  }

  private getAuditLogsCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_audit_logs');
  }

  private getTeachersCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_teachers');
  }

  private getTeacherAttendanceCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_teacher_attendance');
  }

  private getStoriesCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_stories');
  }

  private getQuizzesCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_quizzes');
  }

  private getSongsCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_songs');
  }

  private getVersesCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_verses');
  }

  private getCurriculumCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_curriculum');
  }

  private getEventsCollection(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_events');
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
      memberContactId?: string;
      isSyncedFromMember?: boolean;
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
      ...(data.memberContactId ? { memberContactId: data.memberContactId } : {}),
      ...(data.isSyncedFromMember ? { isSyncedFromMember: true } : {}),
      enrolledAt: now,
      updatedAt: now,
    };

    // If this registration originated from Rhema Kids directly, ensure the child is also
    // mirrored into `Rhema Church/{churchId}/members` so the Members tab reflects it seamlessly!
    let linkedMemberContactId = data.memberContactId;
    if (!linkedMemberContactId && data.familyId) {
      try {
        const memberRef = await firestore()
          .collection(RHEMA_ROOT_COLLECTION)
          .doc(cId)
          .collection('members')
          .add(
            sanitizeForFirestore({
              firstName: data.firstName.trim(),
              lastName: (data.lastName || '').trim(),
              name: fullName,
              displayName: fullName,
              relation: data.gender === 'female' ? 'Daughter' : 'Son',
              gender: data.gender === 'female' ? 'Female' : 'Male',
              dob: data.dob,
              anniversaryDate: '',
              email: data.parentEmail || '',
              phone: '',
              referencePhone: (data.parentPhone || '').replace(/\D/g, '').slice(-10),
              isKidMember: true,
              accountId: data.familyId,
              profilePhoto: data.photoUrl || '',
              createdAt: firestore.FieldValue.serverTimestamp(),
              updatedAt: firestore.FieldValue.serverTimestamp(),
            })
          );
        linkedMemberContactId = memberRef.id;
        (newRecord as any).memberContactId = linkedMemberContactId;
        (newRecord as any).isSyncedFromMember = true;
      } catch (memSyncErr) {
        console.warn('[KidsMinistryService] Error mirroring child to members:', memSyncErr);
      }
    }

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
   * Synchronizes registered children from Church Member Registration (`Rhema Church/{churchId}/members`)
   * to the Rhema Kids Sunday School module (`kids_children`).
   * 
   * Single Source of Truth:
   * - Scans family members with kid relations (Son, Daughter, Child, Grandson, Granddaughter, Nephew, Niece)
   *   or flagged with isKidMember: true.
   * - Deduplicates strictly by `memberContactId`, exact full name matching, or `(familyId + fullName)`.
   * - Automatically registers missing children with their age, recommended class tier, and guardian contacts.
   * - Updates existing kids_children if details like DOB, names, or photo have changed.
   * - Can sync for a single family (familyId) or across the entire church.
   */
  async syncMemberChildrenToKidsMinistry(churchId: string, familyId?: string): Promise<{ synced: number; created: number }> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const kidRelations = ['Son', 'Daughter', 'Child', 'Grandson', 'Granddaughter', 'Nephew', 'Niece'];

    try {
      // 1. Fetch relevant member records
      let membersQuery: any = firestore().collection(RHEMA_ROOT_COLLECTION).doc(cId).collection('members');
      if (familyId) {
        membersQuery = membersQuery.where('accountId', '==', familyId);
      }
      const membersSnap = await membersQuery.get();
      if (membersSnap.empty) {
        return { synced: 0, created: 0 };
      }

      // Filter down to children/kids (under 18)
      const childDocs = membersSnap.docs.filter((doc: any) => {
        const d = doc.data();
        const rel = (d.relation || d.Relation || '').trim();
        const isKid = d.isKidMember === true || kidRelations.some(r => r.toLowerCase() === rel.toLowerCase());
        if (!isKid) return false;
        // Age guard: must be under 18 years old to be in Kids Ministry
        if (d.dob) {
          const age = calculateChildAge(d.dob);
          if (age > 17) return false;
        }
        return true;
      });

      if (childDocs.length === 0) {
        return { synced: 0, created: 0 };
      }

      // 2. Fetch existing kids_children in this church/family to prevent duplicates
      let existingKidsQuery: any = this.getKidsCollection(cId);
      if (familyId) {
        existingKidsQuery = existingKidsQuery.where('familyId', '==', familyId);
      }
      const existingKidsSnap = await existingKidsQuery.get();
      const existingKids = existingKidsSnap.docs.map((d: any) => ({
        docId: d.id,
        ...(d.data() as ChildRecord),
      }));

      // Cache parents for pre-populating guardian & contact info
      const parentCache: Record<string, any> = {};
      const getParentInfo = async (accId: string) => {
        if (!accId) return null;
        if (parentCache[accId]) return parentCache[accId];
        try {
          const parentDoc = await firestore().collection(RHEMA_ROOT_COLLECTION).doc(cId).collection('members').doc(accId).get();
          if (parentDoc.exists) {
            parentCache[accId] = parentDoc.data();
            return parentDoc.data();
          }
        } catch {
          // ignore lookup error
        }
        return null;
      };

      let created = 0;
      let synced = 0;

      for (const mDoc of childDocs) {
        const mData = mDoc.data();
        const memberContactId = mDoc.id;
        const mFamilyId = mData.accountId || familyId || memberContactId;

        const firstName = (mData.firstName || mData.FirstName || '').trim() || (mData.name ? mData.name.split(' ')[0] : 'Child');
        const lastName = (mData.lastName || mData.LastName || '').trim() || (mData.name ? mData.name.split(' ').slice(1).join(' ') : '');
        const fullName = (`${firstName} ${lastName}`).trim() || mData.name || 'Child';
        const dob = mData.dob || mData.dateOfBirth || mData.DOB || '2020-01-01';
        const gender: 'male' | 'female' = (mData.gender || mData.Gender || '').toLowerCase() === 'female' ? 'female' : 'male';

        // Check if this child already exists in kids_children
        const existingMatch = existingKids.find((k: any) => {
          if (k.memberContactId && k.memberContactId === memberContactId) return true;
          // Match by name within same family
          if (k.familyId === mFamilyId && k.fullName.toLowerCase() === fullName.toLowerCase()) return true;
          return false;
        });

        if (existingMatch) {
          // Keep synchronized if DOB or link changed
          const updates: any = {};
          if (!existingMatch.memberContactId) {
            updates.memberContactId = memberContactId;
            updates.isSyncedFromMember = true;
          }
          if (mData.dob && existingMatch.dob !== mData.dob) {
            updates.dob = mData.dob;
            const newAge = calculateChildAge(mData.dob);
            updates.age = newAge;
            const rec = getRecommendedClassTier(newAge);
            updates.assignedTier = rec.tier;
            updates.assignedClassName = rec.displayName;
          }
          if (Object.keys(updates).length > 0) {
            await this.updateChildProfile(cId, existingMatch.docId, updates);
            synced++;
          }
        } else {
          // Not in kids_children yet -> automatically create linked record
          const parentData = await getParentInfo(mFamilyId);
          const parentName = parentData?.name || `${parentData?.firstName || ''} ${parentData?.lastName || ''}`.trim() || 'Parent';
          const parentPhone = parentData?.phone || parentData?.MobilePhone || mData.referencePhone || mData.phone || '';
          const parentEmail = parentData?.email || '';

          await this.registerChild(cId, {
            familyId: mFamilyId,
            parentMemberId: mFamilyId,
            parentName,
            parentPhone,
            parentEmail,
            firstName,
            lastName,
            dob,
            gender,
            photoUrl: mData.profilePhoto || mData.photoUrl || '',
            guardians: [
              {
                id: mFamilyId,
                name: parentName,
                relationship: mData.relation === 'Daughter' || mData.relation === 'Son' ? 'Father' : 'Guardian',
                phone: parentPhone,
                isPrimaryContact: true,
                canPickup: true,
              },
            ],
            notes: 'Auto-synced from Church Member Registration',
            memberContactId,
            isSyncedFromMember: true,
          });
          created++;
        }
      }

      return { synced, created };
    } catch (err) {
      console.error('[KidsMinistryService] Error syncing member children:', err);
      return { synced: 0, created: 0 };
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
    await this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_settings')
      .doc('classes')
      .set({ initialized: true, updatedAt: firestore.FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {});
    return results;
  }

  /**
   * Realtime subscription for Sunday School classes.
   */
  subscribeToClasses(
    churchId: string,
    callback: (classes: KidsClassRecord[]) => void
  ): () => void {
    const cId = churchId || RHEMA_CHURCH_ID;
    let seedCheckDone = false;
    return this.getClassesCollection(cId).onSnapshot(
      async snap => {
        if (!snap || snap.empty) {
          if (!seedCheckDone) {
            seedCheckDone = true;
            try {
              const metaSnap = await this.getDb()
                .collection(RHEMA_ROOT_COLLECTION)
                .doc(cId)
                .collection('kids_settings')
                .doc('classes')
                .get();
              if (!metaSnap.exists || !metaSnap.data()?.initialized) {
                const seeded = await this.getOrInitKidsClasses(cId);
                callback(seeded);
                return;
              }
            } catch (_) {}
          }
          callback([]);
          return;
        }
        seedCheckDone = true;
        const list = snap.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any),
        }));
        const tierOrder: Record<KidsClassTier, number> = {
          nursery: 1,
          beginners: 2,
          primary: 3,
          junior: 4,
          teens: 5,
        };
        list.sort((a, b) => {
          const tDiff = (tierOrder[a.tier as KidsClassTier] || 99) - (tierOrder[b.tier as KidsClassTier] || 99);
          if (tDiff !== 0) return tDiff;
          return (a.ageRange?.min ?? 0) - (b.ageRange?.min ?? 0);
        });
        callback(list);
      },
      err => {
        console.warn('subscribeToClasses error:', err);
        callback([]);
      }
    );
  }

  /**
   * Creates a new Sunday School classroom in Firestore.
   */
  async createClass(
    churchId: string,
    data: {
      name: string;
      tier: KidsClassTier;
      ageRange: { min: number; max: number };
      roomNumber: string;
      maxCapacity: number;
      leadTeacherName: string;
      leadTeacherPhone?: string;
      schedule: { dayOfWeek: string; startTime: string; endTime: string };
      academicYear?: string;
    }
  ): Promise<string> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();
    const classCode = `CLASS-${data.tier.toUpperCase()}-${Date.now().toString().slice(-4)}`;

    const payload = sanitizeForFirestore({
      classId: classCode,
      churchId: cId,
      name: data.name.trim(),
      tier: data.tier,
      ageRange: {
        min: Number(data.ageRange.min) || 0,
        max: Number(data.ageRange.max) || 14,
      },
      roomNumber: data.roomNumber.trim() || 'Room TBD',
      maxCapacity: Number(data.maxCapacity) || 25,
      currentEnrolledCount: 0,
      leadTeacherId: '',
      leadTeacherName: data.leadTeacherName.trim() || 'TBD',
      leadTeacherPhone: (data.leadTeacherPhone || '').trim(),
      schedule: {
        dayOfWeek: data.schedule?.dayOfWeek || 'Sunday',
        startTime: data.schedule?.startTime || '09:30',
        endTime: data.schedule?.endTime || '11:30',
      },
      academicYear: data.academicYear || '2026-2027',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const docRef = await this.getClassesCollection(cId).add(payload);

    await this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_settings')
      .doc('classes')
      .set({ initialized: true, updatedAt: now }, { merge: true })
      .catch(() => {});

    return docRef.id;
  }

  /**
   * Updates an existing Sunday School class room, capacity, teacher, or schedule.
   */
  async updateClass(
    churchId: string,
    classDocId: string,
    updates: Partial<KidsClassRecord>
  ): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const cleanUpdates = sanitizeForFirestore({
      ...updates,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    await this.getClassesCollection(cId).doc(classDocId).update(cleanUpdates);
  }

  /**
   * Permanently deletes a Sunday School classroom.
   */
  async deleteClass(churchId: string, classDocId: string): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    await this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_settings')
      .doc('classes')
      .set({ initialized: true, updatedAt: firestore.FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {});
    await this.getClassesCollection(cId).doc(classDocId).delete();
  }

  /**
   * Promotes or transfers a child to a target class tier.
   */
  async promoteChild(params: {
    churchId?: string;
    childDocId: string;
    childName: string;
    previousTier?: KidsClassTier;
    targetTier: KidsClassTier;
    targetClassId?: string;
    targetClassName: string;
    promotedByAdminId?: string;
    notes?: string;
  }): Promise<void> {
    const cId = params.churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();

    const childUpdate: Record<string, any> = {
      assignedTier: params.targetTier,
      assignedClassName: params.targetClassName,
      lastPromotedAt: now,
      updatedAt: now,
    };
    if (params.targetClassId) {
      childUpdate.assignedClassId = params.targetClassId;
    }

    await this.getKidsCollection(cId).doc(params.childDocId).update(childUpdate);

    await this.getAuditLogsCollection(cId).add({
      action: 'CLASS_PROMOTION',
      childDocId: params.childDocId,
      childName: params.childName,
      previousTier: params.previousTier || 'unassigned',
      targetTier: params.targetTier,
      targetClassName: params.targetClassName,
      promotedByAdminId: params.promotedByAdminId || 'admin',
      notes: params.notes || 'Age-based Sunday School promotion',
      timestamp: now,
    });
  }

  /**
   * Analyzes registered children and finds those eligible for promotion based on their age.
   */
  checkPromotionEligibility(children: ChildRecord[]): Array<{
    child: ChildRecord;
    currentTier: KidsClassTier;
    currentClassName: string;
    recommendedTier: KidsClassTier;
    recommendedClassName: string;
    currentAge: number;
  }> {
    const candidates: Array<{
      child: ChildRecord;
      currentTier: KidsClassTier;
      currentClassName: string;
      recommendedTier: KidsClassTier;
      recommendedClassName: string;
      currentAge: number;
    }> = [];

    for (const c of children) {
      const currentAge = calculateChildAge(c.dob);
      const recommended = getRecommendedClassTier(currentAge);

      if (c.assignedTier && c.assignedTier !== recommended.tier) {
        candidates.push({
          child: c,
          currentTier: c.assignedTier,
          currentClassName: c.assignedClassName || c.assignedTier,
          recommendedTier: recommended.tier,
          recommendedClassName: recommended.displayName,
          currentAge,
        });
      }
    }

    return candidates;
  }

  /**
   * Bulk promotes all eligible children in a batch.
   */
  async bulkPromoteChildren(
    churchId: string,
    candidates: Array<{
      child: ChildRecord;
      recommendedTier: KidsClassTier;
      recommendedClassName: string;
    }>,
    adminId?: string
  ): Promise<{ promotedCount: number }> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const batch = this.getDb().batch();
    const now = firestore.FieldValue.serverTimestamp();

    let count = 0;
    for (const item of candidates) {
      const childRef = this.getKidsCollection(cId).doc(item.child.id);
      batch.update(childRef, {
        assignedTier: item.recommendedTier,
        assignedClassName: item.recommendedClassName,
        lastPromotedAt: now,
        updatedAt: now,
      });

      const auditRef = this.getAuditLogsCollection(cId).doc();
      batch.set(auditRef, {
        action: 'CLASS_PROMOTION',
        childDocId: item.child.id,
        childName: item.child.fullName,
        previousTier: item.child.assignedTier || 'unassigned',
        targetTier: item.recommendedTier,
        targetClassName: item.recommendedClassName,
        promotedByAdminId: adminId || 'admin',
        notes: 'Bulk age-based promotion',
        timestamp: now,
      });

      count++;
    }

    if (count > 0) {
      await batch.commit();
    }

    return { promotedCount: count };
  }

  /**
   * Adds an authorized pickup guardian to a child's safeguarding profile.
   */
  async addAuthorizedGuardian(
    churchId: string,
    childDocId: string,
    guardian: any
  ): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const childRef = this.getKidsCollection(cId).doc(childDocId);
    await childRef.update({
      guardians: firestore.FieldValue.arrayUnion(sanitizeForFirestore(guardian)),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Removes an authorized pickup guardian from a child's profile.
   */
  async removeAuthorizedGuardian(
    churchId: string,
    childDocId: string,
    guardianId: string
  ): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const childRef = this.getKidsCollection(cId).doc(childDocId);
    const snap = await childRef.get();
    if (!snap.exists) return;
    const data = snap.data() as ChildRecord;
    const updated = (data.guardians || []).filter(g => g.id !== guardianId);
    await childRef.update({
      guardians: updated,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Toggles emergency hold on child dismissal (prevents unauthorized release).
   */
  async toggleEmergencyHold(
    churchId: string,
    childDocId: string,
    isHold: boolean,
    reason?: string
  ): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const childRef = this.getKidsCollection(cId).doc(childDocId);
    const now = firestore.FieldValue.serverTimestamp();
    await childRef.update({
      custodyStatus: isHold ? 'emergency_hold' : 'checked_in',
      emergencyHoldReason: isHold ? (reason || 'Parent requested custody hold') : null,
      updatedAt: now,
    });

    const auditRef = this.getAuditLogsCollection(cId).doc();
    await auditRef.set({
      action: isHold ? 'EMERGENCY_HOLD_ACTIVATED' : 'EMERGENCY_HOLD_RELEASED',
      childDocId,
      reason: reason || 'Parent toggle',
      timestamp: now,
    });
  }

  /**
   * Performs check-in for a child with duplicate check-in prevention.
   */
  async checkInChild(params: {
    churchId?: string;
    child: ChildRecord;
    method: 'face_scan' | 'qr_code' | 'manual';
    checkedInByMemberId: string;
    checkedInByName: string;
  }): Promise<{ session: any; alreadyCheckedIn: boolean }> {
    const cId = params.churchId || RHEMA_CHURCH_ID;
    const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
    const sessionsRef = this.getSessionsCollection(cId);

    // 1. DUPLICATE CHECK-IN PREVENTION
    const existingSnap = await sessionsRef
      .where('childDocId', '==', params.child.id)
      .where('sessionDate', '==', today)
      .where('status', '==', 'active')
      .get();

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      return {
        session: { id: existingDoc.id, ...(existingDoc.data() as any) },
        alreadyCheckedIn: true,
      };
    }

    // 2. GENERATE SECURE DYNAMIC PICKUP CODE (e.g. "RK-7942")
    const pickupCode = generateDynamicPickupCode();
    const now = firestore.FieldValue.serverTimestamp();

    const sessionData = {
      sessionId: `SESS_${today.replace(/-/g, '')}_${Date.now().toString().slice(-4)}`,
      churchId: cId,
      childId: params.child.childId,
      childDocId: params.child.id,
      childName: params.child.fullName,
      childPhotoUrl: params.child.photoUrl || '',
      classId: params.child.assignedClassId || params.child.assignedTier || 'general',
      className: params.child.assignedClassName || 'Sunday School',
      sessionDate: today,

      pickupCode,
      checkInTime: now,
      checkedInByMemberId: params.checkedInByMemberId,
      checkedInByName: params.checkedInByName,
      checkedInMethod: params.method,

      status: 'active',
      allergyFlag: !!params.child.medical?.hasAllergies,
      notes: params.child.notes || '',
      createdAt: now,
    };

    const docRef = await sessionsRef.add(sanitizeForFirestore(sessionData));

    // 3. UPDATE CHILD LIVE STATUS
    await this.getKidsCollection(cId).doc(params.child.id).update({
      custodyStatus: 'checked_in',
      activePickupCode: pickupCode,
      currentSessionId: docRef.id,
      lastCheckInAt: now,
      updatedAt: now,
    });

    // 4. LOG ATTENDANCE
    await this.getAttendanceCollection(cId).add({
      childDocId: params.child.id,
      childId: params.child.childId,
      childName: params.child.fullName,
      classTier: params.child.assignedTier || 'primary',
      sessionDate: today,
      checkInTime: now,
      method: params.method,
      createdAt: now,
    });

    return {
      session: { id: docRef.id, ...sessionData },
      alreadyCheckedIn: false,
    };
  }

  /**
   * Verifies and checks out a child.
   */
  async checkOutChild(params: {
    churchId?: string;
    sessionId?: string;
    childDocId?: string;
    pickupCode: string;
    verifiedByTeacherId: string;
    checkedOutByName?: string;
    checkedOutByPhone?: string;
    overrideReason?: string;
  }): Promise<{ success: boolean; error?: string; childName?: string }> {
    const cId = params.churchId || RHEMA_CHURCH_ID;
    const sessionsRef = this.getSessionsCollection(cId);

    let sessionDoc: any = null;

    if (params.sessionId) {
      const snap = await sessionsRef.doc(params.sessionId).get();
      if (snap.exists) sessionDoc = snap;
    } else if (params.childDocId) {
      const today = new Date().toISOString().split('T')[0];
      const snap = await sessionsRef
        .where('childDocId', '==', params.childDocId)
        .where('sessionDate', '==', today)
        .where('status', '==', 'active')
        .get();
      if (!snap.empty) sessionDoc = snap.docs[0];
    } else if (params.pickupCode) {
      const today = new Date().toISOString().split('T')[0];
      const cleanCode = params.pickupCode.trim().toUpperCase();
      const snap = await sessionsRef
        .where('pickupCode', '==', cleanCode)
        .where('sessionDate', '==', today)
        .where('status', '==', 'active')
        .get();
      if (!snap.empty) sessionDoc = snap.docs[0];
    }

    if (!sessionDoc) {
      return { success: false, error: 'No active Sunday School session found with this code.' };
    }

    const sData = sessionDoc.data() as any;

    // Check code match (unless emergency override provided)
    if (!params.overrideReason && sData.pickupCode !== params.pickupCode.trim().toUpperCase()) {
      return { success: false, error: 'Pickup code mismatch. Custody release cannot be authorized.' };
    }

    const now = firestore.FieldValue.serverTimestamp();

    // Update Session
    await sessionsRef.doc(sessionDoc.id).update({
      status: 'checked_out',
      checkOutTime: now,
      checkedOutByName: params.checkedOutByName || 'Authorized Guardian',
      checkedOutByPhone: params.checkedOutByPhone || '',
      verifiedByTeacherId: params.verifiedByTeacherId,
      overrideReason: params.overrideReason || null,
      updatedAt: now,
    });

    // Update Child record
    await this.getKidsCollection(cId).doc(sData.childDocId).update({
      custodyStatus: 'checked_out',
      activePickupCode: '',
      currentSessionId: '',
      lastCheckOutAt: now,
      updatedAt: now,
    });

    // Audit Log
    await this.getAuditLogsCollection(cId).add({
      action: 'CHECK_OUT',
      childDocId: sData.childDocId,
      childName: sData.childName,
      sessionId: sessionDoc.id,
      pickupCode: sData.pickupCode,
      checkedOutByName: params.checkedOutByName || '',
      verifiedByTeacherId: params.verifiedByTeacherId,
      overrideReason: params.overrideReason || '',
      timestamp: now,
    });

    return { success: true, childName: sData.childName };
  }

  /**
   * Realtime subscription for active checked-in sessions (Live Headcount).
   */
  subscribeToActiveSessions(
    churchId: string,
    callback: (sessions: any[]) => void
  ): () => void {
    const today = new Date().toISOString().split('T')[0];
    return this.getSessionsCollection(churchId)
      .where('sessionDate', '==', today)
      .where('status', '==', 'active')
      .onSnapshot(
        snap => {
          if (!snap) return callback([]);
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          callback(list);
        },
        () => callback([])
      );
  }

  /**
   * Searches for a child record by QR Payload (e.g. "RHEMA_KIDS:<childId>:<code...>") or Child ID or Phone.
   */
  async findChildByScanQuery(churchId: string, query: string): Promise<ChildRecord | null> {
    if (!query) return null;
    const clean = query.trim();

    // Check if it's our structured QR: "RHEMA_KIDS:docId:code"
    if (clean.startsWith('RHEMA_KIDS:')) {
      const parts = clean.split(':');
      if (parts[1]) {
        const snap = await this.getKidsCollection(churchId).doc(parts[1]).get();
        if (snap.exists) {
          return { id: snap.id, ...(snap.data() as any) };
        }
      }
    }

    // Try finding by childId (e.g. "KID-2026-0001")
    const byIdSnap = await this.getKidsCollection(churchId)
      .where('childId', '==', clean.toUpperCase())
      .limit(1)
      .get();
    if (!byIdSnap.empty) {
      return { id: byIdSnap.docs[0].id, ...(byIdSnap.docs[0].data() as any) };
    }

    // Try finding by activePickupCode (e.g. "RK-7942")
    const byCodeSnap = await this.getKidsCollection(churchId)
      .where('activePickupCode', '==', clean.toUpperCase())
      .limit(1)
      .get();
    if (!byCodeSnap.empty) {
      return { id: byCodeSnap.docs[0].id, ...(byCodeSnap.docs[0].data() as any) };
    }

    // Try finding by Parent Phone
    const cleanPhone = clean.replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      const byPhoneSnap = await this.getKidsCollection(churchId)
        .where('parentPhone', '==', cleanPhone)
        .limit(1)
        .get();
      if (!byPhoneSnap.empty) {
        return { id: byPhoneSnap.docs[0].id, ...(byPhoneSnap.docs[0].data() as any) };
      }
    }

    return null;
  }

  /**
   * Seeds default Sunday School teachers if collection is empty.
   */
  async getOrInitKidsTeachers(churchId?: string): Promise<KidsTeacherRecord[]> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const teachersRef = this.getTeachersCollection(cId);
    const snap = await teachersRef.get();

    if (!snap.empty) {
      return snap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
    }

    const now = firestore.FieldValue.serverTimestamp();
    const defaults: Omit<KidsTeacherRecord, 'id'>[] = [
      {
        teacherId: 'TCH-2026-0001',
        churchId: cId,
        name: 'Bro. Sunil Babu',
        phone: '+919876543211',
        email: 'sunil.babu@rhema.org',
        role: 'lead_teacher',
        assignedClassTier: 'primary',
        assignedClassName: 'Primary Stars',
        roomNumber: 'Room 201',
        safeguardingStatus: 'verified',
        safeguardingVerifiedDate: '2026-01-10',
        backgroundCheckPassed: true,
        faceEnrolled: true,
        pinCode: '1001',
        status: 'active',
        attendanceCount: 14,
        createdAt: now,
        updatedAt: now,
      },
      {
        teacherId: 'TCH-2026-0002',
        churchId: cId,
        name: 'Bro. Rajesh Yeddula',
        phone: '+919876543212',
        email: 'rajesh.yeddula@rhema.org',
        role: 'lead_teacher',
        assignedClassTier: 'junior',
        assignedClassName: 'Junior Champions',
        roomNumber: 'Room 204',
        safeguardingStatus: 'verified',
        safeguardingVerifiedDate: '2026-01-08',
        backgroundCheckPassed: true,
        faceEnrolled: true,
        pinCode: '1002',
        status: 'active',
        attendanceCount: 18,
        createdAt: now,
        updatedAt: now,
      },
      {
        teacherId: 'TCH-2026-0003',
        churchId: cId,
        name: 'Sis. Jayanthi Admin',
        phone: '+919876543213',
        email: 'jayanthi@rhema.org',
        role: 'lead_teacher',
        assignedClassTier: 'beginners',
        assignedClassName: 'Beginners Kingdom',
        roomNumber: 'Room 102',
        safeguardingStatus: 'verified',
        safeguardingVerifiedDate: '2026-01-12',
        backgroundCheckPassed: true,
        faceEnrolled: true,
        pinCode: '1003',
        status: 'active',
        attendanceCount: 16,
        createdAt: now,
        updatedAt: now,
      },
      {
        teacherId: 'TCH-2026-0004',
        churchId: cId,
        name: 'Sis. Mary Grace',
        phone: '+919876543214',
        email: 'mary.grace@rhema.org',
        role: 'lead_teacher',
        assignedClassTier: 'nursery',
        assignedClassName: 'Nursery Angels',
        roomNumber: 'Room 101',
        safeguardingStatus: 'verified',
        safeguardingVerifiedDate: '2026-01-15',
        backgroundCheckPassed: true,
        faceEnrolled: true,
        pinCode: '1004',
        status: 'active',
        attendanceCount: 12,
        createdAt: now,
        updatedAt: now,
      },
      {
        teacherId: 'TCH-2026-0005',
        churchId: cId,
        name: 'Youth Pastor Caleb',
        phone: '+919876543215',
        email: 'caleb@rhema.org',
        role: 'director',
        assignedClassTier: 'teens',
        assignedClassName: 'Teens for Christ',
        roomNumber: 'Youth Hall',
        safeguardingStatus: 'verified',
        safeguardingVerifiedDate: '2026-01-05',
        backgroundCheckPassed: true,
        faceEnrolled: true,
        pinCode: '1005',
        status: 'active',
        attendanceCount: 20,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const results: KidsTeacherRecord[] = [];
    for (const item of defaults) {
      const docRef = await teachersRef.add(sanitizeForFirestore(item));
      results.push({ id: docRef.id, ...item });
    }
    return results;
  }

  /**
   * Realtime subscription to Sunday School teachers and volunteers.
   */
  subscribeToTeachers(
    churchId: string,
    callback: (teachers: KidsTeacherRecord[]) => void
  ): () => void {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getTeachersCollection(cId).onSnapshot(
      async snap => {
        if (!snap || snap.empty) {
          const seeded = await this.getOrInitKidsTeachers(cId);
          callback(seeded);
          return;
        }
        const list = snap.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any),
        }));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        callback(list);
      },
      err => {
        console.warn('subscribeToTeachers error:', err);
        callback([]);
      }
    );
  }

  /**
   * Registers a new teacher or Sunday school volunteer.
   */
  async registerTeacher(
    churchId: string,
    data: {
      name: string;
      phone: string;
      email?: string;
      memberId?: string;
      role: any;
      assignedClassTier: KidsClassTier;
      assignedClassName: string;
      roomNumber?: string;
      pinCode?: string;
      backgroundCheckPassed?: boolean;
      safeguardingStatus?: 'verified' | 'pending' | 'in_review';
    }
  ): Promise<KidsTeacherRecord> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();
    const countSnap = await this.getTeachersCollection(cId).get();
    const teacherId = `TCH-2026-${String(countSnap.size + 1).padStart(4, '0')}`;

    const newRecord = {
      teacherId,
      churchId: cId,
      memberId: data.memberId || '',
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim() || '',
      role: data.role,
      assignedClassTier: data.assignedClassTier,
      assignedClassName: data.assignedClassName,
      roomNumber: data.roomNumber || 'Room 201',
      safeguardingStatus: data.safeguardingStatus || 'verified',
      safeguardingVerifiedDate: data.backgroundCheckPassed ? new Date().toISOString().split('T')[0] : '',
      backgroundCheckPassed: Boolean(data.backgroundCheckPassed),
      faceEnrolled: false,
      pinCode: data.pinCode || '1234',
      status: 'active' as const,
      attendanceCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await this.getTeachersCollection(cId).add(sanitizeForFirestore(newRecord));
    return { id: docRef.id, ...newRecord };
  }

  /**
   * Fetches church members for search and selection when registering faculty.
   */
  async searchChurchMembers(churchId: string, search: string): Promise<any[]> {
    const cId = churchId || RHEMA_CHURCH_ID;
    try {
      const snap = await firestore()
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(cId)
        .collection('members')
        .limit(100)
        .get();

      const q = search.trim().toLowerCase();
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((m: any) => {
          const name = (m.name || `${m.firstName || ''} ${m.lastName || ''}`).trim().toLowerCase();
          const phone = (m.phone || m.mobileNumber || '').toLowerCase();
          if (!q) return true;
          return name.includes(q) || phone.includes(q);
        });
    } catch (err) {
      console.warn('searchChurchMembers error:', err);
      return [];
    }
  }

  /**
   * Updates an existing teacher profile.
   */
  async updateTeacher(
    churchId: string,
    teacherDocId: string,
    updates: Partial<KidsTeacherRecord>
  ): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const cleanUpdates = sanitizeForFirestore({
      ...updates,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    await this.getTeachersCollection(cId).doc(teacherDocId).update(cleanUpdates);
  }

  /**
   * Deletes a teacher from Sunday school roster.
   */
  async deleteTeacher(churchId: string, teacherDocId: string): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    await this.getTeachersCollection(cId).doc(teacherDocId).delete();
  }

  /**
   * Clock in teacher with face scan or 4-digit PIN (blocks duplicate check-in today).
   */
  async teacherCheckIn(params: {
    churchId?: string;
    teacher: KidsTeacherRecord;
    method: 'face_scan' | 'pin';
  }): Promise<{ record: any; alreadyCheckedIn: boolean }> {
    const cId = params.churchId || RHEMA_CHURCH_ID;
    const today = new Date().toISOString().split('T')[0];
    const attRef = this.getTeacherAttendanceCollection(cId);

    const existingSnap = await attRef
      .where('teacherDocId', '==', params.teacher.id)
      .where('date', '==', today)
      .get();

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      return {
        record: { id: existingDoc.id, ...(existingDoc.data() as any) },
        alreadyCheckedIn: true,
      };
    }

    const now = firestore.FieldValue.serverTimestamp();
    const attData = {
      teacherDocId: params.teacher.id,
      teacherId: params.teacher.teacherId,
      teacherName: params.teacher.name,
      date: today,
      checkInTime: now,
      method: params.method,
      classTier: params.teacher.assignedClassTier,
      className: params.teacher.assignedClassName,
      status: 'present',
      createdAt: now,
    };

    const docRef = await attRef.add(sanitizeForFirestore(attData));

    await this.getTeachersCollection(cId).doc(params.teacher.id).update({
      attendanceCount: firestore.FieldValue.increment(1),
      lastCheckInAt: now,
      updatedAt: now,
    });

    return {
      record: { id: docRef.id, ...attData },
      alreadyCheckedIn: false,
    };
  }

  /**
   * Realtime subscription to today's teacher attendance.
   */
  subscribeToTodayTeacherAttendance(
    churchId: string,
    callback: (records: any[]) => void
  ): () => void {
    const cId = churchId || RHEMA_CHURCH_ID;
    const today = new Date().toISOString().split('T')[0];
    return this.getTeacherAttendanceCollection(cId)
      .where('date', '==', today)
      .onSnapshot(
        snap => {
          if (!snap) return callback([]);
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          callback(list);
        },
        () => callback([])
      );
  }

  // ==========================================
  // PHASE 5: BIBLE STORIES MANAGEMENT & SEEDING
  // ==========================================

  async getOrInitStories(churchId?: string): Promise<KidsBibleStory[]> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const storiesRef = this.getStoriesCollection(cId);
    const snap = await storiesRef.get();

    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    }

    const now = firestore.FieldValue.serverTimestamp();
    const defaults: Omit<KidsBibleStory, 'id'>[] = [
      {
        storyId: 'STORY-001',
        churchId: cId,
        title: 'David and Goliath',
        titleTelugu: 'దావీదు మరియు గొల్యాతు',
        scriptureRef: '1 Samuel 17',
        theme: 'Courage & Faith / దైర్యము & విశ్వాసము',
        coverEmoji: '⚔️',
        readTime: '6 min',
        summary: 'How a young shepherd boy defeated a giant champion through steadfast trust in God.',
        summaryTelugu: 'ఒక యువ గొర్రెల కాపరి దేవునియందు నమ్మకముతో ఫిలిష్తీయుల వీరుడైన గొల్యాతును ఎలా ఓడించాడో ఈ కథ తెలుపుతుంది.',
        pages: [
          {
            pageNumber: 1,
            heading: 'The Giant Challenger / గొల్యాతు సవాలు',
            illustrationEmoji: '🛡️',
            textEnglish: 'Every morning and evening for forty days, a giant named Goliath came out and defied the army of Israel. The soldiers were terrified!',
            textTelugu: 'నలభై దినములు ప్రతి ఉదయము మరియు సాయంత్రము గొల్యాతు అను దైత్యుడు వచ్చి ఇశ్రాయేలు సైన్యమును సవాలు చేసెను. సైనికులందరు భయపడిరి!',
          },
          {
            pageNumber: 2,
            heading: 'David Arrives at the Camp / దావీదు శిబిరమునకు వచ్చుట',
            illustrationEmoji: '🐑',
            textEnglish: 'Young David, who was tending sheep, came to bring food to his brothers. When he heard Goliath insulting the living God, he stepped forward courageously.',
            textTelugu: 'గొర్రెలను కాస్తున్న యువకుడైన దావీదు తన అన్నలకు ఆహారము తీసుకొని వచ్చెను. గొల్యాతు జీవముగల దేవుని సైన్యమును దూషించుట విని, దావీదు ముందుకు వచ్చెను.',
          },
          {
            pageNumber: 3,
            heading: 'Five Smooth Stones / ఐదు నునుపైన రాళ్ళు',
            illustrationEmoji: '🪨',
            textEnglish: 'David refused King Saul’s heavy armor. Instead, he took his staff, chose five smooth stones from the stream, and put them in his shepherd’s pouch with his sling in hand.',
            textTelugu: 'సౌలు రాజు ఇచ్చిన బరువైన యుద్ధకవచమును దావీదు వద్దనుకొనెను. తన చేతికర్రను తీసుకొని, వాగులోనుండి ఐదు నునుపైన రాళ్ళను ఏరుకొని ఒడిసెలతో బయలుదేరెను.',
          },
          {
            pageNumber: 4,
            heading: 'The Victory of the Lord / యెహోవా విజయము',
            illustrationEmoji: '🏆',
            textEnglish: 'David said: "You come against me with sword and spear, but I come against you in the name of the LORD Almighty!" With one stone, the giant fell to the ground!',
            textTelugu: 'దావీదు: "నీవు కత్తియు ఈటెయు ధరించి వచ్చుచున్నావు, అయితే సైన్యములకధిపతియగు యెహోవా పేరట నేను నీ మీదికి వచ్చుచున్నాను!" అని చెప్పి, ఒక్క రాతితోనే గొల్యాతును నేలకూల్చెను!',
          },
        ],
        reflectionQuestions: [
          {
            questionEnglish: 'Why was David not afraid of the giant Goliath?',
            questionTelugu: 'దావీదు గొల్యాతును చూచి ఎందుకు భయపడలేదు?',
          },
          {
            questionEnglish: 'What "giants" or challenges can God help you face today?',
            questionTelugu: 'ఈ రోజు నీ జీవితంలో ఎదురయ్యే ఏ కష్టాలలో దేవుడు సహాయం చేయగలడు?',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        storyId: 'STORY-002',
        churchId: cId,
        title: "Daniel in the Lions' Den",
        titleTelugu: 'సింహాల బోనులో దానియేలు',
        scriptureRef: 'Daniel 6',
        theme: 'Prayer & Faithfulness / ప్రార్థన & నిబద్ధత',
        coverEmoji: '🦁',
        readTime: '5 min',
        summary: 'Daniel remained faithful in daily prayer, and God sent an angel to shut the lions’ mouths.',
        summaryTelugu: 'దానియేలు దినమునకు మూడు మార్లు మోకాళ్ళూని ప్రార్థించెను; దేవుడు తన దూతను పంపి సింహాల నోళ్ళు మూయించెను.',
        pages: [
          {
            pageNumber: 1,
            heading: 'Three Times a Day / దినమునకు మూడుసార్లు ప్రార్థన',
            illustrationEmoji: '🙏',
            textEnglish: 'Even when the king signed a law forbidding prayer to anyone except himself, Daniel went to his room, opened his window toward Jerusalem, and knelt down to pray three times a day.',
            textTelugu: 'రాజు నుండి శాసనము వచ్చినను, దానియేలు యెరూషలేము తట్టు కిటికీలను తెరిచి ఉంచి, ప్రతిదినము మూడుసార్లు దేవునికి మోకరించి ప్రార్థించి స్తుతించుచుండెను.',
          },
          {
            pageNumber: 2,
            heading: 'Into the Den of Lions / సింహముల గుహలో',
            illustrationEmoji: '🐾',
            textEnglish: 'Daniel was arrested and cast into the den of hungry lions. The king had a stone laid across the mouth of the den and spent the night fasting.',
            textTelugu: 'శత్రువులు దానియేలును పట్టుకొని ఆకలితో ఉన్న సింహముల గుహలో పడవేసిరి. రాజు ఉపవాసముండి రాత్రి అంతయు నిద్రపోకుండా గడిపెను.',
          },
          {
            pageNumber: 3,
            heading: 'The Angel of Protection / కాపాడిన దేవదూత',
            illustrationEmoji: '✨',
            textEnglish: 'At dawn, the king ran to the den and called out in anguish. Daniel answered: "O king, live forever! My God sent His angel, and He shut the lions’ mouths so they have not hurt me!"',
            textTelugu: 'వేకువజామునే రాజు గుహ దగ్గరకు పరుగెత్తి పిలువగా, దానియేలు: "రాజా, నా దేవుడు తన దూతను పంపి సింహముల నోళ్ళు మూయించెను, అవి నాకు ఏ హానియు చేయలేదు!" అని పలికెను.',
          },
        ],
        reflectionQuestions: [
          {
            questionEnglish: 'How often did Daniel pray to God each day?',
            questionTelugu: 'దానియేలు ప్రతిరోజూ ఎన్నిసార్లు ప్రార్థన చేసాడు?',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        storyId: 'STORY-003',
        churchId: cId,
        title: 'Noah and the Great Ark',
        titleTelugu: 'నోవహు మరియు పెద్ద ఓడ',
        scriptureRef: 'Genesis 6–9',
        theme: 'Obedience & God’s Promise / విధేయత & దేవుని నిబంధన',
        coverEmoji: '🌈',
        readTime: '6 min',
        summary: 'Noah obeyed God by building an immense ark and saving animals two by two, sealed with the rainbow covenant.',
        summaryTelugu: 'నోవహు దేవుని మాటకు లోబడి ఓడను నిర్మించెను; జంతువులను జోళ్ళుగా కాపాడి, ఇంద్రధనుస్సు ద్వారా దేవుని వాగ్దానమును పొందెను.',
        pages: [
          {
            pageNumber: 1,
            heading: 'Building by Faith / విశ్వాసముతో ఓడ నిర్మించుట',
            illustrationEmoji: '🔨',
            textEnglish: 'God told Noah to build an ark of gopher wood. Though it had never rained before, Noah listened to God and built every single measurement with obedience.',
            textTelugu: 'దేవుడు నోవహుతో గోఫెరు కర్రతో ఒక పెద్ద ఓడను చేయుమని ఆజ్ఞాపించెను. వర్షము పడకపోయినను నోవహు దేవుని మాటకు లోబడి ఓడను పూర్తి చేసెను.',
          },
          {
            pageNumber: 2,
            heading: 'Two by Two / జోడు జోడుగా జంతువులు',
            illustrationEmoji: '🦒',
            textEnglish: 'Animals came into the ark two by two—birds, cattle, and creeping things. Then the LORD Himself shut the door of the ark securely.',
            textTelugu: 'ఆకాశ పక్షులు, పశువులు, ప్రాకు జంతువులు అన్నీ జోడు జోడుగా ఓడలోనికి ప్రవేశించెను. ఆ తరువాత యెహోవా తానే ఓడ తలుపును మూసెను.',
          },
          {
            pageNumber: 3,
            heading: 'The Rainbow Covenant / ఇంద్రధనుస్సు నిబంధన',
            illustrationEmoji: '🕊️',
            textEnglish: 'After the flood subsided, a dove brought back a fresh olive leaf. God set a beautiful rainbow in the clouds as a promise that the earth would never again be flooded.',
            textTelugu: 'ప్రళయ జలములు తగ్గిన తరువాత పావురము ఒలీవ ఆకును తెచ్చెను. ఇకపై జలప్రళయము రాదని దేవుడు ఆకాశములో ఇంద్రధనుస్సును నిబంధన గుర్తుగా ఉంచెను.',
          },
        ],
        reflectionQuestions: [
          {
            questionEnglish: 'What does the rainbow remind us of when we see it in the sky?',
            questionTelugu: 'ఆకాశంలో ఇంద్రధనుస్సును చూసినప్పుడు మనకు ఏ వాగ్దానం గుర్తుకు వస్తుంది?',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];

    const results: KidsBibleStory[] = [];
    for (const item of defaults) {
      const docRef = await storiesRef.add(sanitizeForFirestore(item));
      results.push({ id: docRef.id, ...item });
    }
    return results;
  }

  subscribeToStories(
    churchId: string,
    callback: (stories: KidsBibleStory[]) => void
  ): () => void {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getStoriesCollection(cId).onSnapshot(
      async snap => {
        if (!snap || snap.empty) {
          const seeded = await this.getOrInitStories(cId);
          callback(seeded);
          return;
        }
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        callback(list);
      },
      () => callback([])
    );
  }

  // ==========================================
  // PHASE 5: BIBLE QUIZZES MANAGEMENT & SEEDING
  // ==========================================

  async getOrInitQuizzes(churchId?: string): Promise<KidsQuiz[]> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const quizzesRef = this.getQuizzesCollection(cId);
    const snap = await quizzesRef.get();

    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    }

    const now = firestore.FieldValue.serverTimestamp();
    const defaults: Omit<KidsQuiz, 'id'>[] = [
      {
        quizId: 'QUIZ-001',
        churchId: cId,
        title: 'David and Goliath Quiz',
        titleTelugu: 'దావీదు మరియు గొల్యాతు క్విజ్',
        scriptureRef: '1 Samuel 17',
        pointsReward: 50,
        badgeReward: '🏆 Giant Slayer Badge',
        coverEmoji: '⚔️',
        questions: [
          {
            id: 'q1',
            questionEnglish: 'How many smooth stones did David take from the stream?',
            questionTelugu: 'దావీదు వాగులోనుండి ఎన్ని నునుపైన రాళ్ళను ఏరుకొనెను?',
            options: ['3 Stones', '5 Smooth Stones', '7 Stones', '1 Giant Boulder'],
            optionsTelugu: ['3 రాళ్ళు', '5 నునుపైన రాళ్ళు', '7 రాళ్ళు', '1 పెద్ద బండరాయి'],
            correctIndex: 1,
            explanation: 'David selected 5 smooth stones from the brook and put them in his shepherd bag (1 Sam 17:40).',
          },
          {
            id: 'q2',
            questionEnglish: 'In whose name did David face the giant Goliath?',
            questionTelugu: 'దావీదు ఎవరి పేరట గొల్యాతు మీదికి వెళ్ళెను?',
            options: ['In King Saul’s Name', 'In his own strength', 'In the Name of the LORD Almighty', 'In his brothers’ name'],
            optionsTelugu: ['సౌలు రాజు పేరట', 'తన స్వంత బలముతో', 'సైన్యములకధిపతియగు యెహోవా పేరట', 'తన అన్నల పేరట'],
            correctIndex: 2,
            explanation: '"I come against you in the name of the LORD Almighty, the God of the armies of Israel" (1 Sam 17:45).',
          },
          {
            id: 'q3',
            questionEnglish: 'What was David’s job before he became a hero of Israel?',
            questionTelugu: 'దావీదు ఇశ్రాయేలు వీరుడు కాకముందు ఏమి చేస్తుండెను?',
            options: ['Carpenter', 'Shepherd boy', 'Soldier in the army', 'Fisherman'],
            optionsTelugu: ['వడ్రంగి', 'గొర్రెల కాపరి', 'సైన్యంలో సైనికుడు', 'జాలరి'],
            correctIndex: 1,
            explanation: 'David faithfully looked after his father’s sheep in Bethlehem (1 Sam 17:15).',
          },
          {
            id: 'q4',
            questionEnglish: 'Which weapon did David use to defeat Goliath?',
            questionTelugu: 'గొల్యాతును ఓడించడానికి దావీదు ఏ ఆయుధమును ఉపయోగించెను?',
            options: ['A heavy sword', 'A long spear', 'A sling and a stone', 'A golden bow'],
            optionsTelugu: ['భారీ కత్తి', 'పొడవైన ఈటె', 'ఒడిసెల మరియు ఒక రాయి', 'బంగారు విల్లు'],
            correctIndex: 2,
            explanation: 'David reached into his bag, took out a stone, slung it, and struck the giant on the forehead (1 Sam 17:49).',
          },
        ],
        createdAt: now,
      },
      {
        quizId: 'QUIZ-002',
        churchId: cId,
        title: "Daniel's Faith Challenge",
        titleTelugu: 'దానియేలు విశ్వాస క్విజ్',
        scriptureRef: 'Daniel 6',
        pointsReward: 50,
        badgeReward: '🦁 Lion Tamer Badge',
        coverEmoji: '🦁',
        questions: [
          {
            id: 'q1',
            questionEnglish: 'How many times a day did Daniel kneel and pray to God?',
            questionTelugu: 'దానియేలు ప్రతిదినము ఎన్నిసార్లు మోకరించి ప్రార్థించెను?',
            options: ['1 time at night', '2 times', '3 times a day', 'Only on Sabbath'],
            optionsTelugu: ['రాత్రి 1 సారి', '2 సార్లు', 'దినమునకు 3 సార్లు', 'విశ్రాంతి దినమున మాత్రమే'],
            correctIndex: 2,
            explanation: 'Daniel knelt down on his knees three times a day, and prayed and gave thanks before his God (Dan 6:10).',
          },
          {
            id: 'q2',
            questionEnglish: 'What did God send to protect Daniel in the lions’ den?',
            questionTelugu: 'సింహాల గుహలో దానియేలును కాపాడటానికి దేవుడు ఎవరిని పంపెను?',
            options: ['A burning fire', 'His Holy Angel', 'A deep sleep potion', 'A shield of gold'],
            optionsTelugu: ['మండుచున్న అగ్ని', 'తన దేవదూతను', 'నిద్ర మత్తు', 'బంగారు డాలు'],
            correctIndex: 1,
            explanation: '"My God sent His angel, and shut the lions’ mouths, so that they have not hurt me" (Dan 6:22).',
          },
        ],
        createdAt: now,
      },
    ];

    const results: KidsQuiz[] = [];
    for (const item of defaults) {
      const docRef = await quizzesRef.add(sanitizeForFirestore(item));
      results.push({ id: docRef.id, ...item });
    }
    return results;
  }

  subscribeToQuizzes(
    churchId: string,
    callback: (quizzes: KidsQuiz[]) => void
  ): () => void {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getQuizzesCollection(cId).onSnapshot(
      async snap => {
        if (!snap || snap.empty) {
          const seeded = await this.getOrInitQuizzes(cId);
          callback(seeded);
          return;
        }
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        callback(list);
      },
      () => callback([])
    );
  }

  // ==========================================
  // PHASE 5: KIDS ACTION WORSHIP SONGS
  // ==========================================

  async getOrInitSongs(churchId?: string): Promise<KidsWorshipSong[]> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const songsRef = this.getSongsCollection(cId);
    const snap = await songsRef.get();

    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    }

    const now = firestore.FieldValue.serverTimestamp();
    const defaults: Omit<KidsWorshipSong, 'id'>[] = [
      {
        songId: 'SONG-001',
        churchId: cId,
        title: "I'm in the Lord's Army",
        titleTelugu: 'నేను ప్రభువు సైనికుడను (ఆక్షన్ సాంగ్)',
        category: 'action_song',
        youtubeVideoId: 'zeuoPQznpFo',
        coverEmoji: '🎖️',
        duration: '3:15',
        lyricsEnglish: `I may never march in the infantry,\nRide in the cavalry,\nShoot the artillery;\nI may never zoom o'er the enemy,\nBut I'm in the Lord's army! Yes, sir!`,
        lyricsTelugu: `నేను కాల్బలములో నడవకపోయినను,\nగుఱ్ఱపు రౌతుగా వెళ్ళకపోయినను,\nఫిరంగులను పేల్చకపోయినను,\nఆకాశంలో ఎగురకపోయినను,\nనేను ప్రభువు సైనికుడను! ఎస్, సర్!`,
        createdAt: now,
      },
      {
        songId: 'SONG-002',
        churchId: cId,
        title: 'Read Your Bible, Pray Every Day',
        titleTelugu: 'బైబిల్ చదువు ప్రార్థన చేయి',
        category: 'action_song',
        youtubeVideoId: 'AyKSwGvUbcY',
        coverEmoji: '📖',
        duration: '2:40',
        lyricsEnglish: `Read your Bible, pray every day, and you'll grow, grow, grow!\nForget your Bible, forget to pray, and you'll shrink, shrink, shrink!`,
        lyricsTelugu: `ప్రతిరోజు బైబిల్ చదువు ప్రార్థన చేయి - నీవు ఎదుగుతావు, ఎదుగుతావు!\nబైబిల్ మరచి ప్రార్థన మానితే - నీవు కృంగిపోతావు, క్షీణిస్తావు!`,
        createdAt: now,
      },
      {
        songId: 'SONG-003',
        churchId: cId,
        title: 'Jesus Loves Me, This I Know',
        titleTelugu: 'యేసయ్య నన్ను ప్రేమించును',
        category: 'hymn',
        youtubeVideoId: 'QSaWPYb6_6k',
        coverEmoji: '❤️',
        duration: '3:05',
        lyricsEnglish: `Jesus loves me! This I know,\nFor the Bible tells me so;\nLittle ones to Him belong;\nThey are weak, but He is strong.\nYes, Jesus loves me!`,
        lyricsTelugu: `యేసయ్య నన్ను ప్రేమించును,\nబైబిల్ వాక్యము చెప్పుచున్నది;\nచిన్నపిల్లలము ఆయనవారము,\nమనం బలహీనులము, ఆయన బలవంతుడు.\nఅవును, యేసయ్య నన్ను ప్రేమించును!`,
        createdAt: now,
      },
    ];

    const results: KidsWorshipSong[] = [];
    for (const item of defaults) {
      const docRef = await songsRef.add(sanitizeForFirestore(item));
      results.push({ id: docRef.id, ...item });
    }
    return results;
  }

  subscribeToSongs(
    churchId: string,
    callback: (songs: KidsWorshipSong[]) => void
  ): () => void {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getSongsCollection(cId).onSnapshot(
      async snap => {
        if (!snap || snap.empty) {
          const seeded = await this.getOrInitSongs(cId);
          callback(seeded);
          return;
        }
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        callback(list);
      },
      () => callback([])
    );
  }

  // ─── PHASE 6: 52-WEEK CURRICULUM MANAGEMENT ─────────────────

  async getOrInitCurriculum(churchId: string): Promise<KidsCurriculumLesson[]> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const curriculumRef = this.getCurriculumCollection(cId);
    const existingSnap = await curriculumRef.get();

    if (!existingSnap.empty) {
      const list = existingSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as KidsCurriculumLesson[];
      return list.sort((a, b) => a.weekNumber - b.weekNumber);
    }

    const defaultCurriculum = this.build52WeekCurriculumOutline();
    const results: KidsCurriculumLesson[] = [];

    // Batch insert default curriculum
    const batch = this.getDb().batch();
    for (const lesson of defaultCurriculum) {
      const docRef = curriculumRef.doc(`week_${lesson.weekNumber}`);
      batch.set(docRef, sanitizeForFirestore(lesson));
      results.push({ id: docRef.id, ...lesson });
    }
    await batch.commit();

    return results;
  }

  subscribeToCurriculum(
    churchId: string,
    callback: (lessons: KidsCurriculumLesson[]) => void
  ): () => void {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getCurriculumCollection(cId).onSnapshot(
      async snap => {
        if (!snap || snap.empty) {
          const seeded = await this.getOrInitCurriculum(cId);
          callback(seeded);
          return;
        }
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as KidsCurriculumLesson[];
        callback(list.sort((a, b) => a.weekNumber - b.weekNumber));
      },
      () => callback([])
    );
  }

  private getCurriculumConfigDoc(churchId?: string) {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getDb()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cId)
      .collection('kids_settings')
      .doc('curriculum_config');
  }

  subscribeToCurriculumConfig(
    churchId: string,
    callback: (config: KidsCurriculumConfig) => void
  ): () => void {
    const docRef = this.getCurriculumConfigDoc(churchId);
    return docRef.onSnapshot(snap => {
      if (snap && snap.exists) {
        callback(snap.data() as KidsCurriculumConfig);
      } else {
        callback({
          isLaunched: false,
          officialLaunchDate: null,
          manualOverrideWeek: null,
        });
      }
    }, () => {
      callback({
        isLaunched: false,
        officialLaunchDate: null,
        manualOverrideWeek: null,
      });
    });
  }

  async setCurriculumLaunchDate(churchId: string, launchDate: string): Promise<void> {
    const docRef = this.getCurriculumConfigDoc(churchId);
    await docRef.set(
      sanitizeForFirestore({
        officialLaunchDate: launchDate,
        isLaunched: true,
        manualOverrideWeek: null,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      }),
      { merge: true }
    );
  }

  async resetCurriculumLaunchDate(churchId: string): Promise<void> {
    const docRef = this.getCurriculumConfigDoc(churchId);
    await docRef.set(
      sanitizeForFirestore({
        officialLaunchDate: null,
        isLaunched: false,
        manualOverrideWeek: 1,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      }),
      { merge: true }
    );
  }

  async setCurrentActiveWeek(churchId: string, activeWeekNumber: number): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const curriculumRef = this.getCurriculumCollection(cId);
    const snap = await curriculumRef.get();

    const batch = this.getDb().batch();
    for (const doc of snap.docs) {
      const data = doc.data();
      const isCurrent = data.weekNumber === activeWeekNumber;
      if (data.isCurrentWeek !== isCurrent) {
        batch.update(doc.ref, { isCurrentWeek: isCurrent, updatedAt: firestore.FieldValue.serverTimestamp() });
      }
    }
    await batch.commit();
  }

  async updateCurriculumLesson(
    churchId: string,
    lessonDocId: string,
    updates: Partial<KidsCurriculumLesson>
  ): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    await this.getCurriculumCollection(cId).doc(lessonDocId).update(
      sanitizeForFirestore({
        ...updates,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      })
    );
  }

  async createCurriculumLesson(
    churchId: string,
    lesson: Omit<KidsCurriculumLesson, 'id'>
  ): Promise<string> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();
    const docRef = this.getCurriculumCollection(cId).doc(`week_${lesson.weekNumber}`);
    await docRef.set(
      sanitizeForFirestore({
        ...lesson,
        createdAt: now,
        updatedAt: now,
      }),
      { merge: true }
    );
    return docRef.id;
  }

  async deleteCurriculumLesson(
    churchId: string,
    lessonDocId: string
  ): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    await this.getCurriculumCollection(cId).doc(lessonDocId).delete();
  }

  private build52WeekCurriculumOutline(): KidsCurriculumLesson[] {
    const now = new Date().toISOString();

    const themes: Array<{
      week: number;
      quarter: CurriculumQuarter;
      qTheme: string;
      title: string;
      titleTe: string;
      ref: string;
      refTe: string;
      bigIdea: string;
      bigIdeaTe: string;
      verseEn: string;
      verseTe: string;
      verseRef: string;
      verseRefTe: string;
      supplies: string[];
    }> = [
      // Q1: Foundations of Faith & Creation (Weeks 1-13)
      {
        week: 1,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'God Creates the Heavens and the Earth',
        titleTe: 'దేవుడు ఆకాశమును భూమిని సృష్టించెను',
        ref: 'Genesis 1:1-31',
        refTe: 'ఆదికాండము 1:1-31',
        bigIdea: 'God is Almighty and created everything good.',
        bigIdeaTe: 'దేవుడు సర్వశక్తిమంతుడు, ప్రతిదానిని మంచిగా సృష్టించెను.',
        verseEn: 'In the beginning God created the heavens and the earth.',
        verseTe: 'ఆదియందు దేవుడు భూమ్యాకాశములను సృజించెను.',
        verseRef: 'Genesis 1:1',
        verseRefTe: 'ఆదికాండము 1:1',
        supplies: ['Playdough', 'Globe/Map', 'Color crayons', 'Creation sticker sheets'],
      },
      {
        week: 2,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'Noah and the Ark of Safety',
        titleTe: 'నోవహు మరియు రక్షణ ఓడ',
        ref: 'Genesis 6-9',
        refTe: 'ఆదికాండము 6-9',
        bigIdea: 'God protects and rewards those who walk obediently with Him.',
        bigIdeaTe: 'దేవునికి విధేయత చూపేవారిని ఆయన రక్షించి దీవిస్తాడు.',
        verseEn: 'Noah walked with God.',
        verseTe: 'నోవహు దేవునితో నడచినవాడు.',
        verseRef: 'Genesis 6:9',
        verseRefTe: 'ఆదికాండము 6:9',
        supplies: ['Paper boats', 'Rainbow markers', 'Animal cutouts'],
      },
      {
        week: 3,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'The Call of Abraham: Stepping Out in Faith',
        titleTe: 'అబ్రాహాము పిలుపు: విశ్వాస యాత్ర',
        ref: 'Genesis 12:1-9',
        refTe: 'ఆదికాండము 12:1-9',
        bigIdea: 'God leads our steps when we trust His voice.',
        bigIdeaTe: 'మనం దేవుని స్వరాన్ని నమ్మినప్పుడు ఆయన మన మార్గాన్ని నడిపిస్తాడు.',
        verseEn: 'I will bless you and make your name great.',
        verseTe: 'నేను నిన్ను ఆశీర్వదించి నీ నామమును గొప్ప చేయుదును.',
        verseRef: 'Genesis 12:2',
        verseRefTe: 'ఆదికాండము 12:2',
        supplies: ['Tent craft sheets', 'Star stickers', 'Compass'],
      },
      {
        week: 4,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'Joseph’s Colorful Coat and Big Dreams',
        titleTe: 'యోసేపు రంగుల అంగీ మరియు దైవిక కలలు',
        ref: 'Genesis 37:1-36',
        refTe: 'ఆదికాండము 37:1-36',
        bigIdea: 'God has a wonderful plan for our future.',
        bigIdeaTe: 'మన భవిష్యత్తు కోసం దేవునికి అద్భుతమైన సంకల్పం ఉన్నది.',
        verseEn: 'For I know the plans I have for you, declares the Lord.',
        verseTe: 'నేను మిమ్మునుగూర్చి తలంచుచున్న తలంపులను నేనెరుగుదును.',
        verseRef: 'Jeremiah 29:11',
        verseRefTe: 'యిర్మీయా 29:11',
        supplies: ['Fabric scraps', 'Coat coloring outline', 'Ribbons'],
      },
      {
        week: 5,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'Baby Moses in the River Basket',
        titleTe: 'నీటి బుట్టలో మోషే బాలుడు',
        ref: 'Exodus 2:1-10',
        refTe: 'నిర్గమకాండము 2:1-10',
        bigIdea: 'God watches over us and keeps us safe anywhere.',
        bigIdeaTe: 'దేవుడు ఎల్లప్పుడూ మనలను కాపాడి భద్రపరుస్తాడు.',
        verseEn: 'The Lord will watch over your coming and going.',
        verseTe: 'యెహోవా నీ రాకపోకలయందు నిన్ను కాపాడును.',
        verseRef: 'Psalm 121:8',
        verseRefTe: 'కీర్తనలు 121:8',
        supplies: ['Woven basket craft', 'Blue water tissue', 'Paper baby cutout'],
      },
      {
        week: 6,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'Crossing the Red Sea on Dry Ground',
        titleTe: 'ఎర్రసముద్రము పాయలవుట',
        ref: 'Exodus 14:1-31',
        refTe: 'నిర్గమకాండము 14:1-31',
        bigIdea: 'When there seems no way, God makes a way!',
        bigIdeaTe: 'దారి లేని చోట దేవుడు మన కొరకు మార్గమును సృష్టిస్తాడు!',
        verseEn: 'The Lord will fight for you; you need only to be still.',
        verseTe: 'యెహోవా మీ పక్షమున యుద్ధము చేయును; మీరు ఊరకుండవలెను.',
        verseRef: 'Exodus 14:14',
        verseRefTe: 'నిర్గమకాండము 14:14',
        supplies: ['Blue paper plates', 'Sand glue', 'Staff prop'],
      },
      {
        week: 7,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'The Ten Commandments: Loving God and Others',
        titleTe: 'పది ఆజ్ఞలు: దేవుని ప్రేమించుట మరియు ఇతరులను ప్రేమించుట',
        ref: 'Exodus 20:1-17',
        refTe: 'నిర్గమకాండము 20:1-17',
        bigIdea: 'God gives us commandments to protect our joy and peace.',
        bigIdeaTe: 'దేవుని ఆజ్ఞలు మనకు సమాధానమును దీవెనను ఇస్తాయి.',
        verseEn: 'Your word is a lamp for my feet, a light on my path.',
        verseTe: 'నీ వాక్యము నా పాదములకు దీపమును నా త్రోవకు వెలుగునై యున్నది.',
        verseRef: 'Psalm 119:105',
        verseRefTe: 'కీర్తనలు 119:105',
        supplies: ['Stone tablet cutouts', 'Golden gel pens', 'Rule cards'],
      },
      {
        week: 8,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'Joshua and the Walls of Jericho',
        titleTe: 'యెహోషువ మరియు యెరికో గోడలు కూలుట',
        ref: 'Joshua 6:1-20',
        refTe: 'యెహోషువ 6:1-20',
        bigIdea: 'Praise and obedience bring down every wall of obstacle.',
        bigIdeaTe: 'స్తోత్రము మరియు విధేయత ద్వారా అడ్డంకులన్నియూ కూలిపోవును.',
        verseEn: 'Be strong and courageous! Do not be afraid.',
        verseTe: 'నిబ్బరము కలిగి ధైర్యముగా ఉండుము, భయపడకుము.',
        verseRef: 'Joshua 1:9',
        verseRefTe: 'యెహోషువ 1:9',
        supplies: ['Foam blocks', 'Toy trumpets', 'Cardboard boxes'],
      },
      {
        week: 9,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'Gideon’s 300 Brave Warriors',
        titleTe: 'గిద్యోను మూడువందల మంది ధైర్యవంతులు',
        ref: 'Judges 7:1-25',
        refTe: 'న్యాయాధిపతులు 7:1-25',
        bigIdea: 'Victory comes not by numbers, but by the power of the Spirit.',
        bigIdeaTe: 'విజయము సంఖ్యల వల్ల కాదు, దేవుని ఆత్మ శక్తి వల్ల కలుగుతుంది.',
        verseEn: 'Not by might nor by power, but by my Spirit, says the Lord.',
        verseTe: 'శక్తిచేతనైనను బలముచేతనైనను కాదు, నా ఆత్మచేతనే జరుగును.',
        verseRef: 'Zechariah 4:6',
        verseRefTe: 'జెకర్యా 4:6',
        supplies: ['Clay jar craft', 'Battery mini tea-lights', 'Paper horns'],
      },
      {
        week: 10,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'Ruth and Naomi: Loving Family Faithfully',
        titleTe: 'రూతు మరియు నయోమి: నమ్మకమైన ప్రేమ',
        ref: 'Ruth 1:1-22',
        refTe: 'రూతు 1:1-22',
        bigIdea: 'Kindness and loyalty in family are blessed by God.',
        bigIdeaTe: 'కుటుంబములో నమ్మకత్వము మరియు ప్రేమను దేవుడు ఆశీర్వదిస్తాడు.',
        verseEn: 'Where you go I will go, and where you stay I will stay.',
        verseTe: 'నీవు వెళ్లు చోటికే నేను వెళ్లెదను, నీవు నివసించు చోటనే నేను నివసించెదను.',
        verseRef: 'Ruth 1:16',
        verseRefTe: 'రూతు 1:16',
        supplies: ['Grain stalks', 'Heart stickers', 'Cardboard baskets'],
      },
      {
        week: 11,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'God Speaks to Boy Samuel in the Night',
        titleTe: 'రాత్రి సమయాన చిన్న సమూయేలుతో దేవుని స్వరం',
        ref: '1 Samuel 3:1-19',
        refTe: '1 సమూయేలు 3:1-19',
        bigIdea: 'Even the youngest child can listen and respond to God.',
        bigIdeaTe: 'చిన్నపిల్లలైనను దేవుని స్వరాన్ని విని లోబడవచ్చు.',
        verseEn: 'Speak, Lord, for your servant is listening.',
        verseTe: 'యెహోవా, సెలవిమ్ము నీ దాసుడు ఆలకించుచున్నాడు.',
        verseRef: '1 Samuel 3:9',
        verseRefTe: '1 సమూయేలు 3:9',
        supplies: ['Listening ear headbands', 'Bedtime story scrolls'],
      },
      {
        week: 12,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'David Chosen: God Looks at the Heart',
        titleTe: 'దావీదు ఎంపిక: దేవుడు హృదయమును చూచును',
        ref: '1 Samuel 16:1-13',
        refTe: '1 సమూయేలు 16:1-13',
        bigIdea: 'People look at outward appearance, but God looks at our heart.',
        bigIdeaTe: 'మనుష్యులు పైరూపమును లక్ష్యపెట్టుదురు, దేవుడు హృదయమును లక్ష్యపెట్టును.',
        verseEn: 'The Lord looks at the heart.',
        verseTe: 'యెహోవా హృదయమును లక్ష్యపెట్టును.',
        verseRef: '1 Samuel 16:7',
        verseRefTe: '1 సమూయేలు 16:7',
        supplies: ['Mirror cards', 'Heart stickers', 'Shepherd crook cutout'],
      },
      {
        week: 13,
        quarter: 'Q1',
        qTheme: 'Q1: Foundations of Faith & Creation',
        title: 'David and Goliath: Giant-Slaying Courage',
        titleTe: 'దావీదు మరియు గొల్యాతు: విశ్వాసంతో జయించుట',
        ref: '1 Samuel 17:1-50',
        refTe: '1 సమూయేలు 17:1-50',
        bigIdea: 'The battle belongs to the Lord! Trust Him over any fear.',
        bigIdeaTe: 'యుద్ధము యెహోవాదే! భయమును జయించుటకు దేవుడిని నమ్ముము.',
        verseEn: 'The battle is the Lord’s, and he will give all of you into our hands.',
        verseTe: 'యుద్ధము యెహోవాదే; ఆయన మిమ్మును మా చేతికి అప్పగించును.',
        verseRef: '1 Samuel 17:47',
        verseRefTe: '1 సమూయేలు 17:47',
        supplies: ['5 smooth stones in pouch', 'Sling craft string', 'Giant silhouette'],
      },

      // Q2: Miracles, Wisdom & Prophets (Weeks 14-26)
      {
        week: 14,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Solomon Prays for a Wise Heart',
        titleTe: 'సొలొమోను జ్ఞానము కొరకు ప్రార్థన',
        ref: '1 Kings 3:5-15',
        refTe: '1 రాజులు 3:5-15',
        bigIdea: 'Wisdom from God is better than all riches and gold.',
        bigIdeaTe: 'దేవుని ఇచ్చే జ్ఞానము సమస్త బంగారము కంటే శ్రేష్ఠమైనది.',
        verseEn: 'The fear of the Lord is the beginning of wisdom.',
        verseTe: 'యెహోవాయందు భయభక్తులు కలిగియుండుట జ్ఞానమునకు మూలము.',
        verseRef: 'Proverbs 9:10',
        verseRefTe: 'సామెతలు 9:10',
        supplies: ['Golden crown craft', 'Wisdom owl stickers', 'Scroll bookmarks'],
      },
      {
        week: 15,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Elijah and Fire from Heaven on Mount Carmel',
        titleTe: 'ఏలీయా మరియు కర్మెలు పర్వతముపై ఆకాశమునుండి అగ్ని',
        ref: '1 Kings 18:16-39',
        refTe: '1 రాజులు 18:16-39',
        bigIdea: 'The Lord, He is God alone! Never worship idols.',
        bigIdeaTe: 'యెహోవాయే నిజమైన దేవుడు! విగ్రహములను ఆరాధించవద్దు.',
        verseEn: 'The Lord—he is God! The Lord—he is God!',
        verseTe: 'యెహోవాయే దేవుడు, యెహోవాయే దేవుడు!',
        verseRef: '1 Kings 18:39',
        verseRefTe: '1 రాజులు 18:39',
        supplies: ['Stone altar cardboard', 'Tissue fire flames', 'Water drops craft'],
      },
      {
        week: 16,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Elisha and the Chariots of Angel Fire',
        titleTe: 'ఎలీషా మరియు అగ్ని రథముల రక్షణ',
        ref: '2 Kings 6:8-23',
        refTe: '2 రాజులు 6:8-23',
        bigIdea: 'Those who are with us are more than those who are with them.',
        bigIdeaTe: 'మన పక్షమున ఉన్నవారు వారి పక్షమున ఉన్నవారికంటే అధికులు.',
        verseEn: 'Don’t be afraid. Those who are with us are more than those who are with them.',
        verseTe: 'భయపడకుము, మన పక్షమున ఉన్నవారు వారికంటె ఎక్కువ మంది.',
        verseRef: '2 Kings 6:16',
        verseRefTe: '2 రాజులు 6:16',
        supplies: ['Chariot stencils', 'Glitter pens', 'Shield paper craft'],
      },
      {
        week: 17,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Boy King Josiah and the Rediscovered Word',
        titleTe: 'బాలుడైన యోషీయా రాజు మరియు పరిశుద్ధ గ్రంథము',
        ref: '2 Kings 22:1-20',
        refTe: '2 రాజులు 22:1-20',
        bigIdea: 'Young leaders who obey God’s Word bring revival to nations.',
        bigIdeaTe: 'దేవుని వాక్యమునకు లోబడే చిన్నపిల్లలు సమాజములో మార్పు తెస్తారు.',
        verseEn: 'I have hidden your word in my heart that I might not sin against you.',
        verseTe: 'నీయెదుట నేను పాపము చేయకుండునట్లు నా హృదయములో నీ వాక్యము ఉంచుకొనియున్నాను.',
        verseRef: 'Psalm 119:11',
        verseRefTe: 'కీర్తనలు 119:11',
        supplies: ['Ancient scroll craft', 'Royal seal stamps', 'Gold cord'],
      },
      {
        week: 18,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Queen Esther: For Such a Time as This',
        titleTe: 'ఎస్తేరు రాణి: ఈ సమయము కొరకే నీవు పిలువబడితివి',
        ref: 'Esther 4:1-17',
        refTe: 'ఎస్తేరు 4:1-17',
        bigIdea: 'God places us in our schools and families for a divine purpose.',
        bigIdeaTe: 'దేవుడు మనలను ఒక ప్రత్యేకమైన ఉద్దేశముతో ఉంచాడు.',
        verseEn: 'And who knows but that you have come to your royal position for such a time as this?',
        verseTe: 'నీవు ఈ సమయము కొరకే రాణి పదవి పొందితివేమో ఎవరికి తెలియును?',
        verseRef: 'Esther 4:14',
        verseRefTe: 'ఎస్తేరు 4:14',
        supplies: ['Tiara cutouts', 'Jewel stickers', 'Prayer request cards'],
      },
      {
        week: 19,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Three Hebrew Youths in the Blazing Furnace',
        titleTe: 'అగ్ని గుండములో ముగ్గురు స్నేహితులు',
        ref: 'Daniel 3:1-30',
        refTe: 'దానియేలు 3:1-30',
        bigIdea: 'Jesus walks with us right in the middle of every trial.',
        bigIdeaTe: 'శ్రమల మధ్యలో కూడా యేసయ్య మనతోనే నడుస్తాడు.',
        verseEn: 'When you walk through the fire, you will not be burned.',
        verseTe: 'నీవు అగ్ని మధ్యను నడచునప్పుడు కాలిపోవు.',
        verseRef: 'Isaiah 43:2',
        verseRefTe: 'యెషయా 43:2',
        supplies: ['Red/Orange crepe paper', '4th man figure cutout', 'Gold statue prop'],
      },
      {
        week: 20,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Daniel in the Lions’ Den: Angels Shutting Mouths',
        titleTe: 'దానియేలు సింహాల గుహ: నోళ్లు మూయించిన దేవదూత',
        ref: 'Daniel 6:1-24',
        refTe: 'దానియేలు 6:1-24',
        bigIdea: 'Consistent daily prayer gives unwavering courage.',
        bigIdeaTe: 'ప్రతిదిన ప్రార్థన మనకు ఎటువంటి పరిస్థితినైనా ఎదుర్కొనే ధైర్యం ఇస్తుంది.',
        verseEn: 'My God sent his angel, and he shut the mouths of the lions.',
        verseTe: 'నా దేవుడు తన దూతను పంపి సింహముల నోళ్లు మూయించెను.',
        verseRef: 'Daniel 6:22',
        verseRefTe: 'దానియేలు 6:22',
        supplies: ['Lion mask craft', 'Prayer clock sheet', 'Cave entrance model'],
      },
      {
        week: 21,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Jonah and the Big Fish: Running Back to God',
        titleTe: 'యోనా మరియు తిమింగలము: దేవుని కనికరము',
        ref: 'Jonah 1-3',
        refTe: 'యోనా 1-3',
        bigIdea: 'God gives second chances to all who repent.',
        bigIdeaTe: 'మారుమనస్సు పొందే ప్రతి ఒక్కరికి దేవుడు రెండవ అవకాశం ఇస్తాడు.',
        verseEn: 'Salvation comes from the Lord.',
        verseTe: 'రక్షణ యెహోవాదే.',
        verseRef: 'Jonah 2:9',
        verseRefTe: 'యోనా 2:9',
        supplies: ['Pop-up whale card', 'Blue waves paper', 'Repentance prayer sheets'],
      },
      {
        week: 22,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Nehemiah: Building the Walls in Unity and Prayer',
        titleTe: 'నెహెమ్యా: ప్రార్థనతో ప్రాకారములు కట్టుట',
        ref: 'Nehemiah 2-6',
        refTe: 'నెహెమ్యా 2-6',
        bigIdea: 'The joy of the Lord is our strength as we work together.',
        bigIdeaTe: 'యెహోవాయందు ఆనందించుట మనకు బలము.',
        verseEn: 'The joy of the Lord is your strength.',
        verseTe: 'యెహోవాయందు ఆనందించుటవలన మీరు బలమొందుదురు.',
        verseRef: 'Nehemiah 8:10',
        verseRefTe: 'నెహెమ్యా 8:10',
        supplies: ['Cardboard bricks', 'Tool cutouts', 'Teamwork building blocks'],
      },
      {
        week: 23,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'The Angel Gabriel Visits Mary with Good News',
        titleTe: 'మరియకు దేవదూత సందేశం: సువార్త ఆరంభం',
        ref: 'Luke 1:26-38',
        refTe: 'లూకా 1:26-38',
        bigIdea: 'Nothing is impossible with God!',
        bigIdeaTe: 'దేవునికి అసాధ్యమైనదేదియు లేదు!',
        verseEn: 'For no word from God will ever fail.',
        verseTe: 'దేవుడు చెప్పిన ఏ మాటయు నిరర్థకము కానేరదు.',
        verseRef: 'Luke 1:37',
        verseRefTe: 'లూకా 1:37',
        supplies: ['Angel wings craft', 'White feathers', 'Lily flower stencils'],
      },
      {
        week: 24,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'The Birth of Jesus in the Bethlehem Manger',
        titleTe: 'బేత్లెహేములో యేసు క్రీస్తు జననము',
        ref: 'Luke 2:1-20',
        refTe: 'లూకా 2:1-20',
        bigIdea: 'Jesus is God’s greatest gift of love to the world.',
        bigIdeaTe: 'యేసయ్య లోకానికి దేవుడు ఇచ్చిన అత్యంత శ్రేష్ఠమైన ప్రేమ కానుక.',
        verseEn: 'Today in the town of David a Savior has been born to you; he is the Messiah, the Lord.',
        verseTe: 'దావీదు పట్టణమందు నేడు రక్షకుడు మీ కొరకు పుట్టియున్నాడు, ఈయన ప్రభువైన క్రీస్తు.',
        verseRef: 'Luke 2:11',
        verseRefTe: 'లూకా 2:11',
        supplies: ['Straw manger craft', 'Star topper', 'Baby Jesus cutout'],
      },
      {
        week: 25,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'The Wise Men Follow the Guiding Star',
        titleTe: 'తూర్పు దేశపు జ్ఞానులు మరియు మార్గదర్శక నక్షత్రము',
        ref: 'Matthew 2:1-12',
        refTe: 'మత్తయి 2:1-12',
        bigIdea: 'Wise children seek Jesus and bring Him the treasure of their heart.',
        bigIdeaTe: 'జ్ఞానముగల పిల్లలు యేసయ్యను వెదకి తమ హృదయ కానుకలను సమర్పిస్తారు.',
        verseEn: 'They bowed down and worshiped him.',
        verseTe: 'వారు సాష్టాంగపడి ఆయనను పూజించిరి.',
        verseRef: 'Matthew 2:11',
        verseRefTe: 'మత్తయి 2:11',
        supplies: ['Gold gift box', 'Glitter stars', 'Camel cutouts'],
      },
      {
        week: 26,
        quarter: 'Q2',
        qTheme: 'Q2: Miracles, Wisdom & Prophets',
        title: 'Boy Jesus in the Temple: Growing in Wisdom and Favor',
        titleTe: 'దేవాలయములో బాలుడైన యేసు',
        ref: 'Luke 2:41-52',
        refTe: 'లూకా 2:41-52',
        bigIdea: 'Children can grow in wisdom, stature, and favor with God and people.',
        bigIdeaTe: 'పిల్లలు జ్ఞానమందును, వయస్సునందును, దేవుని దయయందును ఎదగవచ్చును.',
        verseEn: 'And Jesus grew in wisdom and stature, and in favor with God and man.',
        verseTe: 'యేసు జ్ఞానమందును, వయస్సునందును, దేవుని దయయందును, మనుష్యుల దయయందును వృద్ధిపొందుచుండెను.',
        verseRef: 'Luke 2:52',
        verseRefTe: 'లూకా 2:52',
        supplies: ['Growth chart bookmark', 'Temple pillar craft'],
      },

      // Q3: Life, Ministry & Teachings of Jesus (Weeks 27-39)
      {
        week: 27,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'Baptism of Jesus: The Holy Spirit Descends',
        titleTe: 'యేసు బాప్తిస్మము: పావురమువలె దిగివచ్చిన పరిశుద్ధాత్మ',
        ref: 'Matthew 3:13-17',
        refTe: 'మత్తయి 3:13-17',
        bigIdea: 'We are beloved children in whom God is well pleased.',
        bigIdeaTe: 'మనం దేవునికి ప్రియమైన పిల్లలము, ఆయన మనయందు ఆనందిస్తున్నాడు.',
        verseEn: 'This is my Son, whom I love; with him I am well pleased.',
        verseTe: 'ఈయనే నా ప్రియకుమారుడు, ఈయనయందు నేను ఆనందించుచున్నాను.',
        verseRef: 'Matthew 3:17',
        verseRefTe: 'మత్తయి 3:17',
        supplies: ['Dove craft cutouts', 'Water droplets stickers'],
      },
      {
        week: 28,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'Jesus Calms the Wild Wind and Waves',
        titleTe: 'తుఫానును గద్దించి నిమ్మళపరచిన యేసు',
        ref: 'Mark 4:35-41',
        refTe: 'మార్కు 4:35-41',
        bigIdea: 'Even the winds and the waves obey Jesus!',
        bigIdeaTe: 'గాలియు సముద్రమును కూడా యేసయ్య మాటకు లోబడును!',
        verseEn: 'Quiet! Be still! Then the wind died down and it was completely calm.',
        verseTe: 'నిశ్శబ్దమై ఊరకుండుము అని గాలితో చెప్పెను; అప్పుడు గాలి అణగి మిక్కిలి నిమ్మళమాయెను.',
        verseRef: 'Mark 4:39',
        verseRefTe: 'మార్కు 4:39',
        supplies: ['Paper boats', 'Blue ribbon storm streamers'],
      },
      {
        week: 29,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'Feeding 5,000 with a Boy’s Little Lunch',
        titleTe: 'ఐదు రొట్టెలు రెండు చేపలతో ఐదువేల మందికి భోజనం',
        ref: 'John 6:1-14',
        refTe: 'యోహాను 6:1-14',
        bigIdea: 'When we give our small lunch to Jesus, He multiplies it for thousands.',
        bigIdeaTe: 'మనకున్న చిన్న కానుకను యేసయ్యకు ఇచ్చినప్పుడు ఆయన దానిని సమృద్ధిగా దీవిస్తాడు.',
        verseEn: 'I am the bread of life. Whoever comes to me will never go hungry.',
        verseTe: 'నేనే జీవపు రొట్టెను; నాయొద్దకు వచ్చువాడు ఏమాత్రమును ఆకలిగొనడు.',
        verseRef: 'John 6:35',
        verseRefTe: 'యోహాను 6:35',
        supplies: ['Basket craft', 'Felt fish cutouts', 'Clay mini loaves'],
      },
      {
        week: 30,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'Jesus Walks on the Stormy Water',
        titleTe: 'నీళ్లపై నడచిన యేసయ్య: కన్నులు ఆయనపైనే ఉంచుము',
        ref: 'Matthew 14:22-33',
        refTe: 'మత్తయి 14:22-33',
        bigIdea: 'Keep your eyes on Jesus and you will not sink.',
        bigIdeaTe: 'మీ దృష్టి యేసయ్యపై ఉంచినప్పుడు మీరు మునిగిపోరు.',
        verseEn: 'Take courage! It is I. Don’t be afraid.',
        verseTe: 'ధైర్యము తెచ్చుకొనుడి, నేనే, భయపడకుడి.',
        verseRef: 'Matthew 14:27',
        verseRefTe: 'మత్తయి 14:27',
        supplies: ['Water ripple card', 'Footprint stamps'],
      },
      {
        week: 31,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'The Good Samaritan: Loving Our Neighbor',
        titleTe: 'మంచి సమరయుడు: పొరుగువారిని ప్రేమించుట',
        ref: 'Luke 10:25-37',
        refTe: 'లూకా 10:25-37',
        bigIdea: 'Love your neighbor as yourself through real helping actions.',
        bigIdeaTe: 'నిన్నువలె నీ పొరుగువానిని ప్రేమించి సహాయము చేయుము.',
        verseEn: 'Love your neighbor as yourself.',
        verseTe: 'నిన్నువలె నీ పొరుగువానిని ప్రేమింపవలెను.',
        verseRef: 'Luke 10:27',
        verseRefTe: 'లూకా 10:27',
        supplies: ['First-aid bandages', 'Helping hand craft', 'Oil bottle prop'],
      },
      {
        week: 32,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'The Parable of the Lost Sheep',
        titleTe: 'తప్పిపోయిన గొర్రెపిల్ల ఉపమానము',
        ref: 'Luke 15:1-7',
        refTe: 'లూకా 15:1-7',
        bigIdea: 'The Good Shepherd seeks and rescues every single child.',
        bigIdeaTe: 'మంచి కాపరి తప్పిపోయిన ప్రతి ఒక్కరినీ వెదకి రక్షిస్తాడు.',
        verseEn: 'I am the good shepherd. The good shepherd lays down his life for the sheep.',
        verseTe: 'నేను గొఱ్ఱెల మంచి కాపరిని; మంచి కాపరి గొఱ్ఱెల కొరకు తన ప్రాణము పెట్టును.',
        verseRef: 'John 10:11',
        verseRefTe: 'యోహాను 10:11',
        supplies: ['Cotton balls', 'Sheep ear headbands', 'Shepherd crook'],
      },
      {
        week: 33,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'Zacchaeus in the Sycamore Tree: A Changed Heart',
        titleTe: 'మేడి చెట్టుపై జక్కయ్య: మార్పునొందిన హృదయము',
        ref: 'Luke 19:1-10',
        refTe: 'లూకా 19:1-10',
        bigIdea: 'Jesus comes to seek and save what was lost.',
        bigIdeaTe: 'నశించినదానిని వెదకి రక్షించుటకు మనుష్యకుమారుడు వచ్చెను.',
        verseEn: 'For the Son of Man came to seek and to save the lost.',
        verseTe: 'నశించినదానిని వెదకి రక్షించుటకు మనుష్యకుమారుడు వచ్చెను.',
        verseRef: 'Luke 19:10',
        verseRefTe: 'లూకా 19:10',
        supplies: ['Sycamore tree craft', 'Coin counters', 'Heart stickers'],
      },
      {
        week: 34,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'Jesus Welcomes and Blesses the Little Children',
        titleTe: 'చిన్న బిడ్డలను ఆహ్వానించి దీవించిన యేసయ్య',
        ref: 'Mark 10:13-16',
        refTe: 'మార్కు 10:13-16',
        bigIdea: 'To children belongs the Kingdom of God; we are deeply valued!',
        bigIdeaTe: 'పరలోకరాజ్యము చిన్నపిల్లలవంటి వారిదే; దేవుని దృష్టిలో మనం విలువైనవారము!',
        verseEn: 'Let the little children come to me, and do not hinder them.',
        verseTe: 'చిన్నబిడ్డలను నా యొద్దకు రానియ్యుడి, వారిని ఆటంకపరచకుడి.',
        verseRef: 'Mark 10:14',
        verseRefTe: 'మార్కు 10:14',
        supplies: ['Crown stickers', 'Rhema blessing ribbon', 'Smiley badges'],
      },
      {
        week: 35,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'Jesus Heals Blind Bartimaeus with Compassion',
        titleTe: 'గుడ్డి భర్తిమయికి చూపునిచ్చిన యేసు',
        ref: 'Mark 10:46-52',
        refTe: 'మార్కు 10:46-52',
        bigIdea: 'Cry out to Jesus in faith; He hears and opens our eyes.',
        bigIdeaTe: 'విశ్వాసంతో యేసయ్యను వేడుకొనుడి; ఆయన మన ప్రార్థన వినును.',
        verseEn: 'Go, your faith has healed you.',
        verseTe: 'వెళ్లుము; నీ విశ్వాసము నిన్ను స్వస్థపరచెను.',
        verseRef: 'Mark 10:52',
        verseRefTe: 'మార్కు 10:52',
        supplies: ['Glasses craft', 'Sight test chart', 'Yellow sunshine stickers'],
      },
      {
        week: 36,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'Lazarus Come Forth: The Resurrection and the Life',
        titleTe: 'లాజరును బ్రతికించిన యేసు: పునరుత్థానము మరియు జీవము',
        ref: 'John 11:1-44',
        refTe: 'యోహాను 11:1-44',
        bigIdea: 'Jesus has power over death itself; He gives eternal life.',
        bigIdeaTe: 'యేసయ్య మరణముపై జయము పొందినవాడు; ఆయన నిత్యజీవమును ఇచ్చును.',
        verseEn: 'I am the resurrection and the life.',
        verseTe: 'పునరుత్థానమును జీవమును నేనే.',
        verseRef: 'John 11:25',
        verseRefTe: 'యోహాను 11:25',
        supplies: ['Bandage wrap craft', 'Cave stone door model'],
      },
      {
        week: 37,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'Palm Sunday: Praising the King of Kings',
        titleTe: 'హోసన్నా రాజు: పరిశుద్ధ ప్రవేశము',
        ref: 'Matthew 21:1-11',
        refTe: 'మత్తయి 21:1-11',
        bigIdea: 'Hosanna! Blessed is He who comes in the name of the Lord!',
        bigIdeaTe: 'హోసన్నా! ప్రభువు పేరిట వచ్చువాడు స్తుతింపబడును గాక!',
        verseEn: 'Blessed is he who comes in the name of the Lord! Hosanna in the highest heaven!',
        verseTe: 'ప్రభువు పేరట వచ్చువాడు స్తుతింపబడును గాక; సర్వోన్నతమైన స్థలములలో హోసన్నా!',
        verseRef: 'Matthew 21:9',
        verseRefTe: 'మత్తయి 21:9',
        supplies: ['Green palm branch leaves', 'Cloak cloth strips', 'Donkey cutout'],
      },
      {
        week: 38,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'The Last Supper: A Servant’s Humility',
        titleTe: 'చివరి రాత్రి భోజనం: శిష్యుల పాదములు కడిగిన యేసు',
        ref: 'John 13:1-17',
        refTe: 'యోహాను 13:1-17',
        bigIdea: 'The greatest in God’s kingdom is the one who serves others.',
        bigIdeaTe: 'దేవుని రాజ్యములో గొప్పవాడు ఇతరులకు సేవచేయువాడే.',
        verseEn: 'Love one another. As I have loved you, so you must love one another.',
        verseTe: 'మీరు ఒకరినొకరు ప్రేమింపవలెను; నేను మిమ్మును ప్రేమించినట్టే మీరును ఒకరినొకరు ప్రేమింపవలెను.',
        verseRef: 'John 13:34',
        verseRefTe: 'యోహాను 13:34',
        supplies: ['Washbasin prop', 'Towel ribbon', 'Communion bread craft'],
      },
      {
        week: 39,
        quarter: 'Q3',
        qTheme: 'Q3: Life, Ministry & Teachings of Jesus',
        title: 'The Garden of Gethsemane: Not My Will, but Yours',
        titleTe: 'గెత్సేమనే తోటలో ప్రార్థన: నీ చిత్తమే సిద్ధించును గాక',
        ref: 'Luke 22:39-46',
        refTe: 'లూకా 22:39-46',
        bigIdea: 'We pray for God’s perfect will in all things.',
        bigIdeaTe: 'సమస్త విషయములలో దేవుని చిత్తము కొరకు ప్రార్థించవలెను.',
        verseEn: 'Not my will, but yours be done.',
        verseTe: 'నా యిష్టము కాదు, నీ చిత్తమే సిద్ధించును గాక.',
        verseRef: 'Luke 22:42',
        verseRefTe: 'లూకా 22:42',
        supplies: ['Olive branch stickers', 'Kneeling prayer silhouettes'],
      },

      // Q4: Resurrection, Church & The Armor of God (Weeks 40-52)
      {
        week: 40,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'The Cross of Calvary: Love Paid in Full',
        titleTe: 'కల్వరి సిలువ: మన కొరకు ప్రాణమిచ్చిన యేసయ్య',
        ref: 'John 19:16-30',
        refTe: 'యోహాను 19:16-30',
        bigIdea: 'Jesus gave His life on the cross so our sins are forgiven.',
        bigIdeaTe: 'మన పాపముల క్షమాపణ కొరకు యేసయ్య సిలువపై ప్రాణమిచ్చెను.',
        verseEn: 'For God so loved the world that he gave his one and only Son.',
        verseTe: 'దేవుడు లోకమును ఎంతో ప్రేమించెను, కాగా ఆయన తన అద్వితీయకుమారుని ఇచ్చెను.',
        verseRef: 'John 3:16',
        verseRefTe: 'యోహాను 3:16',
        supplies: ['Wooden cross craft', 'Red heart felt', 'Thorn branch model'],
      },
      {
        week: 41,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'He is Risen! The Empty Tomb on Easter Dawn',
        titleTe: 'ఆయన లేచియున్నాడు! ఖాళీ సమాధి మరియు పునరుత్థాన జయము',
        ref: 'Matthew 28:1-10',
        refTe: 'మత్తయి 28:1-10',
        bigIdea: 'Death could not hold Him; Jesus is alive forevermore!',
        bigIdeaTe: 'మరణము ఆయనను బంధించలేకపోయెను; యేసయ్య సదాకాలము జీవించుచున్నాడు!',
        verseEn: 'He is not here; he has risen, just as he said.',
        verseTe: 'ఆయన ఇక్కడ లేడు, తాను చెప్పినట్టే ఆయన లేచియున్నాడు.',
        verseRef: 'Matthew 28:6',
        verseRefTe: 'మత్తయి 28:6',
        supplies: ['Stone rolled away card', 'Sunrise tissue craft', 'Angel banner'],
      },
      {
        week: 42,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'The Road to Emmaus: Hearts Burning with the Word',
        titleTe: 'ఎమ్మాయు మార్గము: వాక్యము వినుచుండగా మండిన హృదయాలు',
        ref: 'Luke 24:13-35',
        refTe: 'లూకా 24:13-35',
        bigIdea: 'Jesus walks beside us as we study the Holy Scriptures.',
        bigIdeaTe: 'మనం లేఖనములను ధ్యానించునప్పుడు యేసయ్య మనతోనే ఉంటాడు.',
        verseEn: 'Were not our hearts burning within us while he talked with us on the road?',
        verseTe: 'ఆయన మార్గములో మనతో మాటలాడుచున్నప్పుడు మన హృదయము మనలో మండుచుండలేదా?',
        verseRef: 'Luke 24:32',
        verseRefTe: 'లూకా 24:32',
        supplies: ['Walking road map', 'Heart candle craft'],
      },
      {
        week: 43,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'The Great Commission: Sharing Good News Everywhere',
        titleTe: 'గొప్ప ఆజ్ఞ: సర్వలోకమునకు సువార్తను ప్రకటించుడి',
        ref: 'Matthew 28:16-20',
        refTe: 'మత్తయి 28:16-20',
        bigIdea: 'Go make disciples! Jesus promises to be with us always.',
        bigIdeaTe: 'సర్వలోకమునకు వెళ్లి శిష్యులనుగా చేయుడి! యేసు ఎల్లప్పుడూ మనతోనే ఉంటాడు.',
        verseEn: 'And surely I am with you always, to the very end of the age.',
        verseTe: 'యుగసమాప్తి వరకు సదాకాలము నేను మీతో కూడ ఉన్నాను.',
        verseRef: 'Matthew 28:20',
        verseRefTe: 'మత్తయి 28:20',
        supplies: ['Mini globes', 'Gospel tract cards', 'Flag stickers'],
      },
      {
        week: 44,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'The Ascension: Jesus Ascends and Promises to Return',
        titleTe: 'యేసు పరలోకారారోహణము మరియు పునరాగమన వాగ్దానము',
        ref: 'Acts 1:6-11',
        refTe: 'అపొస్తలుల కార్యములు 1:6-11',
        bigIdea: 'Jesus is preparing a home for us and will return in glory.',
        bigIdeaTe: 'యేసయ్య మన కొరకు స్థలమును సిద్ధపరచి మరలా వచ్చును.',
        verseEn: 'This same Jesus will come back in the same way you have seen him go.',
        verseTe: 'మీయొద్దనుండి పరలోకమునకు చేర్చుకొనబడిన ఈ యేసే ఆ ప్రకారముగానే మరల వచ్చును.',
        verseRef: 'Acts 1:11',
        verseRefTe: 'అపొస్తలుల కార్యములు 1:11',
        supplies: ['Cloud cotton balls', 'Ascension pop-up card'],
      },
      {
        week: 45,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'Day of Pentecost: Filled with the Holy Spirit',
        titleTe: 'పెంతెకొస్తు దినము: పరిశుద్ధాత్మతో నింపబడుట',
        ref: 'Acts 2:1-21',
        refTe: 'అపొస్తలుల కార్యములు 2:1-21',
        bigIdea: 'The Holy Spirit gives power to be bold witnesses for Jesus.',
        bigIdeaTe: 'పరిశుద్ధాత్మ దేవుడు మనకు ధైర్యమును శక్తిని అనుగ్రహిస్తాడు.',
        verseEn: 'You will receive power when the Holy Spirit comes on you.',
        verseTe: 'పరిశుద్ధాత్మ మీమీదికి వచ్చునప్పుడు మీరు శక్తినొందెదరు.',
        verseRef: 'Acts 1:8',
        verseRefTe: 'అపొస్తలుల కార్యములు 1:8',
        supplies: ['Flame headbands', 'Wind pinwheels', 'Dove ribbons'],
      },
      {
        week: 46,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'Peter and John at the Beautiful Gate: Healing in Jesus’ Name',
        titleTe: 'శృంగారమను దేవాలయ ద్వారము వద్ద స్వస్థత',
        ref: 'Acts 3:1-10',
        refTe: 'అపొస్తలుల కార్యములు 3:1-10',
        bigIdea: 'In the name of Jesus Christ of Nazareth, walk!',
        bigIdeaTe: 'నజరేయుడైన యేసుక్రీస్తు నామమున నడువుము!',
        verseEn: 'Silver or gold I do not have, but what I do have I give you.',
        verseTe: 'వెండి బంగారములు నాయొద్ద లేవుగాని నాకు కలిగినదే నీకిచ్చుచున్నాను.',
        verseRef: 'Acts 3:6',
        verseRefTe: 'అపొస్తలుల కార్యములు 3:6',
        supplies: ['Jumping man craft', 'Temple gate card', 'Joy stickers'],
      },
      {
        week: 47,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'Philip and the Ethiopian: Explaining the Scriptures',
        titleTe: 'ఫిలిప్పు మరియు ఐతియోపీయుడు: వాక్యార్థము వివరించుట',
        ref: 'Acts 8:26-40',
        refTe: 'అపొస్తలుల కార్యములు 8:26-40',
        bigIdea: 'Be ready to share the Bible with anyone anywhere.',
        bigIdeaTe: 'ఎక్కడైనా ఎవరికైనా బైబిల్ వాక్యమును వివరించుటకు సిద్ధముగా ఉండుము.',
        verseEn: 'He went on his way rejoicing.',
        verseTe: 'అతడు సంతోషించుచు తన మార్గమున వెళ్లెను.',
        verseRef: 'Acts 8:39',
        verseRefTe: 'అపొస్తలుల కార్యములు 8:39',
        supplies: ['Chariot wheel craft', 'Scroll booklet', 'Baptism stickers'],
      },
      {
        week: 48,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'Paul’s Transformation on Damascus Road',
        titleTe: 'దమస్కు మార్గములో పౌలు మార్పు: నూతన జీవితము',
        ref: 'Acts 9:1-22',
        refTe: 'అపొస్తలుల కార్యములు 9:1-22',
        bigIdea: 'Jesus turns enemies into His greatest evangelists.',
        bigIdeaTe: 'యేసయ్య ఎటువంటి వారినైనా తన సేవకులుగా మార్చగలడు.',
        verseEn: 'Therefore, if anyone is in Christ, the new creation has come.',
        verseTe: 'కాగా ఎవడైనను క్రీస్తునందున్నయెడల వాడు నూతన సృష్టి.',
        verseRef: '2 Corinthians 5:17',
        verseRefTe: '2 కొరింథీ 5:17',
        supplies: ['Bright light sticker', 'Butterfly transform card'],
      },
      {
        week: 49,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'Paul and Silas Praising in Prison at Midnight',
        titleTe: 'అర్ధరాత్రి చెరసాలలో పౌలు సీలల స్తుతి గానములు',
        ref: 'Acts 16:16-40',
        refTe: 'అపొస్తలుల కార్యములు 16:16-40',
        bigIdea: 'Midnight praises break physical and spiritual chains!',
        bigIdeaTe: 'కష్టకాలములో చేసే దేవుని స్తుతి బంధకములను తెంచును!',
        verseEn: 'About midnight Paul and Silas were praying and singing hymns to God.',
        verseTe: 'అర్ధరాత్రివేళ పౌలును సీలయు దేవునికి ప్రార్థించుచు కీర్తనలు పాడుచుండిరి.',
        verseRef: 'Acts 16:25',
        verseRefTe: 'అపొస్తలుల కార్యములు 16:25',
        supplies: ['Paper chains to break', 'Flashlights', 'Praise shakers'],
      },
      {
        week: 50,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'The Fruit of the Spirit: Godly Character in Kids',
        titleTe: 'ఆత్మ ఫలములు: క్రైస్తవ గుణలక్షణాలు',
        ref: 'Galatians 5:22-23',
        refTe: 'గలతీ 5:22-23',
        bigIdea: 'Love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, self-control.',
        bigIdeaTe: 'ప్రేమ, సంతోషము, సమాధానము, దీర్ఘశాంతము, దయాళుత్వము, మంచితనము, విశ్వాసము, సాత్వికము, ఆశానిగ్రహము.',
        verseEn: 'The fruit of the Spirit is love, joy, peace, patience, kindness, goodness, faithfulness, gentleness and self-control.',
        verseTe: 'ఆత్మ ఫలమేమనగా: ప్రేమ, సంతోషము, సమాధానము, దీర్ఘశాంతము, దయాళుత్వము, మంచితనము, విశ్వాసము, సాత్వికము, ఆశానిగ్రహము.',
        verseRef: 'Galatians 5:22-23',
        verseRefTe: 'గలతీ 5:22-23',
        supplies: ['9 Fruit sticker basket', 'Coloring fruit tree'],
      },
      {
        week: 51,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'The Whole Armor of God: Standing Firm in Christ',
        titleTe: 'దేవుడిచ్చు సర్వాంగ కవచము ధరించుకొనుడి',
        ref: 'Ephesians 6:10-18',
        refTe: 'ఎఫెసీ 6:10-18',
        bigIdea: 'Put on the belt of truth, breastplate of righteousness, shield of faith, helmet of salvation, and sword of the Spirit!',
        bigIdeaTe: 'సత్యమను దట్టి, నీతియను మైమరువు, విశ్వాసమను డాలు, రక్షణయను శిరస్త్రాణము, ఆత్మ ఖడ్గము ధరించుకొనుడి!',
        verseEn: 'Put on the full armor of God, so that you can take your stand against the devil’s schemes.',
        verseTe: 'మీరు అపవాది తంత్రములను ఎదిరించుటకు శక్తిమంతులవునట్లు దేవుడిచ్చు సర్వాంగకవచమును ధరించుకొనుడి.',
        verseRef: 'Ephesians 6:11',
        verseRefTe: 'ఎఫెసీ 6:11',
        supplies: ['Foil sword', 'Cardboard shield', 'Belt & Helmet cutouts'],
      },
      {
        week: 52,
        quarter: 'Q4',
        qTheme: 'Q4: Resurrection, Church & The Armor of God',
        title: 'The New Jerusalem: God Wipes Away Every Tear',
        titleTe: 'నూతన యెరూషలేము: దేవుడు కన్నీళ్లన్నియు తుడుచును',
        ref: 'Revelation 21:1-7',
        refTe: 'ప్రకటన 21:1-7',
        bigIdea: 'Jesus is preparing an eternal home where joy and peace never end!',
        bigIdeaTe: 'యేసయ్య మన కొరకు శాశ్వత పరలోక గృహాన్ని సిద్ధపరుస్తున్నాడు!',
        verseEn: 'He will wipe every tear from their eyes. There will be no more death or mourning or crying or pain.',
        verseTe: 'ఆయన వారి కన్నుల ప్రతి బాష్పబిందువును తుడిచివేయును, ఇక మరణముండదు, దుఃఖమైనను ఏడ్పైనను వేదనయైనను ఇక ఉండదు.',
        verseRef: 'Revelation 21:4',
        verseRefTe: 'ప్రకటన 21:4',
        supplies: ['Golden city gate craft', 'Pearl gates stickers', 'Certificate of Completion'],
      },
    ];

    return themes.map(t => {
      const isCurrent = t.week === 1; // default week 1 active (Genesis / Creation)
      return {
        id: `week_${t.week}`,
        weekNumber: t.week,
        quarter: t.quarter,
        quarterTheme: t.qTheme,
        title: t.title,
        titleTelugu: t.titleTe,
        scriptureRef: t.ref,
        scriptureRefTelugu: t.refTe,
        bigIdea: t.bigIdea,
        bigIdeaTelugu: t.bigIdeaTe,
        memoryVerse: {
          reference: t.verseRef,
          referenceTelugu: t.verseRefTe,
          verseEnglish: t.verseEn,
          verseTelugu: t.verseTe,
        },
        teacherPrep: {
          prayerFocus: `Pray that students understand: "${t.bigIdea}" and memorize ${t.verseRef}.`,
          prayerFocusTelugu: `పిల్లలు "${t.bigIdeaTe}" గ్రహించి, ${t.verseRefTe} కంఠస్థం చేయాలని ప్రార్థించండి.`,
          suppliesNeeded: t.supplies,
          schedule: [
            { timeMinutes: 5, segment: 'Welcome & Prayer', description: 'Greet each child by name; open with welcoming prayer.' },
            { timeMinutes: 10, segment: 'Praise & Action Songs', description: 'Sing themed Telugu & English praise songs with hand motions.' },
            { timeMinutes: 15, segment: 'Bilingual Scripture Lesson', description: `Teach ${t.title} using visual flashcards and reflection dialogue.` },
            { timeMinutes: 10, segment: 'Hands-on Activity & Craft', description: `Complete craft using: ${t.supplies.join(', ')}.` },
            { timeMinutes: 5, segment: 'Memory Verse & Dismissal', description: `Group recitation of ${t.verseRef} before authorized pickup.` },
          ],
        },
        tierGuides: {
          nursery: {
            tier: 'nursery',
            tierName: 'Nursery Angels (Ages 1-3)',
            focusAge: '1-3 years',
            objective: `Introduce God's love through ${t.title}.`,
            objectiveTelugu: `${t.titleTe} ద్వారా దేవుని ప్రేమను పరిచయం చేయుట.`,
            activityName: 'Sensory Touch & Sticker Board',
            activityInstructions: 'Children place stickers and touch soft textured illustrations.',
            activityInstructionsTelugu: 'పిల్లలు రంగుల స్టిక్కర్లు అంటించి బొమ్మలను తాకుతారు.',
            discussionQuestions: ['Who made you?', 'Does Jesus love you?'],
          },
          beginners: {
            tier: 'beginners',
            tierName: 'Beginners Kingdom (Ages 4-5)',
            focusAge: '4-5 years',
            objective: `Understand the story of ${t.title} and say key verse words.`,
            objectiveTelugu: `${t.titleTe} కథను గ్రహించి వాక్యమును వల్లించుట.`,
            activityName: 'Story Puppet Roleplay',
            activityInstructions: 'Children take turns holding characters and acting out key moments.',
            activityInstructionsTelugu: 'పిల్లలు బొమ్మలను పట్టుకొని కథలోని ముఖ్య సన్నివేశాలను నటిస్తారు.',
            discussionQuestions: ['What did God do in today\'s story?', 'How can we thank Jesus?'],
          },
          primary: {
            tier: 'primary',
            tierName: 'Primary Stars (Ages 6-8)',
            focusAge: '6-8 years',
            objective: `Memorize ${t.verseRef} and explain the Big Idea.`,
            objectiveTelugu: `${t.verseRefTe} కంఠస్థం చేసి ప్రధాన సత్యమును వివరించుట.`,
            activityName: 'Hands-On Illustrated Craft',
            activityInstructions: 'Follow the teacher demonstration to build the take-home craft.',
            activityInstructionsTelugu: 'టీచర్ చూపించిన విధానములో చేతిపని క్రాఫ్ట్ తయారుచేయుట.',
            discussionQuestions: ['Why was this story important?', 'What is our memory verse today?'],
          },
          junior: {
            tier: 'junior',
            tierName: 'Junior Champions (Ages 9-11)',
            focusAge: '9-11 years',
            objective: `Locate ${t.ref} in their own Bibles and connect to life choices.`,
            objectiveTelugu: `సొంత బైబిల్లో ${t.refTe} చూసి రోజువారీ జీవితానికి అన్వయించుట.`,
            activityName: 'Scripture Sword Drill & Case Study',
            activityInstructions: 'Fastest team to open the passage and read aloud; discuss practical life scenarios.',
            activityInstructionsTelugu: 'బైబిల్ గ్రంథములో వేగముగా వాక్యమును వెదకి చదివి, నిజజీవిత పరిస్థితులను చర్చించుట.',
            discussionQuestions: ['How can you apply this truth at school?', 'Who needs your encouragement this week?'],
          },
          teens: {
            tier: 'teens',
            tierName: 'Teens for Christ (Ages 12-14)',
            focusAge: '12-14 years',
            objective: `Defend theological truth of ${t.ref} against cultural peer pressure.`,
            objectiveTelugu: `${t.refTe} ఆధారముగా సమాజంలో విశ్వాసమును ధైర్యముగా నిరూపించుట.`,
            activityName: 'Apologetics Circle & Journaling',
            activityInstructions: 'Small group debate and individual journaling of personal conviction.',
            activityInstructionsTelugu: 'చిన్న బృంద చర్చ మరియు వ్యక్తిగత దైవిక తీర్మానము రాసుకొనుట.',
            discussionQuestions: ['What does this passage teach us about culture today?', 'How does this strengthen your personal walk with Christ?'],
          },
        },
        isCurrentWeek: isCurrent,
        academicYear: '2026-2027',
        createdAt: now,
        updatedAt: now,
      };
    });
  }
  async createStory(churchId: string, story: Partial<KidsBibleStory>): Promise<string> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();
    const docRef = await this.getStoriesCollection(cId).add(
      sanitizeForFirestore({
        ...story,
        isPublished: story.isPublished ?? true,
        createdAt: now,
        updatedAt: now,
      })
    );
    return docRef.id;
  }

  async updateStory(churchId: string, docId: string, updates: Partial<KidsBibleStory>): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();
    await this.getStoriesCollection(cId).doc(docId).update(
      sanitizeForFirestore({
        ...updates,
        updatedAt: now,
      })
    );
  }

  async deleteStory(churchId: string, docId: string): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    await this.getStoriesCollection(cId).doc(docId).delete();
  }

  async createQuiz(churchId: string, quiz: Partial<KidsQuiz>): Promise<string> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();
    const docRef = await this.getQuizzesCollection(cId).add(
      sanitizeForFirestore({
        ...quiz,
        isPublished: quiz.isPublished ?? true,
        createdAt: now,
        updatedAt: now,
      })
    );
    return docRef.id;
  }

  async updateQuiz(churchId: string, docId: string, updates: Partial<KidsQuiz>): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();
    await this.getQuizzesCollection(cId).doc(docId).update(
      sanitizeForFirestore({
        ...updates,
        updatedAt: now,
      })
    );
  }

  async deleteQuiz(churchId: string, docId: string): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    await this.getQuizzesCollection(cId).doc(docId).delete();
  }

  async createSong(churchId: string, song: Partial<KidsWorshipSong>): Promise<string> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();
    const docRef = await this.getSongsCollection(cId).add(
      sanitizeForFirestore({
        ...song,
        isPublished: song.isPublished ?? true,
        createdAt: now,
        updatedAt: now,
      })
    );
    return docRef.id;
  }

  async updateSong(churchId: string, docId: string, updates: Partial<KidsWorshipSong>): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();
    await this.getSongsCollection(cId).doc(docId).update(
      sanitizeForFirestore({
        ...updates,
        updatedAt: now,
      })
    );
  }

  async deleteSong(churchId: string, docId: string): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    await this.getSongsCollection(cId).doc(docId).delete();
  }

  // ─── PHASE 9: KIDS EVENTS, VBS & REWARDS ───────────────────────

  async getOrInitVBSEvent(churchId: string): Promise<KidsVBSEventRecord> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const eventsRef = this.getEventsCollection(cId);
    const snap = await eventsRef.where('status', 'in', ['active', 'upcoming']).limit(1).get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      return { id: doc.id, ...(doc.data() as any) };
    }

    // Default VBS 2026 Event
    const now = firestore.FieldValue.serverTimestamp();
    const defaultVBS: Omit<KidsVBSEventRecord, 'id'> = {
      eventId: 'VBS-2026',
      churchId: cId,
      title: 'Kingdom Champions: Living for Jesus VBS 2026',
      titleTelugu: 'పరలోక రాజ్య వీరులు: క్రీస్తు కొరకు జీవించుట VBS 2026',
      themeVerse: 'Be strong in the Lord and in his mighty power. — Ephesians 6:10',
      themeVerseTelugu: 'ప్రభువు యొక్క మహాబలమునుబట్టి ఆయనయందు బలవంతులై యుండుడి. — ఎఫెసీ 6:10',
      startDate: '2026-05-18',
      endDate: '2026-05-23',
      status: 'active',
      houses: [
        { id: 'house_red', name: 'Red Tigers (ధైర్యము)', nameTelugu: 'ఎరుపు పులులు', color: '#EF4444', score: 340, memberCount: 18 },
        { id: 'house_blue', name: 'Blue Eagles (విశ్వాసము)', nameTelugu: 'నీలి గద్దలు', color: '#3B82F6', score: 395, memberCount: 22 },
        { id: 'house_gold', name: 'Gold Lions (జయము)', nameTelugu: 'బంగారు సింహాలు', color: '#FBBF24', score: 410, memberCount: 20 },
        { id: 'house_green', name: 'Emerald Champions (ప్రేమ)', nameTelugu: 'పచ్చటి వీరులు', color: '#10B981', score: 320, memberCount: 16 },
      ],
      totalRegistered: 76,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await eventsRef.add(sanitizeForFirestore(defaultVBS));
    return { id: docRef.id, ...defaultVBS } as any;
  }

  subscribeToVBSEvent(
    churchId: string,
    callback: (event: KidsVBSEventRecord | null) => void
  ): () => void {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getEventsCollection(cId)
      .where('status', 'in', ['active', 'upcoming'])
      .limit(1)
      .onSnapshot(
        async snap => {
          if (!snap || snap.empty) {
            const seeded = await this.getOrInitVBSEvent(cId);
            callback(seeded);
            return;
          }
          const doc = snap.docs[0];
          callback({ id: doc.id, ...(doc.data() as any) });
        },
        () => callback(null)
      );
  }

  async updateVBSHouseScore(
    churchId: string,
    eventDocId: string,
    houseId: string,
    pointsToAdd: number
  ): Promise<void> {
    const cId = churchId || RHEMA_CHURCH_ID;
    const docRef = this.getEventsCollection(cId).doc(eventDocId);
    const snap = await docRef.get();
    if (!snap.exists) return;

    const data = snap.data() as KidsVBSEventRecord;
    const updatedHouses = (data.houses || []).map(h => {
      if (h.id === houseId) {
        return { ...h, score: Math.max(0, (h.score || 0) + pointsToAdd) };
      }
      return h;
    });

    await docRef.update({
      houses: updatedHouses,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  getKingdomBadges(): KidsBadge[] {
    return [
      {
        id: 'badge_star',
        title: 'Sunday Star Disciple',
        titleTelugu: 'ఆదివార నక్షత్ర శిష్యుడు',
        description: 'Earned for perfect Sunday School attendance streak (4 consecutive weeks).',
        emoji: '⭐',
        color: '#FBBF24',
        pointsRequired: 100,
        category: 'attendance',
      },
      {
        id: 'badge_sword',
        title: 'Scripture Sword Master',
        titleTelugu: 'వాక్య ఖడ్గ వీరుడు',
        description: 'Memorized and recited 5 full Scripture memory verses in Telugu and English.',
        emoji: '⚔️',
        color: '#60A5FA',
        pointsRequired: 150,
        category: 'scripture',
      },
      {
        id: 'badge_quiz_champ',
        title: 'Kingdom Trivia Champion',
        titleTelugu: 'రాజ్య క్విజ్ విజేత',
        description: 'Scored 100% on 3 interactive Sunday School Bible trivia quizzes.',
        emoji: '🏆',
        color: '#F59E0B',
        pointsRequired: 200,
        category: 'quiz',
      },
      {
        id: 'badge_worship_hero',
        title: 'Joyful Praise Leader',
        titleTelugu: 'ఆనంద స్తుతి వీరుడు',
        description: 'Learned motions to 5 action songs and led classroom worship.',
        emoji: '🎵',
        color: '#EC4899',
        pointsRequired: 80,
        category: 'craft',
      },
      {
        id: 'badge_vbs_warrior',
        title: 'VBS Kingdom Hero',
        titleTelugu: 'VBS రాజ్య వీరుడు',
        description: 'Graduated Vacation Bible School with House Spirit Honors.',
        emoji: '👑',
        color: '#10B981',
        pointsRequired: 300,
        category: 'vbs',
      },
    ];
  }
}

export default new KidsMinistryService();
