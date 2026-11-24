/**
 * 1. startMatrimonyRegistration
 * Checks active Rhema membership & adult age (>= 18), hydrates draft from existing AppMember profile.
 */
export declare const startMatrimonyRegistration: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    prefilled: {
        displayName: string;
        age: number | null;
        gender: string;
        city: string;
        state: string;
    };
    banReason?: string;
    success: boolean;
    eligible: boolean;
    reasons: string[];
    registered?: never;
    registrationId?: never;
    contactInfo?: never;
    profile?: never;
    consent?: never;
    familyDetails?: never;
    incomeDetails?: never;
    preferences?: never;
    profileManager?: never;
} | {
    success: boolean;
    eligible: boolean;
    registered: boolean;
    registrationId: string;
    contactInfo: {
        fullName: string;
        email: string;
        phone: string;
        dob: string;
        zip: string;
    };
    profile: {
        uid: string;
        churchId: string;
        displayName: string;
        gender: string;
        age: number | null;
        maritalStatus: string;
        motherTongue: string;
        location: {
            city: string;
            state: string;
            country: string;
        };
        faithSummary: {
            baptized: boolean;
            baptismChurch: string | null;
            shareFaithDetails: boolean;
        };
        profilePhoto: null;
        gallery: never[];
        signedProfilePhoto: null;
        signedGallery: never[];
        mobilePrivacy: string;
        photoVisibility: string;
        protectedPhotoAllowedUids: never[];
        profileStatus: string;
        onboardingStage: string;
        verificationStatus: string;
        visibility: string;
        profileCompletion: number;
    };
    consent: null;
    familyDetails: null;
    incomeDetails: null;
    preferences: {
        uid: string;
        age: {
            min: number;
            max: number;
            importance: string;
        };
        height: {
            minCm: number;
            maxCm: number;
            importance: string;
        };
        maritalStatuses: string[];
        education: {
            acceptable: never[];
            importance: string;
        };
        occupationCategories: never[];
        locations: {
            preferredCities: never[];
            preferredStates: string[];
            openToRelocation: boolean;
        };
    };
    profileManager?: never;
} | {
    success: boolean;
    eligible: boolean;
    registered: boolean;
    registrationId: string;
    contactInfo: {
        fullName: any;
        email: any;
        phone: any;
        dob: any;
        zip: any;
    };
    profile: {
        profileCompletion: number;
        onboardingStage: any;
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
        faithSummary?: never;
        profilePhoto?: never;
        gallery?: never;
        mobilePrivacy?: never;
        photoVisibility?: never;
        protectedPhotoAllowedUids?: never;
        profileStatus?: never;
        verificationStatus?: never;
        visibility?: never;
    };
    consent: any;
    profileManager: any;
    familyDetails: any;
    incomeDetails: any;
    preferences: FirebaseFirestore.DocumentData;
}>, unknown>;
/**
 * 2. saveMatrimonyDraft
 * Saves a specific section ('consent' | 'details' | 'preferences' | 'photos') safely.
 */
export declare const saveMatrimonyDraft: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    section: "complete";
    saved: boolean;
} | {
    success: boolean;
    section: "notifications" | "location" | "preferences" | "basic" | "personal" | "religious" | "professional" | "additional" | "interests" | "consent" | "details" | "photos" | "privacy";
    saved: boolean;
}>, unknown>;
/**
 * 3. submitMatrimonyProfile
 * Validates consent + required fields, runs automated checks, moves status to 'pending' for approval.
 */
export declare const submitMatrimonyProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profileStatus: string;
    verificationStatus: string;
}>, unknown>;
/**
 * 3b. resetMatrimonyProfile
 * Deletes the signed-in member's matrimony profile documents so they can restart setup from scratch.
 */
export declare const resetMatrimonyProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profileStatus: string;
}>, unknown>;
/**
 * 3c. deactivateMyMatrimonyAccount
 * Temporarily hides the member's profile from matches and disables outbound contact
 * while allowing them to browse matches and reactivate anytime.
 */
export declare const deactivateMyMatrimonyAccount: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    selfDeactivated: boolean;
    visibility: any;
}>, unknown>;
/**
 * 3d. deleteMyMatrimonyAccount
 * Saves the member's deletion reason on their Church member record and audit log,
 * then completely deletes their Firebase Matrimony profile & associated data
 * (without banning them) so they can immediately create a new profile for themselves or family.
 */
export declare const deleteMyMatrimonyAccount: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    deleted: boolean;
    deletionReason: string;
}>, unknown>;
/**
 * 4. getMatrimonyStatus
 * Returns current approval, verification, and signed photo URLs for the signed-in member.
 */
export declare const getMatrimonyStatus: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    registered: boolean;
    profileStatus: string;
    verificationStatus?: never;
    visibility?: never;
    profileCompletion?: never;
    rejectionReason?: never;
    inactiveReason?: never;
    signedProfilePhoto?: never;
    profile?: never;
} | {
    success: boolean;
    registered: boolean;
    profileStatus: any;
    verificationStatus: any;
    visibility: any;
    profileCompletion: number;
    rejectionReason: any;
    inactiveReason: any;
    signedProfilePhoto: string | null;
    profile: {
        profileCompletion: number;
        signedProfilePhoto: string | null;
        signedGallery: string[];
    };
}>, unknown>;
/**
 * 5. uploadMatrimonyPhoto
 * Validates photo with Anthropic Vision (rejecting animals, objects, blurry/group primary shots, and clear gender mismatches)
 * and uploads to the dedicated private matrimony bucket.
 */
export declare const uploadMatrimonyPhoto: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    storagePath: string;
    signedUrl: string;
}>, unknown>;
//# sourceMappingURL=registration.d.ts.map