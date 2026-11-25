import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp, } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
const REGION = 'asia-south1';
const IST_TIMEZONE = 'Asia/Kolkata';
const ROOT_COLLECTIONS = ['Rhema Church', 'churches'];
function getIstDateParts(dateOverride) {
    if (dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride.trim())) {
        const clean = dateOverride.trim();
        const pieces = clean.split('-');
        const year = parseInt(pieces[0] ?? '0', 10);
        const month = parseInt(pieces[1] ?? '0', 10);
        const day = parseInt(pieces[2] ?? '0', 10);
        if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const utcMidday = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
            const displayDateStr = new Intl.DateTimeFormat('en-US', {
                timeZone: IST_TIMEZONE,
                month: 'long',
                day: 'numeric',
            }).format(utcMidday);
            return { year, month, day, dateStr: clean, displayDateStr };
        }
    }
    const now = new Date();
    const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: IST_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const dateStr = ymdFormatter.format(now); // YYYY-MM-DD in IST
    const parts = dateStr.split('-');
    const year = parseInt(parts[0] ?? '0', 10);
    const month = parseInt(parts[1] ?? '0', 10);
    const day = parseInt(parts[2] ?? '0', 10);
    const displayDateStr = new Intl.DateTimeFormat('en-US', {
        timeZone: IST_TIMEZONE,
        month: 'long',
        day: 'numeric',
    }).format(now);
    return { year, month, day, dateStr, displayDateStr };
}
function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
function parseDateInIstFromDate(d) {
    if (Number.isNaN(d.getTime()))
        return null;
    const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone: IST_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
    const parts = formatted.split('-');
    const year = parseInt(parts[0] ?? '0', 10);
    const month = parseInt(parts[1] ?? '0', 10);
    const day = parseInt(parts[2] ?? '0', 10);
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return null;
    return { year: Number.isNaN(year) ? 0 : year, month, day };
}
export function parseCelebrationDateParts(rawVal) {
    if (!rawVal)
        return null;
    if (rawVal instanceof Timestamp) {
        return parseDateInIstFromDate(rawVal.toDate());
    }
    if (typeof rawVal === 'object' && rawVal !== null && typeof rawVal.toDate === 'function') {
        const dt = rawVal.toDate();
        return parseDateInIstFromDate(dt);
    }
    if (rawVal instanceof Date) {
        return parseDateInIstFromDate(rawVal);
    }
    if (typeof rawVal !== 'string')
        return null;
    const trimmed = rawVal.trim();
    if (!trimmed)
        return null;
    // Match app UI (AdminCelebrationsList.tsx): strip ISO time suffix before splitting
    const clean = (trimmed.split('T')[0] ?? '').split(' ')[0] ?? '';
    const parts = clean.split(/[-/.]/);
    if (parts.length < 3)
        return null;
    const p0 = parts[0] ?? '';
    const p1 = parts[1] ?? '';
    const p2 = parts[2] ?? '';
    let year = 0;
    let month = 0;
    let day = 0;
    if (p0.length === 4) {
        year = parseInt(p0, 10);
        month = parseInt(p1, 10);
        day = parseInt(p2, 10);
    }
    else if (p2.length === 4) {
        day = parseInt(p0, 10);
        month = parseInt(p1, 10);
        year = parseInt(p2, 10);
    }
    else {
        year = parseInt(p0, 10);
        month = parseInt(p1, 10);
        day = parseInt(p2, 10);
    }
    if (Number.isNaN(month) || Number.isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
    }
    return {
        year: Number.isNaN(year) ? 0 : year,
        month,
        day,
    };
}
function matchesIstCalendarDay(parsed, ist) {
    if (parsed.month === ist.month && parsed.day === ist.day) {
        return true;
    }
    // Celebrate Feb 29 dates on Feb 28 during non-leap years
    if (!isLeapYear(ist.year) && parsed.month === 2 && parsed.day === 29 && ist.month === 2 && ist.day === 28) {
        return true;
    }
    return false;
}
function normalizeLast10Digits(rawPhone) {
    if (typeof rawPhone !== 'string' && typeof rawPhone !== 'number')
        return '';
    const digits = String(rawPhone).replace(/\D/g, '');
    if (digits.length < 7)
        return '';
    return digits.slice(-10);
}
function normalizeName(rawName) {
    return String(rawName ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}
function getMemberDisplayName(data) {
    const full = String(data.name || data.Name || '').trim();
    if (full)
        return full;
    const combined = `${String(data.firstName || '').trim()} ${String(data.lastName || '').trim()}`.trim();
    return combined || 'Member';
}
function isEligibleMember(data) {
    if (!data)
        return false;
    if (data.isDeleted === true || data.deleted === true || data.archived === true) {
        return false;
    }
    const status = String(data.status || '').trim().toLowerCase();
    if (status === 'inactive' ||
        status === 'deceased' ||
        status === 'deleted' ||
        status === 'archived' ||
        status === 'suspended' ||
        status === 'blocked' ||
        status === 'removed') {
        return false;
    }
    return true;
}
function getRawCelebrationDate(data, category) {
    if (category === 'birthday') {
        return data.Birthdate || data.dob || data.birthdate || data.dateOfBirth || data.birthday;
    }
    if (category === 'baptism') {
        return data.Baptism_Date__c || data.baptismDate || data.baptism;
    }
    return (data.Anniversary_Date__c ||
        data.anniversaryDate ||
        data.marriageDate ||
        data.weddingAnniversary ||
        data.anniversary);
}
function getOrdinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13)
        return `${n}th`;
    switch (n % 10) {
        case 1:
            return `${n}st`;
        case 2:
            return `${n}nd`;
        case 3:
            return `${n}rd`;
        default:
            return `${n}th`;
    }
}
function buildCelebrationMessages(category, member, customGreeting) {
    const greetingFirstName = member.firstName || member.name;
    if (category === 'birthday') {
        const defaultGreeting = 'Wishing you a very Happy Birthday! May God bless you abundantly and fulfill all your prayers today.';
        const template = (customGreeting || '').trim() || defaultGreeting;
        const personalizedLine = template.toLowerCase().includes(greetingFirstName.toLowerCase())
            ? template
            : `Dear ${greetingFirstName}, ${template}`;
        return {
            pushTitle: `🎂 Happy Birthday, ${member.name}!`,
            pushBody: personalizedLine,
            modalTitle: `🎂 Happy Birthday, ${member.name}!`,
            modalContent: personalizedLine,
            payloadType: 'birthday',
        };
    }
    if (category === 'baptism') {
        const defaultGreeting = 'Happy Baptism Anniversary! May you continue to grow in grace and walk faithfully in His light.';
        const template = (customGreeting || '').trim() || defaultGreeting;
        const yearsPrefix = member.yearsCount > 0 ? `Celebrating ${member.yearsCount} blessed year${member.yearsCount === 1 ? '' : 's'} in Christ! ` : '';
        const personalizedLine = `Dear ${greetingFirstName}, ${yearsPrefix}${template}`;
        return {
            pushTitle: `🕊️ Happy Baptism Anniversary, ${member.name}!`,
            pushBody: personalizedLine,
            modalTitle: `🕊️ Happy Baptism Anniversary, ${member.name}!`,
            modalContent: personalizedLine,
            payloadType: 'baptism_anniversary',
        };
    }
    const coupleDisplay = member.husbandName && member.wifeName
        ? `${member.husbandName} & ${member.wifeName}`
        : member.spouseName && !member.name.toLowerCase().includes(member.spouseName.toLowerCase())
            ? `${member.name} & ${member.spouseName}`
            : member.name;
    const defaultGreeting = 'Wishing you a joyful Wedding Anniversary! May God continue to bless your marriage with love, joy, and peace.';
    const template = (customGreeting || '').trim() || defaultGreeting;
    const yearsText = member.yearsCount > 0 ? `${getOrdinal(member.yearsCount)} ` : '';
    const personalizedLine = `Dear ${coupleDisplay}, wishing you a wonderful ${yearsText}Wedding Anniversary! ${template}`;
    return {
        pushTitle: `💐 Happy Wedding Anniversary, ${coupleDisplay}!`,
        pushBody: personalizedLine,
        modalTitle: `💐 Happy Wedding Anniversary, ${coupleDisplay}!`,
        modalContent: personalizedLine,
        payloadType: 'anniversary',
    };
}
function trackTokensFromDoc(data, docRef, tokenSet, tokenDocRefs) {
    if (!data)
        return;
    const addOne = (rawToken) => {
        if (typeof rawToken !== 'string')
            return;
        const tk = rawToken.trim();
        if (tk.length <= 10)
            return;
        tokenSet.add(tk);
        const existingRefs = tokenDocRefs.get(tk) || [];
        if (!existingRefs.some((r) => r.path === docRef.path)) {
            existingRefs.push(docRef);
            tokenDocRefs.set(tk, existingRefs);
        }
    };
    addOne(data.fcmToken);
    if (Array.isArray(data.fcmTokens)) {
        for (const item of data.fcmTokens) {
            addOne(item);
        }
    }
}
async function pruneInvalidTokens(invalidTokens, tokenDocRefs) {
    if (invalidTokens.length === 0)
        return 0;
    const uniqueInvalid = Array.from(new Set(invalidTokens));
    const byDocPath = new Map();
    for (const tk of uniqueInvalid) {
        const refs = tokenDocRefs.get(tk) || [];
        for (const ref of refs) {
            const entry = byDocPath.get(ref.path) || { ref, tokens: [] };
            entry.tokens.push(tk);
            byDocPath.set(ref.path, entry);
        }
    }
    let prunedCount = 0;
    await Promise.allSettled(Array.from(byDocPath.values()).map(async ({ ref, tokens }) => {
        try {
            const snap = await ref.get();
            if (!snap.exists)
                return;
            const data = snap.data() || {};
            const updatePayload = {
                fcmTokens: FieldValue.arrayRemove(...tokens),
            };
            if (typeof data.fcmToken === 'string' && tokens.includes(data.fcmToken.trim())) {
                updatePayload.fcmToken = FieldValue.delete();
            }
            await ref.update(updatePayload);
            prunedCount += tokens.length;
        }
        catch (err) {
            console.warn(`[CelebrationPush] Failed pruning token on ${ref.path}:`, err);
        }
    }));
    return prunedCount;
}
function namesCompatibleForPhoneFallback(memberName, userName) {
    const normMember = normalizeName(memberName);
    const normUser = normalizeName(userName);
    if (!normUser || !normMember || normMember === 'member' || normMember === 'unknown') {
        return true;
    }
    if (normMember === normUser)
        return true;
    const memberFirst = normMember.split(' ')[0] ?? '';
    const userFirst = normUser.split(' ')[0] ?? '';
    if (memberFirst.length >= 2 && memberFirst === userFirst)
        return true;
    if (normMember.includes(normUser) || normUser.includes(normMember))
        return true;
    return false;
}
async function getChurchCelebrationSettings(db, rootCollection, churchId, category) {
    const settingKey = category === 'birthday'
        ? 'birthdayNotif'
        : category === 'baptism'
            ? 'baptismNotif'
            : 'anniversaryNotif';
    const candidates = [
        db.collection(rootCollection).doc(churchId).collection('settings').doc('notifications'),
        db.collection('churches').doc(churchId).collection('settings').doc('notifications'),
    ];
    // Global fallback settings apply as defaults (especially for default 'rhema' church admin UI saves)
    candidates.push(db.collection('settings').doc('notifications'));
    let enabled = true;
    let greeting = '';
    let foundExplicitEnable = false;
    for (const ref of candidates) {
        try {
            const snap = await ref.get();
            if (!snap.exists)
                continue;
            const data = snap.data() || {};
            const block = data[settingKey];
            if (!block || typeof block !== 'object')
                continue;
            if (!foundExplicitEnable && typeof block.enabled === 'boolean') {
                enabled = block.enabled;
                foundExplicitEnable = true;
            }
            if (!greeting && typeof block.greeting === 'string' && block.greeting.trim().length > 0) {
                greeting = block.greeting.trim();
            }
        }
        catch (_) { }
    }
    return { enabled, greeting };
}
function sanitizeDocIdSegment(raw) {
    return raw.replace(/[^a-zA-Z0-9_+-]/g, '_').slice(0, 80);
}
async function claimDispatchSlot(db, rootCollection, churchId, istDateStr, category, member, force) {
    const logId = `${istDateStr}_${category}_${sanitizeDocIdSegment(member.canonicalKey)}`;
    const logRef = db
        .collection(rootCollection)
        .doc(churchId)
        .collection('celebration_dispatch_logs')
        .doc(logId);
    if (force) {
        await logRef.set({
            date: istDateStr,
            category,
            churchId,
            memberId: member.canonicalKey,
            memberName: member.name,
            status: 'processing',
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { claimed: true, logRef };
    }
    const nowMs = Date.now();
    const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(logRef);
        if (snap.exists) {
            const data = snap.data() || {};
            if (data.status === 'sent') {
                return false;
            }
            if (data.status === 'processing' &&
                typeof data.startedAtMs === 'number' &&
                nowMs - data.startedAtMs < 5 * 60_000) {
                return false;
            }
        }
        tx.set(logRef, {
            date: istDateStr,
            category,
            churchId,
            memberId: member.canonicalKey,
            memberName: member.name,
            status: 'processing',
            startedAtMs: nowMs,
            createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
    });
    return { claimed, logRef };
}
async function dispatchSingleMemberPush(messaging, tokens, tokenDocRefs, pushTitle, pushBody, dataPayload) {
    if (tokens.length === 0) {
        return { successCount: 0, failureCount: 0, prunedCount: 0 };
    }
    const bodyPreview = pushBody.length > 200 ? `${pushBody.slice(0, 197)}...` : pushBody;
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens = [];
    for (let i = 0; i < tokens.length; i += 500) {
        const chunk = tokens.slice(i, i + 500);
        try {
            const response = await messaging.sendEachForMulticast({
                notification: {
                    title: pushTitle,
                    body: bodyPreview,
                },
                data: {
                    ...dataPayload,
                    title: pushTitle,
                    body: bodyPreview,
                },
                tokens: chunk,
                android: {
                    priority: 'high',
                    notification: {
                        title: pushTitle,
                        body: bodyPreview,
                        sound: 'default',
                        channelId: 'church_alerts',
                        priority: 'max',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                        visibility: 'public',
                        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                    },
                },
                apns: {
                    headers: {
                        'apns-priority': '10',
                        'apns-push-type': 'alert',
                    },
                    payload: {
                        aps: {
                            alert: {
                                title: pushTitle,
                                body: bodyPreview,
                            },
                            sound: 'default',
                            badge: 1,
                        },
                    },
                },
            });
            successCount += response.successCount;
            failureCount += response.failureCount;
            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const code = String(resp.error?.code || '');
                        if (code === 'messaging/registration-token-not-registered' ||
                            code === 'messaging/invalid-registration-token') {
                            const badToken = chunk[idx];
                            if (badToken)
                                invalidTokens.push(badToken);
                        }
                    }
                });
            }
        }
        catch (err) {
            failureCount += chunk.length;
            console.error('[CelebrationPush] Multicast chunk error:', err);
        }
    }
    const prunedCount = invalidTokens.length > 0 ? await pruneInvalidTokens(invalidTokens, tokenDocRefs) : 0;
    return { successCount, failureCount, prunedCount };
}
export async function runCelebrationPushDispatch(category, options) {
    const db = options?.db ?? getFirestore();
    const messaging = options?.messaging ?? getMessaging();
    const dryRun = options?.dryRun === true;
    const force = options?.force === true;
    const ist = getIstDateParts(options?.dateOverride);
    console.log(`🎉 [CelebrationPush] Running ${category} dispatch for IST date ${ist.dateStr} (dryRun=${dryRun}, force=${force})`);
    // Discover churches preferring 'Rhema Church' over legacy 'churches'
    const discoveredChurches = new Map();
    for (const rootCol of ROOT_COLLECTIONS) {
        try {
            const snap = await db.collection(rootCol).get();
            snap.forEach((doc) => {
                if (options?.churchIdFilter && doc.id !== options.churchIdFilter)
                    return;
                if (!discoveredChurches.has(doc.id)) {
                    const data = doc.data() || {};
                    discoveredChurches.set(doc.id, {
                        churchId: doc.id,
                        rootCollection: rootCol,
                        name: String(data.name || data.churchName || '').trim(),
                    });
                }
            });
        }
        catch (err) {
            console.warn(`[CelebrationPush] Failed reading collection ${rootCol}:`, err);
        }
    }
    // Fallback if churchIdFilter points directly to a church doc not returned by collection scan
    if (options?.churchIdFilter && !discoveredChurches.has(options.churchIdFilter)) {
        discoveredChurches.set(options.churchIdFilter, {
            churchId: options.churchIdFilter,
            rootCollection: 'Rhema Church',
            name: '',
        });
    }
    // Pre-load users collection once so cross-referencing UIDs and same-church phones is O(1) without N+1 queries
    const usersByUid = new Map();
    const usersByChurchAndPhone = new Map();
    try {
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach((uDoc) => {
            const uData = uDoc.data() || {};
            const entry = { uid: uDoc.id, data: uData, ref: uDoc.ref };
            usersByUid.set(uDoc.id, { data: uData, ref: uDoc.ref });
            const last10 = normalizeLast10Digits(uData.phone || uData.mobile || uData.phoneNumber);
            if (last10) {
                const uChurch = String(uData.primaryChurchId || uData.churchId || 'rhema').trim();
                const key = `${uChurch}::${last10}`;
                const list = usersByChurchAndPhone.get(key) || [];
                list.push(entry);
                usersByChurchAndPhone.set(key, list);
            }
        });
    }
    catch (err) {
        console.warn('[CelebrationPush] Failed loading users index:', err);
    }
    const report = {
        category,
        istDateStr: ist.dateStr,
        dryRun,
        churchesProcessed: 0,
        totalMatched: 0,
        totalSentMembers: 0,
        totalSkippedAlreadySent: 0,
        totalNoTokenMembers: 0,
        totalTokensTargeted: 0,
        totalSuccessTokens: 0,
        totalFailedTokens: 0,
        churches: [],
    };
    for (const church of discoveredChurches.values()) {
        const { churchId, rootCollection } = church;
        const settings = await getChurchCelebrationSettings(db, rootCollection, churchId, category);
        if (!settings.enabled) {
            console.log(`🔇 [CelebrationPush] ${category} notifications disabled for church ${churchId}.`);
            continue;
        }
        const membersSnap = await db.collection(rootCollection).doc(churchId).collection('members').get();
        if (membersSnap.empty) {
            continue;
        }
        report.churchesProcessed += 1;
        // Index all member docs inside this church so uid<->phone duplicates for the SAME person resolve together
        const memberDocsById = new Map();
        const phoneNameCountMap = new Map();
        const uidByPhoneAndName = new Map();
        membersSnap.forEach((mDoc) => {
            const mData = mDoc.data() || {};
            memberDocsById.set(mDoc.id, { data: mData, ref: mDoc.ref });
            const last10 = normalizeLast10Digits(mData.directPhone || mData.phone || mData.mobile || mData.MobilePhone || mData.phoneNumber);
            const normName = normalizeName(getMemberDisplayName(mData));
            const explicitUid = String(mData.authUid || mData.uid || '').trim();
            const candidateUid = explicitUid || (usersByUid.has(mDoc.id) ? mDoc.id : '');
            if (last10 && normName && normName !== 'member' && normName !== 'unknown') {
                const set = phoneNameCountMap.get(last10) || new Set();
                set.add(normName);
                phoneNameCountMap.set(last10, set);
                if (candidateUid && !uidByPhoneAndName.has(`${last10}::${normName}`)) {
                    uidByPhoneAndName.set(`${last10}::${normName}`, candidateUid);
                }
            }
        });
        // Collect today's celebrating members for this church and merge duplicate docs representing the same person
        const celebrantsByPerson = new Map();
        membersSnap.forEach((mDoc) => {
            if (options?.memberIdFilter && mDoc.id !== options.memberIdFilter) {
                return;
            }
            const mData = mDoc.data() || {};
            if (!isEligibleMember(mData))
                return;
            const rawDate = getRawCelebrationDate(mData, category);
            const parsed = parseCelebrationDateParts(rawDate);
            if (!parsed || !matchesIstCalendarDay(parsed, ist))
                return;
            const displayName = getMemberDisplayName(mData);
            const firstName = displayName.split(/\s+/)[0] || displayName;
            const directPhone = String(mData.directPhone || mData.phone || mData.mobile || mData.MobilePhone || mData.phoneNumber || '').trim();
            const last10 = normalizeLast10Digits(directPhone);
            const normName = normalizeName(displayName);
            const explicitUid = String(mData.authUid || mData.uid || '').trim();
            // Canonical key per person:
            // Prefer Auth UID (or UID inferred via identical church phone+name); otherwise deterministic phone+name
            // (or doc.id fallback) so two different household members sharing a phone never collide.
            let canonicalKey = explicitUid;
            if (!canonicalKey && usersByUid.has(mDoc.id)) {
                canonicalKey = mDoc.id;
            }
            if (!canonicalKey && last10 && normName) {
                canonicalKey = uidByPhoneAndName.get(`${last10}::${normName}`) || '';
            }
            if (!canonicalKey) {
                canonicalKey = last10 && normName ? `${last10}_${normName.replace(/\s+/g, '_')}` : mDoc.id;
            }
            const yearsCount = parsed.year > 1900 && parsed.year < ist.year ? ist.year - parsed.year : 0;
            const existing = celebrantsByPerson.get(canonicalKey);
            if (existing) {
                if (!existing.docIds.includes(mDoc.id))
                    existing.docIds.push(mDoc.id);
                if (explicitUid && !existing.uidCandidates.includes(explicitUid))
                    existing.uidCandidates.push(explicitUid);
                existing.memberDocRefs.push(mDoc.ref);
                trackTokensFromDoc(mData, mDoc.ref, existing.memberTokens, existing.tokenDocRefs);
                if (!existing.directPhone && directPhone) {
                    existing.directPhone = directPhone;
                    existing.directPhoneLast10 = last10;
                }
                return;
            }
            const uidCandidates = [];
            if (explicitUid)
                uidCandidates.push(explicitUid);
            if (!uidCandidates.includes(mDoc.id))
                uidCandidates.push(mDoc.id);
            const celebrant = {
                canonicalKey,
                docIds: [mDoc.id],
                uidCandidates,
                churchId,
                rootCollection,
                name: displayName,
                firstName,
                directPhone,
                directPhoneLast10: last10,
                husbandName: String(mData.husbandName || '').trim(),
                wifeName: String(mData.wifeName || '').trim(),
                spouseName: String(mData.spouseName || '').trim(),
                eventYear: parsed.year,
                yearsCount,
                memberDocRefs: [mDoc.ref],
                memberTokens: new Set(),
                tokenDocRefs: new Map(),
            };
            trackTokensFromDoc(mData, mDoc.ref, celebrant.memberTokens, celebrant.tokenDocRefs);
            celebrantsByPerson.set(canonicalKey, celebrant);
        });
        const churchSummary = {
            churchId,
            rootCollection,
            matchedCount: celebrantsByPerson.size,
            sentMemberCount: 0,
            skippedAlreadySentCount: 0,
            noTokenMemberCount: 0,
            totalTokensTargeted: 0,
            totalSuccessTokens: 0,
            totalFailedTokens: 0,
            prunedInvalidTokens: 0,
            targets: [],
        };
        if (celebrantsByPerson.size === 0) {
            report.churches.push(churchSummary);
            continue;
        }
        report.totalMatched += celebrantsByPerson.size;
        // Prevent buzzing the same physical device twice during a single category run (e.g. spouses sharing one phone)
        const tokensAlreadyDispatchedThisSweep = new Set();
        for (const celebrant of celebrantsByPerson.values()) {
            // Step A: Resolve UID-linked users/{uid} and same-UID member docs in this church
            for (const uid of [...celebrant.uidCandidates]) {
                const userEntry = usersByUid.get(uid);
                if (userEntry) {
                    const uChurch = String(userEntry.data.primaryChurchId || userEntry.data.churchId || '').trim();
                    if (!uChurch || uChurch === churchId) {
                        trackTokensFromDoc(userEntry.data, userEntry.ref, celebrant.memberTokens, celebrant.tokenDocRefs);
                    }
                }
                const linkedMemberDoc = memberDocsById.get(uid);
                if (linkedMemberDoc && !celebrant.docIds.includes(uid)) {
                    const linkedName = getMemberDisplayName(linkedMemberDoc.data);
                    if (namesCompatibleForPhoneFallback(celebrant.name, linkedName)) {
                        celebrant.docIds.push(uid);
                        celebrant.memberDocRefs.push(linkedMemberDoc.ref);
                        trackTokensFromDoc(linkedMemberDoc.data, linkedMemberDoc.ref, celebrant.memberTokens, celebrant.tokenDocRefs);
                    }
                }
            }
            // Step B: Direct-phone fallback within THIS EXACT church only (never cross-church, never referencePhone, never name-only)
            if (celebrant.directPhoneLast10) {
                const phoneKey = `${churchId}::${celebrant.directPhoneLast10}`;
                const matchingUsers = usersByChurchAndPhone.get(phoneKey) || [];
                const uniqueNamesForPhone = phoneNameCountMap.get(celebrant.directPhoneLast10);
                const isSinglePersonPhone = !uniqueNamesForPhone || uniqueNamesForPhone.size <= 1;
                for (const uEntry of matchingUsers) {
                    const uName = getMemberDisplayName(uEntry.data);
                    if (isSinglePersonPhone || namesCompatibleForPhoneFallback(celebrant.name, uName)) {
                        trackTokensFromDoc(uEntry.data, uEntry.ref, celebrant.memberTokens, celebrant.tokenDocRefs);
                        if (!celebrant.uidCandidates.includes(uEntry.uid)) {
                            celebrant.uidCandidates.push(uEntry.uid);
                        }
                    }
                }
                // Also inspect sibling member docs in the same church with exact matching direct phone + compatible name
                for (const [mId, mEntry] of memberDocsById.entries()) {
                    if (celebrant.docIds.includes(mId))
                        continue;
                    const mPhone10 = normalizeLast10Digits(mEntry.data.directPhone || mEntry.data.phone || mEntry.data.mobile || mEntry.data.MobilePhone || mEntry.data.phoneNumber);
                    if (mPhone10 !== celebrant.directPhoneLast10)
                        continue;
                    const mName = getMemberDisplayName(mEntry.data);
                    if (isSinglePersonPhone || namesCompatibleForPhoneFallback(celebrant.name, mName)) {
                        celebrant.docIds.push(mId);
                        celebrant.memberDocRefs.push(mEntry.ref);
                        trackTokensFromDoc(mEntry.data, mEntry.ref, celebrant.memberTokens, celebrant.tokenDocRefs);
                    }
                }
            }
            const candidateTokens = Array.from(celebrant.memberTokens).filter((tk) => !tokensAlreadyDispatchedThisSweep.has(tk));
            const msg = buildCelebrationMessages(category, celebrant, settings.greeting);
            const notifDocId = `${ist.dateStr}_${category}`;
            if (dryRun) {
                churchSummary.targets.push({
                    memberName: celebrant.name,
                    canonicalKey: celebrant.canonicalKey,
                    tokenCount: candidateTokens.length,
                    status: candidateTokens.length > 0 ? 'dry_run_ready' : 'dry_run_no_tokens',
                });
                churchSummary.totalTokensTargeted += candidateTokens.length;
                if (candidateTokens.length === 0)
                    churchSummary.noTokenMemberCount += 1;
                candidateTokens.forEach((tk) => tokensAlreadyDispatchedThisSweep.add(tk));
                continue;
            }
            // Atomic idempotency claim
            const { claimed, logRef } = await claimDispatchSlot(db, rootCollection, churchId, ist.dateStr, category, celebrant, force);
            if (!claimed) {
                churchSummary.skippedAlreadySentCount += 1;
                churchSummary.targets.push({
                    memberName: celebrant.name,
                    canonicalKey: celebrant.canonicalKey,
                    tokenCount: candidateTokens.length,
                    status: 'skipped_already_sent',
                });
                continue;
            }
            // Write private personal notification card ONLY under this celebrating member's own notifications subcollection
            const targetNotifMemberIds = Array.from(new Set([...celebrant.docIds, ...celebrant.uidCandidates])).filter(Boolean);
            const primaryAuthUid = celebrant.uidCandidates.find((id) => usersByUid.has(id)) || '';
            await Promise.allSettled(targetNotifMemberIds.map((targetId) => db
                .collection(rootCollection)
                .doc(churchId)
                .collection('members')
                .doc(targetId)
                .collection('notifications')
                .doc(notifDocId)
                .set({
                title: msg.modalTitle,
                content: msg.modalContent,
                date: ist.displayDateStr,
                type: msg.payloadType,
                celebrationCategory: category,
                isCelebration: true,
                targetChurchId: churchId,
                targetMemberId: targetId,
                targetUid: primaryAuthUid,
                targetPhone: celebrant.directPhone,
                read: false,
                createdAt: FieldValue.serverTimestamp(),
            }, { merge: true })));
            if (candidateTokens.length === 0) {
                churchSummary.noTokenMemberCount += 1;
                await logRef.set({
                    status: 'sent',
                    sentTokenCount: 0,
                    successCount: 0,
                    failureCount: 0,
                    note: 'No active FCM device token found; in-app notification created.',
                    completedAt: FieldValue.serverTimestamp(),
                }, { merge: true });
                churchSummary.targets.push({
                    memberName: celebrant.name,
                    canonicalKey: celebrant.canonicalKey,
                    tokenCount: 0,
                    status: 'no_tokens_in_app_written',
                });
                continue;
            }
            candidateTokens.forEach((tk) => tokensAlreadyDispatchedThisSweep.add(tk));
            churchSummary.totalTokensTargeted += candidateTokens.length;
            const dataPayload = {
                type: msg.payloadType,
                id: notifDocId,
                churchId,
                memberId: celebrant.canonicalKey,
                isCelebration: 'true',
                celebrationCategory: category,
                screen: 'Updates',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            };
            const dispatchResult = await dispatchSingleMemberPush(messaging, candidateTokens, celebrant.tokenDocRefs, msg.pushTitle, msg.pushBody, dataPayload);
            churchSummary.totalSuccessTokens += dispatchResult.successCount;
            churchSummary.totalFailedTokens += dispatchResult.failureCount;
            churchSummary.prunedInvalidTokens += dispatchResult.prunedCount;
            if (dispatchResult.successCount > 0) {
                churchSummary.sentMemberCount += 1;
            }
            await logRef.set({
                status: 'sent',
                sentTokenCount: candidateTokens.length,
                successCount: dispatchResult.successCount,
                failureCount: dispatchResult.failureCount,
                prunedInvalidTokens: dispatchResult.prunedCount,
                completedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            churchSummary.targets.push({
                memberName: celebrant.name,
                canonicalKey: celebrant.canonicalKey,
                tokenCount: candidateTokens.length,
                status: dispatchResult.successCount > 0 ? 'sent' : 'failed',
            });
        }
        report.totalSentMembers += churchSummary.sentMemberCount;
        report.totalSkippedAlreadySent += churchSummary.skippedAlreadySentCount;
        report.totalNoTokenMembers += churchSummary.noTokenMemberCount;
        report.totalTokensTargeted += churchSummary.totalTokensTargeted;
        report.totalSuccessTokens += churchSummary.totalSuccessTokens;
        report.totalFailedTokens += churchSummary.totalFailedTokens;
        report.churches.push(churchSummary);
    }
    console.log(`✅ [CelebrationPush] Completed ${category} for ${ist.dateStr}: matched=${report.totalMatched}, sent=${report.totalSentMembers}, skipped=${report.totalSkippedAlreadySent}, noTokens=${report.totalNoTokenMembers}`);
    return report;
}
/**
 * 🎂 Daily Birthday Wishes — 6:30 AM IST (`Asia/Kolkata`)
 */
export const sendDailyBirthdayPushScheduled = onSchedule({ schedule: '30 6 * * *', timeZone: IST_TIMEZONE, region: REGION }, async () => {
    await runCelebrationPushDispatch('birthday');
});
/**
 * 🕊️ Daily Baptism Anniversary Wishes — 7:00 AM IST (`Asia/Kolkata`)
 */
export const sendDailyBaptismAnniversaryPushScheduled = onSchedule({ schedule: '0 7 * * *', timeZone: IST_TIMEZONE, region: REGION }, async () => {
    await runCelebrationPushDispatch('baptism');
});
/**
 * 💐 Daily Wedding Anniversary Wishes — 7:30 AM IST (`Asia/Kolkata`)
 */
export const sendDailyWeddingAnniversaryPushScheduled = onSchedule({ schedule: '30 7 * * *', timeZone: IST_TIMEZONE, region: REGION }, async () => {
    await runCelebrationPushDispatch('anniversary');
});
/**
 * 🧪 Manual/Verification HTTP endpoint for celebration push dispatches.
 * Defaults to `dryRun=true` so accidental hits never notify live members.
 */
export const triggerCelebrationPushManual = onRequest({ timeoutSeconds: 300, cors: true, region: REGION }, async (req, res) => {
    try {
        const rawType = String(req.query.type || req.body?.type || 'all').trim().toLowerCase();
        const churchIdFilter = String(req.query.churchId || req.body?.churchId || '').trim() || undefined;
        const memberIdFilter = String(req.query.memberId || req.body?.memberId || '').trim() || undefined;
        const dateOverride = String(req.query.date || req.body?.date || '').trim() || undefined;
        const dryRun = req.query.dryRun !== 'false' && req.body?.dryRun !== false;
        const force = req.query.force === 'true' || req.body?.force === true;
        const categories = rawType === 'birthday' || rawType === 'baptism' || rawType === 'anniversary'
            ? [rawType]
            : ['birthday', 'baptism', 'anniversary'];
        const dispatchOpts = { dryRun, force };
        if (churchIdFilter)
            dispatchOpts.churchIdFilter = churchIdFilter;
        if (memberIdFilter)
            dispatchOpts.memberIdFilter = memberIdFilter;
        if (dateOverride)
            dispatchOpts.dateOverride = dateOverride;
        const results = [];
        for (const cat of categories) {
            results.push(await runCelebrationPushDispatch(cat, dispatchOpts));
        }
        res.status(200).json({
            success: true,
            dryRun,
            results,
        });
    }
    catch (error) {
        console.error('❌ [CelebrationPush] triggerCelebrationPushManual error:', error);
        res.status(500).json({
            success: false,
            error: error?.message || 'Internal error running celebration push manual trigger.',
        });
    }
});
//# sourceMappingURL=celebrationPushScheduler.js.map