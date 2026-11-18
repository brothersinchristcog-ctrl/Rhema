import firestore from '@react-native-firebase/firestore';

export interface MemberIdConfig {
  prefix: string; // e.g. "Rhema"
  separator: string; // e.g. "-"
  paddingDigits: number; // e.g. 3 -> "001"
  currentSequence: number; // highest sequence number assigned
  updatedAt?: any;
}

const DEFAULT_CONFIG: MemberIdConfig = {
  prefix: 'Rhema',
  separator: '-',
  paddingDigits: 3,
  currentSequence: 0,
};

class MemberIdService {
  private getChurchDocRef(churchId?: string) {
    const cid = churchId || 'rhema';
    return firestore().collection('Rhema Church').doc(cid);
  }

  private getConfigRef(churchId?: string) {
    return this.getChurchDocRef(churchId).collection('settings').doc('member_id_config');
  }

  private getCounterRef(churchId?: string) {
    return this.getChurchDocRef(churchId).collection('counters').doc('member_sequence');
  }

  private getMembersCol(churchId?: string) {
    return this.getChurchDocRef(churchId).collection('members');
  }

  /**
   * Get the current church Member ID configuration.
   */
  async getConfig(churchId?: string): Promise<MemberIdConfig> {
    try {
      const snap = await this.getConfigRef(churchId).get();
      if (snap.exists()) {
        const data = snap.data();
        return {
          prefix: data?.prefix || DEFAULT_CONFIG.prefix,
          separator: data?.separator !== undefined ? data.separator : DEFAULT_CONFIG.separator,
          paddingDigits: data?.paddingDigits || DEFAULT_CONFIG.paddingDigits,
          currentSequence: data?.currentSequence || 0,
        };
      }
      return { ...DEFAULT_CONFIG };
    } catch (e) {
      console.warn('Error reading MemberIdConfig, fallback to default:', e);
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Update the church Member ID configuration (e.g. change prefix or digit padding).
   */
  async saveConfig(churchId: string | undefined, updates: Partial<MemberIdConfig>): Promise<void> {
    const ref = this.getConfigRef(churchId);
    await ref.set(
      {
        ...updates,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  /**
   * Format a numerical sequence into a standard Member ID string.
   * e.g. prefix="Rhema", seq=7, padding=3 => "Rhema-007"
   */
  formatCode(prefix: string, separator: string, seq: number, padding: number): string {
    const cleanPrefix = (prefix || 'Rhema').trim();
    const cleanSep = separator !== undefined ? separator : '-';
    const numStr = String(seq).padStart(padding || 3, '0');
    return `${cleanPrefix}${cleanSep}${numStr}`;
  }

  /**
   * Atomically generate and reserve the next Member ID for a given church.
   */
  async getNextMemberCode(churchId?: string): Promise<{ code: string; sequence: number }> {
    const churchDoc = this.getChurchDocRef(churchId);
    const counterRef = this.getCounterRef(churchId);
    const config = await this.getConfig(churchId);
    const membersCol = this.getMembersCol(churchId);

    // Run transaction on the counter document
    const result = await firestore().runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      let currentSeq = 0;

      if (counterSnap.exists()) {
        currentSeq = Number(counterSnap.data()?.currentSequence) || 0;
      } else {
        // If counter doesn't exist, scan members collection once to find max existing sequence
        const membersSnap = await membersCol.get();
        const regex = new RegExp(`^${config.prefix}[^0-9]*(\\d+)$`, 'i');
        membersSnap.docs.forEach((doc) => {
          const rawCode = String(doc.data()?.memberCode || '').trim();
          const match = rawCode.match(regex);
          if (match) {
            const parsed = parseInt(match[1], 10);
            if (!isNaN(parsed) && parsed > currentSeq) {
              currentSeq = parsed;
            }
          }
        });
      }

      const nextSeq = currentSeq + 1;
      const candidateCode = this.formatCode(
        config.prefix,
        config.separator,
        nextSeq,
        config.paddingDigits
      );

      tx.set(
        counterRef,
        {
          currentSequence: nextSeq,
          lastGeneratedCode: candidateCode,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { code: candidateCode, sequence: nextSeq };
    });

    return result;
  }

  /**
   * Assign a unique Member ID to a specific member document in Firestore.
   * If member already has a memberCode, returns the existing code unless overwrite=true.
   */
  async assignMemberCode(
    churchId: string | undefined,
    memberId: string,
    overwrite: boolean = false
  ): Promise<string> {
    if (!memberId) throw new Error('memberId is required to assign member code');
    const memberRef = this.getMembersCol(churchId).doc(memberId);
    const snap = await memberRef.get();

    if (!snap.exists()) {
      throw new Error(`Member with ID "${memberId}" does not exist`);
    }

    const data = snap.data() || {};
    if (data.memberCode && !overwrite) {
      return data.memberCode;
    }

    const { code, sequence } = await this.getNextMemberCode(churchId);

    await memberRef.set(
      {
        memberCode: code,
        memberSequence: sequence,
        memberCodeAssignedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return code;
  }

  /**
   * Backfill all existing approved members in real-time.
   * Sorts members chronologically by joinDate/approvedAt/createdAt and assigns sequential IDs.
   */
  async backfillExistingMembers(
    churchId?: string
  ): Promise<{
    totalMembers: number;
    newlyAssigned: number;
    alreadyAssigned: number;
    sampleCodes: string[];
  }> {
    const config = await this.getConfig(churchId);
    const membersCol = this.getMembersCol(churchId);
    const snap = await membersCol.get();

    if (snap.empty) {
      return { totalMembers: 0, newlyAssigned: 0, alreadyAssigned: 0, sampleCodes: [] };
    }

    // 1. Separate members into already assigned vs unassigned
    const assignedDocs: Array<{ id: string; code: string; seq: number }> = [];
    const unassignedDocs: Array<{ id: string; data: any; sortTime: number }> = [];

    const prefixRegex = new RegExp(`^${config.prefix}[^0-9]*(\\d+)$`, 'i');
    let maxAssignedSeq = 0;

    snap.docs.forEach((d) => {
      const data = d.data() || {};
      const rawCode = String(data.memberCode || '').trim();
      if (rawCode) {
        let seq = Number(data.memberSequence) || 0;
        const match = rawCode.match(prefixRegex);
        if (match) {
          const parsed = parseInt(match[1], 10);
          if (!isNaN(parsed) && parsed > seq) seq = parsed;
        }
        if (seq > maxAssignedSeq) maxAssignedSeq = seq;
        assignedDocs.push({ id: d.id, code: rawCode, seq });
      } else {
        // Compute best chronological timestamp
        let sortTime = 0;
        const dateCandidates = [
          data.joinDate,
          data.approvedAt,
          data.createdAt,
          data.createdDate,
        ];
        for (const candidate of dateCandidates) {
          if (!candidate) continue;
          if (typeof candidate.toDate === 'function') {
            sortTime = candidate.toDate().getTime();
            break;
          }
          if (candidate.seconds) {
            sortTime = candidate.seconds * 1000;
            break;
          }
          const parsed = Date.parse(candidate);
          if (!isNaN(parsed) && parsed > 0) {
            sortTime = parsed;
            break;
          }
        }
        unassignedDocs.push({ id: d.id, data, sortTime: sortTime || Date.now() });
      }
    });

    // 2. Sort unassigned members chronologically ascending
    unassignedDocs.sort((a, b) => a.sortTime - b.sortTime);

    if (unassignedDocs.length === 0) {
      return {
        totalMembers: snap.docs.length,
        newlyAssigned: 0,
        alreadyAssigned: assignedDocs.length,
        sampleCodes: assignedDocs.slice(0, 5).map((a) => a.code),
      };
    }

    // 3. Assign sequential codes in chunks of 400 (Firestore WriteBatch limit is 500)
    let currentSeq = maxAssignedSeq;
    const sampleCodes: string[] = [];
    const BATCH_SIZE = 400;

    for (let i = 0; i < unassignedDocs.length; i += BATCH_SIZE) {
      const chunk = unassignedDocs.slice(i, i + BATCH_SIZE);
      const batch = firestore().batch();

      for (const item of chunk) {
        currentSeq++;
        const code = this.formatCode(
          config.prefix,
          config.separator,
          currentSeq,
          config.paddingDigits
        );
        if (sampleCodes.length < 5) sampleCodes.push(code);

        const ref = membersCol.doc(item.id);
        batch.set(
          ref,
          {
            memberCode: code,
            memberSequence: currentSeq,
            memberCodeAssignedAt: firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();
    }

    // 4. Update the atomic counter document to reflect the highest sequence assigned
    await this.getCounterRef(churchId).set(
      {
        currentSequence: currentSeq,
        lastGeneratedCode: this.formatCode(
          config.prefix,
          config.separator,
          currentSeq,
          config.paddingDigits
        ),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      totalMembers: snap.docs.length,
      newlyAssigned: unassignedDocs.length,
      alreadyAssigned: assignedDocs.length,
      sampleCodes,
    };
  }
}

export default new MemberIdService();
