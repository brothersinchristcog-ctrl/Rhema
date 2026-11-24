import { type ResolvedMemberEntitlements } from './entitlements.js';
type BinaryGender = 'male' | 'female';
export declare function normalizeGender(raw: unknown): BinaryGender | null;
export declare function normalizeAnyOption(raw: unknown): string;
export declare function toTimestampMs(val: any): number;
interface FilterInput {
    minAge?: number | undefined;
    maxAge?: number | undefined;
    minHeightCm?: number | undefined;
    maxHeightCm?: number | undefined;
    profileCreatedBy?: string | undefined;
    maritalStatus?: string | undefined;
    motherTongue?: string | undefined;
    physicalStatus?: string | undefined;
    baptized?: string | undefined;
    baptizedOnly?: boolean | undefined;
    denomination?: string | undefined;
    division?: string | undefined;
    occupation?: string | undefined;
    annualIncome?: string | undefined;
    employmentType?: string | undefined;
    education?: string[] | undefined;
    nearbyProfiles?: boolean | undefined;
    sameCity?: boolean | undefined;
    sameState?: boolean | undefined;
    country?: string | undefined;
    state?: string | undefined;
    city?: string | undefined;
    eatingHabits?: string | undefined;
    drinkingHabits?: string | undefined;
    smokingHabits?: string | undefined;
    familyStatus?: string | undefined;
    familyType?: string | undefined;
    familyValues?: string | undefined;
    createdWithin?: 'all' | 'today' | '3d' | '1w' | '1m' | undefined;
    mutualMatchesOnly?: boolean | undefined;
    withPhotoOnly?: boolean | undefined;
    sharedInterestsOnly?: boolean | undefined;
}
interface ScoreEvaluation {
    eligible: boolean;
    score: number;
    sharedInterests: string[];
    matchReasons: string[];
    breakdown: {
        ageScore: number;
        educationScore: number;
        interestsScore: number;
        heightScore: number;
        maritalScore: number;
        familyScore: number;
        faithScore: number;
        careerScore: number;
        locationScore: number;
        lifestyleScore: number;
        additionalScore: number;
        habitsScore: number;
    };
}
export declare function areEducationsClose(aRaw: unknown, bRaw: unknown): 'exact' | 'close' | 'none';
export declare function areProfessionsClose(aRaw: unknown, bRaw: unknown): 'exact' | 'close' | 'none';
export declare function evaluateCompatibility(viewer: Record<string, any>, viewerPrivate: Record<string, any>, viewerPrefs: Record<string, any>, candidate: Record<string, any>, candidatePrivate: Record<string, any>, candidatePrefs: Record<string, any>, filters: FilterInput, matchBasis?: 'partner_preferences' | 'all_filters'): ScoreEvaluation;
export declare function canViewerSeeCandidatePhotos(params: {
    viewerUid: string;
    candidate: Record<string, any>;
    interestStatus: string | null;
    viewerEntitlements?: ResolvedMemberEntitlements | undefined;
    photoRequestStatus?: 'pending' | 'approved' | 'declined' | null;
}): boolean;
/**
 * 1. getMatrimonyMatches
 * Returns real verified opposite-gender matches scored by Partner Preferences, Age, & Hobbies/Interests.
 */
export declare const getMatrimonyMatches: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
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
        isContactUnlocked: boolean;
        canUnlockContact: boolean;
        mobilePrivacy: string;
        isPhotoProtected: boolean;
        photoRequestStatus: "approved" | "declined" | "pending" | null;
        photoVisibility: any;
        candidateTier: import("./entitlements.js").MatrimonyTier;
        isHighlighted: "gold" | "platinum" | "none";
        visibilityPriority: number;
        verificationSummary: {
            adminApproved: boolean;
            churchMemberVerified: boolean;
            photoVerified: boolean;
            baptismVerified: boolean;
            trustLevel: "prime_verified" | "verified";
        };
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
            educationScore: number;
            interestsScore: number;
            heightScore: number;
            maritalScore: number;
            familyScore: number;
            faithScore: number;
            careerScore: number;
            locationScore: number;
            lifestyleScore: number;
            additionalScore: number;
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
    hasMore: boolean;
    nextOffset: number;
    totalAvailableCount: number;
    hiddenCount: number;
    viewerGender: BinaryGender;
    targetGender: BinaryGender;
    viewerPhoto: string | null;
    viewerPreferencesFilter: Record<string, any>;
    preferencesUpdatedAtMs: number;
    viewerEntitlements: ResolvedMemberEntitlements;
    lockedAdvancedFilters: boolean;
} | {
    success: boolean;
    matches: never[];
    totalCount: number;
    viewerGender: null;
    targetGender: null;
    viewerPhoto: string | null;
    hasMore?: never;
    nextOffset?: never;
    totalAvailableCount?: never;
    hiddenCount?: never;
    viewerPreferencesFilter?: never;
    preferencesUpdatedAtMs?: never;
    viewerEntitlements?: never;
    lockedAdvancedFilters?: never;
}>, unknown>;
/**
 * 1b. getMatrimonyHomeSummary
 * Consolidated single-RPC loader for MatrimonyHomeScreen: returns status, registration summary,
 * entitlements, unread notification count, and all 4 Home preview strips in one Firestore pass.
 */
