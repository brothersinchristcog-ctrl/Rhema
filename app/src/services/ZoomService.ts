import { firebase } from '@react-native-firebase/functions';

interface CreateZoomMeetingParams {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  churchId?: string;
}

interface ZoomMeetingResult {
  success: boolean;
  meetingId: string;
  meetingUrl: string;
  password?: string;
  startUrl?: string;
}

/**
 * Generates a Zoom meeting exclusively via the Firebase Cloud Function backend.
 * Zoom OAuth credentials are stored strictly in backend environment configuration.
 */
export async function createZoomMeeting(
  params: CreateZoomMeetingParams
): Promise<ZoomMeetingResult> {
  const durationMinutes = Math.max(
    15,
    Math.round((params.endTime.getTime() - params.startTime.getTime()) / 60000)
  );

  const fn = firebase.app().functions('asia-south1').httpsCallable('generateZoomMeetingLink');
  const res = await fn({
    topic: params.title,
    title: params.title,
    description: params.description || '',
    startTime: params.startTime.toISOString(),
    endTime: params.endTime.toISOString(),
    duration: durationMinutes,
    churchId: params.churchId,
  });

  const data = res.data as any;
  const meetingUrl = data?.meetingUrl || data?.meetingUri;
  if (!data?.success || !meetingUrl) {
    throw new Error(data?.message || 'Zoom backend did not return a valid meeting URL.');
  }

  return {
    success: true,
    meetingId: String(data.meetingId || ''),
    meetingUrl,
    password: data.password || '',
    startUrl: data.startUrl || '',
  };
}
