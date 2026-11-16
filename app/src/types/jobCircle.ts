import { VolunteerApplication, VolunteerStatus } from './volunteer';

export type JobOpportunityType =
  | 'full_time_paid'
  | 'part_time_paid'
  | 'volunteer'
  | 'temporary'
  | 'internship'
  | 'ministry_service'
  | (string & {});

export type JobCompensationType = 'salary' | 'stipend' | 'unpaid' | (string & {});

export type JobOpportunityStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'closed';

export type JobApplicationStatus =
  | 'submitted'
  | 'under_review'
  | 'shortlisted'
  | 'meeting_scheduled'
  | 'selected'
  | 'rejected'
  | 'withdrawn'
  | 'joined';

export interface JobCategory {
  id: string;
  name: string;
  nameTelugu: string;
  description?: string;
  icon: string;
  order: number;
  isEnabled: boolean;
}

export interface AttachmentInfo {
  url: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt: any;
}

export interface JobOpportunity {
  id: string;
  churchId: string;
  title: string;
  categoryId: string;
  categoryName: string;
  description: string;
  responsibilities: string[];
  requiredSkills: string[];
  qualifications?: string[];
  experienceRequired?: string;
  thumbnailUrl?: string; // Banner / thumbnail image for LinkedIn-style feed
  location: string;
  timeCommitment: string;
  opportunityType: JobOpportunityType;
  compensationType: JobCompensationType;
  compensationDetails?: string; // e.g. "Rs. 25,000 - 35,000 / month" or "Honorarium provided"
  applicationDeadline?: any;
  contactEmail?: string;
  contactPhone?: string;
  additionalInstructions?: string;
  status: JobOpportunityStatus;
  
  // Scoped leader or creator
  createdById: string;
  createdByName: string;
  createdByPhoto?: string;
  createdByRole?: string;
  approvedById?: string;
  approvedByName?: string;
  approvedAt?: any;
  rejectionReason?: string;
  createdAt: any;
  updatedAt: any;

  // Stats
  applicationsCount?: number;
}

export interface JobApplication {
  id: string;
  churchId: string;
  opportunityId: string;
  opportunityTitle: string;
  categoryId: string;
  categoryName: string;
  opportunityType: JobOpportunityType;
  compensationType: JobCompensationType;
  
  // Member Details
  memberId: string;
  memberName: string;
  memberPhone: string;
  memberEmail?: string;
  memberFcmToken?: string;
  
  // Church/Ministry Background
  ministryInterests?: string[];
  applicationMessage?: string;
  
  // Attachments (CV / Resume)
  resumeAttachment?: AttachmentInfo;
  
  // Workflow Status
  status: JobApplicationStatus;
  meetingDate?: any;
  meetingTime?: string;
  meetingLocation?: string;
  meetingNotes?: string;
  adminNotes?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: any;
  
  createdAt: any;
  updatedAt: any;
}

export interface MinistryProfile {
  id: string; // matches memberId
  churchId: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  memberEmail?: string;
  
  // Ministry Talents & Calling
  ministryInterests: string[];
  skillsAndTalents: string[]; // e.g. Singing, Keyboard, Guitar, Drums, Preaching, Sound Engineering, Video Editing
  previousExperience?: string;
  languagesKnown: string[];
  preferredMinistries: string[];
  availabilityDays: string[]; // e.g. ["Sunday", "Friday", "Saturday"]
  availabilityTimeSlots: string[]; // e.g. ["Morning", "Evening", "Anytime"]
  shortIntroduction?: string;
  isProfileVisibleToLeaders: boolean;
  
  // Resume / CV attached to profile for quick reuse
  defaultResume?: AttachmentInfo;
  
  updatedAt: any;
}

export interface MinistryTeam {
  id: string;
  churchId: string;
  name: string;
  categoryId: string;
  description?: string;
  leaderId: string;
  leaderName: string;
  memberIds: string[];
  members: {
    memberId: string;
    memberName: string;
    roleInTeam: string;
    phone?: string;
    joinedAt: any;
  }[];
  createdAt: any;
  updatedAt: any;
}

export const DEFAULT_MINISTRY_CATEGORIES: JobCategory[] = [
  { id: 'pastoral', name: 'Pastoral Ministry', nameTelugu: 'పాస్టోరల్ పరిచర్య', icon: 'BookOpen', order: 1, isEnabled: true },
  { id: 'worship', name: 'Worship & Music Ministry', nameTelugu: 'ఆరాధన & సంగీత పరిచర్య', icon: 'Music', order: 2, isEnabled: true },
  { id: 'youth', name: 'Youth Ministry', nameTelugu: 'యవ్వనస్థుల పరిచర్య', icon: 'Zap', order: 3, isEnabled: true },
  { id: 'sunday_school', name: "Children's & Sunday School", nameTelugu: 'పిల్లల & సండే స్కూల్ పరిచర్య', icon: 'Smile', order: 4, isEnabled: true },
  { id: 'media_tech', name: 'Media & Technical Ministry', nameTelugu: 'మీడియా & టెక్నికల్ పరిచర్య', icon: 'Video', order: 5, isEnabled: true },
  { id: 'admin', name: 'Church Administration', nameTelugu: 'చర్చి పరిపాలన', icon: 'ClipboardList', order: 6, isEnabled: true },
  { id: 'missions', name: 'Missions & Outreach Ministry', nameTelugu: 'సువార్త & ఔట్రీచ్ పరిచర్య', icon: 'Globe', order: 7, isEnabled: true },
  { id: 'prayer', name: 'Prayer & Intercessory Ministry', nameTelugu: 'విజ్ఞాపన ప్రార్థన పరిచర్య', icon: 'HeartHandshake', order: 8, isEnabled: true },
  { id: 'hospitality', name: 'Events & Hospitality Ministry', nameTelugu: 'ఈవెంట్స్ & ఆతిథ్య పరిచర్య', icon: 'Heart', order: 9, isEnabled: true },
  { id: 'facilities', name: 'Facilities & Operations', nameTelugu: 'భవన & ప్రాంగణ నిర్వహణ', icon: 'Wrench', order: 10, isEnabled: true },
  { id: 'bible_teaching', name: 'Bible Teaching & Discipleship', nameTelugu: 'బైబిల్ బోధన & శిష్యరికం', icon: 'Award', order: 11, isEnabled: true },
  { id: 'care_support', name: 'Care & Support Ministry', nameTelugu: 'సంరక్షణ & సేవా పరిచర్య', icon: 'Shield', order: 12, isEnabled: true },
];

export const COMMON_MINISTRY_SKILLS = [
  'Singing / Vocals',
  'Keyboard / Piano',
  'Acoustic Guitar',
  'Bass Guitar',
  'Electric Guitar',
  'Drums / Percussion',
  'Sound & Audio Engineering',
  'Live Streaming & Video Switching',
  'Video Editing',
  'Photography',
  'Graphic Design',
  'Preaching',
  'Bible Teaching',
  'Sunday School Teaching',
  'Counseling & Prayer',
  'Hospitality & Food Service',
  'Ushering & Welcoming',
  'Church Administration',
  'First Aid / Healthcare',
  'Stage Setup & Lighting',
];
