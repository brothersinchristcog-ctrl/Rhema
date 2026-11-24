export type MatrimonyProfileStatus =
  | 'not_started'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'correction_requested'
  | 'hidden'
  | 'on_hold'
  | 'engaged'
  | 'married'
  | 'inactive'
  | 'suspended'
  | 'deleted';

export type PreferenceImportance = 'essential' | 'preferred' | 'flexible';

export type MatrimonyMembershipTier = 'free' | 'silver' | 'gold' | 'platinum';

export type MatrimonyMobilePrivacy = 'show_all' | 'messages_only';

export type MatrimonyPhotoVisibility =
  | 'approved_members'
  | 'contacted_and_paid'
  | 'protect_photo'
  | 'matches_only';

export interface MatrimonyMembershipInfo {
  tier: MatrimonyMembershipTier;
  planId?: string;
  planName?: string;
  status?: 'active' | 'expired';
  amountInr?: number;
  durationMonths?: number;
  validUntilMs?: number;
  paymentId?: string;
}

export interface MatrimonyPlanLimits {
  monthlyInterestLimit: number;
  contactNumberLimit: number;
  shortlistLimit: number;
  messageAccess: boolean;
  callAccess: boolean;
  whatsappAccess: boolean;
  advancedFilters: boolean;
  visibilityPriority: number;
  highlightStyle: 'none' | 'gold' | 'platinum';
  prioritySupport: boolean;
}

export interface MatrimonyPlanSpec {
  planId: string;
  tier: 'silver' | 'gold' | 'platinum';
  planName: string;
  tagline: string;
  durationMonths: number;
  priceInr: number;
  originalPriceInr: number;
  discountPercentage: number;
  badgeText: string;
  benefits: string[];
  limits: MatrimonyPlanLimits;
  isActive: boolean;
  sortOrder: number;
}

export interface MemberEntitlements {
  tier: MatrimonyMembershipTier;
  planId: string | null;
  planName: string;
  subscriptionStatus: 'free' | 'active' | 'expired';
  subscriptionId: string | null;
  startDateMs: number | null;
  expiryDateMs: number | null;
  monthlyInterestLimit: number;
  interestsSentThisMonth: number;
  interestsRemaining: number;
  contactNumberLimit: number;
  contactNumbersViewedCount: number;
  contactNumbersRemaining: number;
  shortlistLimit: number;
  messageAccess: boolean;
  callAccess: boolean;
  whatsappAccess: boolean;
  advancedFilters: boolean;
  visibilityPriority: number;
  highlightStyle: 'none' | 'gold' | 'platinum';
  prioritySupport: boolean;
  unlockedContactUids: string[];
  monthKey: string;
}

export interface MatrimonyVerificationSummary {
  adminApproved: boolean;
  churchMemberVerified: boolean;
  photoVerified: boolean;
  baptismVerified: boolean;
  trustLevel: 'prime_verified' | 'verified';
}

export interface MatrimonyConsent {
  profilePublication: boolean;
  matchmaking: boolean;
  communication: boolean;
  consentVersion: string;
}

export interface MatrimonyProfile {
  uid: string;
  churchId: string;
  displayName: string;
  gender: string;
  age: number | null;
  heightCm?: number;
  maritalStatus: string;
  motherTongue?: string;
  aboutMe?: string;
  location: {
    city: string;
    state: string;
    country: string;
    citizenship?: string;
    village?: string;
    pincode?: string;
  };
  physicalStatus?: string;
  numberOfChildren?: string;
  education?: {
    qualification?: string;
    specialization?: string;
    college?: string;
  };
  career?: {
    occupationCategory?: string;
    employmentType?: string;
    profession?: string;
    organization?: string;
    workLocation?: string;
  };
  familySummary?: {
    familyType?: string;
    familyStatus?: string;
    familyValues?: string;
  };
  faithSummary?: {
    religion?: string;
    denomination?: string;
    division?: string;
    openToAnyDivision?: boolean;
    religiousValues?: string;
    baptized?: boolean | null;
    baptismChurch?: string | null;
    shareFaithDetails?: boolean;
  };
  habits?: {
    eatingHabits?: string;
    smokingHabits?: string;
    drinkingHabits?: string;
  };
  interests?: {
    hobbies?: string[];
    music?: string[];
    reading?: string[];
    movies?: string[];
    sports?: string[];
    food?: string[];
    languages?: string[];
  };
  profilePhoto?: string | null;
  signedProfilePhoto?: string | null;
  gallery?: string[];
  signedGallery?: string[];
  photoVisibility?: MatrimonyPhotoVisibility;
  mobilePrivacy?: MatrimonyMobilePrivacy;
  protectedPhotoAllowedUids?: string[];
  selfDeactivated?: boolean;
  deletionReason?: string | null;
  notificationPreferences?: Partial<MatrimonyNotificationPreferences>;
  profileStatus: MatrimonyProfileStatus;
  onboardingStage?: 'not_started' | 'photos_pending' | 'completed' | string;
  verificationStatus: string;
  visibility: string;
  profileCompletion: number;
  inactiveReason?: string | null;
  membership?: MatrimonyMembershipInfo | null;
}

