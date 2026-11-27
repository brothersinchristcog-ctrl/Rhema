/**
 * Canonical Admin Dashboard Permission Registry & Helpers.
 *
 * Care Cells, Expense, Donations, Daily Verses, and App Admin remain strictly
 * controlled by Super Admin / existing cell assignments and are never delegated
 * via standard admin tab permissions.
 */

export type ProtectedSuperAdminModuleKey =
  | 'care_cells'
  | 'expense'
  | 'donations'
  | 'daily_verses'
  | 'app_admin';

export type DelegableAdminModuleKey =
  | 'promises'
  | 'sermons'
  | 'songs'
  | 'events'
  | 'pastor_events'
  | 'prayer_wall'
  | 'testimonies'
  | 'attendance'
  | 'kids_ministry'
  | 'service_roster'
  | 'job_circle'
  | 'volunteers'
  | 'members'
  | 'approvals'
  | 'celebrations'
  | 'gallery'
  | 'notifications'
  | 'whatsapp'
  | 'online_meetings'
  | 'bible_quiz'
  | 'baptism'
  | 'matrimony'
  | 'support_team'
  | 'church_settings';

export type AdminModuleKey =
  | 'dashboard'
  | DelegableAdminModuleKey
  | ProtectedSuperAdminModuleKey;

export type AdminModuleCategory =
  | 'Ministry & Word'
  | 'People & Fellowship'
  | 'Services & Events'
  | 'Media & Communications'
  | 'Church Management'
  | 'Super Admin Protected';

export interface AdminModuleDefinition {
  key: AdminModuleKey;
  label: string;
  description: string;
  category: AdminModuleCategory;
  navigatorTabs: string[];
  stackRoutes: string[];
  protectedSuperAdminOnly?: boolean;
  coreAlwaysEnabled?: boolean;
}

