import AsyncStorage from '@react-native-async-storage/async-storage';
import type forgeType from 'node-forge';
import { firestore, FieldValue } from './firebaseConfig';

let _expoCryptoMod: typeof import('expo-crypto') | null | undefined;
function getExpoCrypto() {
  if (_expoCryptoMod !== undefined) return _expoCryptoMod;
  try {
    _expoCryptoMod = require('expo-crypto');
  } catch {
    _expoCryptoMod = null;
  }
  return _expoCryptoMod;
}

function getSafeRandomBytes(count: number): Uint8Array {
  const out = new Uint8Array(count);
  try {
    const expoCrypto = getExpoCrypto();
    if (expoCrypto?.getRandomBytes) {
      let offset = 0;
      while (offset < count) {
        const chunkLen = Math.min(1024, count - offset);
        const chunk = expoCrypto.getRandomBytes(chunkLen);
        out.set(chunk, offset);
        offset += chunkLen;
      }
      return out;
    }
  } catch {
    // Fall through to WebCrypto / Math.random entropy mix
  }
  const gCrypto = (globalThis as any)?.crypto;
  if (gCrypto && typeof gCrypto.getRandomValues === 'function') {
    let offset = 0;
    while (offset < count) {
      const chunkLen = Math.min(65536, count - offset);
      gCrypto.getRandomValues(out.subarray(offset, offset + chunkLen));
      offset += chunkLen;
    }
    return out;
  }
  for (let i = 0; i < count; i++) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

let _forgeMod: typeof forgeType | null = null;
function getForge(): typeof forgeType {
  if (!_forgeMod) {
    _forgeMod = require('node-forge');
    try {
      const seedBytesFn = (needed: number) => {
        const arr = getSafeRandomBytes(needed);
        let s = '';
        for (let i = 0; i < arr.length; i++) {
          s += String.fromCharCode(arr[i]);
        }
        return s;
      };
      if (_forgeMod!.random) {
        (_forgeMod!.random as any).seedFileSync = seedBytesFn;
        (_forgeMod!.random as any).seedFile = (
          needed: number,
          cb: (err: any, bytes?: string) => void
        ) => {
          try {
            cb(null, seedBytesFn(needed));
          } catch (e) {
            cb(e);
          }
        };
      }
    } catch {
      // Non-fatal
    }
  }
  return _forgeMod!;
}

export const E2EE_PREFIX = 'e2ee:v1:';
const PBKDF2_ITERATIONS = 50000;
const PRIV_KEY_STORAGE_PREFIX = '@rhema_e2ee_priv_';
const PUB_KEY_STORAGE_PREFIX = '@rhema_e2ee_pub_';
const BACKUP_FLAG_PREFIX = '@rhema_e2ee_backup_flag_';
const BACKUP_DISMISSED_PREFIX = '@rhema_e2ee_backup_dismissed_';

export type E2EEStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'needs_pin_unlock'
  | 'error';

export interface E2EEStateSnapshot {
  uid: string | null;
  status: E2EEStatus;
  hasBackup: boolean;
  needsBackupPrompt: boolean;
  fingerprint: string;
}

export interface ParsedE2EEEnvelope {
  version: 'v1';
  keyId: string;
  ivBytes: string;
  tagBytes: string;
  ctBytes: string;
}

interface BackupBlob {
  version: number;
  kdf: string;
  iterations: number;
  saltB64: string;
  ivB64: string;
  tagB64: string;
  ciphertextB64: string;
  updatedAt: number;
}

const PUBLIC_KEY_CACHE_TTL_MS = 5 * 60 * 1000;

class E2EEService {
  private currentUid: string | null = null;
  private status: E2EEStatus = 'uninitialized';
  private privateKeyPem: string | null = null;
  private publicKeyPem: string | null = null;
  private privateKeyObj: forgeType.pki.rsa.PrivateKey | null = null;
  private publicKeyObj: forgeType.pki.rsa.PublicKey | null = null;
  private hasBackup = false;
  private backupDismissedThisSession = false;
  private fingerprint = '';
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<(state: E2EEStateSnapshot) => void>();
  private publicKeyCache = new Map<
    string,
    { pem: string; key: forgeType.pki.rsa.PublicKey; fetchedAt: number }
  >();
  private lastEntropySeedAt = 0;

  private seedPrngIfNeeded(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastEntropySeedAt < 30000) return;
    try {
      const randomBytes = getSafeRandomBytes(32);
      let binary = '';
      for (let i = 0; i < randomBytes.length; i++) {
        binary += String.fromCharCode(randomBytes[i]);
      }
      getForge().random.collect(binary);
      this.lastEntropySeedAt = now;
    } catch {
      // ignore PRNG collect failure
    }
  }

  public randomBinaryBytes(length: number): string {
    this.seedPrngIfNeeded();
    const arr = getSafeRandomBytes(length);
    let out = '';
    for (let i = 0; i < arr.length; i++) {
      out += String.fromCharCode(arr[i]);
    }
    return out;
  }

  public randomHex(byteLength = 6): string {
    const arr = getSafeRandomBytes(byteLength);
    let hex = '';
    for (let i = 0; i < arr.length; i++) {
      hex += arr[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  private computeFingerprint(pubPem: string): string {
    try {
      const forge = getForge();
      const md = forge.md.sha256.create();
      md.update(pubPem.trim(), 'utf8');
      const hex = md.digest().toHex().toUpperCase();
      return hex.slice(0, 32).match(/.{1,4}/g)?.join(' ') || hex.slice(0, 16);
    } catch {
      return '';
    }
  }

  public getState(): E2EEStateSnapshot {
    return {
      uid: this.currentUid,
      status: this.status,
      hasBackup: this.hasBackup,
      needsBackupPrompt:
        Boolean(this.currentUid) &&
        this.status === 'ready' &&
        !this.hasBackup &&
        !this.backupDismissedThisSession,
      fingerprint: this.fingerprint,
    };
  }

  private emitState(): void {
    const snap = this.getState();
    this.listeners.forEach((cb) => {
      try {
        cb(snap);
      } catch {
        // ignore listener failure
      }
    });
  }

  public subscribeState(cb: (state: E2EEStateSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => {
      this.listeners.delete(cb);
    };
  }

  public dismissBackupPromptTemporarily(): void {
    this.backupDismissedThisSession = true;
    if (this.currentUid) {
      AsyncStorage.setItem(
        `${BACKUP_DISMISSED_PREFIX}${this.currentUid}`,
        String(Date.now())
      ).catch(() => {});
    }
    this.emitState();
  }

  public clearSessionMemory(): void {
    this.currentUid = null;
    this.status = 'uninitialized';
    this.privateKeyPem = null;
    this.publicKeyPem = null;
    this.privateKeyObj = null;
    this.publicKeyObj = null;
    this.hasBackup = false;
    this.backupDismissedThisSession = false;
    this.fingerprint = '';
    this.initPromise = null;
    this.emitState();
  }

  public async initializeForUser(uid: string): Promise<E2EEStateSnapshot> {
    if (!uid) {
      this.clearSessionMemory();
      return this.getState();
    }

    if (this.currentUid === uid && this.status === 'ready' && this.privateKeyObj) {
      return this.getState();
    }

    if (this.currentUid === uid && this.initPromise) {
      await this.initPromise;
      return this.getState();
    }

    if (this.currentUid !== uid) {
      this.clearSessionMemory();
      this.currentUid = uid;
    }

    this.status = 'initializing';
    this.emitState();

    this.initPromise = this.runInit(uid).finally(() => {
      this.initPromise = null;
    });
    await this.initPromise;
    return this.getState();
  }

  private async runInit(uid: string): Promise<void> {
    try {
      this.seedPrngIfNeeded(true);

      const [localPriv, localPub, localBackupFlag, dismissedAtStr] = await Promise.all([
        AsyncStorage.getItem(`${PRIV_KEY_STORAGE_PREFIX}${uid}`),
        AsyncStorage.getItem(`${PUB_KEY_STORAGE_PREFIX}${uid}`),
        AsyncStorage.getItem(`${BACKUP_FLAG_PREFIX}${uid}`),
        AsyncStorage.getItem(`${BACKUP_DISMISSED_PREFIX}${uid}`),
      ]);

      if (dismissedAtStr) {
        const ts = parseInt(dismissedAtStr, 10);
        if (!Number.isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000) {
          this.backupDismissedThisSession = true;
        }
      }

      if (localPriv && localPub) {
        try {
          const forge = getForge();
          const privObj = forge.pki.privateKeyFromPem(localPriv);
          const pubObj = forge.pki.publicKeyFromPem(localPub);
          this.privateKeyPem = localPriv;
          this.publicKeyPem = localPub;
          this.privateKeyObj = privObj;
          this.publicKeyObj = pubObj;
          this.fingerprint = this.computeFingerprint(localPub);
          this.hasBackup = localBackupFlag === 'true';
          this.status = 'ready';
          this.emitState();

          // Sync public key & backup flag cleanly in background
          this.syncCloudKeyMetadata(uid, localPub).catch(() => {});
          return;
        } catch {
          // Corrupted local key; fall through to cloud backup / regeneration
        }
      }

      // Check Firestore for existing encrypted backup or key metadata
      const [keyDocSnap, backupSnap] = await Promise.all([
        firestore().collection('user_e2ee_keys').doc(uid).get().catch(() => null),
        firestore()
          .collection('user_e2ee_keys')
          .doc(uid)
          .collection('private')
          .doc('backup')
          .get()
          .catch(() => null),
      ]);

      const keyData = keyDocSnap && keyDocSnap.exists ? keyDocSnap.data() : null;
      const hasCloudBackup = Boolean(
        (backupSnap && backupSnap.exists && backupSnap.data()?.ciphertextB64) ||
          keyData?.hasBackup
      );

      if (hasCloudBackup) {
        // User has an encrypted key backup on cloud -> prompt for Backup PIN to restore history
        this.hasBackup = true;
        if (typeof keyData?.publicKeyPem === 'string' && keyData.publicKeyPem.trim()) {
          this.publicKeyPem = keyData.publicKeyPem;
          this.fingerprint = this.computeFingerprint(keyData.publicKeyPem);
        }
        this.status = 'needs_pin_unlock';
        this.emitState();
        return;
      }

      // First-time user (or device without backup): generate fresh RSA-2048 identity keypair
      await this.generateAndPersistFreshKeyPair(uid);
    } catch (err) {
      console.warn('E2EE initialization warning:', err);
      this.status = 'error';
      this.emitState();
    }
  }

  private async syncCloudKeyMetadata(uid: string, localPubPem: string): Promise<void> {
    const docRef = firestore().collection('user_e2ee_keys').doc(uid);
    const snap = await docRef.get().catch(() => null);
    const existing = snap && snap.exists ? snap.data() : null;

    if (existing?.hasBackup && !this.hasBackup) {
      this.hasBackup = true;
      await AsyncStorage.setItem(`${BACKUP_FLAG_PREFIX}${uid}`, 'true').catch(() => {});
      this.emitState();
    }

    if (!existing || existing.publicKeyPem !== localPubPem) {
      await docRef.set(
        {
          uid,
          version: 1,
          algorithm: 'RSA-OAEP-SHA256',
          publicKeyPem: localPubPem,
          keyFingerprint: this.computeFingerprint(localPubPem),
          hasBackup: this.hasBackup,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  private async generateAndPersistFreshKeyPair(uid: string): Promise<void> {
    this.seedPrngIfNeeded(true);
    const forge = getForge();
    const yieldDelay =
      typeof process === 'undefined' || !process?.versions?.node ? 12 : 0;
    const keypair = await new Promise<forgeType.pki.rsa.KeyPair>((resolve, reject) => {
      const origSetImmediate = forge.util.setImmediate;
      forge.util.setImmediate = ((cb: (...args: any[]) => void, ...args: any[]) =>
        setTimeout(() => cb(...args), yieldDelay)) as any;
      try {
        forge.pki.rsa.generateKeyPair({ bits: 2048 }, (err, kp) => {
          forge.util.setImmediate = origSetImmediate;
          if (err || !kp) reject(err || new Error('RSA key generation failed'));
          else resolve(kp);
        });
      } catch (syncErr) {
        forge.util.setImmediate = origSetImmediate;
        reject(syncErr);
      }
    });

    const pubPem = forge.pki.publicKeyToPem(keypair.publicKey);
    const privPem = forge.pki.privateKeyToPem(keypair.privateKey);
    const fp = this.computeFingerprint(pubPem);

    await Promise.all([
      AsyncStorage.setItem(`${PRIV_KEY_STORAGE_PREFIX}${uid}`, privPem),
      AsyncStorage.setItem(`${PUB_KEY_STORAGE_PREFIX}${uid}`, pubPem),
      AsyncStorage.setItem(`${BACKUP_FLAG_PREFIX}${uid}`, 'false'),
    ]);

    this.privateKeyPem = privPem;
    this.publicKeyPem = pubPem;
    this.privateKeyObj = keypair.privateKey;
    this.publicKeyObj = keypair.publicKey;
    this.fingerprint = fp;
    this.hasBackup = false;
    this.status = 'ready';

    this.publicKeyCache.set(uid, {
      pem: pubPem,
      key: keypair.publicKey,
      fetchedAt: Date.now(),
    });

    await firestore()
      .collection('user_e2ee_keys')
      .doc(uid)
      .set(
        {
          uid,
          version: 1,
          algorithm: 'RSA-OAEP-SHA256',
          publicKeyPem: pubPem,
          keyFingerprint: fp,
          hasBackup: false,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    this.emitState();
  }

  public async setBackupPin(
    uid: string,
    pinOrPassphrase: string
  ): Promise<{ ok: boolean; error?: string }> {
    const cleanPin = pinOrPassphrase.trim();
    if (cleanPin.length < 6) {
      return { ok: false, error: 'PIN / passphrase must be at least 6 characters.' };
    }
    if (this.currentUid !== uid || !this.privateKeyPem) {
      await this.initializeForUser(uid);
    }
    if (!this.privateKeyPem || !this.publicKeyPem) {
      return { ok: false, error: 'Encryption key is not ready yet. Please try again.' };
    }

    try {
      this.seedPrngIfNeeded(true);
      const forge = getForge();
      const saltBytes = this.randomBinaryBytes(16);
      const ivBytes = this.randomBinaryBytes(12);
      const derivedKey = forge.pkcs5.pbkdf2(
        cleanPin,
        saltBytes,
        PBKDF2_ITERATIONS,
        32,
        'sha256'
      );

      const cipher = forge.cipher.createCipher('AES-GCM', derivedKey);
      cipher.start({
        iv: ivBytes,
        additionalData: `rhema-backup-v1:${uid}`,
        tagLength: 128,
      });
      cipher.update(forge.util.createBuffer(this.privateKeyPem, 'utf8'));
      const finished = cipher.finish();
      if (!finished) {
        return { ok: false, error: 'Failed to encrypt private key backup.' };
      }

      const backupPayload: BackupBlob = {
        version: 1,
        kdf: 'PBKDF2-SHA256',
        iterations: PBKDF2_ITERATIONS,
        saltB64: forge.util.encode64(saltBytes),
        ivB64: forge.util.encode64(ivBytes),
        tagB64: forge.util.encode64(cipher.mode.tag.getBytes()),
        ciphertextB64: forge.util.encode64(cipher.output.getBytes()),
        updatedAt: Date.now(),
      };

      const userKeyDoc = firestore().collection('user_e2ee_keys').doc(uid);
      await Promise.all([
        userKeyDoc.collection('private').doc('backup').set(backupPayload),
        userKeyDoc.set(
          {
            uid,
            version: 1,
            algorithm: 'RSA-OAEP-SHA256',
            publicKeyPem: this.publicKeyPem,
            keyFingerprint: this.fingerprint,
            hasBackup: true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        AsyncStorage.setItem(`${BACKUP_FLAG_PREFIX}${uid}`, 'true'),
        AsyncStorage.removeItem(`${BACKUP_DISMISSED_PREFIX}${uid}`),
      ]);

      this.hasBackup = true;
      this.backupDismissedThisSession = false;
      this.emitState();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Unable to save encrypted backup.' };
    }
  }

  public async unlockWithBackupPin(
    uid: string,
    pinOrPassphrase: string
  ): Promise<{ ok: boolean; error?: string }> {
    const cleanPin = pinOrPassphrase.trim();
    if (!cleanPin) {
      return { ok: false, error: 'Please enter your Backup PIN.' };
    }

    try {
      const [backupSnap, keySnap] = await Promise.all([
        firestore()
          .collection('user_e2ee_keys')
          .doc(uid)
          .collection('private')
          .doc('backup')
          .get(),
        firestore().collection('user_e2ee_keys').doc(uid).get(),
      ]);

      if (!backupSnap.exists || !backupSnap.data()?.ciphertextB64) {
        return { ok: false, error: 'No encrypted key backup was found for this account.' };
      }

      const forge = getForge();
      const blob = backupSnap.data() as BackupBlob;
      const saltBytes = forge.util.decode64(blob.saltB64);
      const ivBytes = forge.util.decode64(blob.ivB64);
      const tagBytes = forge.util.decode64(blob.tagB64);
      const ctBytes = forge.util.decode64(blob.ciphertextB64);
      const iterations = Number(blob.iterations) || PBKDF2_ITERATIONS;

      const derivedKey = forge.pkcs5.pbkdf2(cleanPin, saltBytes, iterations, 32, 'sha256');
      const decipher = forge.cipher.createDecipher('AES-GCM', derivedKey);
      decipher.start({
        iv: ivBytes,
        additionalData: `rhema-backup-v1:${uid}`,
        tagLength: 128,
        tag: forge.util.createBuffer(tagBytes),
      });
      decipher.update(forge.util.createBuffer(ctBytes));
      if (!decipher.finish()) {
        return { ok: false, error: 'Incorrect Backup PIN. Please try again.' };
      }

      const privPem = decipher.output.toString('utf8');
      const privObj = forge.pki.privateKeyFromPem(privPem);
      let pubPem = String(keySnap.data()?.publicKeyPem || '').trim();
      let pubObj: forgeType.pki.rsa.PublicKey;
      if (pubPem) {
        pubObj = forge.pki.publicKeyFromPem(pubPem);
      } else {
        pubObj = forge.pki.rsa.setPublicKey(privObj.n, privObj.e);
        pubPem = forge.pki.publicKeyToPem(pubObj);
      }

      await Promise.all([
        AsyncStorage.setItem(`${PRIV_KEY_STORAGE_PREFIX}${uid}`, privPem),
        AsyncStorage.setItem(`${PUB_KEY_STORAGE_PREFIX}${uid}`, pubPem),
        AsyncStorage.setItem(`${BACKUP_FLAG_PREFIX}${uid}`, 'true'),
      ]);

      this.currentUid = uid;
      this.privateKeyPem = privPem;
      this.publicKeyPem = pubPem;
      this.privateKeyObj = privObj;
      this.publicKeyObj = pubObj;
      this.fingerprint = this.computeFingerprint(pubPem);
      this.hasBackup = true;
      this.backupDismissedThisSession = false;
      this.status = 'ready';

      this.publicKeyCache.set(uid, {
        pem: pubPem,
        key: pubObj,
        fetchedAt: Date.now(),
      });

      this.emitState();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Unable to unlock backup.' };
    }
  }

  public async resetKeyForNewDevice(uid: string): Promise<void> {
    if (!uid) return;
    await firestore()
      .collection('user_e2ee_keys')
      .doc(uid)
      .collection('private')
      .doc('backup')
      .delete()
      .catch(() => {});
    await this.generateAndPersistFreshKeyPair(uid);
  }

  public isEncryptedPayload(value?: string | null): boolean {
    return typeof value === 'string' && value.startsWith(E2EE_PREFIX);
  }

  public parseEncryptedPayload(value?: string | null): ParsedE2EEEnvelope | null {
    if (!this.isEncryptedPayload(value)) return null;
    const raw = String(value).slice(E2EE_PREFIX.length);
    const parts = raw.split(':');
    if (parts.length !== 4) return null;
    const [keyId, ivB64, tagB64, ctB64] = parts;
    if (!keyId || !ivB64 || !tagB64 || ctB64 === undefined) return null;
    try {
      const forge = getForge();
      return {
        version: 'v1',
        keyId,
        ivBytes: forge.util.decode64(ivB64),
        tagBytes: forge.util.decode64(tagB64),
        ctBytes: forge.util.decode64(ctB64),
      };
    } catch {
      return null;
    }
  }

  public generateRoomAesKeyBytes(): string {
    return this.randomBinaryBytes(32);
  }

  public encryptTextWithKey(
    plaintext: string,
    aesKeyBytes: string,
    keyId: string,
    aadScope: string
  ): string {
    const forge = getForge();
    const ivBytes = this.randomBinaryBytes(12);
    const cipher = forge.cipher.createCipher('AES-GCM', aesKeyBytes);
    cipher.start({
      iv: ivBytes,
      additionalData: `${aadScope}:${keyId}`,
      tagLength: 128,
    });
    cipher.update(forge.util.createBuffer(plaintext, 'utf8'));
    if (!cipher.finish()) {
      throw new Error('AES-GCM encryption failed.');
    }
    const ivB64 = forge.util.encode64(ivBytes);
    const tagB64 = forge.util.encode64(cipher.mode.tag.getBytes());
    const ctB64 = forge.util.encode64(cipher.output.getBytes());
    return `${E2EE_PREFIX}${keyId}:${ivB64}:${tagB64}:${ctB64}`;
  }

  public decryptTextWithKey(
    envelope: string,
    aesKeyBytes: string,
    aadScope: string
  ): string | null {
    const parsed = this.parseEncryptedPayload(envelope);
    if (!parsed) return null;
    try {
      const forge = getForge();
      const decipher = forge.cipher.createDecipher('AES-GCM', aesKeyBytes);
      decipher.start({
        iv: parsed.ivBytes,
        additionalData: `${aadScope}:${parsed.keyId}`,
        tagLength: 128,
        tag: forge.util.createBuffer(parsed.tagBytes),
      });
      decipher.update(forge.util.createBuffer(parsed.ctBytes));
      if (!decipher.finish()) return null;
      return decipher.output.toString('utf8');
    } catch {
      return null;
    }
  }

  public async fetchPublicKeys(
    uids: string[],
    forceRefresh = false
  ): Promise<{ keys: Map<string, forgeType.pki.rsa.PublicKey>; missingUids: string[] }> {
    const forge = getForge();
    const unique = Array.from(new Set(uids.map((u) => String(u || '').trim()).filter(Boolean)));
    const result = new Map<string, forgeType.pki.rsa.PublicKey>();
    const toFetch: string[] = [];
    const now = Date.now();

    unique.forEach((uid) => {
      if (uid === this.currentUid && this.publicKeyObj) {
        result.set(uid, this.publicKeyObj);
        return;
      }
      const cached = this.publicKeyCache.get(uid);
      if (!forceRefresh && cached && now - cached.fetchedAt < PUBLIC_KEY_CACHE_TTL_MS) {
        result.set(uid, cached.key);
        return;
      }
      toFetch.push(uid);
    });

    if (toFetch.length > 0) {
      await Promise.all(
        toFetch.map(async (uid) => {
          try {
            const snap = await firestore().collection('user_e2ee_keys').doc(uid).get();
            const pubPem = snap.exists ? String(snap.data()?.publicKeyPem || '').trim() : '';
            if (pubPem) {
              const pubObj = forge.pki.publicKeyFromPem(pubPem);
              this.publicKeyCache.set(uid, { pem: pubPem, key: pubObj, fetchedAt: Date.now() });
              result.set(uid, pubObj);
            }
          } catch {
            // Skip unreadable or missing keys cleanly
          }
        })
      );
    }

    const missingUids = unique.filter((u) => !result.has(u));
    return { keys: result, missingUids };
  }

  public async wrapAesKeyForUsers(
    aesKeyBytes: string,
    recipientUids: string[]
  ): Promise<{ wrapped: Record<string, string>; missingUids: string[] }> {
    this.seedPrngIfNeeded();
    const forge = getForge();
    const { keys, missingUids } = await this.fetchPublicKeys(recipientUids);
    const wrapped: Record<string, string> = {};

    keys.forEach((pubKey, uid) => {
      const cipherBytes = pubKey.encrypt(aesKeyBytes, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: { md: forge.md.sha256.create() },
      });
      wrapped[uid] = forge.util.encode64(cipherBytes);
    });

    return { wrapped, missingUids };
  }

  public unwrapAesKey(wrappedB64: string): string | null {
    if (!wrappedB64 || !this.privateKeyObj) return null;
    try {
      const forge = getForge();
      const encryptedBytes = forge.util.decode64(wrappedB64);
      return this.privateKeyObj.decrypt(encryptedBytes, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: { md: forge.md.sha256.create() },
      });
    } catch {
      return null;
    }
  }
}

export const e2eeService = new E2EEService();