export interface MatrimonyPreferences {
  age: { min: number; max: number; importance: PreferenceImportance };
  height: { minCm: number; maxCm: number; importance: PreferenceImportance };
  haveChildren?: string;
  maritalStatuses: string[];
  physicalStatus?: string;
  motherTongue?: string;
  denomination?: string;
  division?: string;
  education: { acceptable: string[]; importance: PreferenceImportance };
  employedIn?: string;
  occupation?: string;
  annualIncome?: string;
  locations: {
    preferredCountries?: string[];
    preferredCities: string[];
    preferredStates: string[];
    openToRelocation: boolean;
  };
  eatingHabits?: string;
  drinkingHabits?: string;
  smokingHabits?: string;
  partnerExpectations?: string;
}

export interface MatrimonyPendingRegistrationDraft {
  welcome?: {
    motherTongue?: string;
    baptized?: boolean;
    managedBy?: 'self' | 'guardian';
    createdFor?: string;
  };
  basic?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  personal?: {
    gender?: string;
    dob?: string;
    heightCm?: number;
    physicalStatus?: string;
    maritalStatus?: string;
    numberOfChildren?: string;
  };
  religious?: {
    religion?: string;
    denomination?: string;
    division?: string;
    openToAnyDivision?: boolean;
  };
  location?: {
    country?: string;
    state?: string;
    village?: string;
    pincode?: string;
  };
  professional?: {
    qualification?: string;
    employmentType?: string;
    profession?: string;
    organization?: string;
    incomeCurrency?: string;
    incomeRange?: string;
  };
  additional?: {
    familyStatus?: string;
    aboutMe?: string;
  };
  consent?: {
    profilePublication: boolean;
    matchmaking: boolean;
    communication: boolean;
    managedBy?: 'self' | 'guardian';
    createdFor?: string;
  };
}

export interface StartRegistrationResponse {
  success: boolean;
  eligible: boolean;
  registered?: boolean;
  reasons?: string[];
  banReason?: string;
  registrationId?: string;
  contactInfo?: {
    fullName: string;
    email: string;
    phone: string;
    dob?: string;
    zip?: string;
  };
  prefilled?: {
    displayName?: string;
    age?: number | null;
    gender?: string;
    city?: string;
    state?: string;
  };
  profile?: MatrimonyProfile;
  profileManager?: {
    type?: 'self' | 'guardian';
    createdFor?: string;
    guardianUid?: string | null;
  } | null;
  consent?: MatrimonyConsent | null;
  familyDetails?: {
    familyIntro?: string;
    shareFamilyIntro?: boolean;
    fatherOccupation?: string;
    motherOccupation?: string;
    familyOrigin?: string;
    brothers?: string;
    sisters?: string;
    brothersMarried?: string;
    sistersMarried?: string;
  } | null;
  incomeDetails?: {
    currency?: string;
    annualIncomeRange?: string;
  } | null;
  preferences?: MatrimonyPreferences;
}

