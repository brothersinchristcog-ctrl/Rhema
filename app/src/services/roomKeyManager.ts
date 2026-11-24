import firestore from '@react-native-firebase/firestore';
import { get, ref, set, update, type Database } from 'firebase/database';
import { RHEMA_ROOT_COLLECTION } from '../constants/ChurchConfig';
import { e2eeService } from './e2eeService';

export type RoomScope = 'church' | 'matrimony' | 'celebrations';

export interface RtdbRoomContext {
  scope: 'church' | 'matrimony';
  rtdb: Database;
  churchId?: string;
  roomId: string;
}

export interface CelebrationsRoomContext {
  scope: 'celebrations';
  churchId: string;
  dateId: string;
}

export type AnyRoomContext = RtdbRoomContext | CelebrationsRoomContext;

function buildAadScope(ctx: AnyRoomContext): string {
  if (ctx.scope === 'celebrations') {
    return `celebrations:${ctx.churchId}:${ctx.dateId}`;
  }
  if (ctx.scope === 'church') {
    return `church:${ctx.churchId || 'rhema'}:${ctx.roomId}`;
  }
  return `matrimony:${ctx.roomId}`;
}

function getRtdbE2eeBasePath(ctx: RtdbRoomContext): string {
  if (ctx.scope === 'church') {
    const cid = ctx.churchId || 'rhema';
    return `rhema_chat/${cid}/rooms/${ctx.roomId}/e2ee`;
  }
  return `matrimony_chats/${ctx.roomId}/e2ee`;
}

class RoomKeyManager {
  // key format: `${myUid}:${aadScope}:${keyId}` -> 32-byte binary AES key
  private aesKeyCache = new Map<string, string>();
  private inflightKeyLoads = new Map<string, Promise<string | null>>();
  private activeKeyIdCache = new Map<string, { keyId: string; cachedAt: number }>();

  public clearCache(): void {
    this.aesKeyCache.clear();
    this.inflightKeyLoads.clear();
    this.activeKeyIdCache.clear();
  }

  private aesCacheKey(myUid: string, ctx: AnyRoomContext, keyId: string): string {
    return `${myUid}:${buildAadScope(ctx)}:${keyId}`;
  }

  public getAadScope(ctx: AnyRoomContext): string {
    return buildAadScope(ctx);
  }

  private async fetchKeyBytes(
    ctx: AnyRoomContext,
    myUid: string,
    keyId: string
  ): Promise<string | null> {
    if (!myUid || !keyId) return null;
    const cKey = this.aesCacheKey(myUid, ctx, keyId);
    const hit = this.aesKeyCache.get(cKey);
    if (hit) return hit;

    const existingPromise = this.inflightKeyLoads.get(cKey);
    if (existingPromise) return existingPromise;

    const promise = (async () => {
      try {
        await e2eeService.initializeForUser(myUid);
        if (e2eeService.getState().status !== 'ready') return null;

        let wrappedB64: string | null = null;
        if (ctx.scope === 'celebrations') {
          const envSnap = await firestore()
            .collection(RHEMA_ROOT_COLLECTION)
            .doc(ctx.churchId)
            .collection('live_celebrations')
            .doc(ctx.dateId)
            .collection('keyEnvelopes')
            .doc(`${keyId}_${myUid}`)
            .get();
          wrappedB64 = envSnap.exists ? String(envSnap.data()?.wrappedKey || '') : null;
        } else {
          const base = getRtdbE2eeBasePath(ctx);
          const snap = await get(ref(ctx.rtdb, `${base}/keys/${keyId}/${myUid}`));
          wrappedB64 = snap.exists() ? String(snap.val() || '') : null;
        }

        if (!wrappedB64) return null;
        const aesBytes = e2eeService.unwrapAesKey(wrappedB64);
        if (!aesBytes) return null;

        this.aesKeyCache.set(cKey, aesBytes);
        return aesBytes;
      } catch {
        return null;
      } finally {
        this.inflightKeyLoads.delete(cKey);
      }
    })();

    this.inflightKeyLoads.set(cKey, promise);
    return promise;
  }

