import { Linking } from 'react-native';
import firebase from '@react-native-firebase/app';
import '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import { openZoomMeeting } from './ZoomLauncher';

export type CanonicalMeetingStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';

export function normalizeMeetingChurchId(raw?: unknown): string {
  const clean = String(raw || 'rhema').trim();
  return !clean || clean === 'default' ? 'rhema' : clean;
}

export function isMeetingAdmin(member: any, isPlatformSuperAdmin = false): boolean {
  if (isPlatformSuperAdmin) return true;
  const roleStr = String(member?.userType || member?.role || '').toUpperCase();
  return (
    roleStr.includes('ADMIN') ||
    roleStr.includes('PASTOR') ||
    roleStr.includes('SUPER')
  );
}

export function parseMeetingTimestamp(val: any): Date | null {
  if (!val) return null;
  if (typeof val?.toDate === 'function') return val.toDate();
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000);
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const dt = new Date(val);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

/**
 * Resolves a meeting document's canonical lifecycle status ('scheduled' | 'live' | 'completed').
 * Never auto-promotes a scheduled meeting to 'live' without an explicit admin start action.
 */
export function resolveMeetingStatus(
  meeting: any,
  autoExpirePastScheduled = true
): CanonicalMeetingStatus {
  const raw = String(meeting?.status || '').trim().toLowerCase();
  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'completed' || raw === 'past' || raw === 'ended') return 'completed';
  if (raw === 'live') return 'live';

  if (autoExpirePastScheduled) {
    const endDt = parseMeetingTimestamp(meeting?.endTime);
    if (endDt && endDt.getTime() < Date.now()) {
      return 'completed';
    }
  }
  return 'scheduled';
}

function isFunctionMissingError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  return (
    code.includes('not-found') ||
    code.includes('unimplemented') ||
    msg.includes('not-found') ||
    msg.includes('not found')
  );
}

async function mirrorPatchToMeetingDocs(
  churchId: string,
  meetingId: string,
  patch: Record<string, any>
) {
  await firestore()
    .collection('Rhema Church')
    .doc(churchId)
    .collection('online_meetings')
    .doc(meetingId)
    .set(patch, { merge: true });

  await firestore()
    .collection('churches')
    .doc('default')
    .collection('online_meetings')
    .doc(meetingId)
    .set(patch, { merge: true })
    .catch(() => { });
}

export interface SaveEditedMeetingParams {
  churchId?: string;
  meetingId: string;
  title: string;
  topic: string;
  bibleBook: string;
  date: string;
  startTime: string;
  endTime: string;
  teacherId: string;
  teacherName: string;
  meetingLink: string;
  provider: 'zoom' | 'google_meet';
  startTimestamp: number;
  endTimestamp: number;
}

/**
 * Updates an existing Online Meeting via `updateBibleClass`,
 * falling back to direct Firestore writes if not yet deployed.
 */
