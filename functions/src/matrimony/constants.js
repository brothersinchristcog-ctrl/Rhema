export const MATRIMONY_BUCKET = 'rhema-global-ministries-matrimony';
export const DEFAULT_CHURCH_ID = 'rhema';
export const MIN_MATRIMONY_AGE = 18;
export const CONSENT_VERSION = '1.0';
export const SUBCOLLECTIONS = {
    PRIVATE: 'private',
    PREFERENCES: 'preferences',
    VERIFICATION: 'verification',
    SHORTLISTS: 'shortlists',
    SHORTLISTED_BY: 'shortlisted_by',
    VIEWS: 'views',
    VIEWED_BY: 'viewed_by',
    BLOCKS: 'blocks',
};
export const SUBDOC_IDS = {
    PRIVATE_INFO: 'info',
    PARTNER_PREFS: 'partner',
    VERIFICATION_STATUS: 'status',
};
export const COLLECTIONS = {
    PROFILES: 'matrimony_profiles',
    ADMIN_PROFILES: 'matrimony_admin_profiles',
    BANS: 'matrimony_bans',
    // Legacy root collections (fallback reads only during migration)
    PRIVATE: 'matrimony_private',
    PREFERENCES: 'matrimony_preferences',
    VERIFICATIONS: 'matrimony_verifications',
    INTERESTS: 'matrimony_interests',
    MATCHES: 'matrimony_matches',
    RECOMMENDATIONS: 'matrimony_recommendations',
    SHORTLISTS: 'matrimony_shortlists',
    CHATS: 'matrimony_chats',
    GUARDIANS: 'matrimony_guardians',
    BLOCKS: 'matrimony_blocks',
    REPORTS: 'matrimony_reports',
    NOTIFICATIONS: 'matrimony_notifications',
    SETTINGS: 'matrimony_settings',
    AUDIT_LOGS: 'matrimony_audit_logs',
};
//# sourceMappingURL=constants.js.map