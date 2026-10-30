import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as functionsCompat from 'firebase-functions/v1';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { SalesforceBackend } from './services/SalesforceBackend.js';
import { sendWhatsAppTemplateInternal } from './whatsapp.js';
import { generateCelebrationImage } from './imageGenerator.js';
import { randomUUID } from 'crypto';
// Initialize Firebase Admin once at top level
initializeApp();
// TODO: When Salesforce integration becomes multi-tenant, remove this and loop over churches.
// Single-church configuration for Rhema Global Ministries
const DEFAULT_CHURCH_ID = 'rhema';
// Lazy initialization helpers
let _db;
let _messaging;
let _sfBackend;
const getDb = () => _db || (_db = getFirestore());
const getMsg = () => _messaging || (_messaging = getMessaging());
const getSf = () => {
    if (!_sfBackend) {
        _sfBackend = new SalesforceBackend({
            consumerKey: process.env.SF_CONSUMER_KEY || '',
            username: process.env.SF_USERNAME || '',
            loginUrl: process.env.SF_LOGIN_URL || 'https://test.salesforce.com',
            privateKey: (process.env.SF_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        });
    }
    return _sfBackend;
};
// Helper to remove HTML tags from rich text before sending push notifications
const stripHtml = (html) => {
    if (!html)
        return '';
    return html.replace(/<[^>]*>?/gm, '').trim();
};
/**
 * 📖 GET DAILY PROMISE
 */
const getDailyPromise = onCall({ invoker: 'public' }, async (request) => {
    try {
        const promise = await getSf().getDailyPromise();
        return { success: true, data: promise };
    }
    catch (error) {
        console.error('getDailyPromise Error:', error);
        throw new HttpsError('internal', error.message);
    }
});
/**
 * 📅 GET UPCOMING EVENTS
 */
const getUpcomingEvents = onCall({ invoker: 'public' }, async (request) => {
    try {
        const limit = request.data?.limit || 5;
        const events = await getSf().getUpcomingEvents(limit);
        return { success: true, data: events };
    }
    catch (error) {
        console.error('getUpcomingEvents Error:', error);
        throw new HttpsError('internal', error.message);
    }
});
/**
 * 🛡️ CHECK CONTACT EXISTS
 */
const checkContactExists = onCall({ invoker: 'public' }, async (request) => {
    try {
        const phone = request.data?.phone;
        if (!phone) {
            throw new HttpsError('invalid-argument', 'Phone number is required');
        }
        const result = await getSf().checkContact(phone);
        return { success: true, ...result };
    }
    catch (error) {
        console.error('checkContactExists Error:', error);
        throw new HttpsError('internal', error.message);
    }
});
/**
 * 🔔 NOTIFY MEMBERS
 */
const notifyMembersV2 = onRequest(async (request, response) => {
    const { title, body, target, type } = request.body;
    if (!title || !body) {
        response.status(400).send({ success: false, error: 'Missing title or body' });
        return;
    }
    try {
        console.log(`🔔 Sending Notification: [${title}] to [${target || 'All'}]`);
        let query = getDb().collection('users');
        if (target && target !== 'all') {
            query = query.where('cellGroup', '==', target);
        }
        const snapshot = await query.get();
        const tokenSet = new Set();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.fcmToken)
                tokenSet.add(data.fcmToken);
        });
        const tokens = Array.from(tokenSet);
        if (tokens.length === 0) {
            response.status(200).send({ success: true, message: 'No registered tokens found' });
            return;
        }
        const message = {
            notification: { title, body },
            data: { type: type || 'general' },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    priority: 'max',
                    channelId: 'church_alerts'
                }
            },
            apns: {
                headers: {
                    'apns-priority': '10'
                },
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1
                    }
                }
            },
            tokens: tokens
        };
        const fcmResponse = await getMsg().sendEachForMulticast(message);
        console.log(`✅ Push Sent: ${fcmResponse.successCount} success, ${fcmResponse.failureCount} failed`);
        response.status(200).send({
            success: true, sent: fcmResponse.successCount, failed: fcmResponse.failureCount
        });
    }
    catch (error) {
        console.error('notifyMembers Error:', error);
        response.status(500).send({ success: false, error: error.message });
    }
});
/**
 * ⏰ AUTOMATED DAILY PROMISE SCHEDULER
 * Scheduled to run every day at 05:00 AM IST (01:30 AM UTC)
 */
export const automatedDailyPromise = onSchedule({ schedule: '0 5 * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' }, async (event) => {
    try {
        console.log('⏰ Running automatedDailyPromise scheduler for all churches...');
        const db = getDb();
        // Get date in IST
        const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const rootCollections = ['Rhema Church', 'churches'];
        for (const rootCol of rootCollections) {
            let churchesSnap;
            try {
                churchesSnap = await db.collection(rootCol).get();
            }
            catch (e) {
                continue;
            }
            for (const churchDoc of churchesSnap.docs) {
                const churchId = churchDoc.id;
                // Check if disabled for this specific church
                try {
                    const settingsDoc = await db.collection(rootCol).doc(churchId).collection('settings').doc('notifications').get();
                    const settings = settingsDoc.data();
                    if (settings && settings.dailyPromise && settings.dailyPromise.enabled === false) {
                        console.log(`🛑 Daily Promise automation is disabled for church: ${churchId} in ${rootCol}`);
                        continue;
                    }
                }
                catch (_) { }
                // Check if there's a promise for today for this church
                const promiseSnap = await db.collection(rootCol).doc(churchId).collection('promises').where('date', '==', dStr).limit(1).get();
                if (promiseSnap.empty) {
                    console.log(`⚠️ No daily promise found in Firestore for today (${dStr}) for church: ${churchId} in ${rootCol}`);
                    continue;
                }
                const promiseDoc = promiseSnap.docs[0];
                const promise = promiseDoc.data();
                // Skip drafts
                if (promise.status === 'Draft') {
                    console.log(`⚠️ Today's promise is marked as Draft, skipping automated publish: ${churchId}`);
                    continue;
                }
                // Check if a broadcast was ALREADY created for today's promise (in-memory check to prevent composite index requirement)
                const bcastsForToday = await db.collection(rootCol).doc(churchId).collection('broadcasts')
                    .where('date', '==', dStr)
                    .get();
                const alreadyBroadcast = bcastsForToday.docs.some((d) => d.data().type === 'promise');
                if (alreadyBroadcast) {
                    console.log(`ℹ️ Daily promise broadcast already exists for ${dStr} (${churchId}), skipping to prevent duplicate push.`);
                    if (promise.status === 'Scheduled') {
                        await promiseDoc.ref.update({ status: 'Published', autoPublishedAt: FieldValue.serverTimestamp() });
                    }
                    continue;
                }
                // If status was Scheduled, update to Published
                if (promise.status === 'Scheduled') {
                    await promiseDoc.ref.update({ status: 'Published', autoPublishedAt: FieldValue.serverTimestamp() });
                    console.log(`✅ Updated Scheduled promise to Published for ${dStr} (${churchId})`);
                }
                // Fallbacks for content based on app schema
                const content = promise.verse || promise.textEn || promise.text || promise.Promises__c || promise.Promise_text_telugu__c || 'Grace and Peace be multiplied to you today.';
                const title = promise.verseReferenceEn ? `📖 Daily Promise: ${promise.verseReferenceEn}` : '📖 Today\'s Promise · ఈ రోజు వాగ్దానం';
                // Push to broadcasts collection for this church - this automatically triggers processRhemaBroadcastPushNotifications!
                await db.collection(rootCol).doc(churchId).collection('broadcasts').add({
                    title: title,
                    content: content,
                    date: dStr,
                    type: 'promise',
                    silent: false,
                    targetChurchId: churchId,
                    createdAt: FieldValue.serverTimestamp()
                });
                console.log(`✅ Automated Daily Promise broadcast added for ${churchId} on date ${dStr}`);
            }
        }
    }
    catch (error) {
        console.error('Error in automatedDailyPromise scheduler:', error);
    }
});
/**
 * ⏰ AUTOMATED DAILY BIRTHDAYS TRIGGER (Manual Cloud Scheduler Endpoint)
 */
