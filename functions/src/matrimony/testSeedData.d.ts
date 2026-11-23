export declare const TEST_MALE_AVATAR_URL = "https://firebasestorage.googleapis.com/v0/b/rhema-global-ministries-matrimony/o/seed_avatars%2Fmale_default.jpg?alt=media&token=022d3de8-75b2-4f04-960d-12ba0491e64a";
export declare const TEST_FEMALE_AVATAR_URL = "https://firebasestorage.googleapis.com/v0/b/rhema-global-ministries-matrimony/o/seed_avatars%2Ffemale_default.jpg?alt=media&token=326f2260-74fd-43b4-b054-24a25f40bd20";
export interface GeneratedTestUserBundle {
    uid: string;
    sequence: number;
    last10Phone: string;
    memberDoc: Record<string, any>;
    phoneIndexDoc: Record<string, any>;
    registrationRequestDoc: Record<string, any>;
    globalUserDoc: Record<string, any>;
    matrimonyProfileDoc: Record<string, any>;
    matrimonyPrivateDoc: Record<string, any>;
    matrimonyPrefsDoc: Record<string, any>;
    matrimonyVerificationDoc: Record<string, any>;
    matrimonyAdminProfileDoc: Record<string, any>;
}
export declare function buildTestUserBatch(options: {
    count: 50 | 30;
    startSequence: number;
    batchLabel: string;
}): GeneratedTestUserBundle[];
//# sourceMappingURL=testSeedData.d.ts.map