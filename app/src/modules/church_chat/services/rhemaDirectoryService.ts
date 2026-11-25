import firestore from '@react-native-firebase/firestore';
import { RHEMA_CHURCH_ID, RHEMA_ROOT_COLLECTION } from '../../../constants/ChurchConfig';
import { isGuestMemberDoc, normalizePhone10 } from '../../../utils/phoneUtils';
import { ChatBlockRecord, ChatReportPayload, ChurchMemberContact } from '../types/chat';

const memberCache = new Map<string, ChurchMemberContact>();
const directoryListCache = new Map<string, { ts: number; list: ChurchMemberContact[] }>();
const DIRECTORY_LIST_TTL_MS = 60_000;

export function isRhemaAdminRole(memberLike?: { userType?: string | null; role?: string | null; isSuperAdmin?: boolean; superadmin?: boolean } | null): boolean {
  if (!memberLike) return false;
  if (memberLike.isSuperAdmin || memberLike.superadmin) return true;
  const raw = `${memberLike.userType || ''} ${memberLike.role || ''}`.toUpperCase();
  return raw.includes('ADMIN') || raw.includes('PASTOR') || raw.includes('SUPER');
}

function resolveMemberName(data: Record<string, any>): string {
  const full =
    (data.name && String(data.name).trim()) ||
    (data.displayName && String(data.displayName).trim()) ||
    (data.fullName && String(data.fullName).trim()) ||
    `${data.firstName || ''} ${data.lastName || ''}`.trim();
  return full || (data.phone ? `Member (${data.phone})` : 'Rhema Member');
}

function resolveMemberPhoto(data: Record<string, any>): string | null {
  const candidates = [
    data.profilePhoto,
    data.photoUrl,
    data.photoURL,
    data.avatarUrl,
    data.avatar,
    data.imageUrl,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().startsWith('http')) {
      return c.trim();
    }
  }
  return null;
}

function isSignedInAppUid(uid: string): boolean {
  if (!uid || uid.startsWith('guest_') || uid.startsWith('+')) return false;
  if (/^\d{10,15}$/.test(uid)) return false;
  return uid.length >= 16;
}