const triggerAutomatedBirthdays = onRequest({ timeoutSeconds: 300, cors: true }, async (req, res) => {
    try {
        console.log('⏰ Running automatedDailyBirthdays scheduler...');
        const db = getDb();
        // Check if enabled
        const settingsDoc = await db.collection('churches').doc(DEFAULT_CHURCH_ID).collection('settings').doc('notifications').get();
        const settings = settingsDoc.data();
        if (settings && settings.birthdayNotif && settings.birthdayNotif.enabled === false) {
            console.log('🔇 Birthday greetings automation is disabled.');
            res.status(200).send('Birthday greetings automation is disabled.');
            return;
        }
        // Fetch birthdays from Firestore members collection instead of Salesforce
        const today = new Date();
        const m = today.getMonth() + 1;
        const d = today.getDate();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonthStr = monthNames[today.getMonth()];
        const churchesSnap = await db.collection('churches')
            .where('whatsappIntegrationEnabled', '==', true)
            .where('automatedWhatsappWishesEnabled', '==', true)
            .get();
        const enabledChurchIds = new Set();
        const churchTemplates = new Map();
        churchesSnap.forEach((doc) => {
            enabledChurchIds.add(doc.id);
            const data = doc.data();
            const monthly = data.monthlyCelebrationTemplates;
            const fallback = data.automatedWeCelebrationTemplate || {};
            const tpl = (monthly && monthly[currentMonthStr]) ? monthly[currentMonthStr] : fallback;
            // Store the actual church name from the document so we can use it in the image
            tpl.actualChurchName = data.name || data.churchName || '';
            churchTemplates.set(doc.id, tpl);
        });
        const legacyMembersSnap = await db.collection('members').get();
        const churchMembersSnap = await db.collectionGroup('members').get();
        const processedMemberIds = new Set();
        const bdays = [];
        const processDoc = (doc, churchId) => {
            if (processedMemberIds.has(doc.id))
                return;
            processedMemberIds.add(doc.id);
            const data = doc.data();
            const dobStr = data.dateOfBirth || data.dob || data.birthday;
            if (!dobStr)
                return;
            const parts = dobStr.split(/[-/]/);
            if (parts.length < 3)
                return;
            let month, day;
            if (parts[0].length === 4) { // YYYY-MM-DD
                month = parseInt(parts[1], 10);
                day = parseInt(parts[2], 10);
            }
            else if (parts[2].length === 4) { // DD-MM-YYYY
                day = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10);
            }
            else {
                return;
            }
            if (month === m && day === d) {
                bdays.push({
                    id: doc.id,
                    churchId,
                    name: data.name || (data.firstName ? data.firstName + ' ' + (data.lastName || '') : 'Unknown'),
                    phone: data.phone || data.mobile
                });
            }
        };
        legacyMembersSnap.forEach((doc) => processDoc(doc, DEFAULT_CHURCH_ID));
        churchMembersSnap.forEach((doc) => {
            const cId = doc.ref.parent.parent?.id || DEFAULT_CHURCH_ID;
            processDoc(doc, cId);
        });
        if (bdays.length === 0) {
            console.log('📆 No birthdays celebrating today.');
            res.status(200).send('No birthdays celebrating today.');
            return;
        }
        const greetingTemplate = settings?.birthdayNotif?.greeting || 'Wishing you a very Happy Birthday! May God bless you abundantly and fulfill all your prayers today. 🎂🙏';
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        // Send push notifications
        const snapshot = await db.collection('users').get();
        const userMap = new Map(); // name/phone -> fcmToken
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.fcmToken) {
                if (data.name)
                    userMap.set(data.name.toLowerCase(), data.fcmToken);
                if (data.phone)
                    userMap.set(data.phone.slice(-10), data.fcmToken);
            }
        });
        for (const member of bdays) {
            const personalGreeting = `Dear ${member.name}, ${greetingTemplate}`;
            // Save to broadcasts (targeted to this member only)
            const targetChurchId = member.churchId || DEFAULT_CHURCH_ID;
            const docRef = await db.collection('churches').doc(targetChurchId).collection('broadcasts').add({
                title: `🎂 Happy Birthday, ${member.name}!`,
                content: personalGreeting,
                date: dateStr,
                type: 'birthday',
                targetPhone: member.phone || '',
                silent: true,
                createdAt: FieldValue.serverTimestamp()
            });
            // Target individual user token if matches
            const token = userMap.get(member.name.toLowerCase()) || (member.phone ? userMap.get(member.phone.slice(-10)) : null);
            if (token) {
                const message = {
                    notification: {
                        title: `🎂 Happy Birthday, ${member.name}!`,
                        body: greetingTemplate
                    },
                    data: {
                        type: 'birthday',
                        id: docRef.id
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            priority: 'max',
                            channelId: 'church_alerts'
                        }
                    },
                    apns: {
                        headers: {
                            'apns-priority': '10'
                        },
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1
                            }
                        }
                    },
                    token: token
                };
                await getMsg().send(message);
                console.log(`✅ Individual Birthday FCM sent to ${member.name}`);
            }
            // Automatically send WhatsApp message
            if (member.phone && enabledChurchIds.has(member.churchId)) {
                try {
                    const tpl = churchTemplates.get(member.churchId) || {};
                    let msg = tpl.message || greetingTemplate;
                    let firstWord = member.name.split(' ')[0];
                    let formattedMsg = msg.includes(firstWord) || msg.toLowerCase().includes('dear ')
                        ? msg
                        : `Dear ${firstWord}, ${msg}`;
                    const verseStr = tpl.verseText ? `"${tpl.verseText}" — ${tpl.verseRef}` : '';
                    let imageUrl = tpl.imageUrl;
                    if (!imageUrl) {
                        const color = tpl.themeColor || '#3b82f6';
                        const pngBuffer = await generateCelebrationImage({
                            themeColor: color,
                            type: 'birthday',
                            name: member.name,
                            message: formattedMsg,
                            churchName: tpl.actualChurchName || tpl.churchName
                        });
                        const fileName = `automated_wishes/${member.churchId}/birthday_${Date.now()}.png`;
                        const file = getStorage().bucket().file(fileName);
                        const downloadToken = randomUUID();
                        try {
                            await file.save(pngBuffer, {
                                contentType: 'image/png',
                                metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } }
                            });
                            imageUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
                        }
                        catch (uploadErr) {
                            console.warn('⚠️ Local upload failed, using fallback image for WhatsApp testing');
                            imageUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80';
                        }
                    }
                    await sendWhatsAppTemplateInternal(member.churchId, member.phone, 'birthday_card', 'en', imageUrl, 'Automated Birthday Wish', [formattedMsg, verseStr]);
                    console.log(`✅ WhatsApp Birthday message sent to ${member.name}`);
                }
                catch (waErr) {
                    console.error(`❌ Failed to send WhatsApp to ${member.name}:`, waErr);
                }
            }
        }
        res.status(200).send(`Birthday automation completed. Processed ${bdays.length} members.`);
    }
    catch (error) {
        console.error('Error in automatedDailyBirthdays:', error);
        res.status(500).send('Error executing birthday automation.');
    }
});
/**
 * ⏰ AUTOMATED DAILY ANNIVERSARIES TRIGGER (Manual Cloud Scheduler Endpoint)
 */
