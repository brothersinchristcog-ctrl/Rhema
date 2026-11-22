import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import { push, ref, serverTimestamp, update } from 'firebase/database';
import { RHEMA_CHURCH_ID, RHEMA_ROOT_COLLECTION } from '../../../constants/ChurchConfig';
import { ChatCategory, ChatSystemEvent } from '../types/chat';
import { getChatRtdb } from './rtdbClient';

const CHAT_FUNCTIONS_REGION = 'us-central1';

function getChatCallable(name: string) {
  return functions().app.functions(CHAT_FUNCTIONS_REGION).httpsCallable(name);
}

async function emitSystemMessage(params: {
  churchId: string;
  roomId: string;
  roomTitle: string;
  roomAvatar?: string | null;
  category: ChatCategory;
  participantUids: string[];
  text: string;
  systemEvent: ChatSystemEvent;
}) {
  const db = getChatRtdb();
  const msgRef = push(ref(db, `rhema_chat/${params.churchId}/rooms/${params.roomId}/messages`));
  const msgId = msgRef.key || `${Date.now()}`;
  const updates: Record<string, any> = {
    [`rhema_chat/${params.churchId}/rooms/${params.roomId}/messages/${msgId}`]: {
      id: msgId,
      senderUid: params.systemEvent.actorUid,
      senderName: params.systemEvent.actorName,
      type: 'system',
      text: params.text,
      systemEvent: params.systemEvent,
      createdAt: serverTimestamp(),
    },
  };

  params.participantUids.forEach((uid) => {
    const base = `rhema_chat/${params.churchId}/inbox/${uid}/${params.roomId}`;
    updates[`${base}/roomId`] = params.roomId;
    updates[`${base}/roomType`] = 'group';
    updates[`${base}/category`] = params.category;
    updates[`${base}/title`] = params.roomTitle;
    updates[`${base}/avatarUrl`] = params.roomAvatar || null;
    updates[`${base}/participantCount`] = params.participantUids.length;
    updates[`${base}/lastMessageId`] = msgId;
    updates[`${base}/lastMessageText`] = params.text;
    updates[`${base}/lastMessageType`] = 'system';
    updates[`${base}/lastMessageSenderUid`] = params.systemEvent.actorUid;
    updates[`${base}/lastMessageSenderName`] = params.systemEvent.actorName;
    updates[`${base}/lastMessageAt`] = serverTimestamp();
  });

  await update(ref(db), updates);
}

