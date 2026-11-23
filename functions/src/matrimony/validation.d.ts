export type DraftSection = 'basic' | 'personal' | 'religious' | 'location' | 'professional' | 'additional' | 'interests' | 'consent' | 'details' | 'preferences' | 'photos' | 'privacy' | 'notifications' | 'complete';
export declare function assertNonEmptyString(val: unknown, field: string, maxLen?: number): string;
export declare function optionalString(val: unknown, maxLen?: number): string | undefined;
export declare function optionalEditableString(val: unknown, maxLen?: number): string | undefined;
export declare function optionalNumber(val: unknown, min: number, max: number, field: string): number | undefined;
export declare function optionalBoolean(val: unknown): boolean | undefined;
export declare function optionalStringArray(val: unknown, maxItems?: number, maxItemLen?: number): string[];
export declare function validateDraftSection(section: unknown): DraftSection;
export declare function sanitizePhotoStoragePath(pathVal: unknown, uid: string): string | undefined;
//# sourceMappingURL=validation.d.ts.map