export const rhemaDirectoryService = {
  clearCache(): void {
    memberCache.clear();
    directoryListCache.clear();
  },

  async getChurchMembers(
    churchId: string = RHEMA_CHURCH_ID,
    excludeUid?: string,
    forceRefresh: boolean = false
  ): Promise<ChurchMemberContact[]> {
    const cid = churchId || RHEMA_CHURCH_ID;
    const cachedList = directoryListCache.get(cid);
    if (!forceRefresh && cachedList && Date.now() - cachedList.ts < DIRECTORY_LIST_TTL_MS) {
      return excludeUid
        ? cachedList.list.filter((c) => c.uid !== excludeUid)
        : cachedList.list;
    }

    const snap = await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('members')
      .get();

    const byUid = new Map<string, ChurchMemberContact>();
    const byPhone = new Map<string, ChurchMemberContact>();

    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (data.status === 'Left' || data.status === 'Rejected' || data.status === 'Inactive') {
        return;
      }
      if (isGuestMemberDoc(data)) return;

      const resolvedUid = String(data.authUid || data.uid || doc.id).trim();
      if (!isSignedInAppUid(resolvedUid)) return;

      const contact: ChurchMemberContact = {
        uid: resolvedUid,
        name: resolveMemberName(data),
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        phone: data.phone || data.mobile || '',
        email: data.email || '',
        photoUrl: resolveMemberPhoto(data),
        userType: data.userType || data.role || 'Member',
        memberCode: data.memberCode || '',
        city: data.city || data.mailingCity || data.village || '',
        isAdmin: isRhemaAdminRole(data),
      };

      memberCache.set(`${cid}:${resolvedUid}`, contact);

      const phone10 = normalizePhone10(contact.phone);
      const existingByUid = byUid.get(resolvedUid);
      if (!existingByUid || (doc.id === resolvedUid && !existingByUid.photoUrl && contact.photoUrl)) {
        byUid.set(resolvedUid, contact);
      }
      if (phone10 && !byPhone.has(phone10)) {
        byPhone.set(phone10, contact);
      }
    });

    const list = Array.from(byUid.values());
    list.sort((a, b) => a.name.localeCompare(b.name));
    directoryListCache.set(cid, { ts: Date.now(), list });
    return excludeUid ? list.filter((c) => c.uid !== excludeUid) : list;
  },

  async getMemberByUid(
    churchId: string = RHEMA_CHURCH_ID,
    uid: string
  ): Promise<ChurchMemberContact | null> {
    if (!uid) return null;
    const cid = churchId || RHEMA_CHURCH_ID;
    const cacheKey = `${cid}:${uid}`;
    if (memberCache.has(cacheKey)) {
      return memberCache.get(cacheKey)!;
    }

    try {
      const doc = await firestore()
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(cid)
        .collection('members')
        .doc(uid)
        .get();
      if (!doc.exists) return null;
      const data = doc.data() || {};
      const contact: ChurchMemberContact = {
        uid,
        name: resolveMemberName(data),
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        phone: data.phone || data.mobile || '',
        email: data.email || '',
        photoUrl: resolveMemberPhoto(data),
        userType: data.userType || data.role || 'Member',
        memberCode: data.memberCode || '',
        city: data.city || data.mailingCity || data.village || '',
        isAdmin: isRhemaAdminRole(data),
      };
      memberCache.set(cacheKey, contact);
      return contact;
    } catch {
      return null;
    }
  },

  subscribeBlockedUsers(
    churchId: string,
    myUid: string,
    onChange: (blockedMap: Record<string, ChatBlockRecord>) => void
  ): () => void {
    if (!myUid) return () => {};
    const cid = churchId || RHEMA_CHURCH_ID;
    return firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_blocks')
      .doc(myUid)
      .collection('blocked')
      .onSnapshot(
        (snap) => {
          const map: Record<string, ChatBlockRecord> = {};
          snap.docs.forEach((d) => {
            const data = d.data() || {};
            map[d.id] = {
              blockedUid: d.id,
              blockedName: data.blockedName || 'Rhema Member',
              blockedPhoto: data.blockedPhoto || null,
              createdAt:
                typeof data.createdAt?.toMillis === 'function'
                  ? data.createdAt.toMillis()
                  : Number(data.createdAt || Date.now()),
            };
          });
          onChange(map);
        },
        () => onChange({})
      );
  },

  async blockMember(
    churchId: string,
    myUid: string,
    target: { uid: string; name: string; photoUrl?: string | null },
    reason = 'Blocked by member'
  ): Promise<void> {
    if (!myUid || !target.uid || myUid === target.uid) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_blocks')
      .doc(myUid)
      .collection('blocked')
      .doc(target.uid)
      .set({
        blockedUid: target.uid,
        blockedName: target.name,
        blockedPhoto: target.photoUrl || null,
        reason,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
  },

  async unblockMember(churchId: string, myUid: string, targetUid: string): Promise<void> {
    if (!myUid || !targetUid) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_blocks')
      .doc(myUid)
      .collection('blocked')
      .doc(targetUid)
      .delete();
  },

  async isBlockedByPeer(churchId: string, myUid: string, peerUid: string): Promise<boolean> {
    if (!myUid || !peerUid) return false;
    const cid = churchId || RHEMA_CHURCH_ID;
    try {
      const snap = await firestore()
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(cid)
        .collection('chat_blocks')
        .doc(peerUid)
        .collection('blocked')
        .doc(myUid)
        .get();
      return Boolean(snap.exists);
    } catch {
      return false;
    }
  },

  async submitReport(
    churchId: string,
    reporterUid: string,
    reporterName: string,
    payload: ChatReportPayload
  ): Promise<void> {
    const cid = churchId || RHEMA_CHURCH_ID;
    await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_reports')
      .add({
        churchId: cid,
        reporterUid,
        reporterName,
        reportedUid: payload.reportedUid || null,
        reportedName: payload.reportedName || null,
        roomId: payload.roomId,
        msgId: payload.msgId || null,
        reason: payload.reason,
        details: payload.details || '',
        status: 'pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
  },
};