export const ADMIN_MODULE_DEFINITIONS: readonly AdminModuleDefinition[] = [
  // Core (Always ON for authorized Admins)
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Admin home hub and overview shell',
    category: 'Church Management',
    navigatorTabs: ['Dashboard'],
    stackRoutes: ['AdminRoot'],
    coreAlwaysEnabled: true,
  },

  // Ministry & Word
  {
    key: 'promises',
    label: 'Promises',
    description: 'Create, schedule, and manage Daily Promises',
    category: 'Ministry & Word',
    navigatorTabs: ['Promises', 'New Promise', 'Schedule'],
    stackRoutes: [],
  },
  {
    key: 'sermons',
    label: 'Sermons',
    description: 'Upload and manage audio/video sermons',
    category: 'Ministry & Word',
    navigatorTabs: ['Sermons', 'New Sermon'],
    stackRoutes: [],
  },
  {
    key: 'songs',
    label: 'Songs',
    description: 'Manage church songbook and worship lyrics',
    category: 'Ministry & Word',
    navigatorTabs: ['Songs'],
    stackRoutes: [],
  },
  {
    key: 'bible_quiz',
    label: 'Bible Quiz',
    description: 'Create quizzes, review reports, and manage schedules',
    category: 'Ministry & Word',
    navigatorTabs: ['Bible Quiz'],
    stackRoutes: [],
  },
  {
    key: 'kids_ministry',
    label: 'Kids Ministry',
    description: 'Sunday school classes, curriculum, teachers, and check-ins',
    category: 'Ministry & Word',
    navigatorTabs: ['Kids Ministry'],
    stackRoutes: [],
  },

  // People & Fellowship
  {
    key: 'members',
    label: 'Members',
    description: 'View and update church member profiles and families',
    category: 'People & Fellowship',
    navigatorTabs: ['Members'],
    stackRoutes: [],
  },
  {
    key: 'approvals',
    label: 'Registration Approvals',
    description: 'Review, approve, or reject pending member registrations',
    category: 'People & Fellowship',
    navigatorTabs: ['Approvals'],
    stackRoutes: ['AdminRegistrationApprovals'],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    description: 'Create attendance sessions and view check-in logs',
    category: 'People & Fellowship',
    navigatorTabs: ['Attendance'],
    stackRoutes: [],
  },
  {
    key: 'prayer_wall',
    label: 'Prayer Wall',
    description: 'Moderate prayer requests and post pastoral replies',
    category: 'People & Fellowship',
    navigatorTabs: ['Prayers'],
    stackRoutes: [],
  },
  {
    key: 'testimonies',
    label: 'Testimonies',
    description: 'Review, approve, and publish member testimonies',
    category: 'People & Fellowship',
    navigatorTabs: ['Testimonies'],
    stackRoutes: [],
  },
  {
    key: 'baptism',
    label: 'Baptism',
    description: 'Manage baptism requests and schedules',
    category: 'People & Fellowship',
    navigatorTabs: ['Baptism'],
    stackRoutes: [],
  },
  {
    key: 'volunteers',
    label: 'Volunteer Management',
    description: 'Review volunteer applications and post service calls',
    category: 'People & Fellowship',
    navigatorTabs: ['Volunteer Management'],
    stackRoutes: [],
  },
  {
    key: 'job_circle',
    label: 'Job Circle',
    description: 'Post ministry/job opportunities and review applicants',
    category: 'People & Fellowship',
    navigatorTabs: ['Job Circle'],
    stackRoutes: [
      'AdminJobCircleDashboard',
      'AdminOpportunityEditor',
      'AdminMinistryTeamsScreen',
    ],
  },
  {
    key: 'matrimony',
    label: 'Rhema Matrimony',
    description: 'Verify and moderate Rhema Matrimony member profiles',
    category: 'People & Fellowship',
    navigatorTabs: ['Rhema Matrimony'],
    stackRoutes: ['AdminMatrimonyProfileDetail'],
  },

  // Services & Events
  {
    key: 'events',
    label: 'Events',
    description: 'Manage church events, schedules, and RSVP attendees',
    category: 'Services & Events',
    navigatorTabs: ['Events', 'New Event'],
    stackRoutes: ['EventAttendees'],
  },
  {
    key: 'pastor_events',
    label: 'Pastor Event',
    description: 'Manage Pastor outreach itineraries, maps, and route planning',
    category: 'Services & Events',
    navigatorTabs: ['Pastor Event'],
    stackRoutes: [
      'EventDetail',
      'CreateEvent',
      'RoutePlanner',
      'EventMap',
      'AIAssistant',
    ],
  },
  {
    key: 'service_roster',
    label: 'Service Roster',
    description: 'Plan worship order, teams, rehearsals, and duties',
    category: 'Services & Events',
    navigatorTabs: ['Service Roster'],
    stackRoutes: [],
  },
  {
    key: 'celebrations',
    label: 'Celebrations',
    description: 'Send birthday, wedding, and baptism celebration wishes',
    category: 'Services & Events',
    navigatorTabs: ['Celebrations'],
    stackRoutes: [],
  },

  // Media & Communications
  {
    key: 'notifications',
    label: 'Notifications',
    description: 'Send push broadcasts and manage YouTube Live announcements',
    category: 'Media & Communications',
    navigatorTabs: ['Notifications'],
    stackRoutes: [],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Respond to WhatsApp inbox threads (when enabled for church)',
    category: 'Media & Communications',
    navigatorTabs: ['WhatsApp'],
    stackRoutes: [],
  },
  {
    key: 'gallery',
    label: 'Gallery',
    description: 'Create church photo albums and upload media',
    category: 'Media & Communications',
    navigatorTabs: ['Gallery'],
    stackRoutes: [],
  },
  {
    key: 'online_meetings',
    label: 'Online Meetings',
    description: 'Schedule, start, and manage Zoom & Bible study classes',
    category: 'Media & Communications',
    navigatorTabs: ['Online Meetings', 'New Online Meeting'],
    stackRoutes: [],
  },

  // Church Management
  {
    key: 'church_settings',
    label: 'Church Settings & Branches',
    description: 'Update church profile, branding, branches, About & Contact info',
    category: 'Church Management',
    navigatorTabs: ['Church Settings', 'Church Branches'],
    stackRoutes: [],
  },
  {
    key: 'support_team',
    label: 'Support Team',
    description: 'View and respond to church member support requests',
    category: 'Church Management',
    navigatorTabs: ['Support Team'],
    stackRoutes: [],
  },

  // Strictly Super Admin Protected Modules (Never delegable via Admin Permissions)
  {
    key: 'care_cells',
    label: 'Care Cells',
    description: 'Controlled by Super Admin & per-cell assignments in Care Cells Hub',
    category: 'Super Admin Protected',
    navigatorTabs: ['Care Cells'],
    stackRoutes: [],
    protectedSuperAdminOnly: true,
  },
  {
    key: 'expense',
    label: 'Expense',
    description: 'Strictly Super Admin only — church expenses & approvals',
    category: 'Super Admin Protected',
    navigatorTabs: ['Expense'],
    stackRoutes: [],
    protectedSuperAdminOnly: true,
  },
  {
    key: 'donations',
    label: 'Donations',
    description: 'Strictly Super Admin only — donation ledgers & reports',
    category: 'Super Admin Protected',
    navigatorTabs: ['Donations'],
    stackRoutes: [],
    protectedSuperAdminOnly: true,
  },
  {
    key: 'daily_verses',
    label: 'Daily Verses',
    description: 'Strictly Super Admin only — global daily verse manager',
    category: 'Super Admin Protected',
    navigatorTabs: ['Daily Verses'],
    stackRoutes: [],
    protectedSuperAdminOnly: true,
  },
  {
    key: 'app_admin',
    label: 'App Admin',
    description: 'Strictly Super Admin only — platform & permission administration',
    category: 'Super Admin Protected',
    navigatorTabs: ['App Admin'],
    stackRoutes: [],
    protectedSuperAdminOnly: true,
  },
];

