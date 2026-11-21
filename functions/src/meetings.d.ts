/**
 * Helper: Acquire Server-to-Server OAuth access token from Zoom
 */
export declare function getZoomServerToServerToken(): Promise<string>;
export declare function extractZoomUserId(accessToken: string): string;
/**
 * 📹 CREATE ZOOM MEETING (Callable Function)
 * Called by backend services or ZoomService.
 */
export declare const createZoomMeeting: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    meetingId: string;
    meetingUrl: any;
    meetingUri: any;
    password: any;
    startUrl: any;
}>, unknown>;
/**
 * 📹 GENERATE ZOOM MEETING LINK (Callable Function in asia-south1)
 * Called by AdminZoomMeetingsCreate.tsx when tapping "+ Generate Zoom Meet Link".
 */
export declare const generateZoomMeetingLink: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    meetingId: string;
    meetingUrl: any;
    meetingUri: any;
    password: any;
    startUrl: any;
}>, unknown>;
/**
 * 📅 CREATE ONLINE MEETING / BIBLE CLASS & NOTIFY MEMBERS (asia-south1)
 * Called by AdminZoomMeetingsCreate.tsx for both Google Meet and Zoom meetings.
 */
export declare const createBibleClass: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    id: string;
}>, unknown>;
/**
 * 🔗 HTTP Trigger Alternative for createZoomMeeting
 */
export declare const createZoomMeetingHttp: import("firebase-functions/v2/https").HttpsFunction;
//# sourceMappingURL=meetings.d.ts.map