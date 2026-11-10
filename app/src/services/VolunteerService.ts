import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';
import {
  VolunteerApplication,
  VolunteerStatus,
  VolunteerType,
  EventVolunteerRole,
} from '../types/volunteer';

class VolunteerService {
  private getCollection(churchId: string) {
    const cid = churchId || 'rhema';
    return firestore().collection('Rhema Church').doc(cid).collection('volunteer_applications');
  }

  /**
   * Submit a General Church Volunteer Application
   * Enforces Resubmission Rule: Only one pending application at a time.
   */
  async submitGeneralApplication(
    churchId: string,
    member: { id: string; name: string; phone?: string; email?: string },
    data: {
      preferredMinistries: string[];
      skills: string[];
      availabilityNotes?: string;
    }
  ): Promise<string> {
    const col = this.getCollection(churchId);

    // 1. Check for existing pending application for General Volunteering
    try {
      const pendingSnap = await col
        .where('memberId', '==', member.id)
        .where('volunteerType', '==', 'general')
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      if (!pendingSnap.empty) {
        throw new Error(
          'Your previous volunteer application is currently under review. You can submit a new application once the review is completed.'
        );
      }
    } catch (err: any) {
      if (err.message?.includes('currently under review')) {
        throw err;
      }
      // Index fallback
      const snap = await col.where('memberId', '==', member.id).get();
      const hasPending = snap.docs.some(
        (d) => d.data().volunteerType === 'general' && d.data().status === 'pending'
      );
      if (hasPending) {
        throw new Error(
          'Your previous volunteer application is currently under review. You can submit a new application once the review is completed.'
        );
      }
    }

    const docRef = col.doc();

    let memberFcmToken = '';
    try {
      memberFcmToken = await messaging().getToken();
    } catch (_) {}

    const application: Partial<VolunteerApplication> = {
      id: docRef.id,
      churchId: churchId || 'rhema',
      memberId: member.id,
      memberName: member.name || 'Church Member',
      memberPhone: member.phone || '',
      memberEmail: member.email || '',
      memberFcmToken: memberFcmToken || '',
      volunteerType: 'general',
      status: 'pending',
      preferredMinistries: data.preferredMinistries || [],
      skills: data.skills || [],
      availabilityNotes: data.availabilityNotes || '',
      adminNotified: false,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    await docRef.set(application);
    return docRef.id;
  }

  /**
   * Submit an Event-Based Volunteer Application
   * Enforces Resubmission Rule: Only one pending application per event.
   */
  async submitEventApplication(
    churchId: string,
    member: { id: string; name: string; phone?: string; email?: string },
    event: { id: string; title: string; date?: string; time?: string; location?: string },
    data: {
      preferredRole: string;
      skills?: string[];
      availabilityNotes?: string;
    }
  ): Promise<string> {
    const col = this.getCollection(churchId);

    // 1. Check for existing pending application for this specific event
    try {
      const pendingSnap = await col
        .where('memberId', '==', member.id)
        .where('volunteerType', '==', 'event')
        .where('eventId', '==', event.id)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      if (!pendingSnap.empty) {
        throw new Error(
          'Your previous volunteer application is currently under review. You can submit a new application once the review is completed.'
        );
      }
    } catch (err: any) {
      if (err.message?.includes('currently under review')) {
        throw err;
      }
      // Index fallback
      const snap = await col
        .where('memberId', '==', member.id)
        .where('eventId', '==', event.id)
        .get();
      const hasPending = snap.docs.some(
        (d) => d.data().volunteerType === 'event' && d.data().status === 'pending'
      );
      if (hasPending) {
        throw new Error(
          'Your previous volunteer application is currently under review. You can submit a new application once the review is completed.'
        );
      }
    }

    const docRef = col.doc();

    let memberFcmToken = '';
    try {
      memberFcmToken = await messaging().getToken();
    } catch (_) {}

    const application: Partial<VolunteerApplication> = {
      id: docRef.id,
      churchId: churchId || 'rhema',
      memberId: member.id,
      memberName: member.name || 'Church Member',
      memberPhone: member.phone || '',
      memberEmail: member.email || '',
      memberFcmToken: memberFcmToken || '',
      volunteerType: 'event',
      status: 'pending',
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.date || '',
      eventTime: event.time || '',
      eventLocation: event.location || '',
      preferredRole: data.preferredRole,
      skills: data.skills || [],
      availabilityNotes: data.availabilityNotes || '',
      adminNotified: false,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    await docRef.set(application);
    return docRef.id;
  }

  /**
   * Get applications submitted by a specific member
   */
  async getMyApplications(churchId: string, memberId: string): Promise<VolunteerApplication[]> {
    if (!memberId) return [];
    try {
      const snap = await this.getCollection(churchId)
        .where('memberId', '==', memberId)
        .orderBy('createdAt', 'desc')
        .get();

      return snap.docs.map(d => ({ id: d.id, ...d.data() } as VolunteerApplication));
    } catch (e) {
      // Fallback query if composite index is building
      const snap = await this.getCollection(churchId)
        .where('memberId', '==', memberId)
        .get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as VolunteerApplication));
      return list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
    }
  }