export declare const getMatrimonyHomeSummary: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    registered: boolean;
    profileStatus: string;
    unreadNotificationsCount?: never;
    viewerEntitlements?: never;
    status?: never;
    registration?: never;
    allMatches?: never;
    newMatches?: never;
    viewedYou?: never;
    viewedByYou?: never;
} | {
    success: boolean;
    registered: boolean;
    profileStatus: any;
    unreadNotificationsCount: number;
    viewerEntitlements: ResolvedMemberEntitlements;
    status: {
        success: boolean;
        registered: boolean;
        profileStatus: any;
        verificationStatus: any;
        visibility: any;
        profileCompletion: any;
        inactiveReason: any;
        signedProfilePhoto: string | null;
        profile: {
            signedProfilePhoto: string | null;
            signedGallery: string[];
        };
    };
    registration: {
        success: boolean;
        eligible: boolean;
        registered: boolean;
        registrationId: string;
        profile: {
            signedProfilePhoto: string | null;
            signedGallery: string[];
        };
        consent: any;
        profileManager: any;
        familyDetails: any;
        incomeDetails: any;
        preferences: FirebaseFirestore.DocumentData;
    };
    allMatches: {
        success: boolean;
        matches: any[];
        totalCount: number;
        hasMore: boolean;
        nextOffset: number;
        totalAvailableCount: number;
        hiddenCount: number;
        viewerGender: BinaryGender | null;
        targetGender: BinaryGender | null;
        viewerPhoto: string | null;
        viewerPreferencesFilter: Record<string, any>;
        preferencesUpdatedAtMs: number;
        viewerEntitlements: ResolvedMemberEntitlements;
        lockedAdvancedFilters: boolean;
    };
    newMatches: {
        success: boolean;
        matches: any[];
        totalCount: number;
        hasMore: boolean;
        nextOffset: number;
        totalAvailableCount: number;
        hiddenCount: number;
        viewerGender: BinaryGender | null;
        targetGender: BinaryGender | null;
        viewerPhoto: string | null;
        viewerPreferencesFilter: Record<string, any>;
        preferencesUpdatedAtMs: number;
        viewerEntitlements: ResolvedMemberEntitlements;
        lockedAdvancedFilters: boolean;
    };
    viewedYou: {
        success: boolean;
        matches: any[];
        totalCount: number;
        hasMore: boolean;
        nextOffset: number;
        totalAvailableCount: number;
        hiddenCount: number;
        viewerGender: BinaryGender | null;
        targetGender: BinaryGender | null;
        viewerPhoto: string | null;
        viewerPreferencesFilter: Record<string, any>;
        preferencesUpdatedAtMs: number;
        viewerEntitlements: ResolvedMemberEntitlements;
        lockedAdvancedFilters: boolean;
    };
    viewedByYou: {
        success: boolean;
        matches: any[];
        totalCount: number;
        hasMore: boolean;
        nextOffset: number;
        totalAvailableCount: number;
        hiddenCount: number;
        viewerGender: BinaryGender | null;
        targetGender: BinaryGender | null;
        viewerPhoto: string | null;
        viewerPreferencesFilter: Record<string, any>;
        preferencesUpdatedAtMs: number;
        viewerEntitlements: ResolvedMemberEntitlements;
        lockedAdvancedFilters: boolean;
    };
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
 * 3. dismissMatrimonyMatch ("Don't Show" / Ignored or Blocked)
 */
export declare const dismissMatrimonyMatch: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    dismissed: boolean;
    type: "blocked" | "dont_show";
}>, unknown>;
/**
 * 3b. restoreMatrimonyMatches (Undo / Unignore / Unblock)
 */