export interface MatrimonyStatusResponse {
  success: boolean;
  registered: boolean;
  profileStatus: MatrimonyProfileStatus;
  verificationStatus?: string;
  visibility?: string;
  profileCompletion?: number;
  rejectionReason?: string | null;
  inactiveReason?: string | null;
  signedProfilePhoto?: string | null;
  profile?: MatrimonyProfile;
}

export interface MatrimonyProfileReport {
  id: string;
  targetUid: string;
  targetName?: string;
  targetCode?: string;
  reporterUid: string;
  reporterName: string;
  reporterCode?: string;
  category: string;
  reason: string;
  source?: 'profile' | 'chat';
  status: 'open' | 'action_taken' | 'resolved' | 'dismissed';
  createdAtMs: number;
  resolvedAtMs?: number | null;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
}

export interface AdminMatrimonyCounts {
  total: number;
  verified: number;
  pending: number;
  approved: number;
  rejected: number;
  draft: number;
  correction_requested: number;
  suspended: number;
  inactive: number;
  reported: number;
  openReports?: number;
}

export interface AdminMatrimonyProfileSummary extends MatrimonyProfile {
  signedPhoto?: string | null;
  submittedAt?: any;
  updatedAt?: any;
  createdAt?: any;
  deletedAtMs?: number | null;
  openReportCount?: number;
  totalReportCount?: number;
  latestReport?: MatrimonyProfileReport | null;
  isLegacyBan?: boolean;
  verification?: {
    approval?: {
      status?: string;
      type?: string;
      reviewedBy?: string | null;
      reviewedAt?: any;
      rejectionReason?: string | null;
    };
  } | null;
}

export interface AdminMatrimonyProfileDetail extends StartRegistrationResponse {
  verification?: Record<string, any> | null;
  rejectionReason?: string | null;
  inactiveReason?: string | null;
  deletionReason?: string | null;
  deletedAtMs?: number | null;
  isLegacyBan?: boolean;
  reports?: MatrimonyProfileReport[];
}

export type MatrimonyMatchTab =
  | 'all'
  | 'newly_joined'
  | 'shortlisted'
  | 'shortlisted_by_you'
  | 'shortlisted_you'
  | 'viewed_you'
  | 'viewed_by_you'
  | 'nearby'
  | 'photo_matches'
  | 'mutual_matches'
  | 'looking_for_you'
  | 'education_pref'
  | 'professional_pref'
  | 'location_pref'
  | 'nri_matches'
  | 'shared_interests';

export interface MatrimonyMatchesFilter {
  minAge?: number;
  maxAge?: number;
  minHeightCm?: number;
  maxHeightCm?: number;
  profileCreatedBy?: string;
  maritalStatus?: string;
  motherTongue?: string;
  physicalStatus?: string;
  baptized?: string;
  baptizedOnly?: boolean;
  denomination?: string;
  division?: string;
  occupation?: string;
  annualIncome?: string;
  employmentType?: string;
  education?: string[];
  nearbyProfiles?: boolean;
  sameCity?: boolean;
  sameState?: boolean;
  country?: string;
  state?: string;
  city?: string;
  eatingHabits?: string;
  drinkingHabits?: string;
  smokingHabits?: string;
  familyStatus?: string;
  familyType?: string;
  familyValues?: string;
  createdWithin?: 'all' | 'today' | '3d' | '1w' | '1m';
  mutualMatchesOnly?: boolean;
  withPhotoOnly?: boolean;
  sharedInterestsOnly?: boolean;
}

export interface PreferenceCheckItem {
  label: string;
  value: string;
  matched: boolean;
}

export interface PreferenceCheckSection {
  title: string;
  items: PreferenceCheckItem[];
}

export interface PartnerPreferenceMatchSummary {
  matchedCount: number;
  totalCount: number;
  sections: PreferenceCheckSection[];
}