const triggerAutomatedAnniversaries = onRequest({ timeoutSeconds: 300, cors: true }, async (req, res) => {
    try {
        console.log('⏰ Running automatedDailyAnniversaries scheduler...');
        const db = getDb();
        // Check if enabled
        const settingsDoc = await db.collection('churches').doc(DEFAULT_CHURCH_ID).collection('settings').doc('notifications').get();
        const settings = settingsDoc.data();
        if (settings && settings.anniversaryNotif && settings.anniversaryNotif.enabled === false) {
            console.log('🔇 Anniversary greetings automation is disabled.');
            res.status(200).send('Anniversary greetings automation is disabled.');
            return;
        }
        // Fetch anniversaries from Firestore members collection
        const today = new Date();
        const m = today.getMonth() + 1;
        const d = today.getDate();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonthStr = monthNames[today.getMonth()];
        const churchesSnap = await db.collection('churches')
            .where('whatsappIntegrationEnabled', '==', true)
            .where('automatedWhatsappWishesEnabled', '==', true)
            .get();
        const enabledChurchIds = new Set();
        const churchTemplates = new Map();
        churchesSnap.forEach((doc) => {
            enabledChurchIds.add(doc.id);
            const data = doc.data();
            const monthly = data.monthlyCelebrationTemplates;
            const fallback = data.automatedWeCelebrationTemplate || {};
            const tpl = (monthly && monthly[currentMonthStr]) ? monthly[currentMonthStr] : fallback;
            tpl.actualChurchName = data.name || data.churchName || '';
            churchTemplates.set(doc.id, tpl);
        });
        const legacyMembersSnap = await db.collection('members').get();
        const churchMembersSnap = await db.collectionGroup('members').get();
        const processedMemberIds = new Set();
        const annivs = [];
        const processDoc = (doc, churchId) => {
            if (processedMemberIds.has(doc.id))
                return;
            processedMemberIds.add(doc.id);
            const data = doc.data();
            const annivStr = data.marriageDate || data.anniversaryDate || data.anniversary;
            if (!annivStr)
                return;
            const parts = annivStr.split(/[-/]/);
            if (parts.length < 3)
                return;
            let year, month, day;
            if (parts[0].length === 4) { // YYYY-MM-DD
                year = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10);
                day = parseInt(parts[2], 10);
            }
            else if (parts[2].length === 4) { // DD-MM-YYYY
                day = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10);
                year = parseInt(parts[2], 10);
            }
            else {
                return;
            }
            if (month === m && day === d) {
                const currentYear = new Date().getFullYear();
                const years = year > 1900 ? currentYear - year : 0;
                let husband = data.husbandName;
                let wife = data.wifeName;
                if (!husband && !wife) {
                    if (data.gender === 'Male') {
                        husband = data.name || (data.firstName ? data.firstName + ' ' + (data.lastName || '') : 'Unknown');
                        wife = data.spouseName || 'Sister';
                    }
                    else {
                        wife = data.name || (data.firstName ? data.firstName + ' ' + (data.lastName || '') : 'Unknown');
                        husband = data.spouseName || 'Brother';
                    }
                }
                annivs.push({
                    id: doc.id,
                    churchId,
                    husband: husband || 'Brother',
                    wife: wife || 'Sister',
                    years: years || '',
                    phone: data.phone || data.mobile
                });
            }
        };
        legacyMembersSnap.forEach((doc) => processDoc(doc, DEFAULT_CHURCH_ID));
        churchMembersSnap.forEach((doc) => {
            const cId = doc.ref.parent.parent?.id || DEFAULT_CHURCH_ID;
            processDoc(doc, cId);
        });
        if (annivs.length === 0) {
            console.log('📆 No wedding anniversaries celebrating today.');
            res.status(200).send('No wedding anniversaries celebrating today.');
            return;
        }
        const greetingTemplate = settings?.anniversaryNotif?.greeting || 'Wishing you a wonderful wedding anniversary! May God bless your home with love, joy, and peace. 💐💒';
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        // Send push notifications
        const snapshot = await db.collection('users').get();
        const userMap = new Map();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.fcmToken) {
                if (data.name)
                    userMap.set(data.name.toLowerCase(), data.fcmToken);
                if (data.phone)
                    userMap.set(data.phone.slice(-10), data.fcmToken);
            }
        });
        for (const ann of annivs) {
            const coupleNames = `${ann.husband} & ${ann.wife}`;
            const husbandTitle = ann.husband === 'Brother' ? '' : 'Brother ';
            const wifeTitle = ann.wife === 'Sister' ? '' : 'Sister ';
            const yearsText = ann.years ? `${ann.years}th ` : '';
            const personalGreeting = `Wishing ${husbandTitle}${ann.husband} & ${wifeTitle}${ann.wife} a wonderful ${yearsText}Wedding Anniversary! ${greetingTemplate}`;
            // Save to broadcasts (targeted to this couple only)
            const targetChurchId = ann.churchId || DEFAULT_CHURCH_ID;
            const docRef = await db.collection('churches').doc(targetChurchId).collection('broadcasts').add({
                title: `💐 Happy Wedding Anniversary!`,
                content: personalGreeting,
                date: dateStr,
                type: 'anniversary',
                targetPhone: ann.phone || '',
                silent: true,
                createdAt: FieldValue.serverTimestamp()
            });
            // Target spouses
            const husbandToken = userMap.get(ann.husband.toLowerCase());
            const wifeToken = userMap.get(ann.wife.toLowerCase());
            const phoneToken = ann.phone ? userMap.get(ann.phone.slice(-10)) : null;
            const targetTokens = [...new Set([husbandToken, wifeToken, phoneToken].filter(Boolean))];
            if (targetTokens.length > 0) {
                const message = {
                    notification: {
                        title: `💐 Happy Wedding Anniversary!`,
                        body: `Wishing you a wonderful anniversary! ${greetingTemplate}`
                    },
                    data: {
                        type: 'anniversary',
                        id: docRef.id
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            priority: 'max',
                            channelId: 'church_alerts'
                        }
                    },
                    apns: {
                        headers: {
                            'apns-priority': '10'
                        },
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1
                            }
                        }
                    },
                    tokens: targetTokens
                };
                await getMsg().sendEachForMulticast(message);
                console.log(`✅ Individual Anniversary FCM sent to couple`);
            }
            // Automatically send WhatsApp message
            if (ann.phone) {
                try {
                    if (ann.churchId === DEFAULT_CHURCH_ID || enabledChurchIds.has(ann.churchId)) {
                        const tpl = churchTemplates.get(ann.churchId) || {};
                        let msg = tpl.message || greetingTemplate;
                        let couple = `${ann.husband} & ${ann.wife}`;
                        let formattedMsg = msg.includes(couple) || msg.toLowerCase().includes('dear ')
                            ? msg
                            : `Dear ${couple}, ${msg}`;
                        const verseStr = tpl.verseText ? `"${tpl.verseText}" — ${tpl.verseRef}` : '';
                        let imageUrl = tpl.imageUrl;
                        if (!imageUrl) {
                            const color = tpl.themeColor || '#3b82f6';
                            const pngBuffer = await generateCelebrationImage({
                                themeColor: color,
                                type: 'anniversary',
                                name: couple,
                                message: formattedMsg,
                                churchName: tpl.actualChurchName || tpl.churchName
                            });
                            const fileName = `automated_wishes/${ann.churchId}/anniversary_${Date.now()}.png`;
                            const file = getStorage().bucket().file(fileName);
                            const downloadToken = randomUUID();
                            try {
                                await file.save(pngBuffer, {
                                    contentType: 'image/png',
                                    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } }
                                });
                                imageUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
                            }
                            catch (uploadErr) {
                                console.warn('⚠️ Local upload failed, using fallback image for WhatsApp testing');
                                imageUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80';
                            }
                        }
                        await sendWhatsAppTemplateInternal(ann.churchId, ann.phone, 'birthday_card', 'en', imageUrl, 'Automated Anniversary Wish', [formattedMsg, verseStr]);
                        console.log(`✅ WhatsApp Anniversary message sent to ${ann.husband} & ${ann.wife}`);
                    }
                }
                catch (waErr) {
                    console.error(`❌ Failed to send WhatsApp Anniversary to ${ann.husband}:`, waErr);
                }
            }
        }
        res.status(200).send(`Anniversary automation completed. Processed ${annivs.length} couples.`);
    }
    catch (error) {
        console.error('Error in automatedDailyAnniversaries:', error);
        res.status(500).send('Error executing anniversary automation.');
    }
});
/**
 * ⏰ AUTOMATED DAILY BAPTISM ANNIVERSARIES TRIGGER (Manual Cloud Scheduler Endpoint)
 */