export declare const restoreMatrimonyMatches: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    restoredCount: number;
}>, unknown>;
/**
 * 3c. getMatrimonyHiddenProfiles
 * Returns ignored ('dont_show') or blocked ('blocked') profiles with basic summary for Account Settings.
 */
export declare const getMatrimonyHiddenProfiles: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    profiles: {
        uid: string;
        displayName: string;
        profileCode: string;
        age: number | null;
        heightCm: number | null;
        occupation: string;
        city: string;
        signedProfilePhoto: string | null;
        hiddenAtMs: number;
    }[];
}>, unknown>;
/**
 * 4. sendMatrimonyInterest
 */
export declare const sendMatrimonyInterest: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    interestStatus: string;
    isMutual: boolean;
    interestsSentThisMonth: number;
    interestsRemaining: number;
    monthlyInterestLimit: number;
}>, unknown>;
/**
 * 4b. unlockMatrimonyContact
 * Unlocks verified contact phone & DOB for a target profile, consuming 1 contact credit
 * for Silver (10) / Gold (40) or free for Platinum (-1). Idempotent within active cycle.
 */
export declare const unlockMatrimonyContact: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    alreadyUnlocked: boolean;
    contactPhone: string | null;
    dob: string | null;
    contactNumbersViewedCount: number;
    contactNumbersRemaining: number;
}>, unknown>;
/**
 * 5. getMatrimonyInterestsHub
 * Returns real received and sent interest records with hydrated candidate profiles.
 */
export declare const getMatrimonyInterestsHub: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    received: never[];
    sent: never[];
    viewerEntitlements?: never;
} | {
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
            isContactUnlocked: boolean;
            canUnlockContact: boolean;
            mobilePrivacy: string;
            isPhotoProtected: boolean;
            photoRequestStatus: "approved" | "declined" | "pending" | null;
            photoVisibility: any;
            candidateTier: import("./entitlements.js").MatrimonyTier;
            isHighlighted: "gold" | "platinum" | "none";
            visibilityPriority: number;
            verificationSummary: {
                adminApproved: boolean;
                churchMemberVerified: boolean;
                photoVerified: boolean;
                baptismVerified: boolean;
                trustLevel: "prime_verified" | "verified";
            };
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
                educationScore: number;
                interestsScore: number;
                heightScore: number;
                maritalScore: number;
                familyScore: number;
                faithScore: number;
                careerScore: number;
                locationScore: number;
                lifestyleScore: number;
                additionalScore: number;
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
            isContactUnlocked: boolean;
            canUnlockContact: boolean;
            mobilePrivacy: string;
            isPhotoProtected: boolean;
            photoRequestStatus: "approved" | "declined" | "pending" | null;
            photoVisibility: any;
            candidateTier: import("./entitlements.js").MatrimonyTier;
            isHighlighted: "gold" | "platinum" | "none";
            visibilityPriority: number;
            verificationSummary: {
                adminApproved: boolean;
                churchMemberVerified: boolean;
                photoVerified: boolean;
                baptismVerified: boolean;
                trustLevel: "prime_verified" | "verified";
            };
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
                educationScore: number;
                interestsScore: number;
                heightScore: number;
                maritalScore: number;
                familyScore: number;
                faithScore: number;
                careerScore: number;
                locationScore: number;
                lifestyleScore: number;
                additionalScore: number;
                habitsScore: number;
            };
            isShortlisted: boolean;
            joinedAtMs: number;
            viewedAtMs: number;
            updatedAtMs: number;
        };
    }[];
    viewerEntitlements: ResolvedMemberEntitlements;
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
/**
 * 8. requestMatrimonyPhotoAccess
 * Requests permission from a member with Protect Photo / restricted photos to view their photo.
 */
export declare const requestMatrimonyPhotoAccess: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    status: string;
    alreadyAllowed: boolean;
}>, unknown>;
/**
 * 9. getMatrimonyPhotoRequests
 * Lists incoming photo access requests received by the signed-in member.
 */