  private async writeWrappedEnvelopesRtdb(
    ctx: RtdbRoomContext,
    keyId: string,
    wrapped: Record<string, string>,
    missingUids: string[],
    setAsCurrent: boolean
  ): Promise<void> {
    const base = getRtdbE2eeBasePath(ctx);
    const updates: Record<string, any> = {};
    Object.entries(wrapped).forEach(([uid, cipherB64]) => {
      updates[`${base}/keys/${keyId}/${uid}`] = cipherB64;
      updates[`${base}/pending/${keyId}/${uid}`] = null;
    });
    missingUids.forEach((uid) => {
      updates[`${base}/pending/${keyId}/${uid}`] = true;
    });
    if (setAsCurrent) {
      updates[`${base}/meta/currentKeyId`] = keyId;
      updates[`${base}/meta/updatedAt`] = Date.now();
    }
    if (Object.keys(updates).length > 0) {
      await update(ref(ctx.rtdb), updates);
    }
  }

  public async getOrCreateRoomSendKey(
    ctx: AnyRoomContext,
    myUid: string,
    participantUids: string[]
  ): Promise<{ keyId: string; keyBytes: string }> {
    const state = await e2eeService.initializeForUser(myUid);
    if (state.status === 'needs_pin_unlock') {
      throw new Error('PIN_UNLOCK_REQUIRED');
    }
    if (state.status !== 'ready') {
      throw new Error('Encryption keys are still initializing. Please try again.');
    }

    const allParticipants = Array.from(
      new Set([myUid, ...participantUids].map((u) => String(u || '').trim()).filter(Boolean))
    );

    if (ctx.scope === 'celebrations') {
      return this.getOrCreateCelebrationsKey(ctx, myUid, allParticipants);
    }

    const base = getRtdbE2eeBasePath(ctx);
    const metaSnap = await get(ref(ctx.rtdb, `${base}/meta/currentKeyId`)).catch(() => null);
    const existingKeyId = metaSnap && metaSnap.exists() ? String(metaSnap.val() || '') : '';

    if (existingKeyId) {
      const existingBytes = await this.fetchKeyBytes(ctx, myUid, existingKeyId);
      if (existingBytes) {
        this.activeKeyIdCache.set(`${myUid}:${buildAadScope(ctx)}`, {
          keyId: existingKeyId,
          cachedAt: Date.now(),
        });
        // Opportunistically wrap for any participants missing from this key epoch
        this.backfillRtdbMissingKeys(ctx, existingKeyId, existingBytes, allParticipants).catch(
          () => {}
        );
        return { keyId: existingKeyId, keyBytes: existingBytes };
      }
    }

    // Create a fresh key epoch wrapped for every participant with a public key
    const newKeyId = `k_${Date.now().toString(36)}_${e2eeService.randomHex(4)}`;
    const newKeyBytes = e2eeService.generateRoomAesKeyBytes();
    const { wrapped, missingUids } = await e2eeService.wrapAesKeyForUsers(
      newKeyBytes,
      allParticipants
    );
    await this.writeWrappedEnvelopesRtdb(ctx, newKeyId, wrapped, missingUids, true);

    this.aesKeyCache.set(this.aesCacheKey(myUid, ctx, newKeyId), newKeyBytes);
    this.activeKeyIdCache.set(`${myUid}:${buildAadScope(ctx)}`, {
      keyId: newKeyId,
      cachedAt: Date.now(),
    });
    return { keyId: newKeyId, keyBytes: newKeyBytes };
  }