const triggerAutomatedBaptisms = onRequest({ timeoutSeconds: 300, cors: true }, async (req, res) => {
    try {
        console.log('⏰ Running automatedDailyBaptisms scheduler...');
        const db = getDb();
        // Check if enabled
        const settingsDoc = await db.collection('churches').doc(DEFAULT_CHURCH_ID).collection('settings').doc('notifications').get();
        const settings = settingsDoc.data();
        if (settings && settings.baptismNotif && settings.baptismNotif.enabled === false) {
            console.log('🔇 Baptism greetings automation is disabled.');
            res.status(200).send('Baptism greetings automation is disabled.');
            return;
        }
        // Fetch baptisms from Firestore members collection
        const today = new Date();
        const m = today.getMonth() + 1;
        const d = today.getDate();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonthStr = monthNames[today.getMonth()];
        const churchesSnap = await db.collection('churches')
            .where('whatsappIntegrationEnabled', '==', true)
            .where('automatedWhatsappWishesEnabled', '==', true)
            .get();
        const enabledChurchIds = new Set();
        const churchTemplates = new Map();
        churchesSnap.forEach((doc) => {
            enabledChurchIds.add(doc.id);
            const data = doc.data();
            const monthly = data.monthlyCelebrationTemplates;
            const fallback = data.automatedWeCelebrationTemplate || {};
            const tpl = (monthly && monthly[currentMonthStr]) ? monthly[currentMonthStr] : fallback;
            tpl.actualChurchName = data.name || data.churchName || '';
            churchTemplates.set(doc.id, tpl);
        });
        const legacyMembersSnap = await db.collection('members').get();
        const churchMembersSnap = await db.collectionGroup('members').get();
        const processedMemberIds = new Set();
        const baptisms = [];
        const processDoc = (doc, churchId) => {
            if (processedMemberIds.has(doc.id))
                return;
            processedMemberIds.add(doc.id);
            const data = doc.data();
            const bapStr = data.baptismDate || data.baptism;
            if (!bapStr)
                return;
            const parts = bapStr.split(/[-/]/);
            if (parts.length < 3)
                return;
            let year, month, day;
            if (parts[0].length === 4) { // YYYY-MM-DD
                year = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10);
                day = parseInt(parts[2], 10);
            }
            else if (parts[2].length === 4) { // DD-MM-YYYY
                day = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10);
                year = parseInt(parts[2], 10);
            }
            else {
                return;
            }
            if (month === m && day === d) {
                const currentYear = new Date().getFullYear();
                const years = year > 1900 ? currentYear - year : 0;
                baptisms.push({
                    id: doc.id,
                    churchId,
                    name: data.name || (data.firstName ? data.firstName + ' ' + (data.lastName || '') : 'Unknown'),
                    years: years || '',
                    phone: data.phone || data.mobile
                });
            }
        };
        legacyMembersSnap.forEach((doc) => processDoc(doc, DEFAULT_CHURCH_ID));
        churchMembersSnap.forEach((doc) => {
            const cId = doc.ref.parent.parent?.id || DEFAULT_CHURCH_ID;
            processDoc(doc, cId);
        });
        if (baptisms.length === 0) {
            console.log('📆 No baptism anniversaries celebrating today.');
            console.log('No baptism anniversaries celebrating today.');
            return;
        }
        const greetingTemplate = settings?.baptismNotif?.greeting || 'Happy Baptism Anniversary! May you continue to grow in faith and walk in His light. 🙏🕊️';
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        // Send push notifications
        const snapshot = await db.collection('users').get();
        const userMap = new Map(); // name/phone -> fcmToken
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.fcmToken) {
                if (data.name)
                    userMap.set(data.name.toLowerCase(), data.fcmToken);
                if (data.phone)
                    userMap.set(data.phone.slice(-10), data.fcmToken);
            }
        });
        for (const member of baptisms) {
            const personalGreeting = `Dear ${member.name}, ${greetingTemplate}`;
            // Save to broadcasts (targeted to this member only)
            const targetChurchId = member.churchId || DEFAULT_CHURCH_ID;
            const docRef = await db.collection('churches').doc(targetChurchId).collection('broadcasts').add({
                title: `🕊️ Happy Baptism Anniversary, ${member.name}!`,
                content: personalGreeting,
                date: dateStr,
                type: 'baptism',
                targetPhone: member.phone || '',
                silent: true,
                createdAt: FieldValue.serverTimestamp()
            });
            // Target individual user token if matches
            const token = userMap.get(member.name.toLowerCase()) || (member.phone ? userMap.get(member.phone.slice(-10)) : null);
            if (token) {
                const message = {
                    notification: {
                        title: `🕊️ Happy Baptism Anniversary, ${member.name}!`,
                        body: greetingTemplate
                    },
                    data: {
                        type: 'baptism',
                        id: docRef.id
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            priority: 'max',
                            channelId: 'church_alerts'
                        }
                    },
                    apns: {
                        headers: {
                            'apns-priority': '10'
                        },
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1
                            }
                        }
                    },
                    token: token
                };
                await getMsg().send(message);
                console.log(`✅ Individual Baptism FCM sent to ${member.name}`);
            }
            // Automatically send WhatsApp message
            if (member.phone) {
                try {
                    if (member.churchId === DEFAULT_CHURCH_ID || enabledChurchIds.has(member.churchId)) {
                        const tpl = churchTemplates.get(member.churchId) || {};
                        let msg = tpl.message || greetingTemplate;
                        let firstWord = member.name.split(' ')[0];
                        let formattedMsg = msg.includes(firstWord) || msg.toLowerCase().includes('dear ')
                            ? msg
                            : `Dear ${firstWord}, ${msg}`;
                        const verseStr = tpl.verseText ? `"${tpl.verseText}" — ${tpl.verseRef}` : '';
                        let imageUrl = tpl.imageUrl;
                        if (!imageUrl) {
                            const color = tpl.themeColor || '#3b82f6'; // Default blue
                            const pngBuffer = await generateCelebrationImage({
                                themeColor: color,
                                type: 'baptism',
                                name: member.name,
                                message: formattedMsg,
                                churchName: tpl.actualChurchName || tpl.churchName
                            });
                            const fileName = `automated_wishes/${member.churchId}/baptism_${Date.now()}.png`;
                            const file = getStorage().bucket().file(fileName);
                            const downloadToken = randomUUID();
                            try {
                                await file.save(pngBuffer, {
                                    contentType: 'image/png',
                                    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } }
                                });
                                imageUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
                            }
                            catch (uploadErr) {
                                console.warn('⚠️ Local upload failed, using fallback image for WhatsApp testing');
                                imageUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80';
                            }
                        }
                        await sendWhatsAppTemplateInternal(member.churchId, member.phone, 'birthday_card', 'en', imageUrl, 'Automated Baptism Wish', [formattedMsg, verseStr]);
                        console.log(`✅ WhatsApp Baptism message sent to ${member.name}`);
                    }
                }
                catch (waErr) {
                    console.error(`❌ Failed to send WhatsApp Baptism message to ${member.name}:`, waErr);
                }
            }
        }
        res.status(200).send(`Baptism automation completed. Processed ${baptisms.length} members.`);
    }
    catch (error) {
        console.error('Error in automatedDailyBaptisms:', error);
        res.status(500).send('Error executing baptism automation.');
    }
});
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
/**
 * 📣 ON BROADCAST CREATED TRIGGER (Gen 2)
 * Automatically sends push notifications when a new broadcast is added to Firestore (e.g. Emergency Meeting or custom admin updates)
 */