export const rhemaGroupService = {
  /**
   * Creates a new Rhema group chat. Strictly enforced for Church Admins only
   * via the `createRhemaChatGroup` Cloud Function.
   */
  async createGroup(params: {
    churchId?: string;
    name: string;
    description?: string;
    avatarUrl?: string | null;
    category?: 'team' | 'group';
    memberUids: string[];
    onlyAdminsCanSend?: boolean;
  }): Promise<{ roomId: string }> {
    const cid = params.churchId || RHEMA_CHURCH_ID;
    const callable = getChatCallable('createRhemaChatGroup');
    const res = await callable({
      churchId: cid,
      name: params.name.trim(),
      description: (params.description || '').trim(),
      avatarUrl: params.avatarUrl || null,
      category: params.category || 'team',
      memberUids: params.memberUids,
      onlyAdminsCanSend: Boolean(params.onlyAdminsCanSend),
    });
    const data = (res?.data || {}) as any;
    if (!data?.roomId) {
      throw new Error('Failed to create group.');
    }
    return { roomId: String(data.roomId) };
  },

  async updateGroupInfo(params: {
    churchId?: string;
    roomId: string;
    actorUid: string;
    actorName: string;
    name: string;
    description: string;
    avatarUrl?: string | null;
    category: ChatCategory;
    participantUids: string[];
  }): Promise<void> {
    const cid = params.churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const cleanName = params.name.trim();
    const cleanDesc = params.description.trim();

    const updates: Record<string, any> = {
      [`rhema_chat/${cid}/rooms/${params.roomId}/meta/name`]: cleanName,
      [`rhema_chat/${cid}/rooms/${params.roomId}/meta/description`]: cleanDesc,
      [`rhema_chat/${cid}/rooms/${params.roomId}/meta/avatarUrl`]: params.avatarUrl || null,
      [`rhema_chat/${cid}/rooms/${params.roomId}/meta/updatedAt`]: serverTimestamp(),
    };
    params.participantUids.forEach((uid) => {
      updates[`rhema_chat/${cid}/inbox/${uid}/${params.roomId}/title`] = cleanName;
      updates[`rhema_chat/${cid}/inbox/${uid}/${params.roomId}/avatarUrl`] =
        params.avatarUrl || null;
    });

    await update(ref(db), updates);

    await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_groups')
      .doc(params.roomId)
      .set(
        {
          name: cleanName,
          description: cleanDesc,
          avatarUrl: params.avatarUrl || null,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});

    await emitSystemMessage({
      churchId: cid,
      roomId: params.roomId,
      roomTitle: cleanName,
      roomAvatar: params.avatarUrl || null,
      category: params.category,
      participantUids: params.participantUids,
      text: `${params.actorName} updated group details`,
      systemEvent: {
        action: 'info_updated',
        actorUid: params.actorUid,
        actorName: params.actorName,
      },
    });
  },

  async updateGroupPermissions(params: {
    churchId?: string;
    roomId: string;
    actorUid: string;
    actorName: string;
    roomTitle: string;
    roomAvatar?: string | null;
    category: ChatCategory;
    participantUids: string[];
    onlyAdminsCanSend: boolean;
    onlyAdminsCanEditInfo: boolean;
    onlyAdminsCanAddMembers: boolean;
  }): Promise<void> {
    const cid = params.churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();

    await update(ref(db), {
      [`rhema_chat/${cid}/rooms/${params.roomId}/meta/onlyAdminsCanSend`]: params.onlyAdminsCanSend,
      [`rhema_chat/${cid}/rooms/${params.roomId}/meta/onlyAdminsCanEditInfo`]:
        params.onlyAdminsCanEditInfo,
      [`rhema_chat/${cid}/rooms/${params.roomId}/meta/onlyAdminsCanAddMembers`]:
        params.onlyAdminsCanAddMembers,
      [`rhema_chat/${cid}/rooms/${params.roomId}/meta/updatedAt`]: serverTimestamp(),
    });

    await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_groups')
      .doc(params.roomId)
      .set(
        {
          permissions: {
            onlyAdminsCanSend: params.onlyAdminsCanSend,
            onlyAdminsCanEditInfo: params.onlyAdminsCanEditInfo,
            onlyAdminsCanAddMembers: params.onlyAdminsCanAddMembers,
          },
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});

    await emitSystemMessage({
      churchId: cid,
      roomId: params.roomId,
      roomTitle: params.roomTitle,
      roomAvatar: params.roomAvatar || null,
      category: params.category,
      participantUids: params.participantUids,
      text: `${params.actorName} updated group permissions`,
      systemEvent: {
        action: 'permissions_updated',
        actorUid: params.actorUid,
        actorName: params.actorName,
      },
    });
  },

  async addMembers(params: {
    churchId?: string;
    roomId: string;
    actorUid: string;
    actorName: string;
    roomTitle: string;
    roomAvatar?: string | null;
    category: ChatCategory;
    existingParticipantUids: string[];
    newMembers: { uid: string; name: string }[];
  }): Promise<void> {
    if (params.newMembers.length === 0) return;
    const cid = params.churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const mergedParticipants = Array.from(
      new Set([...params.existingParticipantUids, ...params.newMembers.map((m) => m.uid)])
    );

    const updates: Record<string, any> = {};
    params.newMembers.forEach((m) => {
      updates[`rhema_chat/${cid}/rooms/${params.roomId}/participants/${m.uid}`] = true;
      updates[`rhema_chat/${cid}/inbox/${m.uid}/${params.roomId}`] = {
        roomId: params.roomId,
        roomType: 'group',
        category: params.category,
        title: params.roomTitle,
        avatarUrl: params.roomAvatar || null,
        participantCount: mergedParticipants.length,
        lastMessageText: `${params.actorName} added ${m.name}`,
        lastMessageType: 'system',
        lastMessageAt: serverTimestamp(),
        unreadCount: 0,
        isMuted: false,
        isArchived: false,
        isFavorite: false,
      };
    });
    await update(ref(db), updates);

    await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_groups')
      .doc(params.roomId)
      .set(
        {
          participantIds: mergedParticipants,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});

    const namesText = params.newMembers.map((m) => m.name).join(', ');
    await emitSystemMessage({
      churchId: cid,
      roomId: params.roomId,
      roomTitle: params.roomTitle,
      roomAvatar: params.roomAvatar || null,
      category: params.category,
      participantUids: mergedParticipants,
      text: `${params.actorName} added ${namesText}`,
      systemEvent: {
        action: 'member_added',
        actorUid: params.actorUid,
        actorName: params.actorName,
        targetName: namesText,
      },
    });
  },

  async removeMember(params: {
    churchId?: string;
    roomId: string;
    actorUid: string;
    actorName: string;
    roomTitle: string;
    roomAvatar?: string | null;
    category: ChatCategory;
    existingParticipantUids: string[];
    existingAdminUids: string[];
    targetUid: string;
    targetName: string;
  }): Promise<void> {
    const cid = params.churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const remainingParticipants = params.existingParticipantUids.filter(
      (u) => u !== params.targetUid
    );
    const remainingAdmins = params.existingAdminUids.filter((u) => u !== params.targetUid);

    await update(ref(db), {
      [`rhema_chat/${cid}/rooms/${params.roomId}/participants/${params.targetUid}`]: null,
      [`rhema_chat/${cid}/rooms/${params.roomId}/admins/${params.targetUid}`]: null,
      [`rhema_chat/${cid}/inbox/${params.targetUid}/${params.roomId}`]: null,
    });

    await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_groups')
      .doc(params.roomId)
      .set(
        {
          participantIds: remainingParticipants,
          adminIds: remainingAdmins,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});

    await emitSystemMessage({
      churchId: cid,
      roomId: params.roomId,
      roomTitle: params.roomTitle,
      roomAvatar: params.roomAvatar || null,
      category: params.category,
      participantUids: remainingParticipants,
      text: `${params.actorName} removed ${params.targetName}`,
      systemEvent: {
        action: 'member_removed',
        actorUid: params.actorUid,
        actorName: params.actorName,
        targetUid: params.targetUid,
        targetName: params.targetName,
      },
    });
  },

  async setMemberAdminRole(params: {
    churchId?: string;
    roomId: string;
    actorUid: string;
    actorName: string;
    roomTitle: string;
    roomAvatar?: string | null;
    category: ChatCategory;
    participantUids: string[];
    existingAdminUids: string[];
    targetUid: string;
    targetName: string;
    makeAdmin: boolean;
  }): Promise<void> {
    const cid = params.churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();

    await update(ref(db), {
      [`rhema_chat/${cid}/rooms/${params.roomId}/admins/${params.targetUid}`]: params.makeAdmin
        ? true
        : null,
    });

    const nextAdmins = params.makeAdmin
      ? Array.from(new Set([...params.existingAdminUids, params.targetUid]))
      : params.existingAdminUids.filter((u) => u !== params.targetUid);

    await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_groups')
      .doc(params.roomId)
      .set(
        {
          adminIds: nextAdmins,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});

    await emitSystemMessage({
      churchId: cid,
      roomId: params.roomId,
      roomTitle: params.roomTitle,
      roomAvatar: params.roomAvatar || null,
      category: params.category,
      participantUids: params.participantUids,
      text: params.makeAdmin
        ? `${params.targetName} is now a Group Admin`
        : `${params.targetName} is no longer a Group Admin`,
      systemEvent: {
        action: params.makeAdmin ? 'admin_promoted' : 'admin_demoted',
        actorUid: params.actorUid,
        actorName: params.actorName,
        targetUid: params.targetUid,
        targetName: params.targetName,
      },
    });
  },

  async leaveGroup(params: {
    churchId?: string;
    roomId: string;
    myUid: string;
    myName: string;
    roomTitle: string;
    roomAvatar?: string | null;
    category: ChatCategory;
    existingParticipantUids: string[];
    existingAdminUids: string[];
  }): Promise<void> {
    const cid = params.churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const remainingParticipants = params.existingParticipantUids.filter((u) => u !== params.myUid);
    let nextAdmins = params.existingAdminUids.filter((u) => u !== params.myUid);

    const updates: Record<string, any> = {
      [`rhema_chat/${cid}/rooms/${params.roomId}/participants/${params.myUid}`]: null,
      [`rhema_chat/${cid}/rooms/${params.roomId}/admins/${params.myUid}`]: null,
      [`rhema_chat/${cid}/inbox/${params.myUid}/${params.roomId}`]: null,
    };

    // Promote next remaining participant if the last admin leaves
    let successorUid: string | null = null;
    if (nextAdmins.length === 0 && remainingParticipants.length > 0) {
      successorUid = remainingParticipants[0];
      nextAdmins = [successorUid];
      updates[`rhema_chat/${cid}/rooms/${params.roomId}/admins/${successorUid}`] = true;
    }

    if (remainingParticipants.length > 0) {
      await emitSystemMessage({
        churchId: cid,
        roomId: params.roomId,
        roomTitle: params.roomTitle,
        roomAvatar: params.roomAvatar || null,
        category: params.category,
        participantUids: remainingParticipants,
        text: `${params.myName} left the group`,
        systemEvent: {
          action: 'member_left',
          actorUid: params.myUid,
          actorName: params.myName,
          targetUid: successorUid || undefined,
        },
      });
    }

    await update(ref(db), updates);

    await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('chat_groups')
      .doc(params.roomId)
      .set(
        {
          participantIds: remainingParticipants,
          adminIds: nextAdmins,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});
  },
};