  private async backfillRtdbMissingKeys(
    ctx: RtdbRoomContext,
    keyId: string,
    keyBytes: string,
    participantUids: string[]
  ): Promise<void> {
    const base = getRtdbE2eeBasePath(ctx);
    const [keysSnap, reqSnap, pendingSnap] = await Promise.all([
      get(ref(ctx.rtdb, `${base}/keys/${keyId}`)).catch(() => null),
      get(ref(ctx.rtdb, `${base}/requests/${keyId}`)).catch(() => null),
      get(ref(ctx.rtdb, `${base}/pending/${keyId}`)).catch(() => null),
    ]);

    const existingKeys = (keysSnap?.val() || {}) as Record<string, any>;
    const requests = (reqSnap?.val() || {}) as Record<string, any>;
    const pending = (pendingSnap?.val() || {}) as Record<string, any>;

    const candidates = new Set<string>();
    participantUids.forEach((u) => {
      if (!existingKeys[u]) candidates.add(u);
    });
    Object.keys(requests).forEach((u) => {
      if (requests[u] && !existingKeys[u]) candidates.add(u);
    });
    Object.keys(pending).forEach((u) => {
      if (pending[u] && !existingKeys[u]) candidates.add(u);
    });

    if (candidates.size === 0) return;

    const { wrapped } = await e2eeService.wrapAesKeyForUsers(keyBytes, Array.from(candidates));
    const updates: Record<string, any> = {};
    Object.entries(wrapped).forEach(([uid, cipherB64]) => {
      updates[`${base}/keys/${keyId}/${uid}`] = cipherB64;
      updates[`${base}/pending/${keyId}/${uid}`] = null;
      updates[`${base}/requests/${keyId}/${uid}`] = null;
    });
    if (Object.keys(updates).length > 0) {
      await update(ref(ctx.rtdb), updates);
    }
  }

  public async fulfillPendingRtdbRoomKeys(
    ctx: RtdbRoomContext,
    myUid: string,
    participantUids: string[]
  ): Promise<void> {
    try {
      const base = getRtdbE2eeBasePath(ctx);
      const metaSnap = await get(ref(ctx.rtdb, `${base}/meta/currentKeyId`));
      const keyId = metaSnap.exists() ? String(metaSnap.val() || '') : '';
      if (!keyId) return;
      const keyBytes = await this.fetchKeyBytes(ctx, myUid, keyId);
      if (!keyBytes) return;
      await this.backfillRtdbMissingKeys(ctx, keyId, keyBytes, participantUids);
    } catch {
      // Non-fatal background sync
    }
  }

  public async addParticipantsToRtdbRoomKey(
    ctx: RtdbRoomContext,
    myUid: string,
    newParticipantUids: string[]
  ): Promise<void> {
    if (newParticipantUids.length === 0) return;
    const base = getRtdbE2eeBasePath(ctx);
    const metaSnap = await get(ref(ctx.rtdb, `${base}/meta/currentKeyId`)).catch(() => null);
    const keyId = metaSnap && metaSnap.exists() ? String(metaSnap.val() || '') : '';
    if (!keyId) {
      await this.getOrCreateRoomSendKey(ctx, myUid, newParticipantUids);
      return;
    }
    const keyBytes = await this.fetchKeyBytes(ctx, myUid, keyId);
    if (!keyBytes) {
      await this.getOrCreateRoomSendKey(ctx, myUid, newParticipantUids);
      return;
    }
    const { wrapped, missingUids } = await e2eeService.wrapAesKeyForUsers(
      keyBytes,
      newParticipantUids
    );
    await this.writeWrappedEnvelopesRtdb(ctx, keyId, wrapped, missingUids, false);
  }

  /**
   * Rotates to a new AES-256 room key epoch when a participant is removed or leaves a group
   * so excluded members cannot decrypt future messages.
   */
  public async rotateRtdbRoomKey(
    ctx: RtdbRoomContext,
    actorUid: string,
    remainingParticipantUids: string[]
  ): Promise<void> {
    const cleanRemaining = Array.from(
      new Set(remainingParticipantUids.map((u) => String(u || '').trim()).filter(Boolean))
    );
    if (cleanRemaining.length === 0) return;

    const newKeyId = `k_${Date.now().toString(36)}_${e2eeService.randomHex(4)}`;
    const newKeyBytes = e2eeService.generateRoomAesKeyBytes();
    const { wrapped, missingUids } = await e2eeService.wrapAesKeyForUsers(
      newKeyBytes,
      cleanRemaining
    );
    await this.writeWrappedEnvelopesRtdb(ctx, newKeyId, wrapped, missingUids, true);

    if (cleanRemaining.includes(actorUid)) {
      this.aesKeyCache.set(this.aesCacheKey(actorUid, ctx, newKeyId), newKeyBytes);
      this.activeKeyIdCache.set(`${actorUid}:${buildAadScope(ctx)}`, {
        keyId: newKeyId,
        cachedAt: Date.now(),
      });
    }
  }