/**
 * Common logic to handle broadcast push notification dispatch
 */
async function handleBroadcastPushDispatch(data, churchIdParam, messageIdParam) {
    if (!data)
        return;
    // Skip if silent/already handled by scheduler
    if (data.silent === true) {
        console.log(`🛑 Skipping broadcast push for silent document: ${messageIdParam}`);
        return;
    }
    const title = data.title || 'Church Update';
    const body = data.content || '';
    const type = data.type || 'general';
    const churchId = churchIdParam || data.targetChurchId || DEFAULT_CHURCH_ID;
    console.log(`🔔 handleBroadcastPushDispatch fired for: [${title}] type: [${type}] church: [${churchId}]`);
    try {
        const db = getDb();
        const tokenSet = new Set();
        // 1. Gather tokens from 'Rhema Church'/{churchId}/members (Primary single-church collection)
        try {
            const rhemaMemSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();
            rhemaMemSnap.forEach((doc) => {
                const mData = doc.data();
                if (data.targetPhone && mData.phone) {
                    const rawDigits = data.targetPhone.replace(/\D/g, '');
                    const last10 = rawDigits.slice(-10);
                    if (!mData.phone.includes(last10))
                        return;
                }
                if (mData.fcmToken && typeof mData.fcmToken === 'string' && mData.fcmToken.trim().length > 0) {
                    tokenSet.add(mData.fcmToken.trim());
                }
            });
        }
        catch (err) {
            console.warn(`Could not read 'Rhema Church'/${churchId}/members for tokens:`, err);
        }
        // 2. Also gather tokens from legacy 'churches'/{churchId}/members if any
        try {
            const memSnap = await db.collection('churches').doc(churchId).collection('members').get();
            memSnap.forEach((doc) => {
                const mData = doc.data();
                if (data.targetPhone && mData.phone) {
                    const rawDigits = data.targetPhone.replace(/\D/g, '');
                    const last10 = rawDigits.slice(-10);
                    if (!mData.phone.includes(last10))
                        return;
                }
                if (mData.fcmToken && typeof mData.fcmToken === 'string' && mData.fcmToken.trim().length > 0) {
                    tokenSet.add(mData.fcmToken.trim());
                }
            });
        }
        catch (_) { }
        // 3. Also check root 'users' collection where primaryChurchId == churchId
        try {
            let query = db.collection('users');
            if (churchId) {
                query = query.where('primaryChurchId', '==', churchId);
            }
            const snapshotUsers = await query.get();
            snapshotUsers.forEach((doc) => {
                const uData = doc.data();
                if (data.targetPhone && uData.phone) {
                    const rawDigits = data.targetPhone.replace(/\D/g, '');
                    const last10 = rawDigits.slice(-10);
                    if (!uData.phone.includes(last10))
                        return;
                }
                if (uData.fcmToken && typeof uData.fcmToken === 'string' && uData.fcmToken.trim().length > 0) {
                    tokenSet.add(uData.fcmToken.trim());
                }
            });
        }
        catch (_) { }
        const plainBody = stripHtml(body);
        const targetQuizId = data.quizId || data.relatedId || (data.type === 'quiz' ? data.id : undefined);
        const notificationData = {
            type,
            id: String(targetQuizId || data.sermonId || messageIdParam || ''),
            ...(targetQuizId ? { quizId: String(targetQuizId) } : {}),
            ...(data.sermonId ? { sermonId: String(data.sermonId) } : {}),
            ...(data.screen ? { screen: String(data.screen) } : {}),
            ...(churchId ? { churchId: String(churchId) } : {}),
            ...(data.date ? { date: String(data.date) } : {}),
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        };
        const isPromise = type === 'promise' || type === 'daily_verse';
        const channelId = isPromise ? 'daily_verse' : 'church_alerts';
        const tokens = Array.from(tokenSet);
        console.log(`📱 Found ${tokens.length} eligible registered device tokens for church: ${churchId}`);
        // Direct multicast delivery to registered member devices
        if (tokens.length > 0) {
            for (let i = 0; i < tokens.length; i += 500) {
                const batch = tokens.slice(i, i + 500);
                const message = {
                    notification: {
                        title,
                        body: plainBody.length > 200 ? plainBody.substring(0, 197) + '...' : plainBody,
                    },
                    data: notificationData,
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            priority: 'max',
                            channelId: channelId,
                        },
                    },
                    apns: {
                        headers: {
                            'apns-priority': '10',
                        },
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1,
                            },
                        },
                    },
                    tokens: batch,
                };
                const response = await getMsg().sendEachForMulticast(message);
                console.log(`✅ Broadcast push delivered to tokens: ${response.successCount} success, ${response.failureCount} failed.`);
            }
        }
        else if (churchId && !data.targetPhone) {
            // Fallback: If no device tokens exist in DB, send to church topic so subscribers still receive it
            console.log(`⚠️ No individual device tokens found in DB, falling back to topic church_${churchId}`);
            await getMsg().send({
                notification: {
                    title,
                    body: plainBody.length > 200 ? plainBody.substring(0, 197) + '...' : plainBody,
                },
                data: notificationData,
                topic: `church_${churchId}`,
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        priority: 'max',
                        channelId: channelId,
                    },
                },
                apns: {
                    headers: {
                        'apns-priority': '10',
                    },
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1,
                        },
                    },
                },
            });
            console.log(`✅ Fallback broadcast push delivered to topic church_${churchId}`);
        }
    }
    catch (error) {
        console.error('Error sending broadcast push:', error);
    }
}
/**
 * 📣 ON BROADCAST CREATED TRIGGER (Rhema Church collection)
 * Catches all broadcasts created in 'Rhema Church/{churchId}/broadcasts/{messageId}'
 */