export declare const getMatrimonyPhotoRequests: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    requests: {
        uid: string;
        displayName: any;
        profileCode: any;
        age: any;
        heightCm: any;
        occupation: string;
        city: string;
        signedProfilePhoto: string | null;
        status: "approved" | "declined" | "pending";
        createdAtMs: number;
        updatedAtMs: number;
        candidate: {
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
            isContactUnlocked: boolean;
            canUnlockContact: boolean;
            mobilePrivacy: string;
            isPhotoProtected: boolean;
            photoRequestStatus: "approved" | "declined" | "pending" | null;
            photoVisibility: any;
            candidateTier: import("./entitlements.js").MatrimonyTier;
            isHighlighted: "gold" | "platinum" | "none";
            visibilityPriority: number;
            verificationSummary: {
                adminApproved: boolean;
                churchMemberVerified: boolean;
                photoVerified: boolean;
                baptismVerified: boolean;
                trustLevel: "prime_verified" | "verified";
            };
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
                educationScore: number;
                interestsScore: number;
                heightScore: number;
                maritalScore: number;
                familyScore: number;
                faithScore: number;
                careerScore: number;
                locationScore: number;
                lifestyleScore: number;
                additionalScore: number;
                habitsScore: number;
            };
            isShortlisted: boolean;
            interestStatus: string | null;
            interestSentAtMs: number;
            joinedAtMs: number;
            viewedAtMs: number;
            updatedAtMs: number;
        };
    }[];
}>, unknown>;
/**
 * 10. respondMatrimonyPhotoRequest
 * Approves or declines a member's request to view your protected photos.
 */
export declare const respondMatrimonyPhotoRequest: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    status: "approved" | "declined";
}>, unknown>;
/**
 * 11. getMatrimonyNotificationsFeed
 * Returns the signed-in member's Rhema Matrimony in-app notifications inbox,
 * enriched with viewer-safe sender metadata and hydrated match cards.
 */
export declare const getMatrimonyNotificationsFeed: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    notifications: {
        id: string;
        type: string;
        prefKey: string | null;
        category: string;
        isUrgent: boolean;
        senderUid: string | null;
        senderName: any;
        senderGender: any;
        senderPhoto: any;
        title: string;
        body: string;
        read: boolean;
        createdAtMs: number;
        actionType: "view_profile" | "view_matches" | "view_photo_requests" | "view_interests" | "view_offers" | "view_status";
        actionLabel: string;
        incomingPhotoRequestStatus: "approved" | "declined" | "pending" | null;
        candidate: any;
    }[];
    unreadCount: number;
}>, unknown>;
/**
 * 12. manageMatrimonyNotification
 * Marks one or all notifications as read, or deletes a notification owned by the caller.
 */
export declare const manageMatrimonyNotification: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    updated: number;
    deleted?: never;
    read?: never;
} | {
    success: boolean;
    deleted: boolean;
    read: boolean;
    updated?: never;
} | {
    success: boolean;
    read: boolean;
    updated?: never;
    deleted?: never;
} | {
    success: boolean;
    deleted: boolean;
    updated?: never;
    read?: never;
}>, unknown>;
/**
 * 13. getMatrimonyCandidatePhotos
 * Resolves viewer-authorized signed photo URLs for a single candidate profile
 * so live unlocks immediately load real images without requiring a full feed refresh.
 */
export declare const getMatrimonyCandidatePhotos: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    canSeePhotos: boolean;
    signedProfilePhoto: string | null;
    signedGallery: string[];
}>, unknown>;
/**
 * 14. searchMatrimonyById
 * Direct lookup of an approved opposite-gender profile by Matrimony ID (e.g. RMT820)
 * using the warm approved catalog with full privacy, block, and compatibility evaluation.
 */
export declare const searchMatrimonyById: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    found: boolean;
    reason: string;
    message: string;
    profile?: never;
    viewerPhoto?: never;
} | {
    success: boolean;
    found: boolean;
    profile: {
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
        isContactUnlocked: boolean;
        canUnlockContact: boolean;
        mobilePrivacy: string;
        isPhotoProtected: boolean;
        photoRequestStatus: "approved" | "declined" | "pending" | null;
        photoVisibility: any;
        candidateTier: import("./entitlements.js").MatrimonyTier;
        isHighlighted: "gold" | "platinum" | "none";
        visibilityPriority: number;
        verificationSummary: {
            adminApproved: boolean;
            churchMemberVerified: boolean;
            photoVerified: boolean;
            baptismVerified: boolean;
            trustLevel: "prime_verified" | "verified";
        };
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
            educationScore: number;
            interestsScore: number;
            heightScore: number;
            maritalScore: number;
            familyScore: number;
            faithScore: number;
            careerScore: number;
            locationScore: number;
            lifestyleScore: number;
            additionalScore: number;
            habitsScore: number;
        };
        isShortlisted: boolean;
        interestStatus: string | null;
        interestSentAtMs: number;
        joinedAtMs: number;
        viewedAtMs: number;
        updatedAtMs: number;
    };
    viewerPhoto: string | null;
    reason?: never;
    message?: never;
}>, unknown>;
export {};
//# sourceMappingURL=matches.d.ts.map