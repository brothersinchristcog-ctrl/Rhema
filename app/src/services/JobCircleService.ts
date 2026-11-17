import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import {
  JobCategory,
  JobOpportunity,
  JobApplication,
  MinistryProfile,
  MinistryTeam,
  JobOpportunityStatus,
  JobApplicationStatus,
  AttachmentInfo,
  DEFAULT_MINISTRY_CATEGORIES,
} from '../types/jobCircle';
import VolunteerService from './VolunteerService';

function isPlainObject(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively removes undefined fields from plain objects and arrays so
 * Cloud Firestore writes never fail with "Unsupported field value: undefined",
 * while leaving Date, Timestamp, and FieldValue sentinels intact.
 */
function stripUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedFields(item)) as unknown as T;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined) continue;
    cleaned[key] = stripUndefinedFields(val);
  }
  return cleaned as T;
}

class JobCircleService {
  private getRootRef(churchId: string) {
    const cid = churchId || 'rhema';
    return firestore().collection('Rhema Church').doc(cid);
  }

  // ─────────────────────────────────────────────────────────────
  // 1. CATEGORIES MANAGEMENT
  // ─────────────────────────────────────────────────────────────
  async getCategories(churchId: string): Promise<JobCategory[]> {
    try {
      const snap = await this.getRootRef(churchId)
        .collection('job_circle_categories')
        .orderBy('order', 'asc')
        .get();

      if (snap.empty) {
        // Seed default categories if none exist
        await this.seedDefaultCategories(churchId);
        return DEFAULT_MINISTRY_CATEGORIES;
      }

      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as JobCategory))
        .filter(cat => cat.isEnabled !== false);
    } catch (err) {
      console.warn('[JobCircleService] getCategories fallback to defaults:', err);
      return DEFAULT_MINISTRY_CATEGORIES;
    }
  }

  async seedDefaultCategories(churchId: string): Promise<void> {
    const batch = firestore().batch();
    const col = this.getRootRef(churchId).collection('job_circle_categories');

    for (const cat of DEFAULT_MINISTRY_CATEGORIES) {
      const ref = col.doc(cat.id);
      batch.set(ref, cat, { merge: true });
    }
    await batch.commit();
  }

  async updateCategory(
    churchId: string,
    categoryId: string,
    updates: Partial<JobCategory>
  ): Promise<void> {
    await this.getRootRef(churchId)
      .collection('job_circle_categories')
      .doc(categoryId)
      .set(stripUndefinedFields(updates), { merge: true });
  }

  async addCategory(churchId: string, name: string): Promise<JobCategory> {
    const col = this.getRootRef(churchId).collection('job_circle_categories');
    const newDoc = col.doc();
    const newCat: JobCategory = {
      id: newDoc.id,
      name: name.trim(),
      nameTelugu: '',
      icon: 'Briefcase',
      order: Date.now(),
      isEnabled: true,
    };
    await newDoc.set(newCat);
    return newCat;
  }

  async checkCategoryUsage(churchId: string, categoryId: string): Promise<number> {
    try {
      const snap = await this.getRootRef(churchId)
        .collection('job_circle_opportunities')
        .where('categoryId', '==', categoryId)
        .limit(10)
        .get();
      return snap.size;
    } catch (err) {
      console.warn('[JobCircleService] checkCategoryUsage error:', err);
      return 0;
    }
  }

  async deleteCategory(churchId: string, categoryId: string, forceSoftDelete = false): Promise<void> {
    const ref = this.getRootRef(churchId).collection('job_circle_categories').doc(categoryId);
    if (forceSoftDelete) {
      await ref.update({ isEnabled: false });
    } else {
      await ref.delete();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Custom Configs (Custom Opportunity Types & Compensation Types)
  // ─────────────────────────────────────────────────────────────
  async getCustomConfigs(churchId: string): Promise<{ opportunityTypes: { label: string; value: string }[]; compensationTypes: { label: string; value: string }[] }> {
    try {
      const doc = await this.getRootRef(churchId).collection('job_circle_settings').doc('configs').get();
      if (!doc.exists) {
        return { opportunityTypes: [], compensationTypes: [] };
      }
      const data = doc.data() || {};
      return {
        opportunityTypes: data.opportunityTypes || [],
        compensationTypes: data.compensationTypes || [],
      };
    } catch (err) {
      console.warn('[JobCircleService] getCustomConfigs fallback:', err);
      return { opportunityTypes: [], compensationTypes: [] };
    }
  }

  async addCustomOpportunityType(churchId: string, label: string): Promise<string> {
    const val = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const ref = this.getRootRef(churchId).collection('job_circle_settings').doc('configs');
    await ref.set(
      {
        opportunityTypes: firestore.FieldValue.arrayUnion({ label: label.trim(), value: val }),
      },
      { merge: true }
    );
    return val;
  }

  async checkOpportunityTypeUsage(churchId: string, oppTypeValue: string): Promise<number> {
    try {
      const snap = await this.getRootRef(churchId)
        .collection('job_circle_opportunities')
        .where('opportunityType', '==', oppTypeValue)
        .limit(10)
        .get();
      return snap.size;
    } catch (err) {
      console.warn('[JobCircleService] checkOpportunityTypeUsage error:', err);
      return 0;
    }
  }

  async deleteCustomOpportunityType(churchId: string, item: { label: string; value: string }): Promise<void> {
    const ref = this.getRootRef(churchId).collection('job_circle_settings').doc('configs');
    await ref.update({
      opportunityTypes: firestore.FieldValue.arrayRemove(item),
    });
  }

  async addCustomCompensationType(churchId: string, label: string): Promise<string> {
    const val = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const ref = this.getRootRef(churchId).collection('job_circle_settings').doc('configs');
    await ref.set(
      {
        compensationTypes: firestore.FieldValue.arrayUnion({ label: label.trim(), value: val }),
      },
      { merge: true }
    );
    return val;
  }

  async checkCompensationTypeUsage(churchId: string, compTypeValue: string): Promise<number> {
    try {
      const snap = await this.getRootRef(churchId)
        .collection('job_circle_opportunities')
        .where('compensationType', '==', compTypeValue)
        .limit(10)
        .get();
      return snap.size;
    } catch (err) {
      console.warn('[JobCircleService] checkCompensationTypeUsage error:', err);
      return 0;
    }
  }

  async deleteCustomCompensationType(churchId: string, item: { label: string; value: string }): Promise<void> {
    const ref = this.getRootRef(churchId).collection('job_circle_settings').doc('configs');
    await ref.update({
      compensationTypes: firestore.FieldValue.arrayRemove(item),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. OPPORTUNITIES MANAGEMENT
  // ─────────────────────────────────────────────────────────────
  async getOpportunities(
    churchId: string,
    options?: {
      status?: JobOpportunityStatus;
      categoryId?: string;
      onlyApproved?: boolean;
    }
  ): Promise<JobOpportunity[]> {
    try {
      let query: any = this.getRootRef(churchId).collection('job_circle_opportunities');

      if (options?.onlyApproved) {
        query = query.where('status', '==', 'approved');
      } else if (options?.status) {
        query = query.where('status', '==', options.status);
      }

      if (options?.categoryId && options.categoryId !== 'all') {
        query = query.where('categoryId', '==', options.categoryId);
      }

      const snap = await query.get();
      const list = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as JobOpportunity));
      return list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });
    } catch (err) {
      console.warn('[JobCircleService] getOpportunities error:', err);
      return [];
    }
  }

  async getOpportunityById(churchId: string, id: string): Promise<JobOpportunity | null> {
    const doc = await this.getRootRef(churchId).collection('job_circle_opportunities').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as JobOpportunity;
  }

  async createOpportunity(
    churchId: string,
    data: Omit<JobOpportunity, 'id' | 'createdAt' | 'updatedAt' | 'applicationsCount'>
  ): Promise<string> {
    const col = this.getRootRef(churchId).collection('job_circle_opportunities');
    const newDoc = col.doc();
    const payload = stripUndefinedFields({
      ...data,
      id: newDoc.id,
      churchId,
      applicationsCount: 0,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    await newDoc.set(payload);
    return newDoc.id;
  }

  async updateOpportunity(
    churchId: string,
    id: string,
    updates: Partial<JobOpportunity>
  ): Promise<void> {
    await this.getRootRef(churchId)
      .collection('job_circle_opportunities')
      .doc(id)
      .set(
        stripUndefinedFields({
          ...updates,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        }),
        { merge: true }
      );
  }

  async deleteOpportunity(churchId: string, id: string): Promise<void> {
    await this.getRootRef(churchId)
      .collection('job_circle_opportunities')
      .doc(id)
      .delete();
  }

  async setOpportunityStatus(
    churchId: string,
    id: string,
    status: JobOpportunityStatus,
    adminInfo?: { adminId: string; adminName: string; rejectionReason?: string }
  ): Promise<void> {
    const updates: any = {
      status,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    if (status === 'approved' && adminInfo) {
      updates.approvedById = adminInfo.adminId;
      updates.approvedByName = adminInfo.adminName;
      updates.approvedAt = firestore.FieldValue.serverTimestamp();
    } else if (status === 'rejected' && adminInfo?.rejectionReason) {
      updates.rejectionReason = adminInfo.rejectionReason;
    }

    await this.getRootRef(churchId)
      .collection('job_circle_opportunities')
      .doc(id)
      .update(updates);

    if (status === 'approved') {
      try {
        const oppDoc = await this.getRootRef(churchId).collection('job_circle_opportunities').doc(id).get();
        if (oppDoc.exists) {
          const oppData = oppDoc.data();
          const categoryText = oppData?.categoryName ? ` in ${oppData.categoryName}` : '';
          const title = '💼 New Ministry Opportunity Open!';
          const body = `Rhema Church is looking for a "${oppData?.title || 'Volunteer'}"${categoryText}. Tap to view details and submit your calling!`;

          await firestore()
            .collection('Rhema Church')
            .doc(churchId || 'rhema')
            .collection('notifications')
            .doc(`job_opp_${id}`)
            .set(
              {
                type: 'job_opportunity_new',
                churchId: churchId || 'rhema',
                title,
                body,
                content: body,
                opportunityId: id,
                opportunityTitle: oppData?.title || '',
                categoryName: oppData?.categoryName || '',
                referenceId: id,
                referenceType: 'job_circle_opportunity',
                createdAt: firestore.FieldValue.serverTimestamp(),
                read: false,
              },
              { merge: true }
            );
        }
      } catch (err) {
        console.warn('[JobCircleService] Failed to write new opportunity broadcast notification:', err);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. FILE / RESUME / CV ATTACHMENT UPLOAD (Firebase Storage)
  // ─────────────────────────────────────────────────────────────
  async uploadAttachment(
    churchId: string,
    memberId: string,
    localUri: string,
    fileName: string,
    mimeType?: string
  ): Promise<AttachmentInfo> {
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const storagePath = `Rhema Church/${churchId}/job_circle_resumes/${memberId}_${timestamp}_${cleanFileName}`;
    const storageRef = storage().ref(storagePath);

    // Upload local file uri
    await storageRef.putFile(localUri);
    const downloadUrl = await storageRef.getDownloadURL();

    return {
      url: downloadUrl,
      fileName,
      mimeType: mimeType || 'application/pdf',
      uploadedAt: new Date().toISOString(),
    };
  }

  async uploadJdDocument(
    churchId: string,
    localUri: string,
    fileName: string,
    mimeType?: string,
    fileSize?: number
  ): Promise<AttachmentInfo> {
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const storagePath = `Rhema Church/${churchId || 'rhema'}/job_descriptions/jd_${timestamp}_${cleanFileName}`;
    const storageRef = storage().ref(storagePath);

    await storageRef.putFile(localUri);
    const downloadUrl = await storageRef.getDownloadURL();

    return {
      url: downloadUrl,
      fileName,
      fileSize,
      mimeType: mimeType || 'application/pdf',
      uploadedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. APPLICATION MANAGEMENT
  // ─────────────────────────────────────────────────────────────
  async applyForOpportunity(
    churchId: string,
    opportunity: JobOpportunity,
    member: { id: string; name: string; phone: string; email?: string; fcmToken?: string },
    data: {
      applicationMessage?: string;
      ministryInterests?: string[];
      resumeAttachment?: AttachmentInfo;
    }
  ): Promise<string> {
    const col = this.getRootRef(churchId).collection('job_circle_applications');

    // Duplicate check: Verify applicant has no active application across all matching records
    const existingSnap = await col
      .where('opportunityId', '==', opportunity.id)
      .where('memberId', '==', member.id)
      .get();

    const hasActiveApplication = existingSnap.docs.some(doc => {
      const existingStatus = doc.data()?.status;
      return existingStatus !== 'withdrawn' && existingStatus !== 'rejected';
    });

    if (hasActiveApplication) {
      throw new Error('You have already applied for this ministry opportunity.');
    }

    const appDoc = col.doc();
    const payload = stripUndefinedFields<JobApplication>({
      id: appDoc.id,
      churchId,
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
      categoryId: opportunity.categoryId,
      categoryName: opportunity.categoryName,
      opportunityType: opportunity.opportunityType,
      compensationType: opportunity.compensationType,
      memberId: member.id,
      memberName: member.name,
      memberPhone: member.phone,
      memberEmail: member.email || '',
      memberFcmToken: member.fcmToken || '',
      ministryInterests: data.ministryInterests || [],
      applicationMessage: data.applicationMessage || '',
      resumeAttachment: data.resumeAttachment,
      status: 'submitted',
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    await appDoc.set(payload);

    // Increment opportunity application count
    await this.getRootRef(churchId)
      .collection('job_circle_opportunities')
      .doc(opportunity.id)
      .update({
        applicationsCount: firestore.FieldValue.increment(1),
      })
      .catch(() => {});

    // Write deterministic in-app notification for Admin (matches Cloud Function docId to prevent duplicates)
    try {
      await firestore()
        .collection('Rhema Church')
        .doc(churchId || 'rhema')
        .collection('notifications')
        .doc(`job_admin_${appDoc.id}`)
        .set(
          {
            type: 'job_application_admin',
            churchId: churchId || 'rhema',
            targetRole: 'admin',
            recipientRole: 'admin',
            title: '💼 New Ministry Application!',
            body: `${member.name} has applied for "${opportunity.title}". Please review their calling and attached CV.`,
            content: `${member.name} has applied for "${opportunity.title}". Please review their calling and attached CV.`,
            memberName: member.name,
            applicantName: member.name,
            memberPhone: member.phone,
            opportunityId: opportunity.id,
            opportunityTitle: opportunity.title,
            applicationId: appDoc.id,
            referenceId: appDoc.id,
            referenceType: 'job_circle_application',
            read: false,
            createdAt: firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (notifErr) {
      console.warn('[JobCircleService] Failed to write admin application notification:', notifErr);
    }

    return appDoc.id;
  }

  async getMyApplications(churchId: string, memberId: string): Promise<JobApplication[]> {
    if (!memberId) return [];
    try {
      // In Cloud Firestore, querying with .where() and .orderBy() on a different field requires a composite index.
      // To ensure this always works seamlessly without index deployment errors across all devices:
      const snap = await this.getRootRef(churchId)
        .collection('job_circle_applications')
        .where('memberId', '==', memberId)
        .get();

      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobApplication));
      return list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });
    } catch (err) {
      console.warn('[JobCircleService] getMyApplications query error, returning empty list:', err);
      return [];
    }
  }

  async getApplicationById(churchId: string, applicationId: string): Promise<JobApplication | null> {
    if (!applicationId) return null;
    try {
      const doc = await this.getRootRef(churchId)
        .collection('job_circle_applications')
        .doc(applicationId)
        .get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() } as JobApplication;
    } catch (err) {
      console.warn('[JobCircleService] getApplicationById error:', err);
      return null;
    }
  }

  async getAllApplications(
    churchId: string,
    opportunityId?: string,
    status?: JobApplicationStatus
  ): Promise<JobApplication[]> {
    try {
      let query: any = this.getRootRef(churchId).collection('job_circle_applications');

      if (opportunityId) {
        query = query.where('opportunityId', '==', opportunityId);
      }
      if (status) {
        query = query.where('status', '==', status);
      }

      const snap = await query.get();
      const list = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as JobApplication));
      return list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });
    } catch (err) {
      console.warn('[JobCircleService] getAllApplications query error, returning empty list:', err);
      return [];
    }
  }

  async updateApplicationStatus(
    churchId: string,
    applicationId: string,
    status: JobApplicationStatus,
    adminDetails?: {
      adminId: string;
      adminName: string;
      adminNotes?: string;
      meetingDate?: any;
      meetingTime?: string;
      meetingLocation?: string;
      meetingNotes?: string;
    }
  ): Promise<void> {
    const updates: any = {
      status,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    if (adminDetails) {
      updates.reviewedBy = adminDetails.adminId;
      updates.reviewedByName = adminDetails.adminName;
      updates.reviewedAt = firestore.FieldValue.serverTimestamp();
      if (adminDetails.adminNotes) updates.adminNotes = adminDetails.adminNotes;
      if (adminDetails.meetingDate) updates.meetingDate = adminDetails.meetingDate;
      if (adminDetails.meetingTime) updates.meetingTime = adminDetails.meetingTime;
      if (adminDetails.meetingLocation) updates.meetingLocation = adminDetails.meetingLocation;
      if (adminDetails.meetingNotes) updates.meetingNotes = adminDetails.meetingNotes;
    }

    await this.getRootRef(churchId)
      .collection('job_circle_applications')
      .doc(applicationId)
      .update(updates);

    // Write in-app notification for Member about status update
    try {
      const appSnap = await this.getRootRef(churchId)
        .collection('job_circle_applications')
        .doc(applicationId)
        .get();
      if (appSnap.exists) {
        const appData = appSnap.data();
        const roleTitle = appData?.opportunityTitle || 'Ministry Position';
        const applicantId = appData?.memberId;
        const applicantPhone = appData?.memberPhone;

        let title = '💼 Ministry Application Update';
        let body = `Your application for "${roleTitle}" has been updated to ${status.replace(/_/g, ' ').toUpperCase()}.`;

        if (status === 'under_review') {
          title = '🔍 Application Under Review';
          body = `Your application for "${roleTitle}" is now prayerfully under review by ministry leaders.`;
        } else if (status === 'meeting_scheduled') {
          title = '📅 Ministry Interview / Meeting Scheduled!';
          const dateStr = adminDetails?.meetingDate ? ` on ${adminDetails.meetingDate}` : '';
          const timeStr = adminDetails?.meetingTime ? ` at ${adminDetails.meetingTime}` : '';
          const locStr = adminDetails?.meetingLocation ? ` at ${adminDetails.meetingLocation}` : '';
          body = `An interview has been scheduled for your application for "${roleTitle}"${dateStr}${timeStr}${locStr}. Please check Job Circle in the app for details.`;
        } else if (status === 'selected') {
          title = '🎉 Congratulations! You have been Selected!';
          body = `Congratulations! You have been selected/appointed to serve in "${roleTitle}". Welcome to the ministry team!`;
        } else if (status === 'shortlisted') {
          title = '⭐ Application Shortlisted!';
          body = `Your application for "${roleTitle}" has been shortlisted by church ministry leaders.`;
        } else if (status === 'rejected') {
          title = '📋 Ministry Application Update';
          const reasonStr = adminDetails?.adminNotes ? ` Note: ${adminDetails.adminNotes}` : '';
          body = `Thank you for your heart to serve. Your application for "${roleTitle}" has not been selected at this time.${reasonStr}`;
        }

        await firestore()
          .collection('Rhema Church')
          .doc(churchId || 'rhema')
          .collection('notifications')
          .doc(`job_status_${applicationId}_${status}`)
          .set(
            {
              type: 'job_application_member',
              churchId: churchId || 'rhema',
              targetMemberId: applicantId,
              recipientId: applicantId,
              recipientRole: 'member',
              targetPhone: applicantPhone || '',
              title,
              body,
              content: body,
              status,
              opportunityId: appData?.opportunityId || '',
              opportunityTitle: roleTitle,
              applicationId,
              referenceId: applicationId,
              referenceType: 'job_circle_application',
              read: false,
              createdAt: firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (notifErr) {
      console.warn('[JobCircleService] Failed to write member application notification:', notifErr);
    }
  }

  async withdrawApplication(churchId: string, applicationId: string, memberId: string): Promise<void> {
    const ref = this.getRootRef(churchId).collection('job_circle_applications').doc(applicationId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Application not found');
    const data = doc.data();
    if (data?.memberId !== memberId) throw new Error('Unauthorized');

    await ref.update({
      status: 'withdrawn',
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  async deleteApplication(churchId: string, applicationId: string, opportunityId?: string): Promise<void> {
    const ref = this.getRootRef(churchId).collection('job_circle_applications').doc(applicationId);
    await ref.delete();

    // Decrement opportunity application count if opportunityId is available
    if (opportunityId) {
      await this.getRootRef(churchId)
        .collection('job_circle_opportunities')
        .doc(opportunityId)
        .update({
          applicationsCount: firestore.FieldValue.increment(-1),
        })
        .catch(() => {});
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. MEMBER MINISTRY PROFILE
  // ─────────────────────────────────────────────────────────────
  async getMinistryProfile(churchId: string, memberId: string): Promise<MinistryProfile | null> {
    try {
      const doc = await this.getRootRef(churchId)
        .collection('job_circle_profiles')
        .doc(memberId)
        .get();

      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() } as MinistryProfile;
    } catch (err) {
      console.error('[JobCircleService] getMinistryProfile error:', err);
      return null;
    }
  }

  async saveMinistryProfile(
    churchId: string,
    profile: Omit<MinistryProfile, 'updatedAt'>
  ): Promise<void> {
    await this.getRootRef(churchId)
      .collection('job_circle_profiles')
      .doc(profile.memberId)
      .set(
        stripUndefinedFields({
          ...profile,
          churchId,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        }),
        { merge: true }
      );
  }

  // ─────────────────────────────────────────────────────────────
  // 6. MINISTRY TEAMS MANAGEMENT
  // ─────────────────────────────────────────────────────────────
  async getMinistryTeams(churchId: string): Promise<MinistryTeam[]> {
    try {
      const snap = await this.getRootRef(churchId)
        .collection('job_circle_teams')
        .orderBy('name', 'asc')
        .get();

      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MinistryTeam));
    } catch (err) {
      console.error('[JobCircleService] getMinistryTeams error:', err);
      return [];
    }
  }

  async createMinistryTeam(
    churchId: string,
    team: Omit<MinistryTeam, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const col = this.getRootRef(churchId).collection('job_circle_teams');
    const doc = col.doc();
    await doc.set(
      stripUndefinedFields({
        ...team,
        id: doc.id,
        churchId,
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      })
    );
    return doc.id;
  }

  async addMemberToTeam(
    churchId: string,
    teamId: string,
    member: { memberId: string; memberName: string; roleInTeam: string; phone?: string }
  ): Promise<void> {
    const ref = this.getRootRef(churchId).collection('job_circle_teams').doc(teamId);
    const cleanedMember = stripUndefinedFields({
      ...member,
      joinedAt: new Date().toISOString(),
    });
    await ref.update({
      memberIds: firestore.FieldValue.arrayUnion(member.memberId),
      members: firestore.FieldValue.arrayUnion(cleanedMember),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  async removeMemberFromTeam(
    churchId: string,
    teamId: string,
    memberId: string
  ): Promise<void> {
    const ref = this.getRootRef(churchId).collection('job_circle_teams').doc(teamId);
    await firestore().runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (!doc.exists) return;

      const data = doc.data() as MinistryTeam;
      const updatedMembers = (data.members || []).filter(m => m.memberId !== memberId);
      const updatedIds = (data.memberIds || []).filter(id => id !== memberId);

      transaction.update(ref, {
        members: updatedMembers,
        memberIds: updatedIds,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 7. UNIFIED ENGAGEMENT QUERY (Bridging with VolunteerService)
  // ─────────────────────────────────────────────────────────────
  /**
   * Fetches all engagements for a member:
   * Both Job Circle Ministry Applications AND Volunteer Applications (without disturbing either).
   */
  async getUnifiedMemberEngagements(churchId: string, memberId: string) {
    const [jobApplications, volunteerApplications] = await Promise.all([
      this.getMyApplications(churchId, memberId),
      VolunteerService.getMyApplications(churchId, memberId),
    ]);

    return {
      jobApplications,
      volunteerApplications,
      totalCount: jobApplications.length + volunteerApplications.length,
    };
  }
}

export default new JobCircleService();