export interface MatrimonyMatchCandidate {
  uid: string;
  displayName: string;
  profileCode: string;
  gender: string;
  age: number | null;
  heightCm: number | null;
  maritalStatus: string;
  motherTongue?: string;
  aboutMe?: string;
  profileCreatedBy?: string;
  education?: {
    qualification?: string;
    specialization?: string;
    college?: string;
  };
  career?: {
    occupationCategory?: string;
    employmentType?: string;
    profession?: string;
    organization?: string;
  };
  location?: {
    city?: string;
    village?: string;
    state?: string;
    country?: string;
  };
  faithSummary?: {
    religion?: string;
    denomination?: string;
    division?: string;
    religiousValues?: string;
    baptized?: boolean | null;
  };
  habits?: {
    eatingHabits?: string;
    smokingHabits?: string;
    drinkingHabits?: string;
  };
  interests?: {
    hobbies?: string[];
    music?: string[];
    reading?: string[];
    movies?: string[];
    sports?: string[];
    food?: string[];
    languages?: string[];
  };
  familySummary?: {
    familyType?: string;
    familyStatus?: string;
    familyValues?: string;
  };
  familyDetails?: {
    brothers?: string;
    sisters?: string;
    brothersMarried?: string;
    sistersMarried?: string;
    familyOrigin?: string;
    fatherOccupation?: string;
    motherOccupation?: string;
    familyIntro?: string;
  } | null;
  annualIncomeRange?: string;
  dob?: string | null;
  maskedDob?: string | null;
  maskedPhone?: string | null;
  contactPhone?: string | null;
  isContactUnlocked?: boolean;
  canUnlockContact?: boolean;
  mobilePrivacy?: MatrimonyMobilePrivacy;
  isPhotoProtected?: boolean;
  photoRequestStatus?: 'pending' | 'approved' | 'declined' | null;
  photoVisibility?: MatrimonyPhotoVisibility;
  candidateTier?: MatrimonyMembershipTier;
  isHighlighted?: 'none' | 'gold' | 'platinum';
  visibilityPriority?: number;
  verificationSummary?: MatrimonyVerificationSummary;
  partnerPreferencesComparison?: PartnerPreferenceMatchSummary;
  signedProfilePhoto?: string | null;
  signedGallery?: string[];
  photoCount: number;
  matchScore: number;
  sharedInterests: string[];
  matchReasons: string[];
  breakdown?: {
    ageScore: number;
    educationScore?: number;
    interestsScore: number;
    heightScore: number;
    maritalScore: number;
    familyScore?: number;
    faithScore: number;
    careerScore: number;
    locationScore: number;
    lifestyleScore?: number;
    additionalScore?: number;
    habitsScore: number;
  };
  isShortlisted: boolean;
  interestStatus: string | null;
  interestSentAtMs?: number;
  joinedAtMs: number;
  viewedAtMs?: number;
  updatedAtMs: number;
}

export interface GetMatrimonyMatchesResponse {
  success: boolean;
  matches: MatrimonyMatchCandidate[];
  totalCount: number;
  hasMore?: boolean;
  nextOffset?: number;
  totalAvailableCount?: number;
  hiddenCount?: number;
  viewerGender: 'male' | 'female' | null;
  targetGender: 'male' | 'female' | null;
  viewerPhoto?: string | null;
  viewerPreferencesFilter?: MatrimonyMatchesFilter;
  preferencesUpdatedAtMs?: number;
  viewerEntitlements?: MemberEntitlements;
  lockedAdvancedFilters?: boolean;
}

export interface MatrimonyInterestEntry {
  id: string;
  direction: 'received' | 'sent';
  status: 'pending' | 'accepted' | 'declined';
  createdAtMs: number;
  updatedAtMs: number;
  candidate: MatrimonyMatchCandidate;
}

export interface GetMatrimonyInterestsHubResponse {
  success: boolean;
  received: MatrimonyInterestEntry[];
  sent: MatrimonyInterestEntry[];
  viewerEntitlements?: MemberEntitlements;
}

export interface AdminSubscriptionItem {
  uid: string;
  subscriptionId: string;
  planId: string;
  planName: string;
  tier: string;
  status: string;
  durationMonths: number;
  amountInr: number;
  source: string;
  grantedBy: string | null;
  note: string | null;
  startDateMs: number | null;
  expiryDateMs: number | null;
}

export interface AdminPaymentHistoryItem {
  id: string;
  uid: string;
  planId: string;
  tier: string;
  amountInr: number;
  status: string;
  source: string;
  paymentId: string | null;
  orderId: string | null;
  createdAtMs: number;
}