export async function saveEditedOnlineMeeting(params: SaveEditedMeetingParams): Promise<void> {
  const churchId = normalizeMeetingChurchId(params.churchId);
  const startMs =
    typeof params.startTimestamp === 'number' && !isNaN(params.startTimestamp)
      ? params.startTimestamp
      : Date.now();
  const endMs =
    typeof params.endTimestamp === 'number' &&
      !isNaN(params.endTimestamp) &&
      params.endTimestamp > startMs
      ? params.endTimestamp
      : startMs + 60 * 60 * 1000;

  try {
    const updateCallable = firebase
      .app()
      .functions('asia-south1')
      .httpsCallable('updateBibleClass');
    await updateCallable({
      churchId,
      meetingId: params.meetingId,
      title: params.title,
      topic: params.topic,
      bibleBook: params.bibleBook,
      date: params.date,
      startTime: params.startTime,
      endTime: params.endTime,
      teacherId: params.teacherId,
      teacherName: params.teacherName,
      meetingLink: params.meetingLink,
      provider: params.provider,
      meetingType: params.provider,
      recurrence: 'NONE',
      startTimestamp: startMs,
      endTimestamp: endMs,
    });
    return;
  } catch (err: any) {
    if (!isFunctionMissingError(err)) {
      throw err;
    }
  }

  let scheduledDate: string | undefined;
  if (params.date.includes('-')) {
    const parts = params.date.trim().split('-');
    if (parts.length === 3 && parts[2]?.length === 4) {
      scheduledDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }

  await mirrorPatchToMeetingDocs(churchId, params.meetingId, {
    id: params.meetingId,
    churchId,
    title: params.title,
    topic: params.topic,
    description: params.topic,
    bibleBook: params.bibleBook,
    date: params.date,
    scheduledDate: scheduledDate || new Date(startMs).toISOString().split('T')[0],
    startTimeLabel: params.startTime,
    endTimeLabel: params.endTime,
    startTime: firestore.Timestamp.fromMillis(startMs),
    endTime: firestore.Timestamp.fromMillis(endMs),
    teacherId: params.teacherId || 'admin',
    teacherName: params.teacherName || 'Church Admin',
    meetingLink: params.meetingLink,
    meetingUrl: params.meetingLink,
    url: params.meetingLink,
    provider: params.provider,
    meetingType: params.provider,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Starts a scheduled meeting live via `startBibleClass` (sending member push alerts).
 */
export async function startOnlineMeetingLive(
  rawChurchId: string | undefined,
  meetingId: string
): Promise<{ pushSent: boolean }> {
  const churchId = normalizeMeetingChurchId(rawChurchId);
  try {
    const startCallable = firebase
      .app()
      .functions('asia-south1')
      .httpsCallable('startBibleClass');
    const res = await startCallable({ churchId, meetingId });
    return { pushSent: Boolean((res?.data as any)?.pushSent) };
  } catch (err: any) {
    if (!isFunctionMissingError(err)) {
      throw err;
    }
  }

  await mirrorPatchToMeetingDocs(churchId, meetingId, {
    status: 'live',
    startedAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
  return { pushSent: false };
}

/**
 * Ends a live meeting and marks it as 'completed' without notifying members.
 */
export async function endOnlineMeeting(
  rawChurchId: string | undefined,
  meetingId: string
): Promise<void> {
  const churchId = normalizeMeetingChurchId(rawChurchId);
  try {
    const endCallable = firebase
      .app()
      .functions('asia-south1')
      .httpsCallable('endBibleClass');
    await endCallable({ churchId, meetingId });
    return;
  } catch (err: any) {
    if (!isFunctionMissingError(err)) {
      throw err;
    }
  }

  await mirrorPatchToMeetingDocs(churchId, meetingId, {
    status: 'completed',
    endedAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Deletes an Online Meeting from both member-facing and admin dashboard collections.
 */
export async function deleteOnlineMeeting(
  rawChurchId: string | undefined,
  meetingId: string
): Promise<void> {
  const churchId = normalizeMeetingChurchId(rawChurchId);
  try {
    const deleteCallable = firebase
      .app()
      .functions('asia-south1')
      .httpsCallable('deleteBibleClass');
    await deleteCallable({ churchId, meetingId });
    return;
  } catch (err: any) {
    if (!isFunctionMissingError(err)) {
      throw err;
    }
  }

  await firestore()
    .collection('Rhema Church')
    .doc(churchId)
    .collection('online_meetings')
    .doc(meetingId)
    .delete();

  await firestore()
    .collection('churches')
    .doc('default')
    .collection('online_meetings')
    .doc(meetingId)
    .delete()
    .catch(() => { });
}

/**
 * Opens a Google Meet or Zoom link directly in the native app or browser.
 */
export async function launchOnlineMeetingUrl(
  meeting: any,
  userName = 'Church Member'
): Promise<boolean> {
  const rawLink =
    meeting?.meetingLink || meeting?.meetingUrl || meeting?.url || meeting?.link || '';
  if (!rawLink || !String(rawLink).trim()) return false;

  let cleanUrl = String(rawLink).trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  const isZoom =
    meeting?.provider === 'zoom' ||
    meeting?.meetingType === 'zoom' ||
    cleanUrl.includes('zoom.us');

  if (isZoom) {
    await openZoomMeeting({
      meetingLink: cleanUrl,
      meetingId: meeting?.meetingId,
      password: meeting?.password,
      userName,
    });
    return true;
  }

  const canOpen = await Linking.canOpenURL(cleanUrl).catch(() => true);
  if (!canOpen) return false;
  await Linking.openURL(cleanUrl);
  return true;
}
