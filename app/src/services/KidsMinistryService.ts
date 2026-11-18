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

  /**
   * Realtime subscription for Sunday School classes.
   */
  subscribeToClasses(
    churchId: string,
    callback: (classes: KidsClassRecord[]) => void
  ): () => void {
    const cId = churchId || RHEMA_CHURCH_ID;
    return this.getClassesCollection(cId).onSnapshot(
      async snap => {
        if (!snap || snap.empty) {
          const seeded = await this.getOrInitKidsClasses(cId);
          callback(seeded);
          return;
        }
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
        list.sort((a, b) => (tierOrder[a.tier] || 99) - (tierOrder[b.tier] || 99));
        callback(list);
      },
      err => {
        console.warn('subscribeToClasses error:', err);
        callback([]);
      }
    );
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
   * Promotes or transfers a child to a target class tier.
   */
  async promoteChild(params: {
    churchId?: string;
    childDocId: string;
    childName: string;
    previousTier?: KidsClassTier;
    targetTier: KidsClassTier;
    targetClassName: string;
    promotedByAdminId?: string;
    notes?: string;
  }): Promise<void> {
    const cId = params.churchId || RHEMA_CHURCH_ID;
    const now = firestore.FieldValue.serverTimestamp();

    await this.getKidsCollection(cId).doc(params.childDocId).update({
      assignedTier: params.targetTier,
      assignedClassName: params.targetClassName,
      lastPromotedAt: now,
      updatedAt: now,
    });

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
}

export default new KidsMinistryService();