export const DELEGABLE_ADMIN_MODULES = ADMIN_MODULE_DEFINITIONS.filter(
  (m) => !m.protectedSuperAdminOnly && !m.coreAlwaysEnabled
);

export const PROTECTED_SUPER_ADMIN_MODULES = ADMIN_MODULE_DEFINITIONS.filter(
  (m) => m.protectedSuperAdminOnly === true
);

export const DELEGABLE_MODULE_KEYS: DelegableAdminModuleKey[] = DELEGABLE_ADMIN_MODULES.map(
  (m) => m.key as DelegableAdminModuleKey
);

export const PROTECTED_MODULE_KEYS = new Set<string>(
  PROTECTED_SUPER_ADMIN_MODULES.map((m) => m.key)
);

const TAB_NAME_TO_MODULE = new Map<string, AdminModuleKey>();
const STACK_ROUTE_TO_MODULE = new Map<string, AdminModuleKey>();
const MODULE_BY_KEY = new Map<AdminModuleKey, AdminModuleDefinition>();

for (const mod of ADMIN_MODULE_DEFINITIONS) {
  MODULE_BY_KEY.set(mod.key, mod);
  for (const tabName of mod.navigatorTabs) {
    TAB_NAME_TO_MODULE.set(tabName.toLowerCase(), mod.key);
  }
  for (const routeName of mod.stackRoutes) {
    STACK_ROUTE_TO_MODULE.set(routeName, mod.key);
  }
}

export function getAdminModuleDefinition(key: AdminModuleKey): AdminModuleDefinition | undefined {
  return MODULE_BY_KEY.get(key);
}

export function getModuleKeyForAdminTab(tabName?: string | null): AdminModuleKey | null {
  const norm = String(tabName || '').trim().toLowerCase();
  if (!norm) return null;
  return TAB_NAME_TO_MODULE.get(norm) || null;
}

export function getModuleKeyForStackRoute(routeName?: string | null): AdminModuleKey | null {
  const clean = String(routeName || '').trim();
  if (!clean) return null;
  return STACK_ROUTE_TO_MODULE.get(clean) || null;
}

export function getModuleKeyForAdminNotificationType(typeRaw?: string | null): AdminModuleKey | null {
  const type = String(typeRaw || '').trim().toLowerCase();
  if (!type) return null;
  if (type === 'registration_request_admin' || type === 'registration_request') return 'approvals';
  if (type === 'job_application_admin') return 'job_circle';
  if (type === 'volunteer_application_admin') return 'volunteers';
  if (type === 'prayer_request_admin' || type === 'prayer_request' || type === 'prayer') return 'prayer_wall';
  if (type === 'baptism_request_admin' || type === 'baptism_request' || type === 'baptism') return 'baptism';
  if (type === 'testimony_admin') return 'testimonies';
  if (type === 'admin_roster_alert') return 'service_roster';
  if (type === 'matrimony_profile_admin' || type === 'matrimony_report_admin') return 'matrimony';
  if (type === 'kids_safety_admin') return 'kids_ministry';
  if (type === 'expense_approval' || type === 'expense_approved' || type === 'expense_rejected' || type === 'invoice') {
    return 'expense';
  }
  if (type === 'new_church') return 'app_admin';
  return null;
}

const ALWAYS_SUPER_ADMIN_TYPES = new Set<string>([
  'expense_approval',
  'expense_approved',
  'expense_rejected',
  'invoice',
  'new_church',
]);

