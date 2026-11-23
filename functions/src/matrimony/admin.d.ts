export declare function requireMatrimonyAdmin(request: {
    auth?: {
        uid?: string;
        token?: Record<string, any>;
    };
}): Promise<string>;
interface FormattedReportItem {
    id: string;
    targetUid: string;
    targetName: string;
    targetCode: string;
    reporterUid: string;
    reporterName: string;
    reporterCode: string;
    category: string;
    reason: string;
    source: 'profile' | 'chat';
    status: 'open' | 'action_taken' | 'resolved' | 'dismissed';
    createdAtMs: number;
    resolvedAtMs: number | null;
    resolvedBy: string | null;
    resolutionNote: string | null;
}
/**
 * 1. getMatrimonyAdminDashboard
 * Returns profile counts (total, verified/approved, pending, rejected, inactive, reported) for Admin Dashboard.
 */
export declare const getMatrimonyAdminDashboard: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    counts: {
        total: number;
        verified: number;
        draft: number;
        pending: number;
        approved: number;
        rejected: number;
        correction_requested: number;
        suspended: number;
        inactive: number;
        reported: number;
        openReports: number;
    };
}>, unknown>;
/**
 * 2. getMatrimonyPendingProfiles
 * Lists matrimony profiles filtered by status ('pending', 'approved', 'rejected', 'inactive', 'reported', 'draft', or 'all') + counts.
 */
export declare const getMatrimonyPendingProfiles: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profiles: {
        signedPhoto: string | null;
        signedProfilePhoto: string | null;
        openReportCount: number;
        totalReportCount: number;
        latestReport: FormattedReportItem | null;
        uid: string;
    }[];
    counts: {
        total: number;
        verified: number;
        draft: number;
        pending: number;
        approved: number;
        rejected: number;
        correction_requested: number;
        suspended: number;
        inactive: number;
        reported: number;
        openReports: number;
    };
}>, unknown>;
/**
 * 2b. getMatrimonyAdminProfileDetail
 * Returns full hydrated matrimony profile, contact info, family details, preferences, photos, and attached reports for admin review.
 */
export declare const getMatrimonyAdminProfileDetail: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    eligible: boolean;
    registrationId: string;
    isLegacyBan: boolean;
    inactiveReason: any;
    contactInfo: {
        fullName: string;
        email: string;
        phone: string;
        dob: string;
    };
    profile: {
        uid: string;
        churchId: string;
        displayName: string;
        gender: string;
        age: null;
        maritalStatus: string;
        motherTongue: string;
        location: {
            city: string;
            state: string;
            country: string;
        };
        profilePhoto: string | null;
        signedProfilePhoto: string | null;
        gallery: never[];
        signedGallery: never[];
        profileStatus: string;
        verificationStatus: string;
        visibility: string;
        profileCompletion: number;
        inactiveReason: any;
    };
    familyDetails: null;
    incomeDetails: null;
    consent: null;
    preferences: null;
    verification: null;
    rejectionReason: null;
    reports: FormattedReportItem[];
    deletionReason?: never;
    deletedAtMs?: never;
} | {
    success: boolean;
    eligible: boolean;
    registrationId: string;
    isLegacyBan: boolean;
    inactiveReason: any;
    deletionReason: any;
    deletedAtMs: any;
    contactInfo: {
        fullName: any;
        email: any;
        phone: any;
        dob: any;
    };
    profile: {
        signedProfilePhoto: string | null;
        signedGallery: string[];
        uid?: never;
        churchId?: never;
        displayName?: never;
        gender?: never;
        age?: never;
        maritalStatus?: never;
        motherTongue?: never;
        location?: never;
        profilePhoto?: never;
        gallery?: never;
        profileStatus?: never;
        verificationStatus?: never;
        visibility?: never;
        profileCompletion?: never;
        inactiveReason?: never;
    };
    familyDetails: any;
    incomeDetails: any;
    consent: any;
    preferences: FirebaseFirestore.DocumentData;
    verification: FirebaseFirestore.DocumentData;
    rejectionReason: any;
    reports: FormattedReportItem[];
}>, unknown>;
/**
 * 3. approveMatrimonyProfile
 */
export declare const approveMatrimonyProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profileStatus: string;
}>, unknown>;
/**
 * 4. rejectMatrimonyProfile
 */
export declare const rejectMatrimonyProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profileStatus: string;
}>, unknown>;
/**
 * 5. requestMatrimonyCorrection
 */
export declare const requestMatrimonyCorrection: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profileStatus: string;
}>, unknown>;
/**
 * 6. suspendMatrimonyProfile
 */
export declare const suspendMatrimonyProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profileStatus: string;
}>, unknown>;
/**
 * 7. removeMatrimonyProfileForAbuse
 * Permanently removes a member's Matrimony profile + subcollections + photos and blocks
 * them from Rhema Matrimony only (keeping their main Rhema Church app access intact).
 */
export declare const removeMatrimonyProfileForAbuse: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    removed: boolean;
    bannedFromMatrimony: boolean;
}>, unknown>;
/**
 * 7b. deleteMatrimonyProfile
 * Deletes a member's Matrimony profile, subcollections, and photos in Firebase
 * WITHOUT restricting them, so they can set up a fresh profile and go through approval again.
 */
export declare const deleteMatrimonyProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    deleted: boolean;
    canReRegister: boolean;
}>, unknown>;
/**
 * 8. inactivateMatrimonyProfile
 * Temporarily makes a member's Matrimony profile inactive & hidden without deleting their data.
 * Attached reports stay visible and are marked 'action_taken'.
 */
export declare const inactivateMatrimonyProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profileStatus: string;
}>, unknown>;
/**
 * 9. activateMatrimonyProfile
 * Reactivates an inactive/suspended (or legacy-banned) Matrimony profile so the member can continue.
 */
export declare const activateMatrimonyProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profileStatus: string;
    wasLegacyBan: boolean;
}>, unknown>;
/**
 * 10. resolveMatrimonyReport
 * Marks an individual attached report as 'resolved' or 'dismissed'.
 */
export declare const resolveMatrimonyReport: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    reportId: string;
    status: string;
}>, unknown>;
export {};
//# sourceMappingURL=admin.d.ts.map