  /**
   * Check if a member has already applied for a specific event
   * Prioritizes active pending application, then approved, then latest application.
   */
  async getMemberEventApplication(
    churchId: string,
    eventId: string,
    memberId: string
  ): Promise<VolunteerApplication | null> {
    if (!eventId || !memberId) return null;
    try {
      const snap = await this.getCollection(churchId)
        .where('eventId', '==', eventId)
        .where('memberId', '==', memberId)
        .get();

      if (snap.empty) return null;
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as VolunteerApplication));

      // Prioritize pending application
      const pending = list.find(a => a.status === 'pending');
      if (pending) return pending;

      // Prioritize approved application
      const approved = list.find(a => a.status === 'approved');
      if (approved) return approved;

      // Otherwise return most recent application
      list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      return list[0];
    } catch (err) {
      console.warn('Error checking member event volunteer application:', err);
      return null;
    }
  }

  /**
   * Check if member has an active pending general volunteer application
   */
  async getPendingGeneralApplication(
    churchId: string,
    memberId: string
  ): Promise<VolunteerApplication | null> {
    if (!memberId) return null;
    try {
      const snap = await this.getCollection(churchId)
        .where('memberId', '==', memberId)
        .where('volunteerType', '==', 'general')
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as VolunteerApplication;
      }
      return null;
    } catch (e) {
      const list = await this.getMyApplications(churchId, memberId);
      return list.find(a => a.volunteerType === 'general' && a.status === 'pending') || null;
    }
  }

  /**
   * Listen to all applications for Church Admins
   */
  subscribeApplications(
    churchId: string,
    onUpdate: (applications: VolunteerApplication[]) => void,
    onError?: (error: Error) => void
  ) {
    return this.getCollection(churchId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        snap => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as VolunteerApplication));
          onUpdate(list);
        },
        err => {
          console.warn('Volunteer applications snapshot error, falling back to unordered:', err);
          this.getCollection(churchId).onSnapshot(
            fallbackSnap => {
              const list = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() } as VolunteerApplication));
              onUpdate(list);
            },
            fallbackErr => {
              if (onError) onError(fallbackErr);
            }
          );
        }
      );
  }

  /**
   * Approve a volunteer application (with optional role assignment for events)
   */
  async approveApplication(
    churchId: string,
    applicationId: string,
    admin: { id: string; name: string },
    assignment?: {
      assignedRole?: string;
      assignedDate?: string;
      assignedTimeSlot?: string;
      assignedLocation?: string;
      assignedResponsibility?: string;
    }
  ): Promise<void> {
    const updateData: any = {
      status: 'approved',
      reviewedBy: admin.id,
      reviewedByName: admin.name,
      reviewedAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    if (assignment) {
      if (assignment.assignedRole) updateData.assignedRole = assignment.assignedRole;
      if (assignment.assignedDate) updateData.assignedDate = assignment.assignedDate;
      if (assignment.assignedTimeSlot) updateData.assignedTimeSlot = assignment.assignedTimeSlot;
      if (assignment.assignedLocation) updateData.assignedLocation = assignment.assignedLocation;
      if (assignment.assignedResponsibility) updateData.assignedResponsibility = assignment.assignedResponsibility;
      updateData.assignedAt = firestore.FieldValue.serverTimestamp();
    }

    await this.getCollection(churchId).doc(applicationId).update(updateData);
  }

  /**
   * Reject a volunteer application with optional reason
   */
  async rejectApplication(
    churchId: string,
    applicationId: string,
    admin: { id: string; name: string },
    rejectionReason?: string
  ): Promise<void> {
    await this.getCollection(churchId).doc(applicationId).update({
      status: 'rejected',
      rejectionReason: rejectionReason?.trim() || '',
      reviewedBy: admin.id,
      reviewedByName: admin.name,
      reviewedAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Assign or modify duties for an approved volunteer
   */
  async assignVolunteerDuty(
    churchId: string,
    applicationId: string,
    assignment: {
      assignedRole: string;
      assignedDate?: string;
      assignedTimeSlot?: string;
      assignedLocation?: string;
      assignedResponsibility?: string;
    }
  ): Promise<void> {
    await this.getCollection(churchId).doc(applicationId).update({
      assignedRole: assignment.assignedRole,
      assignedDate: assignment.assignedDate || '',
      assignedTimeSlot: assignment.assignedTimeSlot || '',
      assignedLocation: assignment.assignedLocation || '',
      assignedResponsibility: assignment.assignedResponsibility || '',
      assignedAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Member withdraws their application
   */
  async withdrawApplication(churchId: string, applicationId: string, memberId: string): Promise<void> {
    await this.getCollection(churchId).doc(applicationId).update({
      status: 'withdrawn',
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Admin permanently deletes a volunteer application
   */
  async deleteApplication(churchId: string, applicationId: string): Promise<void> {
    await this.getCollection(churchId).doc(applicationId).delete();
  }
}

export default new VolunteerService();