const EXPLICIT_ADMIN_ONLY_TYPES = new Set<string>([
  'registration_request_admin',
  'job_application_admin',
  'volunteer_application_admin',
  'prayer_request_admin',
  'baptism_request_admin',
  'testimony_admin',
  'admin_roster_alert',
  'matrimony_profile_admin',
  'matrimony_report_admin',
]);

export function isSuperAdminOnlyNotification(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  const type = String(data.type || '').trim().toLowerCase();
  return data.targetRole === 'super_admin' || ALWAYS_SUPER_ADMIN_TYPES.has(type);
}

export function isAdminOnlyNotification(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  if (isSuperAdminOnlyNotification(data)) return true;
  if (data.targetRole === 'admin' || data.recipientRole === 'admin') return true;
  const type = String(data.type || '').trim().toLowerCase();
  return EXPLICIT_ADMIN_ONLY_TYPES.has(type);
}

/**
 * Resolves the AdminModuleKey required to open/view an admin notification document.
 * Bare legacy types ('prayer_request', 'prayer', 'baptism_request', 'baptism') are only
 * treated as admin-module gated when the payload targets an admin/AdminRoot screen.
 */
export function getRequiredAdminModuleForNotification(data: any): AdminModuleKey | null {
  if (!data || typeof data !== 'object') return null;
  const type = String(data.type || '').trim().toLowerCase();
  if (data.targetRole === 'member' || data.recipientRole === 'member') {
    return null;
  }

  const explicitMod = String(data.requiredAdminModule || '').trim() as AdminModuleKey;
  if (explicitMod && MODULE_BY_KEY.has(explicitMod)) {
    return explicitMod;
  }

  if (
    type === 'prayer_request' ||
    type === 'prayer' ||
    type === 'baptism_request' ||
    type === 'baptism'
  ) {
    const isAdminTargeted =
      data.targetRole === 'admin' ||
      data.recipientRole === 'admin' ||
      data.screen === 'AdminRoot' ||
      String(data.targetTab || '').trim().length > 0;
    if (!isAdminTargeted) return null;
  }

  const fromType = getModuleKeyForAdminNotificationType(type);
  if (fromType) return fromType;

  if (data.targetTab) {
    return getModuleKeyForAdminTab(String(data.targetTab));
  }
  return null;
}

function normalizePhoneTail(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-10) : '';
}

