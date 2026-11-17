import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';
import {
  VolunteerApplication,
  VolunteerStatus,
  VolunteerType,
  EventVolunteerRole,
  GeneralVolunteerPost,
  VolunteerPostStatus,
} from '../types/volunteer';

class VolunteerService {
  private getCollection(churchId: string) {
    const cid = churchId || 'rhema';
    return firestore().collection('Rhema Church').doc(cid).collection('volunteer_applications');
  }

  private getPostsCollection(churchId: string) {
    const cid = churchId || 'rhema';
    return firestore().collection('Rhema Church').doc(cid).collection('volunteer_posts');
  }

  /**
   * Submit a General Church Volunteer Application
   * Enforces Resubmission Rule: Only one pending application at a time (per post or general).
   */
  async submitGeneralApplication(
    churchId: string,
    member: { id: string; name: string; phone?: string; email?: string },
    data: {
      preferredMinistries: string[];
      skills: string[];
      availabilityNotes?: string;
      postId?: string;
      postTitle?: string;
    }
  ): Promise<string> {
    const col = this.getCollection(churchId);
    const targetPostId = (data.postId || '').trim();

    // 1. Check for existing pending application for General Volunteering
    try {
      const snap = await col
        .where('memberId', '==', member.id)
        .where('volunteerType', '==', 'general')
        .where('status', '==', 'pending')
        .get();

      const hasDuplicatePending = snap.docs.some((d) => {
        const docData = d.data();
        if (targetPostId) {
          return String(docData.postId || '').trim() === targetPostId;
        }
        return !docData.postId;
      });

      if (hasDuplicatePending) {
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
      const hasPending = snap.docs.some((d) => {
        const docData = d.data();
        if (docData.volunteerType !== 'general' || docData.status !== 'pending') return false;
        if (targetPostId) {
          return String(docData.postId || '').trim() === targetPostId;
        }
        return !docData.postId;
      });
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
      postId: targetPostId,
      postTitle: (data.postTitle || '').trim(),
      preferredMinistries: data.preferredMinistries || [],
      skills: data.skills || [],
      availabilityNotes: data.availabilityNotes || '',
      adminNotified: false,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    await docRef.set(application);
    await this.notifyAdminApplicationSubmitted(
      churchId,
      docRef.id,
      member.name,
      'general',
      undefined,
      data.postTitle
    );
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
    await this.notifyAdminApplicationSubmitted(churchId, docRef.id, member.name, 'event', event);
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
    const docRef = this.getCollection(churchId).doc(applicationId);
    const appSnap = await docRef.get().catch(() => null);
    const existing = appSnap?.exists ? (appSnap.data() as any) : null;

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

    await docRef.update(updateData);

    if (existing?.memberId) {
      const isEventVolunteer = existing.volunteerType === 'event';
      const eventName = (existing.eventTitle || 'the church event').trim();
      const roleAssigned = assignment?.assignedRole || existing.assignedRole;
      const body = isEventVolunteer
        ? `Your application for ${eventName} has been approved.${roleAssigned ? ` Assigned Role: ${roleAssigned}.` : ''} Please check your event details.`
        : 'Your volunteer application has been approved. Thank you for your willingness to serve the church.';

      await this.writeInAppNotification(
        churchId,
        `vol_status_${applicationId}_approved`,
        {
          type: 'volunteer_application_member',
          targetMemberId: existing.memberId,
          recipientId: existing.memberId,
          recipientRole: 'member',
          targetPhone: existing.memberPhone || '',
          title: '🎉 Volunteer Application Approved!',
          body,
          content: body,
          status: 'approved',
          volunteerType: existing.volunteerType || 'general',
          eventId: existing.eventId || '',
          eventTitle: isEventVolunteer ? eventName : '',
          applicationId,
          referenceId: applicationId,
          referenceType: isEventVolunteer ? 'event_volunteer' : 'general_volunteer',
        },
        true
      );
    }
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
    const docRef = this.getCollection(churchId).doc(applicationId);
    const appSnap = await docRef.get().catch(() => null);
    const existing = appSnap?.exists ? (appSnap.data() as any) : null;
    const cleanReason = rejectionReason?.trim() || '';

    await docRef.update({
      status: 'rejected',
      rejectionReason: cleanReason,
      reviewedBy: admin.id,
      reviewedByName: admin.name,
      reviewedAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    if (existing?.memberId) {
      const isEventVolunteer = existing.volunteerType === 'event';
      const eventName = (existing.eventTitle || 'the church event').trim();
      const reasonPart = cleanReason
        ? ` Reason: ${cleanReason}`
        : ' Please check your application details in the app.';
      const body = isEventVolunteer
        ? `Your volunteer application for ${eventName} has not been approved.${reasonPart}`
        : `Your volunteer application has not been approved.${reasonPart}`;

      await this.writeInAppNotification(
        churchId,
        `vol_status_${applicationId}_rejected`,
        {
          type: 'volunteer_application_member',
          targetMemberId: existing.memberId,
          recipientId: existing.memberId,
          recipientRole: 'member',
          targetPhone: existing.memberPhone || '',
          title: 'Volunteer Application Update',
          body,
          content: body,
          status: 'rejected',
          volunteerType: existing.volunteerType || 'general',
          eventId: existing.eventId || '',
          eventTitle: isEventVolunteer ? eventName : '',
          applicationId,
          referenceId: applicationId,
          referenceType: isEventVolunteer ? 'event_volunteer' : 'general_volunteer',
        },
        true
      );
    }
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
    const docRef = this.getCollection(churchId).doc(applicationId);
    const appSnap = await docRef.get().catch(() => null);
    const existing = appSnap?.exists ? (appSnap.data() as any) : null;

    await docRef.update({
      assignedRole: assignment.assignedRole,
      assignedDate: assignment.assignedDate || '',
      assignedTimeSlot: assignment.assignedTimeSlot || '',
      assignedLocation: assignment.assignedLocation || '',
      assignedResponsibility: assignment.assignedResponsibility || '',
      assignedAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    if (existing?.memberId && String(existing.status || '').toLowerCase() === 'approved') {
      const eventName = (existing.eventTitle || 'the church event').trim();
      const roleText = assignment.assignedRole ? `as ${assignment.assignedRole}` : 'a volunteer';
      const body = `You have been assigned ${roleText} for ${eventName}.${assignment.assignedResponsibility ? ` Duty: ${assignment.assignedResponsibility}.` : ''} Please check your assignment details.`;
      const assignKey = this.computeAssignmentKey(assignment);

      await this.writeInAppNotification(
        churchId,
        `vol_assign_${applicationId}_${assignKey}`,
        {
          type: 'volunteer_assignment',
          targetMemberId: existing.memberId,
          recipientId: existing.memberId,
          recipientRole: 'member',
          targetPhone: existing.memberPhone || '',
          title: '⭐ You Have Been Assigned!',
          body,
          content: body,
          volunteerType: existing.volunteerType || 'event',
          eventId: existing.eventId || '',
          eventTitle: eventName,
          applicationId,
          referenceId: applicationId,
          referenceType: 'event_volunteer',
        },
        true
      );
    }
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

  // ── GENERAL VOLUNTEER POSTS (Admin Call for Volunteers -> Members) ──

  /**
   * Listen to all general volunteer posts for a church
   */
  subscribeVolunteerPosts(
    churchId: string,
    onUpdate: (posts: GeneralVolunteerPost[]) => void,
    onError?: (error: Error) => void
  ) {
    return this.getPostsCollection(churchId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GeneralVolunteerPost));
          onUpdate(list);
        },
        (err) => {
          console.warn('Volunteer posts snapshot error, falling back to unordered:', err);
          this.getPostsCollection(churchId).onSnapshot(
            (fallbackSnap) => {
              const list = fallbackSnap.docs.map(
                (d) => ({ id: d.id, ...d.data() } as GeneralVolunteerPost)
              );
              list.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return timeB - timeA;
              });
              onUpdate(list);
            },
            (fallbackErr) => {
              if (onError) onError(fallbackErr);
            }
          );
        }
      );
  }

  /**
   * Admin creates a new General Volunteer Application Post for members
   */
  async createVolunteerPost(
    churchId: string,
    admin: { id: string; name: string },
    data: {
      title: string;
      description: string;
      ministries: string[];
      recommendedSkills?: string[];
      scheduleSummary?: string;
      slotsNeeded?: number;
      notifyMembers?: boolean;
    }
  ): Promise<string> {
    const cid = churchId || 'rhema';
    const col = this.getPostsCollection(cid);
    const docRef = col.doc();

    const cleanTitle = (data.title || '').trim() || 'Church Volunteer Call';
    const cleanDesc = (data.description || '').trim();
    const cleanMinistries = Array.isArray(data.ministries) ? data.ministries : [];
    const cleanSkills = Array.isArray(data.recommendedSkills) ? data.recommendedSkills : [];
    const cleanSchedule = (data.scheduleSummary || '').trim();
    const cleanSlots =
      typeof data.slotsNeeded === 'number' && data.slotsNeeded > 0 ? data.slotsNeeded : 0;

    const postDoc: Record<string, any> = {
      id: docRef.id,
      churchId: cid,
      title: cleanTitle,
      description: cleanDesc,
      ministries: cleanMinistries,
      recommendedSkills: cleanSkills,
      scheduleSummary: cleanSchedule,
      slotsNeeded: cleanSlots,
      status: 'open',
      notifyMembers: data.notifyMembers !== false,
      createdBy: admin.id || 'admin',
      createdByName: admin.name || 'Church Admin',
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    await docRef.set(postDoc);

    if (data.notifyMembers !== false) {
      await this.broadcastVolunteerPostNotification(cid, {
        ...(postDoc as GeneralVolunteerPost),
        id: docRef.id,
      });
    }

    return docRef.id;
  }

  /**
   * Admin updates an existing General Volunteer Post
   */
  async updateVolunteerPost(
    churchId: string,
    postId: string,
    data: {
      title?: string;
      description?: string;
      ministries?: string[];
      recommendedSkills?: string[];
      scheduleSummary?: string;
      slotsNeeded?: number;
      status?: VolunteerPostStatus;
    }
  ): Promise<void> {
    const cid = churchId || 'rhema';
    const docRef = this.getPostsCollection(cid).doc(postId);
    const updates: Record<string, any> = {
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    if (typeof data.title === 'string') updates.title = data.title.trim();
    if (typeof data.description === 'string') updates.description = data.description.trim();
    if (Array.isArray(data.ministries)) updates.ministries = data.ministries;
    if (Array.isArray(data.recommendedSkills)) updates.recommendedSkills = data.recommendedSkills;
    if (typeof data.scheduleSummary === 'string') updates.scheduleSummary = data.scheduleSummary.trim();
    if (typeof data.slotsNeeded === 'number') updates.slotsNeeded = Math.max(0, data.slotsNeeded);
    if (data.status) updates.status = data.status;

    await docRef.update(updates);
  }

  /**
   * Admin closes or reopens a General Volunteer Post
   */
  async toggleVolunteerPostStatus(
    churchId: string,
    postId: string,
    status: VolunteerPostStatus
  ): Promise<void> {
    await this.getPostsCollection(churchId).doc(postId).update({
      status,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Admin deletes a General Volunteer Post
   */
  async deleteVolunteerPost(churchId: string, postId: string): Promise<void> {
    await this.getPostsCollection(churchId).doc(postId).delete();
  }

  /**
   * Broadcasts push + in-app notification to all church members when a General Volunteer Post is published
   */
  async broadcastVolunteerPostNotification(
    churchId: string,
    post: GeneralVolunteerPost
  ): Promise<void> {
    const cid = churchId || 'rhema';
    const docId = `vol_post_${post.id}`;
    const ministryLabels = (post.ministries || [])
      .map((m) => m.split('·')[0]?.trim() || m)
      .filter(Boolean);
    const minPart =
      ministryLabels.length > 0 ? ` (${ministryLabels.slice(0, 2).join(', ')})` : '';
    const title = `🤝 Volunteer Call: ${post.title}`;
    const body =
      post.description?.trim() ||
      `We are inviting church members to serve in "${post.title}"${minPart}. Tap to apply and serve!`;

    const payload: Record<string, any> = {
      type: 'volunteer_post_new',
      churchId: cid,
      targetChurchId: cid,
      title,
      body,
      content: body,
      postId: post.id,
      postTitle: post.title,
      referenceId: post.id,
      referenceType: 'general_volunteer_post',
      screen: 'Volunteer',
      read: false,
      createdAt: firestore.FieldValue.serverTimestamp(),
    };

    try {
      await firestore()
        .collection('Rhema Church')
        .doc(cid)
        .collection('notifications')
        .doc(docId)
        .set(payload, { merge: true });
    } catch (err) {
      console.warn('[VolunteerService] Volunteer post notification write warning:', err);
    }

    try {
      // silent: false triggers sendRhemaBroadcastPush in Cloud Functions to alert all church members
      await firestore()
        .collection('Rhema Church')
        .doc(cid)
        .collection('broadcasts')
        .doc(docId)
        .set({ ...payload, silent: false }, { merge: true });
    } catch (err) {
      console.warn('[VolunteerService] Volunteer post broadcast write warning:', err);
    }
  }

  private async notifyAdminApplicationSubmitted(
    churchId: string,
    applicationId: string,
    memberNameRaw: string,
    volunteerType: 'general' | 'event',
    event?: { id: string; title: string },
    postTitle?: string
  ): Promise<void> {
    const memberDisplayName = (memberNameRaw || '').trim() || 'A Church Member';
    const isEvent = volunteerType === 'event';
    const eventTitleClean = (event?.title || 'Church Event').trim();
    const postTitleClean = (postTitle || '').trim();
    const title = isEvent
      ? '📅 New Event Volunteer Application!'
      : postTitleClean
      ? `📋 Volunteer Application: ${postTitleClean}`
      : '📋 New Volunteer Application!';
    const body = isEvent
      ? `${memberDisplayName} has applied to volunteer for ${eventTitleClean}. Please review the application.`
      : postTitleClean
      ? `${memberDisplayName} has applied for "${postTitleClean}". Please review the application.`
      : `${memberDisplayName} has submitted a new General Volunteer application. Please review the application.`;

    await this.writeInAppNotification(
      churchId,
      `vol_admin_${applicationId}`,
      {
        type: 'volunteer_application_admin',
        targetRole: 'admin',
        title,
        body,
        content: body,
        memberName: memberDisplayName,
        volunteerType,
        eventId: isEvent ? (event?.id || '') : '',
        eventTitle: isEvent ? eventTitleClean : '',
        postTitle: postTitleClean,
        applicationId,
        referenceId: applicationId,
        referenceType: isEvent ? 'event_volunteer' : 'general_volunteer',
      },
      false
    );
  }

  private computeAssignmentKey(data: {
    assignedRole?: string;
    assignedDate?: string;
    assignedTimeSlot?: string;
    assignedLocation?: string;
    assignedResponsibility?: string;
  }): string {
    const raw = [
      data.assignedRole || '',
      data.assignedDate || '',
      data.assignedTimeSlot || '',
      data.assignedLocation || '',
      data.assignedResponsibility || '',
    ].join('|');
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
  }

  private async writeInAppNotification(
    churchId: string,
    docId: string,
    payload: Record<string, any>,
    writeToBroadcast: boolean
  ): Promise<void> {
    const cid = churchId || 'rhema';
    const docData = {
      ...payload,
      churchId: cid,
      read: false,
      createdAt: firestore.FieldValue.serverTimestamp(),
    };
    try {
      await firestore()
        .collection('Rhema Church')
        .doc(cid)
        .collection('notifications')
        .doc(docId)
        .set(docData, { merge: true });
    } catch (err) {
      console.warn('[VolunteerService] In-app notification write warning:', err);
    }

    if (writeToBroadcast) {
      try {
        await firestore()
          .collection('Rhema Church')
          .doc(cid)
          .collection('broadcasts')
          .doc(docId)
          .set({ ...docData, silent: true }, { merge: true });
      } catch (err) {
        console.warn('[VolunteerService] In-app broadcast write warning:', err);
      }
    }

    const targetMemberId = String(payload?.targetMemberId || payload?.recipientId || '').trim();
    if (targetMemberId) {
      try {
        await firestore()
          .collection('Rhema Church')
          .doc(cid)
          .collection('members')
          .doc(targetMemberId)
          .collection('notifications')
          .doc(docId)
          .set(docData, { merge: true });
      } catch (err) {
        console.warn('[VolunteerService] Member notification subcollection write warning:', err);
      }
    }
  }
}

export default new VolunteerService();

