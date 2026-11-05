import firestore from '@react-native-firebase/firestore';
import FirestoreService from './FirestoreService';
import { Share, Platform } from 'react-native';

export type EventRsvpStatus = 'Going' | 'Interested' | 'Not Going';

export interface EventRsvpRecord {
  id: string; // memberId
  memberId: string;
  memberName: string;
  memberPhone?: string;
  memberPhoto?: string;
  status: EventRsvpStatus;
  eventId: string;
  eventTitle?: string;
  churchId: string;
  createdAt: any;
  updatedAt: any;
}

export interface EventRsvpStats {
  goingCount: number;
  interestedCount: number;
  notGoingCount: number;
  totalResponses: number;
}

export interface MemberRsvpListItem {
  id: string;
  name: string;
  phone?: string;
  photo?: string;
  status: EventRsvpStatus | 'Not Responded';
  respondedAt?: any;
}

class EventRsvpService {
  private getEventsCol(churchId: string) {
    return firestore().collection('Rhema Church').doc(churchId).collection('events');
  }

  private getRsvpsCol(churchId: string, eventId: string) {
    return this.getEventsCol(churchId).doc(eventId).collection('rsvps');
  }

  /**
   * Submit or update a member's RSVP response atomically using Firestore transaction.
   * Updates the member document in `events/{eventId}/rsvps/{memberId}` and
   * maintains accurate aggregate counts in `events/{eventId}.rsvpStats`.
   */
  async submitRsvp(
    churchIdParam: string | undefined,
    eventId: string,
    eventTitle: string,
    member: { id: string; name?: string; phone?: string; profilePicture?: string; photoURL?: string },
    newStatus: EventRsvpStatus
  ): Promise<void> {
    if (!eventId || !member?.id) {
      throw new Error('Event ID and Member ID are required to submit RSVP');
    }

    const churchId = churchIdParam || (await FirestoreService.getChurchId()) || 'rhema';
    const eventRef = this.getEventsCol(churchId).doc(eventId);
    const rsvpRef = this.getRsvpsCol(churchId, eventId).doc(member.id);

    await firestore().runTransaction(async (transaction) => {
      const [eventDoc, rsvpDoc] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(rsvpRef),
      ]);

      if (!eventDoc.exists) {
        throw new Error('Event does not exist');
      }

      const eventData = eventDoc.data() || {};
      const currentStats: EventRsvpStats = eventData.rsvpStats || {
        goingCount: 0,
        interestedCount: 0,
        notGoingCount: 0,
        totalResponses: 0,
      };

      const existingRsvp = rsvpDoc.exists ? (rsvpDoc.data() as EventRsvpRecord) : null;
      const prevStatus = existingRsvp ? existingRsvp.status : null;

      // Adjust counts
      let going = currentStats.goingCount || 0;
      let interested = currentStats.interestedCount || 0;
      let notGoing = currentStats.notGoingCount || 0;
      let total = currentStats.totalResponses || 0;

      if (prevStatus) {
        if (prevStatus === 'Going') going = Math.max(0, going - 1);
        else if (prevStatus === 'Interested') interested = Math.max(0, interested - 1);
        else if (prevStatus === 'Not Going') notGoing = Math.max(0, notGoing - 1);
      } else {
        total += 1;
      }

      if (newStatus === 'Going') going += 1;
      else if (newStatus === 'Interested') interested += 1;
      else if (newStatus === 'Not Going') notGoing += 1;

      const updatedStats: EventRsvpStats = {
        goingCount: going,
        interestedCount: interested,
        notGoingCount: notGoing,
        totalResponses: total,
      };

      const now = firestore.FieldValue.serverTimestamp();
      const rsvpData: EventRsvpRecord = {
        id: member.id,
        memberId: member.id,
        memberName: member.name || 'Member',
        memberPhone: member.phone || '',
        memberPhoto: member.profilePicture || member.photoURL || '',
        status: newStatus,
        eventId,
        eventTitle: eventTitle || eventData.title || eventData.name || 'Church Event',
        churchId,
        createdAt: existingRsvp?.createdAt || now,
        updatedAt: now,
      };

      transaction.set(rsvpRef, rsvpData);
      transaction.update(eventRef, {
        rsvpStats: updatedStats,
        updatedAt: now,
      });
    });
  }

  /**
   * Listen to a specific member's active RSVP response for an event in real-time.
   */
  listenToMemberRsvp(
    churchIdParam: string | undefined,
    eventId: string,
    memberId: string,
    callback: (rsvp: EventRsvpRecord | null) => void
  ): () => void {
    if (!eventId || !memberId) {
      callback(null);
      return () => {};
    }

    let unsub: (() => void) | null = null;
    (async () => {
      const churchId = churchIdParam || (await FirestoreService.getChurchId()) || 'rhema';
      unsub = this.getRsvpsCol(churchId, eventId)
        .doc(memberId)
        .onSnapshot(
          (doc) => {
            if (doc.exists) {
              callback(doc.data() as EventRsvpRecord);
            } else {
              callback(null);
            }
          },
          (err) => {
            console.warn('[EventRsvpService] Error listening to member RSVP:', err);
            callback(null);
          }
        );
    })();

    return () => {
      if (unsub) unsub();
    };
  }

  /**
   * Listen to real-time RSVP aggregate stats on the parent event doc.
   */
  listenToEventStats(
    churchIdParam: string | undefined,
    eventId: string,
    callback: (stats: EventRsvpStats, eventData: any) => void
  ): () => void {
    if (!eventId) return () => {};

    let unsub: (() => void) | null = null;
    (async () => {
      const churchId = churchIdParam || (await FirestoreService.getChurchId()) || 'rhema';
      unsub = this.getEventsCol(churchId)
        .doc(eventId)
        .onSnapshot(
          (doc) => {
            if (doc.exists) {
              const data = doc.data() || {};
              const stats: EventRsvpStats = data.rsvpStats || {
                goingCount: 0,
                interestedCount: 0,
                notGoingCount: 0,
                totalResponses: 0,
              };
              callback(stats, data);
            }
          },
          (err) => {
            console.warn('[EventRsvpService] Error listening to event stats:', err);
          }
        );
    })();

    return () => {
      if (unsub) unsub();
    };
  }

  /**
   * Listen to all RSVP responses for an event in real-time (for Admin Dashboard).
   */
  listenToAllEventRsvps(
    churchIdParam: string | undefined,
    eventId: string,
    callback: (rsvps: EventRsvpRecord[]) => void
  ): () => void {
    if (!eventId) return () => {};

    let unsub: (() => void) | null = null;
    (async () => {
      const churchId = churchIdParam || (await FirestoreService.getChurchId()) || 'rhema';
      unsub = this.getRsvpsCol(churchId, eventId).onSnapshot(
        (snap) => {
          const list: EventRsvpRecord[] = snap.docs.map((d) => d.data() as EventRsvpRecord);
          callback(list);
        },
        (err) => {
          console.warn('[EventRsvpService] Error listening to all RSVPs:', err);
          callback([]);
        }
      );
    })();

    return () => {
      if (unsub) unsub();
    };
  }

  /**
   * Fetch all active church members to calculate Total Invited & Not Responded list.
   */
  async getChurchMembersForRsvp(churchIdParam?: string): Promise<{ id: string; name: string; phone?: string; photo?: string }[]> {
    try {
      const churchId = churchIdParam || (await FirestoreService.getChurchId()) || 'rhema';
      const snap = await firestore()
        .collection('Rhema Church')
        .doc(churchId)
        .collection('members')
        .where('membershipStatus', '==', 'Active')
        .limit(500)
        .get();

      if (snap.empty) {
        // Fallback without membershipStatus filter
        const fallbackSnap = await firestore()
          .collection('Rhema Church')
          .doc(churchId)
          .collection('members')
          .limit(500)
          .get();
        return fallbackSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || data.fullName || data.firstName || 'Member',
            phone: data.phone || data.mobile || '',
            photo: data.profilePicture || data.photoURL || '',
          };
        });
      }

      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || data.fullName || data.firstName || 'Member',
          phone: data.phone || data.mobile || '',
          photo: data.profilePicture || data.photoURL || '',
        };
      });
    } catch (e) {
      console.warn('[EventRsvpService] Error fetching church members:', e);
      return [];
    }
  }

  /**
   * Notify members when RSVP is enabled on an already published event.
   */
  async notifyRsvpOpened(
    param1: string | { churchId?: string; eventId: string; eventTitle: string; eventDate: string } | undefined,
    param2?: string,
    param3?: string,
    param4?: string
  ): Promise<void> {
    let churchIdParam: string | undefined;
    let eventId = '';
    let eventTitle = 'Church Event';
    let eventDate = '';

    if (typeof param1 === 'string' || typeof param1 === 'undefined') {
      churchIdParam = param1;
      eventId = param2 || '';
      eventTitle = param3 || 'Church Event';
      eventDate = param4 || '';
    } else if (param1 && typeof param1 === 'object') {
      churchIdParam = param1.churchId;
      eventId = param1.eventId || '';
      eventTitle = param1.eventTitle || 'Church Event';
      eventDate = param1.eventDate || '';
    }
    try {
      const churchId = churchIdParam || (await FirestoreService.getChurchId()) || 'rhema';
      await FirestoreService.createNotificationBroadcast({
        title: `📝 RSVP Open: ${eventTitle}`,
        content: `Participation confirmation is now open for "${eventTitle}" on ${eventDate}. Tap to let us know if you'll be Going, Interested, or Not Going!`,
        type: 'event_rsvp',
        eventId,
        id: eventId,
        screen: 'EventDetails',
        targetChurchId: churchId,
      });
    } catch (err) {
      console.warn('⚠️ [EventRsvpService] Failed to dispatch RSVP opened notification:', err);
    }
  }

  /**
   * Generate and export a comprehensive participation report (CSV format).
   */
  async exportParticipationReport(
    param1: any,
    param2?: EventRsvpStats,
    param3?: MemberRsvpListItem[]
  ): Promise<void> {
    let eventTitle = 'Event';
    let eventDate = 'N/A';
    let stats: EventRsvpStats = { goingCount: 0, interestedCount: 0, notGoingCount: 0, totalResponses: 0 };
    let allMembersRoster: MemberRsvpListItem[] = [];

    if (param1 && typeof param1 === 'object' && (param1.members || param1.stats)) {
      eventTitle = param1.eventTitle || param1.title || 'Event';
      eventDate = param1.eventDate || param1.date || 'N/A';
      stats = param1.stats || stats;
      allMembersRoster = param1.members || [];
    } else {
      eventTitle = param1?.title || param1?.name || 'Event';
      eventDate = param1?.date || 'N/A';
      stats = param2 || stats;
      allMembersRoster = param3 || [];
    }

    const totalMembers = allMembersRoster.length;

    let csv = `Event Participation Report: ${eventTitle}\n`;
    csv += `Event Date: ${eventDate}\n`;
    csv += `Generated On: ${new Date().toLocaleString()}\n`;
    csv += `\n`;
    csv += `SUMMARY STATISTICS\n`;
    csv += `Total Invited,${totalMembers}\n`;
    csv += `Going,${stats.goingCount} (${totalMembers > 0 ? Math.round((stats.goingCount / totalMembers) * 100) : 0}%)\n`;
    csv += `Interested,${stats.interestedCount} (${totalMembers > 0 ? Math.round((stats.interestedCount / totalMembers) * 100) : 0}%)\n`;
    csv += `Not Going,${stats.notGoingCount} (${totalMembers > 0 ? Math.round((stats.notGoingCount / totalMembers) * 100) : 0}%)\n`;
    const notResponded = Math.max(0, totalMembers - stats.totalResponses);
    csv += `Not Responded,${notResponded} (${totalMembers > 0 ? Math.round((notResponded / totalMembers) * 100) : 0}%)\n`;
    csv += `\n`;
    csv += `MEMBER ROSTER\n`;
    csv += `Index,Member Name,Mobile Number,RSVP Status\n`;

    allMembersRoster.forEach((m, idx) => {
      const safeName = (m.name || 'Member').replace(/,/g, ' ');
      const safePhone = (m.phone || 'N/A').replace(/,/g, ' ');
      csv += `${idx + 1},${safeName},${safePhone},${m.status}\n`;
    });

    try {
      await Share.share({
        title: `${eventTitle} - RSVP Participation Report`,
        message: csv,
      });
    } catch (e) {
      console.warn('[EventRsvpService] Share error:', e);
    }
  }
}

export default new EventRsvpService();