export interface AdminMatrimonyPlansAndSubsResponse {
  success: boolean;
  plans: MatrimonyPlanSpec[];
  subscriptions: AdminSubscriptionItem[];
  paymentHistory: AdminPaymentHistoryItem[];
  summary: {
    activeCount: number;
    expiredCount: number;
    silverActive: number;
    goldActive: number;
    platinumActive: number;
    totalRevenueInr: number;
  };
}

export interface MatrimonyChatPeer {
  uid: string;
  displayName: string;
  profileCode: string;
  signedProfilePhoto: string | null;
  age: number | null;
  heightCm?: number | null;
  occupation?: string | null;
  gender?: string | null;
  isVerified?: boolean;
  city: string;
  contactPhone: string | null;
}

export interface MatrimonyChatContact extends MatrimonyChatPeer {
  roomId: string;
  matchTierEligible?: boolean;
}

export interface MatrimonyInboxItem {
  roomId: string;
  peerUid: string;
  peerName: string;
  peerPhoto: string | null;
  peerCode: string;
  peerAge: number | null;
  peerHeightCm?: number | null;
  peerOccupation?: string | null;
  peerGender?: string | null;
  peerCity: string | null;
  contactPhone: string | null;
  lastMessageText: string;
  lastMessageType?: 'text' | 'image';
  lastMessageSenderUid?: string;
  lastMessageId?: string;
  lastMessageDeliveredToPeer?: boolean;
  lastMessageReadByPeer?: boolean;
  lastMessageAt: number;
  unreadCount: number;
}

export interface MatrimonyChatMessageReply {
  id: string;
  senderUid: string;
  senderName?: string;
  text: string;
}

export interface MatrimonyChatMessage {
  id: string;
  senderUid: string;
  text: string;
  type: 'text' | 'image';
  imageUrl?: string | null;
  replyTo?: MatrimonyChatMessageReply | null;
  createdAt: number;
  deliveredBy?: Record<string, number>;
  readBy?: Record<string, number>;
  deletedForEveryone?: boolean;
  deletedFor?: Record<string, boolean>;
}

export interface MatrimonyNotificationPreferences {
  request: boolean;
  shortlist: boolean;
  profileViews: boolean;
  interestAcceptance: boolean;
  recentlyJoined: boolean;
  dailyMatches: boolean;
  cityMatches: boolean;
  photoMatches: boolean;
  similarMatches: boolean;
  newMatches: boolean;
  dailyRecommendations: boolean;
  basedOnActivity: boolean;
  membershipOffers: boolean;
}

export interface MatrimonyHiddenProfileItem {
  uid: string;
  displayName: string;
  profileCode: string;
  age: number | null;
  heightCm: number | null;
  occupation: string;
  city: string;
  signedProfilePhoto: string | null;
  hiddenAtMs: number;
}

export interface MatrimonyPhotoRequestItem {
  uid: string;
  displayName: string;
  profileCode: string;
  age: number | null;
  heightCm: number | null;
  occupation: string;
  city: string;
  signedProfilePhoto: string | null;
  status: 'pending' | 'approved' | 'declined';
  createdAtMs: number;
  updatedAtMs: number;
  candidate?: MatrimonyMatchCandidate | null;
}

export interface MatrimonyPresenceState {
  online: boolean;
  lastSeen: number;
  activeChatId?: string | null;
}

export type MatrimonyNotificationActionType =
  | 'view_profile'
  | 'view_matches'
  | 'view_photo_requests'
  | 'view_interests'
  | 'view_offers'
  | 'view_status';

export interface MatrimonyNotificationFeedItem {
  id: string;
  type: string;
  prefKey?: string | null;
  category: 'interactions' | 'alerts';
  isUrgent: boolean;
  senderUid?: string | null;
  senderName?: string | null;
  senderGender?: string | null;
  senderPhoto?: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAtMs: number;
  actionType: MatrimonyNotificationActionType;
  actionLabel: string;
  incomingPhotoRequestStatus?: 'pending' | 'approved' | 'declined' | null;
  candidate?: MatrimonyMatchCandidate | null;
}