  private async getOrCreateCelebrationsKey(
    ctx: CelebrationsRoomContext,
    myUid: string,
    seedUids: string[]
  ): Promise<{ keyId: string; keyBytes: string }> {
    const roomDocRef = firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(ctx.churchId)
      .collection('live_celebrations')
      .doc(ctx.dateId);

    const metaSnap = await roomDocRef.collection('e2eeMeta').doc('current').get().catch(() => null);
    const existingKeyId = metaSnap && metaSnap.exists ? String(metaSnap.data()?.currentKeyId || '') : '';

    if (existingKeyId) {
      const existingBytes = await this.fetchKeyBytes(ctx, myUid, existingKeyId);
      if (existingBytes) {
        this.fulfillCelebrationsKeyRequests(ctx, myUid, existingKeyId, existingBytes).catch(
          () => {}
        );
        return { keyId: existingKeyId, keyBytes: existingBytes };
      }
    }

    // Gather all church members who have published E2EE keys so everyone in this church room gets the key
    const [membersSnap, keysSnap] = await Promise.all([
      firestore()
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(ctx.churchId)
        .collection('members')
        .get()
        .catch(() => null),
      firestore().collection('user_e2ee_keys').get().catch(() => null),
    ]);

    const churchMemberUids = new Set<string>(seedUids);
    if (membersSnap) {
      membersSnap.docs.forEach((d) => {
        const m = d.data() || {};
        if (m.status === 'Left' || m.status === 'Rejected' || m.status === 'Inactive') return;
        const resolved = String(m.authUid || m.uid || d.id).trim();
        if (resolved) churchMemberUids.add(resolved);
      });
    }

    const recipientsWithKeys = new Set<string>([myUid]);
    if (keysSnap) {
      keysSnap.docs.forEach((d) => {
        if (churchMemberUids.has(d.id) && d.data()?.publicKeyPem) {
          recipientsWithKeys.add(d.id);
        }
      });
    }

    const newKeyId = `k_${Date.now().toString(36)}_${e2eeService.randomHex(4)}`;
    const newKeyBytes = e2eeService.generateRoomAesKeyBytes();
    const { wrapped } = await e2eeService.wrapAesKeyForUsers(
      newKeyBytes,
      Array.from(recipientsWithKeys)
    );

    const batch = firestore().batch();
    Object.entries(wrapped).forEach(([uid, cipherB64]) => {
      batch.set(roomDocRef.collection('keyEnvelopes').doc(`${newKeyId}_${uid}`), {
        keyId: newKeyId,
        uid,
        wrappedKey: cipherB64,
        updatedAt: Date.now(),
      });
    });
    batch.set(
      roomDocRef.collection('e2eeMeta').doc('current'),
      {
        currentKeyId: newKeyId,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    await batch.commit();

    this.aesKeyCache.set(this.aesCacheKey(myUid, ctx, newKeyId), newKeyBytes);
    return { keyId: newKeyId, keyBytes: newKeyBytes };
  }

  public async fulfillCelebrationsKeyRequests(
    ctx: CelebrationsRoomContext,
    myUid: string,
    keyIdOverride?: string,
    keyBytesOverride?: string
  ): Promise<void> {
    try {
      const roomDocRef = firestore()
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(ctx.churchId)
        .collection('live_celebrations')
        .doc(ctx.dateId);

      const reqSnap = await roomDocRef.collection('keyRequests').get();
      if (reqSnap.empty) return;

      let keyId = keyIdOverride || '';
      if (!keyId) {
        const metaSnap = await roomDocRef.collection('e2eeMeta').doc('current').get();
        keyId = metaSnap.exists ? String(metaSnap.data()?.currentKeyId || '') : '';
      }
      if (!keyId) return;

      const keyBytes = keyBytesOverride || (await this.fetchKeyBytes(ctx, myUid, keyId));
      if (!keyBytes) return;

      const requesterUids = reqSnap.docs.map((d) => d.id).filter(Boolean);
      if (requesterUids.length === 0) return;

      const { wrapped } = await e2eeService.wrapAesKeyForUsers(keyBytes, requesterUids);
      const batch = firestore().batch();
      Object.entries(wrapped).forEach(([uid, cipherB64]) => {
        batch.set(roomDocRef.collection('keyEnvelopes').doc(`${keyId}_${uid}`), {
          keyId,
          uid,
          wrappedKey: cipherB64,
          updatedAt: Date.now(),
        });
        batch.delete(roomDocRef.collection('keyRequests').doc(uid));
      });
      if (Object.keys(wrapped).length > 0) {
        await batch.commit();
      }
    } catch {
      // Non-fatal
    }
  }

  public async requestMissingRoomKey(
    ctx: AnyRoomContext,
    myUid: string,
    keyId: string
  ): Promise<void> {
    if (!myUid || !keyId) return;
    try {
      if (ctx.scope === 'celebrations') {
        await firestore()
          .collection(RHEMA_ROOT_COLLECTION)
          .doc(ctx.churchId)
          .collection('live_celebrations')
          .doc(ctx.dateId)
          .collection('keyRequests')
          .doc(myUid)
          .set({ uid: myUid, keyId, requestedAt: Date.now() }, { merge: true });
      } else {
        const base = getRtdbE2eeBasePath(ctx);
        await set(ref(ctx.rtdb, `${base}/requests/${keyId}/${myUid}`), true);
      }
    } catch {
      // Non-fatal
    }
  }

  public async encryptString(
    ctx: AnyRoomContext,
    myUid: string,
    participantUids: string[],
    plaintext: string,
    existingKey?: { keyId: string; keyBytes: string }
  ): Promise<{ cipherText: string; key: { keyId: string; keyBytes: string } }> {
    const key = existingKey || (await this.getOrCreateRoomSendKey(ctx, myUid, participantUids));
    const cipherText = e2eeService.encryptTextWithKey(
      plaintext,
      key.keyBytes,
      key.keyId,
      buildAadScope(ctx)
    );
    return { cipherText, key };
  }

  public async decryptString(
    ctx: AnyRoomContext,
    myUid: string,
    value?: string | null
  ): Promise<{ text: string; encrypted: boolean; lockedReason?: 'pin' | 'pending_key' }> {
    const raw = typeof value === 'string' ? value : '';
    if (!raw || !e2eeService.isEncryptedPayload(raw)) {
      return { text: raw, encrypted: false };
    }

    const parsed = e2eeService.parseEncryptedPayload(raw);
    if (!parsed) {
      return { text: '🔒 Encrypted message', encrypted: true, lockedReason: 'pending_key' };
    }

    await e2eeService.initializeForUser(myUid);
    const e2eeState = e2eeService.getState();
    if (e2eeState.status === 'needs_pin_unlock') {
      return {
        text: '🔒 Encrypted message (Enter Backup PIN to unlock)',
        encrypted: true,
        lockedReason: 'pin',
      };
    }

    const aesBytes = await this.fetchKeyBytes(ctx, myUid, parsed.keyId);
    if (!aesBytes) {
      this.requestMissingRoomKey(ctx, myUid, parsed.keyId).catch(() => {});
      return {
        text: '🔒 Encrypted message (Syncing key...)',
        encrypted: true,
        lockedReason: 'pending_key',
      };
    }

    const plain = e2eeService.decryptTextWithKey(raw, aesBytes, buildAadScope(ctx));
    if (plain === null) {
      return {
        text: '🔒 Unable to decrypt message with this key',
        encrypted: true,
        lockedReason: 'pending_key',
      };
    }
    return { text: plain, encrypted: true };
  }
}

export const roomKeyManager = new RoomKeyManager();

// Automatically clear cached symmetric keys on sign-out or user switch
e2eeService.subscribeState((snap) => {
  if (snap.status === 'uninitialized') {
    roomKeyManager.clearCache();
  }
});
