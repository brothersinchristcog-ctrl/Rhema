type BinaryGender = 'male' | 'female';
/**
 * 1. getMatrimonyMatches
 * Returns real verified opposite-gender matches scored by Partner Preferences, Age, & Hobbies/Interests.
 */
export declare const getMatrimonyMatches: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    matches: never[];
    totalCount: number;
    viewerGender: null;
    targetGender: null;
    viewerPhoto: string | null;
    totalAvailableCount?: never;
    hiddenCount?: never;
    viewerPreferencesFilter?: never;
    preferencesUpdatedAtMs?: never;
} | {
    success: boolean;
    matches: {
        uid: string;
        displayName: any;
        profileCode: any;
        gender: any;
        age: any;
        heightCm: any;
        maritalStatus: any;
        motherTongue: any;
        aboutMe: any;
        profileCreatedBy: string;
        education: any;
        career: any;
        location: any;
        faithSummary: any;
        habits: any;
        interests: any;
        familySummary: any;
        familyDetails: any;
        annualIncomeRange: any;
        dob: any;
        maskedDob: string | null;
        maskedPhone: string | null;
        contactPhone: any;
        partnerPreferencesComparison: {
            matchedCount: number;
            totalCount: number;
            sections: {
                title: string;
                items: {
                    label: string;
                    value: string;
                    matched: boolean;
                }[];
            }[];
        };
        signedProfilePhoto: string | null;
        signedGallery: string[];
        photoCount: number;
        matchScore: number;
        sharedInterests: string[];
        matchReasons: string[];
        breakdown: {
            ageScore: number;
            interestsScore: number;
            heightScore: number;
            maritalScore: number;
            faithScore: number;
            careerScore: number;
            locationScore: number;
            habitsScore: number;
        };
        isShortlisted: boolean;
        interestStatus: string | null;
        interestSentAtMs: number;
        joinedAtMs: number;
        viewedAtMs: number;
        updatedAtMs: number;
    }[];
    totalCount: number;
    totalAvailableCount: number;
    hiddenCount: number;
    viewerGender: BinaryGender;
    targetGender: BinaryGender;
    viewerPhoto: string | null;
    viewerPreferencesFilter: Record<string, any>;
    preferencesUpdatedAtMs: number;
}>, unknown>;
/**
 * 2. toggleMatrimonyShortlist
 */
export declare const toggleMatrimonyShortlist: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    shortlisted: boolean;
}>, unknown>;
/**
 * 2b. recordMatrimonyProfileView
 * Records that the signed-in member viewed another member's profile.
 */
export declare const recordMatrimonyProfileView: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    recorded: boolean;
}>, unknown>;
/**
 * 3. dismissMatrimonyMatch ("Don't Show")
 */
export declare const dismissMatrimonyMatch: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    dismissed: boolean;
}>, unknown>;
/**
 * 3b. restoreMatrimonyMatches (Undo / Restore "Don't Show")
 */
export declare const restoreMatrimonyMatches: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    restoredCount: number;
}>, unknown>;
/**
 * 4. sendMatrimonyInterest
 */
export declare const sendMatrimonyInterest: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    interestStatus: string;
    isMutual: boolean;
}>, unknown>;
/**
 * 5. getMatrimonyInterestsHub
 * Returns real received and sent interest records with hydrated candidate profiles.
 */
export declare const getMatrimonyInterestsHub: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    received: {
        id: string;
        direction: "received";
        status: "declined" | "pending" | "accepted";
        createdAtMs: number;
        updatedAtMs: number;
        candidate: {
            interestStatus: "declined" | "pending" | "accepted";
            uid: string;
            displayName: any;
            profileCode: any;
            gender: any;
            age: any;
            heightCm: any;
            maritalStatus: any;
            motherTongue: any;
            aboutMe: any;
            profileCreatedBy: string;
            education: any;
            career: any;
            location: any;
            faithSummary: any;
            habits: any;
            interests: any;
            familySummary: any;
            familyDetails: any;
            annualIncomeRange: any;
            dob: any;
            maskedDob: string | null;
            maskedPhone: string | null;
            contactPhone: any;
            partnerPreferencesComparison: {
                matchedCount: number;
                totalCount: number;
                sections: {
                    title: string;
                    items: {
                        label: string;
                        value: string;
                        matched: boolean;
                    }[];
                }[];
            };
            signedProfilePhoto: string | null;
            signedGallery: string[];
            photoCount: number;
            matchScore: number;
            sharedInterests: string[];
            matchReasons: string[];
            breakdown: {
                ageScore: number;
                interestsScore: number;
                heightScore: number;
                maritalScore: number;
                faithScore: number;
                careerScore: number;
                locationScore: number;
                habitsScore: number;
            };
            isShortlisted: boolean;
            interestSentAtMs: number;
            joinedAtMs: number;
            viewedAtMs: number;
            updatedAtMs: number;
        };
    }[];
    sent: {
        id: string;
        direction: "sent";
        status: "declined" | "pending" | "accepted";
        createdAtMs: number;
        updatedAtMs: number;
        candidate: {
            interestStatus: "declined" | "pending" | "accepted";
            interestSentAtMs: number;
            uid: string;
            displayName: any;
            profileCode: any;
            gender: any;
            age: any;
            heightCm: any;
            maritalStatus: any;
            motherTongue: any;
            aboutMe: any;
            profileCreatedBy: string;
            education: any;
            career: any;
            location: any;
            faithSummary: any;
            habits: any;
            interests: any;
            familySummary: any;
            familyDetails: any;
            annualIncomeRange: any;
            dob: any;
            maskedDob: string | null;
            maskedPhone: string | null;
            contactPhone: any;
            partnerPreferencesComparison: {
                matchedCount: number;
                totalCount: number;
                sections: {
                    title: string;
                    items: {
                        label: string;
                        value: string;
                        matched: boolean;
                    }[];
                }[];
            };
            signedProfilePhoto: string | null;
            signedGallery: string[];
            photoCount: number;
            matchScore: number;
            sharedInterests: string[];
            matchReasons: string[];
            breakdown: {
                ageScore: number;
                interestsScore: number;
                heightScore: number;
                maritalScore: number;
                faithScore: number;
                careerScore: number;
                locationScore: number;
                habitsScore: number;
            };
            isShortlisted: boolean;
            joinedAtMs: number;
            viewedAtMs: number;
            updatedAtMs: number;
        };
    }[];
}>, unknown>;
/**
 * 6. respondMatrimonyInterest
 * Accept / Decline received interest, or Withdraw sent pending interest.
 */
export declare const respondMatrimonyInterest: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    status: string;
}>, unknown>;
/**
 * 7. reportMatrimonyProfile
 * Allows an active member to report a profile or chat user; attaches report for Admin review.
 */
export declare const reportMatrimonyProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    reportId: string;
    hidden: boolean;
}>, unknown>;
export {};
//# sourceMappingURL=matches.d.ts.map