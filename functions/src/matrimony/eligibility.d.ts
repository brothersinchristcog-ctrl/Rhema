export interface MemberEligibilityResult {
    eligible: boolean;
    reasons: string[];
    banReason?: string;
    uid: string;
    churchId: string;
    age: number | null;
    prefilled: {
        displayName: string;
        firstName: string;
        lastName: string;
        gender: string;
        maritalStatus: string;
        motherTongue?: string | undefined;
        city: string;
        state: string;
        country: string;
        zip?: string | undefined;
        baptized: boolean;
        baptismDate?: string | undefined;
        baptismChurch?: string | undefined;
        existingPhotoUrl?: string | undefined;
        dob?: string | undefined;
        phone?: string | undefined;
        email?: string | undefined;
        street?: string | undefined;
    };
}
export declare function computeAgeFromDob(dobRaw: unknown): number | null;
export declare function verifyRhemaMemberEligibility(uid: string): Promise<MemberEligibilityResult>;
//# sourceMappingURL=eligibility.d.ts.map