function matchesNotificationRecipientTarget(
  data: any,
  userIds: string[],
  userPhones: string[]
): boolean {
  const cleanUserIds = new Set(userIds.map((v) => String(v || '').trim()).filter(Boolean));
  const cleanUserPhones = userPhones.map(normalizePhoneTail).filter(Boolean);

  const singleIds = [
    data.targetMemberId,
    data.targetUid,
    data.recipientId,
    data.targetAccountId,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  const multiIds = Array.isArray(data.targetUids)
    ? data.targetUids.map((v: any) => String(v || '').trim()).filter(Boolean)
    : [];
  const allTargetIds = [...singleIds, ...multiIds];

  const singlePhone = normalizePhoneTail(data.targetPhone);
  const multiPhones = Array.isArray(data.targetPhones)
    ? data.targetPhones.map(normalizePhoneTail).filter(Boolean)
    : [];
  const allTargetPhones = [...(singlePhone ? [singlePhone] : []), ...multiPhones];

  if (allTargetIds.length === 0 && allTargetPhones.length === 0) {
    return true;
  }

  const idMatched = allTargetIds.some((id) => cleanUserIds.has(id));
  const phoneMatched = allTargetPhones.some((tPhone) =>
    cleanUserPhones.some((uPhone) => uPhone === tPhone || uPhone.endsWith(tPhone) || tPhone.endsWith(uPhone))
  );
  return idMatched || phoneMatched;
}

/**
 * Shared client-side visibility check across UpdatesScreen, JobCircleScreen,
 * and foreground notification listeners.
 */
export function canViewNotificationRecord(params: {
  data: any;
  userIds: Array<string | null | undefined>;
  userPhones: Array<string | null | undefined>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canAccessAdminModule: (key: AdminModuleKey | null | undefined, hasCareCellAccess?: boolean) => boolean;
}): boolean {
  const { data, userIds, userPhones, isAdmin, isSuperAdmin, canAccessAdminModule } = params;
  if (!data || typeof data !== 'object') return false;

  const type = String(data.type || '').trim().toLowerCase();
  const cleanUserIds = userIds.map((v) => String(v || '').trim()).filter(Boolean);
  const cleanUserPhones = userPhones.map((v) => String(v || '').trim()).filter(Boolean);

  if (isSuperAdminOnlyNotification(data) && !isSuperAdmin) {
    return false;
  }

  // Hybrid Admin/Teacher Kids Ministry alerts: visible to authorized Kids Ministry Admins
  // OR explicitly targeted active Kids Ministry Teachers.
  if (type === 'kids_safety_admin' || data.targetRole === 'kids_ministry_staff') {
    if (isSuperAdmin || (isAdmin && canAccessAdminModule('kids_ministry'))) {
      return true;
    }
    const targetUids = Array.isArray(data.targetUids) ? data.targetUids : [];
    const targetPhones = Array.isArray(data.targetPhones) ? data.targetPhones : [];
    const hasExplicitTarget = targetUids.length > 0 || targetPhones.length > 0 || Boolean(data.targetMemberId || data.targetUid || data.recipientId || data.targetPhone);
    if (!hasExplicitTarget) return false;
    return matchesNotificationRecipientTarget(data, cleanUserIds, cleanUserPhones);
  }

  if (isAdminOnlyNotification(data)) {
    if (!isAdmin) return false;
    const requiredMod = getRequiredAdminModuleForNotification(data);
    if (requiredMod && !canAccessAdminModule(requiredMod)) {
      return false;
    }
  }

  return matchesNotificationRecipientTarget(data, cleanUserIds, cleanUserPhones);
}

/**
 * Resolves the clean default permissions map (for newly appointed admins):
 * Dashboard ON, optional modules per configured template (OFF unless explicitly enabled).
 */
export function buildDefaultNewAdminModules(
  templateModules?: Record<string, boolean> | null
): Record<string, boolean> {
  const result: Record<string, boolean> = { dashboard: true };
  for (const key of DELEGABLE_MODULE_KEYS) {
    result[key] = Boolean(templateModules && templateModules[key] === true);
  }
  return result;
}

/**
 * Option A rollout helper: builds a baseline permission map with all delegable
 * modules enabled for already-existing Church Admins (never includes Super-Admin-only keys).
 */
export function buildOptionAExistingAdminModules(): Record<string, boolean> {
  const result: Record<string, boolean> = { dashboard: true };
  for (const key of DELEGABLE_MODULE_KEYS) {
    result[key] = true;
  }
  return result;
}

/**
 * Evaluates whether the current signed-in Admin can access a given module.
 * - Super Admins always retain full access to every module.
 * - Care Cells preserves its existing per-cell `hasCareCellAccess` model cleanly.
 * - Expense, Donations, Daily Verses, App Admin remain strictly Super Admin only.
 * - Standard Admins with an explicit `modules` map are strictly fail-closed (`modules[key] === true`).
 * - Before Option-A permission rollout is initialized (`hasExplicitPermissionDoc === false` && `!defaultTemplateConfigured`),
 *   pre-existing standard Admins retain existing delegable access without disruption.
 */
export function canAdminAccessModule(params: {
  moduleKey: AdminModuleKey | null | undefined;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  modules?: Record<string, boolean> | null;
  hasExplicitPermissionDoc: boolean;
  defaultTemplateConfigured: boolean;
  hasCareCellAccess?: boolean;
}): boolean {
  const {
    moduleKey,
    isSuperAdmin,
    isAdmin,
    modules,
    hasExplicitPermissionDoc,
    defaultTemplateConfigured,
    hasCareCellAccess = false,
  } = params;

  if (!moduleKey) return isAdmin || isSuperAdmin;
  if (isSuperAdmin) return true;
  if (!isAdmin) return false;

  // Protected Super Admin modules (cannot be granted via Admin Permissions)
  if (moduleKey === 'care_cells') {
    // Existing Care Cells behavior: accessible only when Super Admin or explicitly assigned to a Care Cell
    return Boolean(hasCareCellAccess);
  }
  if (PROTECTED_MODULE_KEYS.has(moduleKey)) {
    return false;
  }

  if (moduleKey === 'dashboard') {
    return true;
  }

  if (hasExplicitPermissionDoc && modules && typeof modules === 'object') {
    return modules[moduleKey] === true;
  }

  // Zero-disruption Option A grace only BEFORE church permission docs/template are seeded
  if (!defaultTemplateConfigured) {
    return true;
  }

  // Strict fail-closed default for new admins when template exists but doc is missing
  return false;
}