export const sendRhemaBroadcastPush = onDocumentCreated({ document: 'Rhema Church/{churchId}/broadcasts/{messageId}', region: 'asia-south1' }, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    await handleBroadcastPushDispatch(snapshot.data(), event.params.churchId, event.params.messageId);
});
/**
 * 📣 ON BROADCAST CREATED TRIGGER (Legacy churches collection)
 */
const processBroadcastPushNotifications = functionsCompat
    .region('asia-south1')
    .firestore
    .document('churches/{churchId}/broadcasts/{messageId}')
    .onCreate(async (snapshot, context) => {
    if (!snapshot)
        return;
    await handleBroadcastPushDispatch(snapshot.data(), context.params.churchId, context.params.messageId);
});
/**
 * 🧪 Test HTTP endpoint to trigger today's Daily Promise push notification on-demand
 */
export const triggerDailyPromisePushHttp = onRequest({ cors: true, region: 'asia-south1' }, async (req, res) => {
    try {
        const churchId = req.query.churchId || DEFAULT_CHURCH_ID;
        const db = getDb();
        const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        let promiseSnap = await db.collection('Rhema Church').doc(churchId).collection('promises').where('date', '==', dStr).limit(1).get();
        if (promiseSnap.empty) {
            promiseSnap = await db.collection('churches').doc(churchId).collection('promises').where('date', '==', dStr).limit(1).get();
        }
        if (promiseSnap.empty) {
            res.status(404).json({ error: `No promise found for date ${dStr} in church ${churchId}` });
            return;
        }
        const promise = promiseSnap.docs[0].data();
        const title = promise.verseReferenceEn ? `📖 Daily Promise: ${promise.verseReferenceEn}` : '📖 Today\'s Promise · ఈ రోజు వాగ్దానం';
        const content = promise.verse || promise.textEn || promise.text || 'Grace and Peace be multiplied to you today.';
        // Create broadcast in Rhema Church/{churchId}/broadcasts
        const docRef = await db.collection('Rhema Church').doc(churchId).collection('broadcasts').add({
            title: title,
            content: content,
            date: dStr,
            type: 'promise',
            silent: false,
            targetChurchId: churchId,
            createdAt: FieldValue.serverTimestamp()
        });
        res.json({ success: true, broadcastId: docRef.id, title, content, churchId });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * 📤 UPLOAD EVENT IMAGE
 */
const uploadEventImage = onCall({ invoker: 'public' }, async (request) => {
    try {
        const base64Data = request.data?.image;
        const fileName = request.data?.fileName || `img_${Date.now()}.jpg`;
        if (!base64Data) {
            throw new HttpsError('invalid-argument', 'Image data is required');
        }
        const bucket = getStorage().bucket('church-mobile-app-b7e27-event-banners');
        const file = bucket.file(`events/${fileName}`);
        await file.save(Buffer.from(base64Data, 'base64'), {
            metadata: {
                contentType: 'image/jpeg',
            }
        });
        // Make the file publicly accessible
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
        return { success: true, url: publicUrl };
    }
    catch (error) {
        console.error('uploadEventImage Error:', error);
        throw new HttpsError('internal', error.message);
    }
});
/**
 * Helper to fetch a URL using global fetch (Node 18+)
 */
async function fetchPage(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    });
    return res.text();
}
/**
 * ⏰ YOUTUBE LIVE CHECK SCHEDULER
 * Runs every 5 minutes to check if YouTube channel is live
 */
export const checkYouTubeLive = onSchedule('*/5 * * * *', async (event) => {
    try {
        console.log('⏰ Checking YouTube Live status...');
        const db = getDb();
        const churchRef = db.collection('Rhema Church').doc('rhema');
        const churchSnap = await churchRef.get();
        const cData = churchSnap.exists ? churchSnap.data() : {};
        const url = cData?.socialLinks?.youtube?.trim() || 'https://www.youtube.com/@Brothersinchristfellowship/live';
        const html = await fetchPage(url).catch(() => '');
        // Check if the stream is live
        const isLive = html.includes('"isLive":true') || html.includes('LIVE_STREAM') || html.includes('"style":"LIVE"');
        // Try to find the videoId
        let videoId = '';
        const match = html.match(/"liveStreamability".*?"videoId":"([^"]+)"/) || html.match(/"videoRenderer".*?"videoId":"([^"]+)"/);
        if (match && match[1]) {
            videoId = match[1];
        }
        const liveUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
        const prevState = cData?.youtubeLiveState || { isLive: false };
        // Save new state directly on Rhema Church/rhema (NO extra documents)
        await churchRef.set({
            youtubeLiveState: {
                isLive,
                url: liveUrl,
                videoId: videoId || '',
                lastChecked: FieldValue.serverTimestamp()
            }
        }, { merge: true });
        // State transition: was offline, now live!
        if (isLive && !prevState?.isLive) {
            console.log('🚨 YouTube Live Stream detected! Sending notifications...');
            const churchName = cData?.name || 'Rhema Church';
            const pushTitle = `🔴 ${churchName} is LIVE on YouTube!`;
            const pushBody = 'Join our live worship service now! Tap to watch inside the app. 🎥🙏';
            const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
            // 1. Add to existing broadcasts collection
            const docRef = await churchRef.collection('broadcasts').add({
                title: pushTitle,
                content: pushBody,
                date: dateStr,
                type: 'youtube_live',
                url: liveUrl,
                videoId: videoId || '',
                silent: true,
                createdAt: FieldValue.serverTimestamp()
            });
            // 2. Send topic push to all church members
            await getMsg().send({
                notification: {
                    title: pushTitle,
                    body: pushBody
                },
                data: {
                    type: 'youtube_live',
                    url: liveUrl,
                    videoId: videoId || '',
                    churchId: 'rhema',
                    title: pushTitle,
                    id: docRef.id
                },
                topic: 'church_rhema',
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        priority: 'max',
                        channelId: 'church_alerts'
                    }
                },
                apns: {
                    headers: { 'apns-priority': '10' },
                    payload: { aps: { sound: 'default', badge: 1 } }
                }
            }).catch((e) => console.error('Error sending topic push:', e));
        }
    }
    catch (error) {
        console.error('Error in checkYouTubeLive scheduler:', error);
    }
});
export const triggerTestYouTubeLive = onCall({ invoker: 'public' }, async (request) => {
    try {
        const liveUrl = request.data?.url || 'https://www.youtube.com/@Brothersinchristfellowship/live';
        const db = getDb();
        // Save to Firestore first
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        const docRef = await db.collection('churches').doc(DEFAULT_CHURCH_ID).collection('broadcasts').add({
            title: '🎥 YouTube Live Stream Started!',
            content: 'Brothers in Christ Fellowship is now LIVE on YouTube. Click to join the stream and worship with us! 🎥🙏',
            date: dateStr,
            type: 'youtube_live',
            url: liveUrl,
            silent: true,
            createdAt: FieldValue.serverTimestamp()
        });
        // Send topic push to all church members
        await getMsg().send({
            notification: {
                title: '🔴 We are Live on YouTube!',
                body: 'Brothers in Christ Fellowship is now live! Tap to watch inside the app. 🎥🙏'
            },
            data: {
                type: 'youtube_live',
                url: liveUrl,
                videoId: '',
                churchId: DEFAULT_CHURCH_ID,
                title: 'Brothers in Christ Fellowship Live Stream',
                id: docRef.id
            },
            topic: `church_${DEFAULT_CHURCH_ID}`,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    priority: 'max',
                    channelId: 'church_alerts'
                }
            },
            apns: {
                headers: { 'apns-priority': '10' },
                payload: { aps: { sound: 'default', badge: 1 } }
            }
        }).catch((e) => console.error('Error sending test topic push:', e));
        const snapshotUsers = await db.collection('users').get();
        const tokenSet = new Set();
        snapshotUsers.forEach((doc) => {
            const uData = doc.data();
            if (uData.fcmToken)
                tokenSet.add(uData.fcmToken);
        });
        const tokens = Array.from(tokenSet);
        if (tokens.length === 0) {
            return { success: false, message: 'No registered user tokens found' };
        }
        const message = {
            notification: {
                title: '🚨 We are Live on YouTube!',
                body: 'Join the Brothers in Christ Fellowship live stream now! 🎥🙏'
            },
            data: {
                type: 'youtube_live',
                url: liveUrl,
                videoId: '',
                churchId: DEFAULT_CHURCH_ID,
                title: 'Brothers in Christ Fellowship Live Stream',
                id: docRef.id
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    priority: 'max',
                    channelId: 'church_alerts'
                }
            },
            apns: {
                headers: {
                    'apns-priority': '10'
                },
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1
                    }
                }
            },
            tokens: tokens
        };
        const response = await getMsg().sendEachForMulticast(message);
        return { success: true, sent: response.successCount, failed: response.failureCount, broadcastId: docRef.id };
    }
    catch (error) {
        console.error('triggerTestYouTubeLive Error:', error);
        throw new HttpsError('internal', error.message);
    }
});
const testBdaysV10 = functionsCompat.https.onRequest(async (req, res) => {
    try {
        const db = getDb();
        const settingsDoc = await db.collection('churches').doc(DEFAULT_CHURCH_ID).collection('settings').doc('notifications').get();
        const settings = settingsDoc.data();
        if (settings && settings.birthdayNotif && settings.birthdayNotif.enabled === false) {
            console.log('Birthday greetings disabled.');
            return;
        }
        const today = new Date();
        const m = today.getMonth() + 1;
        const d = today.getDate();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonthStr = monthNames[today.getMonth()];
        const churchesSnap = await db.collection('churches').where('whatsappIntegrationEnabled', '==', true).where('automatedWhatsappWishesEnabled', '==', true).get();
        const enabledChurchIds = new Set();
        const churchTemplates = new Map();
        churchesSnap.forEach((doc) => {
            enabledChurchIds.add(doc.id);
            const data = doc.data();
            const monthly = data.monthlyCelebrationTemplates;
            const fallback = data.automatedWeCelebrationTemplate || {};
            const tpl = (monthly && monthly[currentMonthStr]) ? monthly[currentMonthStr] : fallback;
            tpl.actualChurchName = data.name || data.churchName || '';
            churchTemplates.set(doc.id, tpl);
        });
        const legacyMembersSnap = await db.collection('members').get();
        const legacyMembers = [];
        legacyMembersSnap.forEach((doc) => {
            const data = doc.data();
            if (data.dob && data.status === 'Active')
                legacyMembers.push({ id: doc.id, ...data });
        });
        const multiTenantMembersSnap = await db.collectionGroup('members').get();
        const multiTenantMembers = [];
        multiTenantMembersSnap.forEach((doc) => {
            const data = doc.data();
            if (data.dob && data.status === 'Active')
                multiTenantMembers.push({ id: doc.id, churchId: doc.ref.parent.parent?.id, ...data });
        });
        const allMembers = [...legacyMembers, ...multiTenantMembers];
        const uniqueMembers = new Map();
        allMembers.forEach(m => {
            if (m.phone && !uniqueMembers.has(m.phone))
                uniqueMembers.set(m.phone, m);
        });
        const dedupedMembers = Array.from(uniqueMembers.values());
        let count = 0;
        for (const member of dedupedMembers) {
            if (!member.dob)
                continue;
            const [year, monthStr, dayStr] = member.dob.split('-');
            if (!monthStr || !dayStr)
                continue;
            if (parseInt(monthStr) === m && parseInt(dayStr) === d) {
                count++;
                const targetChurchId = member.churchId || DEFAULT_CHURCH_ID;
                const bdayRef = db.collection('churches').doc(targetChurchId).collection('broadcasts').doc();
                await bdayRef.set({
                    title: `🎂 Happy Birthday ${member.name}!`,
                    content: `Wishing you a very Happy Birthday! May God bless you abundantly and fulfill all your prayers today. 🙏🎈`,
                    date: today.toISOString(),
                    type: 'birthday',
                    category: 'Birthday',
                    author: 'Church Admin',
                    likes: [],
                    comments: 0,
                    targetPhone: member.phone
                });
                const tokenSnap = await db.collection('users').where('phone', '==', member.phone).get();
                if (!tokenSnap.empty) {
                    const userDoc = tokenSnap.docs[0];
                    const userData = userDoc?.data();
                    if (userData?.fcmToken) {
                        await getMsg().send({
                            token: userData.fcmToken,
                            notification: { title: `🎂 Happy Birthday ${member.name}!`, body: 'May God bless you abundantly today! Tap to view.' },
                            data: { type: 'birthday', id: bdayRef.id }
                        });
                    }
                }
            }
        }
        console.log(`Done bdays. Count: ${count}`);
    }
    catch (error) {
        res.status(500).send(error.message);
    }
});
const testAnnivsV1 = functionsCompat.https.onRequest(async (req, res) => {
    try {
        const db = getDb();
        const settingsDoc = await db.collection('churches').doc(DEFAULT_CHURCH_ID).collection('settings').doc('notifications').get();
        const settings = settingsDoc.data();
        if (settings && settings.anniversaryNotif && settings.anniversaryNotif.enabled === false) {
            console.log('Annivs disabled.');
            return;
        }
        const today = new Date();
        const m = today.getMonth() + 1;
        const d = today.getDate();
        const legacyMembersSnap = await db.collection('members').get();
        const legacyMembers = [];
        legacyMembersSnap.forEach((doc) => {
            const data = doc.data();
            if (data.weddingAnniversary && data.status === 'Active')
                legacyMembers.push({ id: doc.id, ...data });
        });
        const multiTenantMembersSnap = await db.collectionGroup('members').get();
        const multiTenantMembers = [];
        multiTenantMembersSnap.forEach((doc) => {
            const data = doc.data();
            if (data.weddingAnniversary && data.status === 'Active')
                multiTenantMembers.push({ id: doc.id, churchId: doc.ref.parent.parent?.id, ...data });
        });
        const allMembers = [...legacyMembers, ...multiTenantMembers];
        const uniqueMembers = new Map();
        allMembers.forEach(mem => {
            if (mem.phone && !uniqueMembers.has(mem.phone))
                uniqueMembers.set(mem.phone, mem);
        });
        const dedupedMembers = Array.from(uniqueMembers.values());
        let count = 0;
        for (const ann of dedupedMembers) {
            if (!ann.weddingAnniversary)
                continue;
            const [year, monthStr, dayStr] = ann.weddingAnniversary.split('-');
            if (!monthStr || !dayStr)
                continue;
            if (parseInt(monthStr) === m && parseInt(dayStr) === d) {
                count++;
                const targetChurchId = ann.churchId || DEFAULT_CHURCH_ID;
                const annRef = db.collection('churches').doc(targetChurchId).collection('broadcasts').doc();
                await annRef.set({
                    title: `💐 Happy Wedding Anniversary ${ann.name}!`,
                    content: `Wishing you a wonderful wedding anniversary! May God bless your home with love, joy, and peace. 💒💖`,
                    date: today.toISOString(),
                    type: 'anniversary',
                    category: 'Anniversary',
                    author: 'Church Admin',
                    likes: [],
                    comments: 0,
                    targetPhone: ann.phone
                });
                const tokenSnap = await db.collection('users').where('phone', '==', ann.phone).get();
                if (!tokenSnap.empty) {
                    const userDoc = tokenSnap.docs[0];
                    const userData = userDoc?.data();
                    if (userData?.fcmToken) {
                        await getMsg().send({
                            token: userData.fcmToken,
                            notification: { title: `💐 Happy Anniversary ${ann.name}!`, body: 'May God bless your home with love! Tap to view.' },
                            data: { type: 'anniversary', id: annRef.id }
                        });
                    }
                }
            }
        }
        console.log(`Done annivs. Count: ${count}`);
    }
    catch (error) {
        res.status(500).send(error.message);
    }
});
const testBaptismsV1 = functionsCompat.https.onRequest(async (req, res) => {
    try {
        const db = getDb();
        const today = new Date();
        const m = today.getMonth() + 1;
        const d = today.getDate();
        const legacyMembersSnap = await db.collection('members').get();
        const legacyMembers = [];
        legacyMembersSnap.forEach((doc) => {
            const data = doc.data();
            if (data.baptismDate && data.status === 'Active')
                legacyMembers.push({ id: doc.id, ...data });
        });
        const multiTenantMembersSnap = await db.collectionGroup('members').get();
        const multiTenantMembers = [];
        multiTenantMembersSnap.forEach((doc) => {
            const data = doc.data();
            if (data.baptismDate && data.status === 'Active')
                multiTenantMembers.push({ id: doc.id, churchId: doc.ref.parent.parent?.id, ...data });
        });
        const allMembers = [...legacyMembers, ...multiTenantMembers];
        const uniqueMembers = new Map();
        allMembers.forEach(mem => {
            if (mem.phone && !uniqueMembers.has(mem.phone))
                uniqueMembers.set(mem.phone, mem);
        });
        const dedupedMembers = Array.from(uniqueMembers.values());
        let count = 0;
        for (const member of dedupedMembers) {
            if (!member.baptismDate)
                continue;
            const [year, monthStr, dayStr] = member.baptismDate.split('-');
            if (!monthStr || !dayStr)
                continue;
            if (parseInt(monthStr) === m && parseInt(dayStr) === d) {
                count++;
                const targetChurchId = member.churchId || DEFAULT_CHURCH_ID;
                const bdayRef = db.collection('churches').doc(targetChurchId).collection('broadcasts').doc();
                await bdayRef.set({
                    title: `🕊️ Happy Baptism Anniversary ${member.name}!`,
                    content: `Happy Baptism Anniversary! May you continue to grow in faith and walk in His light. 🙏🕊️`,
                    date: today.toISOString(),
                    type: 'celebration',
                    category: 'Baptism',
                    author: 'Church Admin',
                    likes: [],
                    comments: 0,
                    targetPhone: member.phone
                });
                const tokenSnap = await db.collection('users').where('phone', '==', member.phone).get();
                if (!tokenSnap.empty) {
                    const userDoc = tokenSnap.docs[0];
                    const userData = userDoc?.data();
                    if (userData?.fcmToken) {
                        await getMsg().send({
                            token: userData.fcmToken,
                            notification: { title: `🕊️ Happy Baptism Anniversary ${member.name}!`, body: 'May you continue to grow in faith! Tap to view.' },
                            data: { type: 'baptism', id: bdayRef.id }
                        });
                    }
                }
            }
        }
        console.log(`Done baptisms. Count: ${count}`);
    }
    catch (error) {
        res.status(500).send(error.message);
    }
});
export { publishScheduledSermons, triggerPublishScheduledSermonsHttp, triggerDailyVersePushHttp, monitorMeetingLive, pushMeetingLive } from './notifications.js';
//# sourceMappingURL=index.js.map