import { firestore } from './firebaseConfig';
import { RHEMA_ROOT_COLLECTION } from '../constants/ChurchConfig';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { 
  ServicePlan, 
  ServiceStatus, 
  ServiceType,
  RunSheetItem, 
  SetlistItem, 
  ServiceTemplate, 
  ServiceRecurrenceRule,
  ActivityCategory,
  MinistryTeam,
  MinistryRole,
  MemberSkillRecord,
  MemberAvailabilityRecord,
  CandidateEntry,
  ServiceAssignmentQueue,
  ServiceRehearsal,
  VolunteerAttendanceRecord,
  LiveServiceState,
  StageCue,
  MemberServiceDuty,
  RosterAnalyticsData,
  VolunteerServingStat,
  SongUsageStat
} from '../types/serviceRoster';

/**
 * Built-in Service Templates tailored for Rhema Church services
 */
export const BUILT_IN_SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: 'tpl_sunday_worship',
    churchId: 'built_in',
    name: 'Regular Sunday Worship',
    description: 'Standard 2-hour full congregational worship service with prayer, setlist, sermon, and benediction.',
    serviceType: 'sunday_worship',
    defaultDurationMinutes: 120,
    isBuiltIn: true,
    runSheetTemplate: [
      { order: 1, program: 'Preparation & Sound Check', category: 'preparation', startTime: '10:00', durationMinutes: 15, endTime: '10:15', responsiblePerson: 'Sound & Media Team' },
      { order: 2, program: 'Opening Prayer', category: 'starting_prayer', startTime: '10:15', durationMinutes: 15, endTime: '10:30', responsiblePerson: 'Elder / Associate Pastor' },
      { order: 3, program: 'Welcome & Opening Greetings', category: 'announcements', startTime: '10:30', durationMinutes: 5, endTime: '10:35', responsiblePerson: 'Service Host' },
      { order: 4, program: 'Praise & Worship (Setlist)', category: 'worship_songs', startTime: '10:35', durationMinutes: 25, endTime: '11:00', responsiblePerson: 'Worship Team' },
      { order: 5, program: 'Bible Scripture Reading', category: 'bible_reading', startTime: '11:00', durationMinutes: 5, endTime: '11:05', responsiblePerson: 'Assigned Reader' },
      { order: 6, program: 'Tithe & Offering Prayer', category: 'offering', startTime: '11:05', durationMinutes: 5, endTime: '11:10', responsiblePerson: 'Offering Team' },
      { order: 7, program: 'Church Announcements', category: 'announcements', startTime: '11:10', durationMinutes: 5, endTime: '11:15', responsiblePerson: 'Church Secretary' },
      { order: 8, program: 'Sermon / Message', category: 'sermon', startTime: '11:15', durationMinutes: 50, endTime: '12:05', responsiblePerson: 'Pastor / Speaker' },
      { order: 9, program: 'Altar Call & Closing Prayer', category: 'closing_prayer', startTime: '12:05', durationMinutes: 10, endTime: '12:15', responsiblePerson: 'Pastor' },
      { order: 10, program: 'Benediction & Fellowship', category: 'benediction', startTime: '12:15', durationMinutes: 15, endTime: '12:30', responsiblePerson: 'Lead Pastor' }
    ]
  },
  {
    id: 'tpl_holy_communion',
    churchId: 'built_in',
    name: 'Holy Communion Service',
    description: 'First Sunday of the month celebration with the Lord’s Table, worship, and solemn reflection.',
    serviceType: 'holy_communion',
    defaultDurationMinutes: 135,
    isBuiltIn: true,
    runSheetTemplate: [
      { order: 1, program: 'Opening Prayer & Thanksgiving', category: 'starting_prayer', startTime: '10:00', durationMinutes: 15, endTime: '10:15' },
      { order: 2, program: 'Praise & Worship', category: 'worship_songs', startTime: '10:15', durationMinutes: 30, endTime: '10:45' },
      { order: 3, program: 'Sermon / Exhortation on Table', category: 'sermon', startTime: '10:45', durationMinutes: 35, endTime: '11:20' },
      { order: 4, program: 'Communion Bread Distribution', category: 'communion', startTime: '11:20', durationMinutes: 15, endTime: '11:35' },
      { order: 5, program: 'Communion Cup Distribution', category: 'communion', startTime: '11:35', durationMinutes: 15, endTime: '11:50' },
      { order: 6, program: 'Corporate Thanksgiving Prayer', category: 'closing_prayer', startTime: '11:50', durationMinutes: 10, endTime: '12:00' },
      { order: 7, program: 'Offering & Benediction', category: 'benediction', startTime: '12:00', durationMinutes: 15, endTime: '12:15' }
    ]
  },
  {
    id: 'tpl_bible_study',
    churchId: 'built_in',
    name: 'Midweek Bible Study',
    description: 'In-depth expositional scripture teaching, Q&A, and community prayer.',
    serviceType: 'bible_study',
    defaultDurationMinutes: 90,
    isBuiltIn: true,
    runSheetTemplate: [
      { order: 1, program: 'Opening Prayer', category: 'starting_prayer', startTime: '19:00', durationMinutes: 10, endTime: '19:10' },
      { order: 2, program: 'Devotional Songs (2 Songs)', category: 'opening_song', startTime: '19:10', durationMinutes: 15, endTime: '19:25' },
      { order: 3, program: 'Scripture Exposition / Study', category: 'sermon', startTime: '19:25', durationMinutes: 45, endTime: '20:10' },
      { order: 4, program: 'Q&A & Discussion', category: 'other', startTime: '20:10', durationMinutes: 10, endTime: '20:20' },
      { order: 5, program: 'Intercessory Prayer & Benediction', category: 'closing_prayer', startTime: '20:20', durationMinutes: 10, endTime: '20:30' }
    ]
  },
  {
    id: 'tpl_fasting_prayer',
    churchId: 'built_in',
    name: 'Fasting & Intercessory Prayer',
    description: 'Half-day or full-day prayer watch with worship, corporate intercession, and healing prayers.',
    serviceType: 'fasting_prayer',
    defaultDurationMinutes: 180,
    isBuiltIn: true,
    runSheetTemplate: [
      { order: 1, program: 'Consecration & Opening Prayer', category: 'starting_prayer', startTime: '10:00', durationMinutes: 20, endTime: '10:20' },
      { order: 2, program: 'Deep Worship & Repentance', category: 'worship_songs', startTime: '10:20', durationMinutes: 40, endTime: '11:00' },
      { order: 3, program: 'Prayer for Church & Nation', category: 'other', startTime: '11:00', durationMinutes: 30, endTime: '11:30' },
      { order: 4, program: 'Word of Encouragement', category: 'sermon', startTime: '11:30', durationMinutes: 30, endTime: '12:00' },
      { order: 5, program: 'Personal Ministry & Healing Prayers', category: 'closing_prayer', startTime: '12:00', durationMinutes: 50, endTime: '12:50' },
      { order: 6, program: 'Breaking of Fast & Benediction', category: 'benediction', startTime: '12:50', durationMinutes: 10, endTime: '13:00' }
    ]
  },
  {
    id: 'tpl_christmas_easter',
    churchId: 'built_in',
    name: 'Special Celebration Service (Christmas / Easter)',
    description: 'Festive service featuring special choir cantata, children’s presentation, and evangelistic message.',
    serviceType: 'christmas_celebration',
    defaultDurationMinutes: 150,
    isBuiltIn: true,
    runSheetTemplate: [
      { order: 1, program: 'Festive Prelude & Welcome', category: 'preparation', startTime: '09:30', durationMinutes: 15, endTime: '09:45' },
      { order: 2, program: 'Opening Prayer', category: 'starting_prayer', startTime: '09:45', durationMinutes: 10, endTime: '09:55' },
      { order: 3, program: 'Carols / Resurrection Praise & Worship', category: 'worship_songs', startTime: '09:55', durationMinutes: 30, endTime: '10:25' },
      { order: 4, program: 'Choir Special Performance', category: 'special_performance', startTime: '10:25', durationMinutes: 15, endTime: '10:40' },
      { order: 5, program: 'Sunday School Presentation', category: 'special_performance', startTime: '10:40', durationMinutes: 15, endTime: '10:55' },
      { order: 6, program: 'Celebration Message', category: 'sermon', startTime: '10:55', durationMinutes: 40, endTime: '11:35' },
      { order: 7, program: 'Special Offering & Thanksgiving', category: 'offering', startTime: '11:35', durationMinutes: 10, endTime: '11:45' },
      { order: 8, program: 'Benediction & Love Feast', category: 'benediction', startTime: '11:45', durationMinutes: 15, endTime: '12:00' }
    ]
  }
];

export const DEFAULT_MINISTRY_TEAMS: Omit<MinistryTeam, 'churchId' | 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'team_worship',
    name: 'Worship Team',
    description: 'Vocalists, song leaders, and choir guiding congregational praise.',
    color: '#831843', // Royal Berry
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_worship_leader', title: 'Worship Leader', category: 'worship', defaultSkillRequired: 'Worship Leader' },
      { id: 'pos_singer_soprano', title: 'Vocalist (Soprano)', category: 'worship', defaultSkillRequired: 'Vocals' },
      { id: 'pos_singer_alto', title: 'Vocalist (Alto)', category: 'worship', defaultSkillRequired: 'Vocals' },
      { id: 'pos_singer_tenor', title: 'Vocalist (Tenor)', category: 'worship', defaultSkillRequired: 'Vocals' },
    ]
  },
  {
    id: 'team_music',
    name: 'Music Team',
    description: 'Instrumentalists providing live worship accompaniment.',
    color: '#4A235A', // Deep Violet
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_keyboard', title: 'Keyboard Player', category: 'worship', defaultSkillRequired: 'Keyboard' },
      { id: 'pos_acoustic', title: 'Acoustic Guitarist', category: 'worship', defaultSkillRequired: 'Guitar' },
      { id: 'pos_electric', title: 'Electric Guitarist', category: 'worship', defaultSkillRequired: 'Guitar' },
      { id: 'pos_bass', title: 'Bass Guitarist', category: 'worship', defaultSkillRequired: 'Bass Guitar' },
      { id: 'pos_drums', title: 'Drummer', category: 'worship', defaultSkillRequired: 'Drums' },
    ]
  },
  {
    id: 'team_prayer',
    name: 'Prayer Team',
    description: 'Intercessors leading opening, pastoral, and altar call prayers.',
    color: '#92400E', // Amber
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_opening_prayer', title: 'Opening Prayer Leader', category: 'ministry', defaultSkillRequired: 'Opening Prayer' },
      { id: 'pos_intercessor', title: 'Intercessory Prayer Leader', category: 'ministry', defaultSkillRequired: 'Closing Prayer' },
      { id: 'pos_altar_prayer', title: 'Altar Call Ministry', category: 'ministry', defaultSkillRequired: 'Closing Prayer' },
    ]
  },
  {
    id: 'team_sound',
    name: 'Sound Team',
    description: 'Front of House (FOH) mix, monitor audio, and acoustic management.',
    color: '#1E3A8A', // Deep Navy
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_sound_foh', title: 'Sound Engineer (FOH)', category: 'audio_visual', defaultSkillRequired: 'Sound Engineering' },
      { id: 'pos_sound_stage', title: 'Stage Audio Technician', category: 'audio_visual', defaultSkillRequired: 'Sound Engineering' },
    ]
  },
  {
    id: 'team_media',
    name: 'Media Team',
    description: 'Projector, bilingual scripture presentation, and lyrics operations.',
    color: '#0F766E', // Teal
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_lyrics_operator', title: 'Lyrics & Screen Operator', category: 'audio_visual', defaultSkillRequired: 'Lyrics and Projector' },
      { id: 'pos_bible_slides', title: 'Scripture Slides Controller', category: 'audio_visual', defaultSkillRequired: 'Lyrics and Projector' },
    ]
  },
  {
    id: 'team_livestream',
    name: 'Livestream Team',
    description: 'Online broadcast, PTZ camera operations, and YouTube streaming.',
    color: '#BE123C', // Crimson
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_camera_lead', title: 'Camera Operator #1', category: 'audio_visual', defaultSkillRequired: 'Camera' },
      { id: 'pos_stream_switcher', title: 'Live Video Director', category: 'audio_visual', defaultSkillRequired: 'Livestream' },
    ]
  },
  {
    id: 'team_hospitality',
    name: 'Hospitality Team',
    description: 'Greeters welcoming members, guest registration, and sanctuary seating.',
    color: '#047857', // Emerald
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_greeter_entrance', title: 'Main Door Greeter', category: 'hospitality', defaultSkillRequired: 'Welcome' },
      { id: 'pos_usher', title: 'Sanctuary Usher', category: 'hospitality', defaultSkillRequired: 'Welcome' },
    ]
  },
  {
    id: 'team_offering',
    name: 'Offering Team',
    description: 'Tithe & offering collection, usher coordination, and secure counting.',
    color: '#B45309', // Warm Bronze
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_offering_lead', title: 'Offering Coordinator', category: 'ministry', defaultSkillRequired: 'Offering' },
      { id: 'pos_offering_collector', title: 'Offering Steward', category: 'ministry', defaultSkillRequired: 'Offering' },
    ]
  },
  {
    id: 'team_stage',
    name: 'Stage & Equipment Team',
    description: 'Pulpit preparation, microphone checks, instruments placement.',
    color: '#374151', // Charcoal
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_stage_manager', title: 'Stage Manager', category: 'logistics' },
    ]
  },
  {
    id: 'team_communion',
    name: 'Communion Team',
    description: 'Preparation and sacred distribution of the bread and the cup.',
    color: '#701A75', // Fuchsia Dark
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_communion_prep', title: 'Table Preparation Steward', category: 'ministry' },
      { id: 'pos_communion_server', title: 'Communion Server', category: 'ministry' },
    ]
  },
  {
    id: 'team_children',
    name: "Children's Ministry",
    description: 'Sunday School teachers and children worship coordinators.',
    color: '#0284C7', // Sky Blue
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_sunday_school_lead', title: 'Sunday School Teacher', category: 'ministry' },
    ]
  },
  {
    id: 'team_security',
    name: 'Security Team',
    description: 'Church premises safety, perimeter stewardship, and emergency protocol.',
    color: '#1F2937', // Dark Gray
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_safety_officer', title: 'Safety Steward', category: 'logistics' },
    ]
  },
  {
    id: 'team_cleaning',
    name: 'Cleaning Team',
    description: 'Sanctuary sanitization, post-service tidying, and care of God’s house.',
    color: '#15803D', // Forest Green
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_sanctuary_care', title: 'Sanctuary Care Steward', category: 'logistics' },
    ]
  },
  {
    id: 'team_parking',
    name: 'Parking Team',
    description: 'Traffic guidance, parking lot organization, and guest vehicle assistance.',
    color: '#4338CA', // Indigo
    memberIds: [],
    active: true,
    positions: [
      { id: 'pos_parking_attendant', title: 'Parking Attendant', category: 'logistics' },
    ]
  }
];

class ServiceRosterService {
  /**
   * Reference helper for church scoped root collection
   */
  private getServicePlansCol(churchId: string) {
    return firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(churchId || 'rhema')
      .collection('servicePlans');
  }

  private getServiceTemplatesCol(churchId: string) {
    return firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(churchId || 'rhema')
      .collection('serviceTemplates');
  }

  private getMinistryTeamsCol(churchId: string) {
    return firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(churchId || 'rhema')
      .collection('ministryTeams');
  }

  private getMemberSkillsCol(churchId: string) {
    return firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(churchId || 'rhema')
      .collection('memberSkills');
  }

  private getMemberAvailabilityCol(churchId: string) {
    return firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(churchId || 'rhema')
      .collection('memberAvailability');
  }

  private getAssignmentQueuesCol(churchId: string, serviceId: string) {
    return this.getServicePlansCol(churchId)
      .doc(serviceId)
      .collection('assignmentQueues');
  }

  private getRehearsalsCol(churchId: string, serviceId: string) {
    return this.getServicePlansCol(churchId)
      .doc(serviceId)
      .collection('rehearsals');
  }

  private getAttendanceCol(churchId: string, serviceId: string) {
    return this.getServicePlansCol(churchId)
      .doc(serviceId)
      .collection('attendance');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SERVICE PLANS CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch all service plans matching optional filters
   */
  async getServicePlans(
    churchId: string, 
    filter?: { 
      status?: ServiceStatus; 
      serviceType?: ServiceType;
      startDate?: string; 
      endDate?: string;
      limitCount?: number;
    }
  ): Promise<ServicePlan[]> {
    try {
      const snap = await this.getServicePlansCol(churchId).get();
      let list = snap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as ServicePlan[];

      if (filter?.status) {
        list = list.filter(p => p.status === filter.status);
      }
      if (filter?.serviceType) {
        list = list.filter(p => p.serviceType === filter.serviceType);
      }
      if (filter?.startDate) {
        list = list.filter(p => p.date >= filter.startDate!);
      }
      if (filter?.endDate) {
        list = list.filter(p => p.date <= filter.endDate!);
      }

      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      if (filter?.limitCount) {
        list = list.slice(0, filter.limitCount);
      }

      return list;
    } catch (err) {
      console.error('[ServiceRosterService] getServicePlans error:', err);
      return [];
    }
  }

  /**
   * Fetch single service plan by ID
   */
  async getServicePlanById(churchId: string, planId: string): Promise<ServicePlan | null> {
    try {
      const doc = await this.getServicePlansCol(churchId).doc(planId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() } as ServicePlan;
    } catch (err) {
      console.error('[ServiceRosterService] getServicePlanById error:', err);
      return null;
    }
  }

  /**
   * Fetch upcoming published plans for members & home banner
   */
  async getUpcomingPublishedPlans(churchId: string, limitCount: number = 5): Promise<ServicePlan[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const snap = await this.getServicePlansCol(churchId).get();

      const plans = snap.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data() } as ServicePlan))
        .filter(p => (p.status === 'published' || p.status === 'live') && (p.date >= today))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .slice(0, limitCount);

      return plans;
    } catch (err) {
      console.error('[ServiceRosterService] getUpcomingPublishedPlans error:', err);
      return [];
    }
  }

  /**
   * Create a new Service Plan.
   * If recurrence is requested (weekly or monthly), generates multiple distinct occurrences,
   * each with its own activities and independent assignment queue.
   */
  async createServicePlan(
    churchId: string,
    planData: Partial<ServicePlan>,
    recurrenceOptions?: {
      frequency: 'weekly' | 'monthly';
      count: number; // e.g. 4 for next 4 weeks
    }
  ): Promise<ServicePlan[]> {
    const plansCol = this.getServicePlansCol(churchId);
    const createdPlans: ServicePlan[] = [];

    const baseDateStr = planData.date || new Date().toISOString().split('T')[0];
    const baseDate = new Date(baseDateStr + 'T00:00:00');
    const seriesId = recurrenceOptions ? `series_${Date.now()}` : undefined;
    const totalOccurrences = recurrenceOptions ? Math.min(Math.max(recurrenceOptions.count, 1), 12) : 1;

    const baseRunSheet = planData.runSheet || [];
    const baseStartTime = planData.startTime || '10:00';
    const recalculatedRunSheet = this.calculateItemEndTimes(baseRunSheet, baseStartTime);
    const totalDuration = this.calculateTotalDurationMinutes(recalculatedRunSheet);

    for (let i = 0; i < totalOccurrences; i++) {
      const occurrenceDate = new Date(baseDate);
      if (i > 0 && recurrenceOptions) {
        if (recurrenceOptions.frequency === 'weekly') {
          occurrenceDate.setDate(baseDate.getDate() + (i * 7));
        } else if (recurrenceOptions.frequency === 'monthly') {
          occurrenceDate.setMonth(baseDate.getMonth() + i);
        }
      }

      const dateStr = occurrenceDate.toISOString().split('T')[0];
      const newDocRef = plansCol.doc();

      // Deep clone activities for this specific occurrence so changes don't cross-contaminate
      const occurrenceRunSheet = recalculatedRunSheet.map((item, idx) => ({
        ...item,
        id: `act_${Date.now()}_${idx}_${i}`,
        assignmentStatus: 'unassigned' as const,
        completionStatus: 'pending' as const
      }));

      const newPlan: ServicePlan = {
        id: newDocRef.id,
        churchId: churchId || 'rhema',
        churchName: planData.churchName || 'Rhema Global Ministries',
        serviceTitle: planData.serviceTitle || 'Sunday Worship Celebration',
        serviceType: planData.serviceType || 'sunday_worship',
        date: dateStr,
        startTime: baseStartTime,
        endTime: planData.endTime || this.addMinutesToTime(baseStartTime, totalDuration || 120),
        location: planData.location || 'Church of God Sanctuary',
        preacher: planData.preacher || 'Bro. Y. Rajesh',
        theme: planData.theme || '',
        bibleReference: planData.bibleReference || '',
        description: planData.description || '',
        additionalInstructions: planData.additionalInstructions || '',
        status: planData.status || 'draft',
        totalDurationMinutes: totalDuration || 120,
        runSheet: occurrenceRunSheet,
        setlist: planData.setlist || [],
        recurrence: recurrenceOptions ? {
          isRecurring: true,
          recurrenceType: recurrenceOptions.frequency,
          seriesId,
          frequency: 1,
          occurrencesGenerated: totalOccurrences
        } : {
          isRecurring: false,
          recurrenceType: 'one_time'
        },
        liveState: {
          isLive: false,
          currentActivityIndex: 0,
          status: 'idle',
          elapsedSeconds: 0
        },
        assignments: {},
        assignmentMemberIds: {},
        assignmentStatus: {},
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp()
      };

      await newDocRef.set(newPlan);
      createdPlans.push(newPlan);
    }

    return createdPlans;
  }

  /**
   * Remove undefined fields recursively before writing to Firestore
   */
  sanitizeForFirestore<T>(data: T): T {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeForFirestore(item)) as any;
    }
    if (typeof data === 'object' && !(data instanceof Date) && !(data as any)?._methodName) {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(data)) {
        if (val !== undefined) {
          sanitized[key] = this.sanitizeForFirestore(val);
        }
      }
      return sanitized;
    }
    return data;
  }

  /**
   * Update an existing service plan
   */
  async updateServicePlan(churchId: string, planId: string, updates: Partial<ServicePlan>): Promise<void> {
    const docRef = this.getServicePlansCol(churchId).doc(planId);
    
    // If runSheet or startTime changed, keep times coherent
    let updatedRunSheet = updates.runSheet;
    let totalDuration = updates.totalDurationMinutes;
    if (updatedRunSheet && updates.startTime) {
      updatedRunSheet = this.calculateItemEndTimes(updatedRunSheet, updates.startTime);
      totalDuration = this.calculateTotalDurationMinutes(updatedRunSheet);
    }

    const payload = this.sanitizeForFirestore({
      ...updates,
      ...(updatedRunSheet ? { runSheet: updatedRunSheet } : {}),
      ...(totalDuration !== undefined ? { totalDurationMinutes: totalDuration } : {}),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });

    await docRef.update(payload);
  }

  /**
   * Delete a service plan
   */
  async deleteServicePlan(churchId: string, planId: string): Promise<void> {
    await this.getServicePlansCol(churchId).doc(planId).delete();
  }

  /**
   * Transition service status (e.g. draft -> published -> live -> completed)
   */
  async updateServiceStatus(churchId: string, planId: string, status: ServiceStatus): Promise<void> {
    await this.getServicePlansCol(churchId).doc(planId).update({
      status,
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DYNAMIC SERVICE ORDER / RUNSHEET ENGINE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Recalculates end times and start times down the chronological sequence
   */
  calculateItemEndTimes(items: RunSheetItem[], serviceStartTime: string = '10:00'): RunSheetItem[] {
    let currentStart = serviceStartTime;

    return items.map((item, index) => {
      const dur = Math.max(1, item.durationMinutes || 5);
      const endTime = this.addMinutesToTime(currentStart, dur);
      const updated: RunSheetItem = {
        ...item,
        order: index + 1,
        startTime: currentStart,
        durationMinutes: dur,
        endTime
      };
      currentStart = endTime;
      return updated;
    });
  }

  /**
   * Sums total duration of run sheet items
   */
  calculateTotalDurationMinutes(items: RunSheetItem[]): number {
    return items.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
  }

  /**
   * Validates timeline for overlaps or out-of-bounds relative to the service window
   */
  validateTimeline(items: RunSheetItem[], serviceStart?: string, serviceEnd?: string) {
    const warnings: string[] = [];
    const overlaps: string[] = [];

    const startMin = serviceStart ? this.timeStringToMinutes(serviceStart) : 0;
    const endMin = serviceEnd ? this.timeStringToMinutes(serviceEnd) : 24 * 60;

    for (let i = 0; i < items.length; i++) {
      const curr = items[i];
      const s = this.timeStringToMinutes(curr.startTime);
      const e = this.timeStringToMinutes(curr.endTime);

      if (serviceStart && s < startMin) {
        warnings.push(`"${curr.program}" starts at ${curr.startTime}, before service start (${serviceStart})`);
      }
      if (serviceEnd && e > endMin) {
        warnings.push(`"${curr.program}" ends at ${curr.endTime}, after service scheduled end (${serviceEnd})`);
      }

      for (let j = i + 1; j < items.length; j++) {
        const next = items[j];
        const nextS = this.timeStringToMinutes(next.startTime);
        const nextE = this.timeStringToMinutes(next.endTime);

        if (s < nextE && nextS < e) {
          overlaps.push(`Time conflict between "${curr.program}" (${curr.startTime}-${curr.endTime}) and "${next.program}" (${next.startTime}-${next.endTime})`);
        }
      }
    }

    return {
      isValid: overlaps.length === 0 && warnings.length === 0,
      overlaps,
      warnings
    };
  }

  /**
   * Add a new activity item to the service plan
   */
  async addActivityItem(
    churchId: string, 
    planId: string, 
    item: Omit<RunSheetItem, 'id' | 'order'>
  ): Promise<RunSheetItem> {
    const plan = await this.getServicePlanById(churchId, planId);
    if (!plan) throw new Error('Service plan not found');

    const currentItems = plan.runSheet || [];
    const newItem: RunSheetItem = {
      ...item,
      id: `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      order: currentItems.length + 1,
      assignmentStatus: item.responsibleMemberId ? 'pending' : 'unassigned',
      completionStatus: 'pending'
    };

    const updatedList = this.calculateItemEndTimes([...currentItems, newItem], plan.startTime);
    const newTotalDuration = this.calculateTotalDurationMinutes(updatedList);

    await this.updateServicePlan(churchId, planId, {
      runSheet: updatedList,
      totalDurationMinutes: newTotalDuration
    });

    return newItem;
  }

  /**
   * Update an existing activity item inside runSheet
   */
  async updateActivityItem(
    churchId: string, 
    planId: string, 
    itemId: string, 
    updates: Partial<RunSheetItem>
  ): Promise<void> {
    const plan = await this.getServicePlanById(churchId, planId);
    if (!plan) throw new Error('Service plan not found');

    const updatedList = (plan.runSheet || []).map(item => {
      if (item.id === itemId) {
        return { ...item, ...updates };
      }
      return item;
    });

    const recalculated = this.calculateItemEndTimes(updatedList, plan.startTime);
    const newTotalDuration = this.calculateTotalDurationMinutes(recalculated);

    await this.updateServicePlan(churchId, planId, {
      runSheet: recalculated,
      totalDurationMinutes: newTotalDuration
    });
  }

  /**
   * Delete an activity item from runSheet
   */
  async deleteActivityItem(churchId: string, planId: string, itemId: string): Promise<void> {
    const plan = await this.getServicePlanById(churchId, planId);
    if (!plan) throw new Error('Service plan not found');

    const filtered = (plan.runSheet || []).filter(item => item.id !== itemId);
    const recalculated = this.calculateItemEndTimes(filtered, plan.startTime);
    const newTotalDuration = this.calculateTotalDurationMinutes(recalculated);

    await this.updateServicePlan(churchId, planId, {
      runSheet: recalculated,
      totalDurationMinutes: newTotalDuration
    });
  }

  /**
   * Reorder activity items in runSheet
   */
  async reorderActivityItems(churchId: string, planId: string, newOrder: RunSheetItem[]): Promise<void> {
    const plan = await this.getServicePlanById(churchId, planId);
    if (!plan) throw new Error('Service plan not found');

    const recalculated = this.calculateItemEndTimes(newOrder, plan.startTime);
    const newTotalDuration = this.calculateTotalDurationMinutes(recalculated);

    await this.updateServicePlan(churchId, planId, {
      runSheet: recalculated,
      totalDurationMinutes: newTotalDuration
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SERVICE TEMPLATES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch templates combining built-in presets and church custom templates
   */
  async getServiceTemplates(churchId: string): Promise<ServiceTemplate[]> {
    try {
      const snap = await this.getServiceTemplatesCol(churchId).orderBy('createdAt', 'desc').get();
      const customTemplates = snap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as ServiceTemplate[];

      return [...BUILT_IN_SERVICE_TEMPLATES, ...customTemplates];
    } catch (err) {
      console.error('[ServiceRosterService] getServiceTemplates error:', err);
      return BUILT_IN_SERVICE_TEMPLATES;
    }
  }

  /**
   * Create a new custom template for the church
   */
  async createServiceTemplate(churchId: string, template: Partial<ServiceTemplate>): Promise<ServiceTemplate> {
    const col = this.getServiceTemplatesCol(churchId);
    const newDoc = col.doc();

    const created: ServiceTemplate = {
      id: newDoc.id,
      churchId,
      name: template.name || 'Custom Service Template',
      description: template.description || '',
      serviceType: template.serviceType || 'sunday_worship',
      defaultDurationMinutes: template.defaultDurationMinutes || 120,
      runSheetTemplate: template.runSheetTemplate || [],
      isBuiltIn: false,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    };

    await newDoc.set(created);
    return created;
  }

  /**
   * Apply a template structure onto an existing service plan
   */
  async applyTemplateToService(churchId: string, templateId: string, serviceId: string): Promise<RunSheetItem[]> {
    const templates = await this.getServiceTemplates(churchId);
    const template = templates.find(t => t.id === templateId);
    if (!template) throw new Error('Template not found');

    const plan = await this.getServicePlanById(churchId, serviceId);
    if (!plan) throw new Error('Service plan not found');

    // Instantiate fresh activity items with clean statuses (no volunteer carry-over)
    const baseItems: RunSheetItem[] = template.runSheetTemplate.map((item, idx) => ({
      ...item,
      id: `act_${Date.now()}_${idx}`,
      order: idx + 1,
      startTime: item.startTime || plan.startTime,
      durationMinutes: item.durationMinutes || 10,
      endTime: item.endTime || this.addMinutesToTime(plan.startTime, item.durationMinutes || 10),
      assignmentStatus: 'unassigned',
      completionStatus: 'pending'
    }));

    const recalculated = this.calculateItemEndTimes(baseItems, plan.startTime);
    const totalDur = this.calculateTotalDurationMinutes(recalculated);

    await this.updateServicePlan(churchId, serviceId, {
      runSheet: recalculated,
      totalDurationMinutes: totalDur,
      serviceType: template.serviceType
    });

    return recalculated;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. MINISTRY TEAMS MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch all ministry teams for church
   */
  async getMinistryTeams(churchId: string, onlyActive: boolean = false): Promise<MinistryTeam[]> {
    try {
      let query: any = this.getMinistryTeamsCol(churchId).orderBy('name', 'asc');
      if (onlyActive) {
        query = query.where('active', '==', true);
      }
      const snap = await query.get();
      if (snap.empty) {
        // Automatically seed default teams if none exist yet!
        return await this.seedDefaultMinistryTeams(churchId);
      }
      return snap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as MinistryTeam[];
    } catch (err) {
      console.error('[ServiceRosterService] getMinistryTeams error:', err);
      return [];
    }
  }

  /**
   * Create or save a ministry team
   */
  async createMinistryTeam(churchId: string, team: Partial<MinistryTeam>): Promise<MinistryTeam> {
    const col = this.getMinistryTeamsCol(churchId);
    const docRef = col.doc();

    const created: MinistryTeam = {
      id: docRef.id,
      churchId: churchId || 'rhema',
      name: team.name || 'New Ministry Team',
      description: team.description || '',
      color: team.color || '#1E3A8A',
      leaderId: team.leaderId,
      leaderName: team.leaderName,
      leaderPhone: team.leaderPhone,
      memberIds: team.memberIds || [],
      positions: team.positions || [],
      active: team.active ?? true,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    };

    await docRef.set(created);
    return created;
  }

  /**
   * Update ministry team
   */
  async updateMinistryTeam(churchId: string, teamId: string, updates: Partial<MinistryTeam>): Promise<void> {
    await this.getMinistryTeamsCol(churchId).doc(teamId).update({
      ...updates,
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Add member to a ministry team
   */
  async addMemberToTeam(churchId: string, teamId: string, memberId: string): Promise<void> {
    await this.getMinistryTeamsCol(churchId).doc(teamId).update({
      memberIds: firestore.FieldValue.arrayUnion(memberId),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Remove member from a ministry team
   */
  async removeMemberFromTeam(churchId: string, teamId: string, memberId: string): Promise<void> {
    await this.getMinistryTeamsCol(churchId).doc(teamId).update({
      memberIds: firestore.FieldValue.arrayRemove(memberId),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Seed the 14 standard Rhema Church ministry teams if database is empty
   */
  async seedDefaultMinistryTeams(churchId: string): Promise<MinistryTeam[]> {
    const col = this.getMinistryTeamsCol(churchId);
    const seeded: MinistryTeam[] = [];

    for (const def of DEFAULT_MINISTRY_TEAMS) {
      const docRef = col.doc(def.id);
      const teamObj: MinistryTeam = {
        ...def,
        churchId: churchId || 'rhema',
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp()
      };
      await docRef.set(teamObj, { merge: true });
      seeded.push(teamObj);
    }

    return seeded;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. MEMBER SKILLS REPOSITORY & VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch skills for church, filterable by member or verification status
   */
  async getMemberSkills(
    churchId: string, 
    memberId?: string, 
    status?: 'verified' | 'pending' | 'rejected'
  ): Promise<MemberSkillRecord[]> {
    try {
      let query: any = this.getMemberSkillsCol(churchId);
      if (memberId) {
        query = query.where('memberId', '==', memberId);
      }
      if (status) {
        query = query.where('verificationStatus', '==', status);
      }

      const snap = await query.get();
      return snap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as MemberSkillRecord[];
    } catch (err) {
      console.error('[ServiceRosterService] getMemberSkills error:', err);
      return [];
    }
  }

  /**
   * Add or submit a member skill
   */
  async addOrUpdateMemberSkill(churchId: string, skill: Partial<MemberSkillRecord>): Promise<MemberSkillRecord> {
    const col = this.getMemberSkillsCol(churchId);
    const docId = skill.id || `${skill.memberId}_${(skill.skillName || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const docRef = col.doc(docId);

    const record: MemberSkillRecord = {
      id: docId,
      churchId: churchId || 'rhema',
      memberId: skill.memberId || '',
      memberName: skill.memberName || '',
      memberPhone: skill.memberPhone,
      category: skill.category || 'music',
      skillName: skill.skillName || 'General Skill',
      proficiencyLevel: skill.proficiencyLevel || 'intermediate',
      verificationStatus: skill.verificationStatus || 'verified',
      submittedByMember: skill.submittedByMember ?? false,
      verifiedBy: skill.verifiedBy,
      verifiedAt: skill.verificationStatus === 'verified' ? firestore.FieldValue.serverTimestamp() : undefined,
      notes: skill.notes || '',
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    };

    await docRef.set(record, { merge: true });
    return record;
  }

  /**
   * Verify or reject submitted skill
   */
  async verifyMemberSkill(
    churchId: string, 
    skillId: string, 
    status: 'verified' | 'rejected', 
    verifiedBy: string,
    rejectionReason?: string
  ): Promise<void> {
    await this.getMemberSkillsCol(churchId).doc(skillId).update({
      verificationStatus: status,
      verifiedBy,
      verifiedAt: firestore.FieldValue.serverTimestamp(),
      ...(rejectionReason ? { rejectionReason } : {}),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Delete member skill
   */
  async deleteMemberSkill(churchId: string, skillId: string): Promise<void> {
    await this.getMemberSkillsCol(churchId).doc(skillId).delete();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. MEMBER AVAILABILITY & BLOCKOUT DATES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get availability for a member
   */
  async getMemberAvailability(churchId: string, memberId: string, monthYear?: string): Promise<MemberAvailabilityRecord | null> {
    try {
      const targetMonth = monthYear || new Date().toISOString().slice(0, 7);
      const docId = `${memberId}_${targetMonth}`;
      const doc = await this.getMemberAvailabilityCol(churchId).doc(docId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() } as MemberAvailabilityRecord;
    } catch (err) {
      console.error('[ServiceRosterService] getMemberAvailability error:', err);
      return null;
    }
  }

  /**
   * Save or update availability / blockouts
   */
  async saveMemberAvailability(churchId: string, record: Partial<MemberAvailabilityRecord>): Promise<void> {
    const targetMonth = record.monthYear || new Date().toISOString().slice(0, 7);
    const docId = `${record.memberId}_${targetMonth}`;
    const docRef = this.getMemberAvailabilityCol(churchId).doc(docId);

    await docRef.set({
      id: docId,
      churchId: churchId || 'rhema',
      memberId: record.memberId,
      memberName: record.memberName || '',
      monthYear: targetMonth,
      unavailableDates: record.unavailableDates || [],
      preferredServiceTimes: record.preferredServiceTimes || [],
      maxServicesPerMonth: record.maxServicesPerMonth,
      notes: record.notes || '',
      updatedAt: firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  /**
   * Check if member is available on a specific service date
   */
  async checkMemberAvailability(churchId: string, memberId: string, date: string): Promise<{ isAvailable: boolean; reason?: string }> {
    try {
      const monthYear = date.slice(0, 7);
      const docId = `${memberId}_${monthYear}`;
      const doc = await this.getMemberAvailabilityCol(churchId).doc(docId).get();
      if (!doc.exists) return { isAvailable: true };

      const data = doc.data() as MemberAvailabilityRecord;
      if (data?.unavailableDates?.includes(date)) {
        return { 
          isAvailable: false, 
          reason: data.notes || 'Marked as unavailable / blockout date' 
        };
      }

      return { isAvailable: true };
    } catch (err) {
      console.error('[ServiceRosterService] checkMemberAvailability error:', err);
      return { isAvailable: true };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. WORSHIP SETLIST MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add song to service setlist
   */
  async addSongToSetlist(churchId: string, serviceId: string, songItem: SetlistItem): Promise<void> {
    const plan = await this.getServicePlanById(churchId, serviceId);
    if (!plan) throw new Error('Service plan not found');

    const sanitizedItem = this.sanitizeForFirestore(songItem);
    const currentSetlist = plan.setlist || [];
    const updated = [...currentSetlist, sanitizedItem];

    await this.updateServicePlan(churchId, serviceId, {
      setlist: updated
    });
  }

  /**
   * Update setlist item
   */
  async updateSetlistSong(churchId: string, serviceId: string, songItemId: string, updates: Partial<SetlistItem>): Promise<void> {
    const plan = await this.getServicePlanById(churchId, serviceId);
    if (!plan) throw new Error('Service plan not found');

    const updated = (plan.setlist || []).map(s => {
      if (s.id === songItemId) {
        return { ...s, ...updates };
      }
      return s;
    });

    await this.updateServicePlan(churchId, serviceId, {
      setlist: updated
    });
  }

  /**
   * Remove song from setlist
   */
  async removeSongFromSetlist(churchId: string, serviceId: string, songItemId: string): Promise<void> {
    const plan = await this.getServicePlanById(churchId, serviceId);
    if (!plan) throw new Error('Service plan not found');

    const updated = (plan.setlist || []).filter(s => s.id !== songItemId);

    await this.updateServicePlan(churchId, serviceId, {
      setlist: updated
    });
  }

  /**
   * Reorder songs in setlist
   */
  async reorderSetlist(churchId: string, serviceId: string, newSetlist: SetlistItem[]): Promise<void> {
    await this.updateServicePlan(churchId, serviceId, {
      setlist: newSetlist
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. ASSIGNMENT QUEUES & CASCADE WORKFLOW (PHASE 4 & 5)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch all assignment queues for a service plan
   */
  async getAssignmentQueues(churchId: string, serviceId: string): Promise<ServiceAssignmentQueue[]> {
    try {
      const snap = await this.getAssignmentQueuesCol(churchId, serviceId).get();
      return snap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as ServiceAssignmentQueue[];
    } catch (err) {
      console.error('[ServiceRosterService] getAssignmentQueues error:', err);
      return [];
    }
  }

  /**
   * Realtime listener for assignment queues (instant UI updates on accept/decline/cascade)
   */
  listenAssignmentQueues(
    churchId: string,
    serviceId: string,
    onUpdate: (queues: ServiceAssignmentQueue[]) => void
  ): () => void {
    return this.getAssignmentQueuesCol(churchId, serviceId).onSnapshot(
      (snap: any) => {
        const queues = snap.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data()
        })) as ServiceAssignmentQueue[];
        onUpdate(queues);
      },
      (err: any) => {
        console.error('[ServiceRosterService] listenAssignmentQueues error:', err);
      }
    );
  }

  /**
   * Dispatch assignment queue with candidate ladder (Rank 1, Rank 2, Rank 3)
   */
  async dispatchAssignmentQueue(
    churchId: string,
    serviceId: string,
    params: {
      roleId: string;
      roleTitle: string;
      activityId?: string;
      activityName?: string;
      candidates: Array<{ candidateId: string; candidateName: string; candidatePhone?: string }>;
      timeoutMinutes?: number;
    }
  ): Promise<void> {
    if (!params.candidates || params.candidates.length === 0) {
      throw new Error('At least one candidate is required to dispatch an assignment queue.');
    }

    const timeoutMinutes = params.timeoutMinutes || 1440; // Default 24 hours
    const nowIso = new Date().toISOString();
    const deadlineIso = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();

    const formattedCandidates: CandidateEntry[] = params.candidates.map((c, idx) => ({
      candidateId: c.candidateId,
      candidateName: c.candidateName,
      candidatePhone: c.candidatePhone,
      status: idx === 0 ? 'pending' : 'waiting',
      requestedAt: idx === 0 ? nowIso : undefined,
      deadline: idx === 0 ? deadlineIso : undefined,
    }));

    const queueRecord: ServiceAssignmentQueue = {
      id: params.roleId,
      serviceId,
      churchId: churchId || 'rhema',
      roleId: params.roleId,
      roleTitle: params.roleTitle,
      activityId: params.activityId,
      activityName: params.activityName,
      status: 'pending',
      currentCandidateIndex: 0,
      timeoutMinutes,
      candidates: formattedCandidates,
      history: [
        {
          timestamp: nowIso,
          action: 'queue_dispatched',
          candidateId: formattedCandidates[0]?.candidateId,
          candidateName: formattedCandidates[0]?.candidateName,
          details: `Dispatched to Candidate #1 (${formattedCandidates[0]?.candidateName}) with ${timeoutMinutes / 60}h deadline.`
        }
      ],
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    };

    const queueRef = this.getAssignmentQueuesCol(churchId, serviceId).doc(params.roleId);
    await queueRef.set(queueRecord);

    // Sync state to parent service plan
    const planRef = this.getServicePlansCol(churchId).doc(serviceId);
    await planRef.update({
      [`assignments.${params.roleId}`]: formattedCandidates[0]?.candidateName,
      [`assignmentMemberIds.${params.roleId}`]: formattedCandidates[0]?.candidateId,
      [`assignmentStatus.${params.roleId}`]: 'pending',
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Concurrency-safe Accept / Decline response workflow with auto-cascade
   */
  async respondToAssignment(
    churchId: string,
    serviceId: string,
    roleId: string,
    candidateId: string,
    action: 'accept' | 'decline',
    reason?: string
  ): Promise<void> {
    const queueRef = this.getAssignmentQueuesCol(churchId, serviceId).doc(roleId);
    const planRef = this.getServicePlansCol(churchId).doc(serviceId);

    await firestore().runTransaction(async (transaction: any) => {
      const qSnap = await transaction.get(queueRef);
      if (!qSnap.exists) {
        throw new Error('Assignment queue not found for this role.');
      }

      const qData = qSnap.data() as ServiceAssignmentQueue;
      const candidates = [...(qData.candidates || [])];
      const curIdx = qData.currentCandidateIndex || 0;
      const activeCandidate = candidates[curIdx];

      if (!activeCandidate) {
        throw new Error('No active candidate in assignment queue.');
      }

      const nowIso = new Date().toISOString();

      if (action === 'accept') {
        // Mark active candidate accepted and resolve queue
        candidates[curIdx] = {
          ...activeCandidate,
          status: 'accepted',
          respondedAt: nowIso
        };

        const historyEntry = {
          timestamp: nowIso,
          action: 'candidate_accepted',
          candidateId: activeCandidate.candidateId,
          candidateName: activeCandidate.candidateName,
          details: `Confirmed as ${qData.roleTitle}`
        };

        transaction.update(queueRef, {
          status: 'confirmed',
          confirmedCandidateId: activeCandidate.candidateId,
          confirmedCandidateName: activeCandidate.candidateName,
          candidates,
          history: firestore.FieldValue.arrayUnion(historyEntry),
          updatedAt: firestore.FieldValue.serverTimestamp()
        });

        transaction.update(planRef, {
          [`assignments.${roleId}`]: activeCandidate.candidateName,
          [`assignmentMemberIds.${roleId}`]: activeCandidate.candidateId,
          [`assignmentStatus.${roleId}`]: 'confirmed',
          updatedAt: firestore.FieldValue.serverTimestamp()
        });
      } else {
        // Decline and auto-cascade to next candidate in queue
        candidates[curIdx] = {
          ...activeCandidate,
          status: 'declined',
          declineReason: reason || 'Unavailable',
          respondedAt: nowIso
        };

        const nextIdx = curIdx + 1;
        if (nextIdx < candidates.length) {
          const nextCand = candidates[nextIdx];
          const timeoutMins = qData.timeoutMinutes || 1440;
          const deadlineIso = new Date(Date.now() + timeoutMins * 60 * 1000).toISOString();

          candidates[nextIdx] = {
            ...nextCand,
            status: 'pending',
            requestedAt: nowIso,
            deadline: deadlineIso
          };

          const historyEntry = {
            timestamp: nowIso,
            action: `declined_cascaded_to_candidate_${nextIdx + 1}`,
            candidateId: activeCandidate.candidateId,
            candidateName: activeCandidate.candidateName,
            details: `Declined: ${reason || 'Unavailable'}. Cascaded to Candidate #${nextIdx + 1} (${nextCand?.candidateName}).`
          };

          transaction.update(queueRef, {
            status: 'pending',
            currentCandidateIndex: nextIdx,
            candidates,
            history: firestore.FieldValue.arrayUnion(historyEntry),
            updatedAt: firestore.FieldValue.serverTimestamp()
          });

          transaction.update(planRef, {
            [`assignments.${roleId}`]: nextCand?.candidateName,
            [`assignmentMemberIds.${roleId}`]: nextCand?.candidateId,
            [`assignmentStatus.${roleId}`]: 'pending',
            updatedAt: firestore.FieldValue.serverTimestamp()
          });
        } else {
          // All candidates exhausted!
          const historyEntry = {
            timestamp: nowIso,
            action: 'queue_exhausted_all_declined',
            candidateId: activeCandidate.candidateId,
            candidateName: activeCandidate.candidateName,
            details: `Declined: ${reason || 'Unavailable'}. All candidates in queue have declined or timed out.`
          };

          transaction.update(queueRef, {
            status: 'exhausted',
            candidates,
            history: firestore.FieldValue.arrayUnion(historyEntry),
            updatedAt: firestore.FieldValue.serverTimestamp()
          });

          transaction.update(planRef, {
            [`assignmentStatus.${roleId}`]: 'declined',
            updatedAt: firestore.FieldValue.serverTimestamp()
          });
        }
      }
    });
  }

  /**
   * Admin manual override for assignment (bypasses queue directly)
   */
  async manualOverrideAssignment(
    churchId: string,
    serviceId: string,
    roleId: string,
    memberId: string,
    memberName: string,
    notes?: string
  ): Promise<void> {
    const queueRef = this.getAssignmentQueuesCol(churchId, serviceId).doc(roleId);
    const planRef = this.getServicePlansCol(churchId).doc(serviceId);

    const nowIso = new Date().toISOString();
    const historyEntry = {
      timestamp: nowIso,
      action: 'manual_override',
      candidateId: memberId,
      candidateName: memberName,
      details: notes || 'Admin manual assignment override'
    };

    await queueRef.set({
      id: roleId,
      serviceId,
      churchId: churchId || 'rhema',
      roleId,
      status: 'confirmed',
      confirmedCandidateId: memberId,
      confirmedCandidateName: memberName,
      history: firestore.FieldValue.arrayUnion(historyEntry),
      updatedAt: firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await planRef.update({
      [`assignments.${roleId}`]: memberName,
      [`assignmentMemberIds.${roleId}`]: memberId,
      [`assignmentStatus.${roleId}`]: 'confirmed',
      ...(notes ? { [`assignmentNotes.${roleId}`]: notes } : {}),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Delete assignment queue
   */
  async deleteAssignmentQueue(churchId: string, serviceId: string, roleId: string): Promise<void> {
    await this.getAssignmentQueuesCol(churchId, serviceId).doc(roleId).delete();
    const planRef = this.getServicePlansCol(churchId).doc(serviceId);
    await planRef.update({
      [`assignments.${roleId}`]: firestore.FieldValue.delete(),
      [`assignmentMemberIds.${roleId}`]: firestore.FieldValue.delete(),
      [`assignmentStatus.${roleId}`]: firestore.FieldValue.delete(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Intelligent candidate recommendation engine for a specific role
   */
  async getEligibleCandidatesForRole(
    churchId: string,
    serviceDate: string,
    params: {
      teamId?: string;
      requiredSkill?: string;
      roleTitle?: string;
    }
  ): Promise<Array<{
    memberId: string;
    memberName: string;
    memberPhone?: string;
    matchScore: number;
    matchReasons: string[];
    isAvailable: boolean;
    availabilityReason?: string;
  }>> {
    try {
      // 1. Fetch church members
      const membersSnap = await firestore()
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(churchId || 'rhema')
        .collection('members')
        .get();

      const members = membersSnap.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data() }))
        .filter((m: any) => m.status !== 'Left');

      // 2. Fetch team if specified
      let teamMemberIds = new Set<string>();
      if (params.teamId) {
        const teamDoc = await this.getMinistryTeamsCol(churchId).doc(params.teamId).get();
        if (teamDoc.exists) {
          const tData = teamDoc.data() as MinistryTeam;
          (tData.memberIds || []).forEach(id => teamMemberIds.add(id));
        }
      }

      // 3. Fetch verified skills
      const verifiedSkills = await this.getMemberSkills(churchId, undefined, 'verified');
      const skillMap = new Map<string, string[]>();
      verifiedSkills.forEach(s => {
        const list = skillMap.get(s.memberId) || [];
        list.push(s.skillName.toLowerCase());
        skillMap.set(s.memberId, list);
      });

      // 4. Score each member
      const results: Array<{
        memberId: string;
        memberName: string;
        memberPhone?: string;
        matchScore: number;
        matchReasons: string[];
        isAvailable: boolean;
        availabilityReason?: string;
      }> = [];

      const targetSkill = (params.requiredSkill || params.roleTitle || '').toLowerCase();

      for (const m of members) {
        let score = 10;
        const reasons: string[] = [];

        // Check team membership
        if (params.teamId && teamMemberIds.has(m.id)) {
          score += 50;
          reasons.push('Team Member');
        }

        // Check verified skills
        const mSkills = skillMap.get(m.id) || [];
        if (targetSkill && mSkills.some(s => targetSkill.includes(s) || s.includes(targetSkill))) {
          score += 40;
          reasons.push('Verified Skill Match');
        } else if (m.primarySkill && targetSkill.includes(m.primarySkill.toLowerCase())) {
          score += 20;
          reasons.push('Profile Primary Skill');
        }

        // Check availability blockouts
        const availCheck = await this.checkMemberAvailability(churchId, m.id, serviceDate);
        if (!availCheck.isAvailable) {
          score -= 100;
          reasons.push('Blocked Out');
        }

        results.push({
          memberId: m.id,
          memberName: m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Church Member',
          memberPhone: m.phone,
          matchScore: score,
          matchReasons: reasons,
          isAvailable: availCheck.isAvailable,
          availabilityReason: availCheck.reason
        });
      }

      // Sort descending by score
      return results.sort((a, b) => b.matchScore - a.matchScore);
    } catch (err) {
      console.error('[ServiceRosterService] getEligibleCandidatesForRole error:', err);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. REHEARSAL MANAGEMENT (PHASE 6)
  // ─────────────────────────────────────────────────────────────────────────────

  async getServiceRehearsals(churchId: string, serviceId: string): Promise<ServiceRehearsal[]> {
    try {
      const snap = await this.getRehearsalsCol(churchId, serviceId).orderBy('date', 'asc').get();
      return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) as ServiceRehearsal[];
    } catch (err) {
      console.error('[ServiceRosterService] getServiceRehearsals error:', err);
      return [];
    }
  }

  listenServiceRehearsals(
    churchId: string,
    serviceId: string,
    onUpdate: (rehearsals: ServiceRehearsal[]) => void
  ): () => void {
    return this.getRehearsalsCol(churchId, serviceId).orderBy('date', 'asc').onSnapshot(
      (snap: any) => {
        const list = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) as ServiceRehearsal[];
        onUpdate(list);
      },
      (err: any) => console.error('[ServiceRosterService] listenServiceRehearsals error:', err)
    );
  }

  async createOrUpdateRehearsal(churchId: string, serviceId: string, rehearsal: Partial<ServiceRehearsal>): Promise<void> {
    const col = this.getRehearsalsCol(churchId, serviceId);
    const docId = rehearsal.id || col.doc().id;
    await col.doc(docId).set({
      ...rehearsal,
      id: docId,
      serviceId,
      churchId: churchId || 'rhema',
      updatedAt: firestore.FieldValue.serverTimestamp(),
      ...(rehearsal.id ? {} : { createdAt: firestore.FieldValue.serverTimestamp() })
    }, { merge: true });
  }

  async deleteRehearsal(churchId: string, serviceId: string, rehearsalId: string): Promise<void> {
    await this.getRehearsalsCol(churchId, serviceId).doc(rehearsalId).delete();
  }

  async updateRehearsalAttendance(
    churchId: string,
    serviceId: string,
    rehearsalId: string,
    memberId: string,
    status: 'present' | 'absent' | 'late' | 'excused'
  ): Promise<void> {
    await this.getRehearsalsCol(churchId, serviceId).doc(rehearsalId).update({
      [`attendance.${memberId}`]: status,
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. VOLUNTEER ATTENDANCE (PHASE 9)
  // ─────────────────────────────────────────────────────────────────────────────

  async getVolunteerAttendance(churchId: string, serviceId: string): Promise<VolunteerAttendanceRecord[]> {
    try {
      const snap = await this.getAttendanceCol(churchId, serviceId).get();
      return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) as VolunteerAttendanceRecord[];
    } catch (err) {
      console.error('[ServiceRosterService] getVolunteerAttendance error:', err);
      return [];
    }
  }

  listenVolunteerAttendance(
    churchId: string,
    serviceId: string,
    onUpdate: (records: VolunteerAttendanceRecord[]) => void
  ): () => void {
    return this.getAttendanceCol(churchId, serviceId).onSnapshot(
      (snap: any) => {
        const records = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) as VolunteerAttendanceRecord[];
        onUpdate(records);
      },
      (err: any) => console.error('[ServiceRosterService] listenVolunteerAttendance error:', err)
    );
  }

  async markVolunteerAttendance(
    churchId: string,
    serviceId: string,
    record: Partial<VolunteerAttendanceRecord>
  ): Promise<void> {
    const docId = `${serviceId}_${record.memberId}_${record.roleId || 'role'}`;
    await this.getAttendanceCol(churchId, serviceId).doc(docId).set({
      id: docId,
      serviceId,
      churchId: churchId || 'rhema',
      memberId: record.memberId,
      memberName: record.memberName || 'Volunteer',
      roleId: record.roleId || '',
      roleTitle: record.roleTitle || '',
      attendanceStatus: record.attendanceStatus || 'present',
      markedBy: record.markedBy || 'admin',
      markedByName: record.markedByName || 'Administrator',
      markedAt: firestore.FieldValue.serverTimestamp(),
      notes: record.notes || ''
    }, { merge: true });
  }

  async bulkMarkVolunteerAttendance(
    churchId: string,
    serviceId: string,
    records: Array<Partial<VolunteerAttendanceRecord>>
  ): Promise<void> {
    const batch = firestore().batch();
    const col = this.getAttendanceCol(churchId, serviceId);

    records.forEach(record => {
      const docId = `${serviceId}_${record.memberId}_${record.roleId || 'role'}`;
      const docRef = col.doc(docId);
      batch.set(docRef, {
        id: docId,
        serviceId,
        churchId: churchId || 'rhema',
        memberId: record.memberId,
        memberName: record.memberName || 'Volunteer',
        roleId: record.roleId || '',
        roleTitle: record.roleTitle || '',
        attendanceStatus: record.attendanceStatus || 'present',
        markedBy: record.markedBy || 'admin',
        markedByName: record.markedByName || 'Administrator',
        markedAt: firestore.FieldValue.serverTimestamp(),
        notes: record.notes || ''
      }, { merge: true });
    });

    await batch.commit();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. LIVE SERVICE EXECUTION STATE (PHASE 7)
  // ─────────────────────────────────────────────────────────────────────────────

  async updateLiveServiceState(churchId: string, serviceId: string, liveState: Partial<LiveServiceState>): Promise<void> {
    await this.getServicePlansCol(churchId).doc(serviceId).update({
      liveState: {
        ...liveState,
        lastUpdated: firestore.FieldValue.serverTimestamp()
      },
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  listenLiveServiceState(
    churchId: string,
    serviceId: string,
    onUpdate: (liveState: LiveServiceState | undefined) => void
  ): () => void {
    return this.getServicePlansCol(churchId).doc(serviceId).onSnapshot(
      (snap: any) => {
        if (!snap.exists) {
          onUpdate(undefined);
          return;
        }
        const plan = snap.data() as ServicePlan;
        onUpdate(plan.liveState);
      },
      (err: any) => console.error('[ServiceRosterService] listenLiveServiceState error:', err)
    );
  }

  /**
   * Real-time listener for the entire service plan document during Live Mode
   * (syncs runSheet, setlist, status, and liveState in real time)
   */
  listenLiveServicePlan(
    churchId: string,
    serviceId: string,
    onUpdate: (plan: ServicePlan | null) => void
  ): () => void {
    return this.getServicePlansCol(churchId).doc(serviceId).onSnapshot(
      (snap: any) => {
        if (!snap.exists) {
          onUpdate(null);
          return;
        }
        onUpdate({ id: snap.id, ...snap.data() } as ServicePlan);
      },
      (err: any) => console.error('[ServiceRosterService] listenLiveServicePlan error:', err)
    );
  }

  /**
   * Start Live Service execution
   */
  async startLiveService(churchId: string, serviceId: string): Promise<void> {
    const planRef = this.getServicePlansCol(churchId).doc(serviceId);
    const snap = await planRef.get();
    if (!snap.exists) throw new Error('Service plan not found');
    const plan = snap.data() as ServicePlan;

    const firstItem = (plan.runSheet || [])[0];
    const initialLiveState: LiveServiceState = {
      isLive: true,
      currentActivityIndex: 0,
      currentActivityId: firstItem ? firstItem.id : undefined,
      status: 'running',
      actualStartedAt: firestore.FieldValue.serverTimestamp(),
      itemStartedAt: firestore.FieldValue.serverTimestamp(),
      elapsedSeconds: 0,
      activeCue: null,
      lastUpdated: firestore.FieldValue.serverTimestamp()
    };

    // Mark first item as in_progress
    const updatedRunSheet = (plan.runSheet || []).map((item, idx) => ({
      ...item,
      completionStatus: idx === 0 ? ('in_progress' as const) : ('pending' as const)
    }));

    await planRef.update({
      status: 'live',
      liveState: initialLiveState,
      runSheet: updatedRunSheet,
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Advance or jump to a specific activity index in runSheet
   */
  async advanceLiveActivity(
    churchId: string,
    serviceId: string,
    targetIndex: number,
    markPreviousCompleted: boolean = true
  ): Promise<void> {
    const planRef = this.getServicePlansCol(churchId).doc(serviceId);
    const snap = await planRef.get();
    if (!snap.exists) throw new Error('Service plan not found');
    const plan = snap.data() as ServicePlan;
    const runSheet = plan.runSheet || [];

    if (targetIndex < 0 || targetIndex >= runSheet.length) return;

    const targetItem = runSheet[targetIndex];

    const updatedRunSheet = runSheet.map((item, idx) => {
      if (idx === targetIndex) {
        return { ...item, completionStatus: 'in_progress' as const };
      }
      if (markPreviousCompleted && idx < targetIndex) {
        return { ...item, completionStatus: 'completed' as const };
      }
      return item;
    });

    await planRef.update({
      runSheet: updatedRunSheet,
      'liveState.currentActivityIndex': targetIndex,
      'liveState.currentActivityId': targetItem.id,
      'liveState.status': 'running',
      'liveState.itemStartedAt': firestore.FieldValue.serverTimestamp(),
      'liveState.lastUpdated': firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Pause or Resume the live service countdown timer
   */
  async setLiveTimerPaused(churchId: string, serviceId: string, pause: boolean): Promise<void> {
    const planRef = this.getServicePlansCol(churchId).doc(serviceId);
    await planRef.update({
      'liveState.status': pause ? 'paused' : 'running',
      ...(pause 
        ? { 'liveState.itemPausedAt': firestore.FieldValue.serverTimestamp() }
        : { 'liveState.itemPausedAt': null }
      ),
      'liveState.lastUpdated': firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Broadcast an instant stage cue from Tech Booth to stage confidence monitor
   */
  async sendStageCue(
    churchId: string,
    serviceId: string,
    message: string,
    sentBy: string = 'Tech Booth'
  ): Promise<void> {
    const cue: StageCue = {
      id: `cue_${Date.now()}`,
      message: message.trim(),
      sentAt: new Date().toISOString(),
      sentBy,
      acknowledged: false
    };

    const planRef = this.getServicePlansCol(churchId).doc(serviceId);
    await planRef.update({
      'liveState.activeCue': cue,
      'liveState.cueHistory': firestore.FieldValue.arrayUnion(cue),
      'liveState.lastUpdated': firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Dismiss or acknowledge active stage cue
   */
  async dismissStageCue(churchId: string, serviceId: string): Promise<void> {
    const planRef = this.getServicePlansCol(churchId).doc(serviceId);
    await planRef.update({
      'liveState.activeCue': null,
      'liveState.lastUpdated': firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Conclude the live service
   */
  async endLiveService(churchId: string, serviceId: string): Promise<void> {
    const planRef = this.getServicePlansCol(churchId).doc(serviceId);
    const snap = await planRef.get();
    if (!snap.exists) return;
    const plan = snap.data() as ServicePlan;

    // Mark all remaining pending/in_progress items as completed
    const updatedRunSheet = (plan.runSheet || []).map(item => ({
      ...item,
      completionStatus: item.completionStatus === 'skipped' ? 'skipped' : ('completed' as const)
    }));

    await planRef.update({
      status: 'completed',
      runSheet: updatedRunSheet,
      'liveState.isLive': false,
      'liveState.status': 'ended',
      'liveState.actualEndedAt': firestore.FieldValue.serverTimestamp(),
      'liveState.activeCue': null,
      'liveState.lastUpdated': firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. MEMBER SERVICE EXPERIENCE (PHASE 8)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch all upcoming service duties and invitations for a specific church member.
   * Scans published plans, runsheet assignments, setlist assignments, sequential queues, and rehearsals.
   */
  async getMemberUpcomingDuties(churchId: string, memberId: string): Promise<MemberServiceDuty[]> {
    if (!churchId || !memberId) return [];
    try {
      const today = new Date().toISOString().split('T')[0];
      const plansSnap = await this.getServicePlansCol(churchId).get();

      const plans = plansSnap.docs
        .map((pDoc: any) => ({ id: pDoc.id, ...pDoc.data() } as ServicePlan))
        .filter(plan => (plan.status === 'published' || plan.status === 'live') && (plan.date >= today))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const duties: MemberServiceDuty[] = [];

      for (const plan of plans) {
        const planStartTime = plan.startTime || '10:00';
        const defaultCallTime = this.addMinutesToTime(planStartTime, -45); // 45m before service

        // Fetch rehearsals for this service
        let rehearsals: ServiceRehearsal[] = [];
        try {
          const rSnap = await this.getRehearsalsCol(churchId, plan.id).get();
          rehearsals = rSnap.docs
            .map((doc: any) => ({ id: doc.id, ...doc.data() }))
            .filter((r: ServiceRehearsal) => (r.participantMemberIds || []).includes(memberId));
        } catch (_) {}

        // 1. Check direct runSheet assignments
        (plan.runSheet || []).forEach(item => {
          if (item.responsibleMemberId === memberId) {
            duties.push({
              id: `${plan.id}_${item.id}`,
              serviceId: plan.id,
              serviceTitle: plan.serviceTitle,
              serviceType: plan.serviceType,
              date: plan.date,
              startTime: plan.startTime,
              endTime: plan.endTime,
              location: plan.location,
              preacher: plan.preacher,
              roleId: item.id,
              roleTitle: item.program,
              activityName: item.program,
              callTime: defaultCallTime,
              status: (item.assignmentStatus === 'confirmed' || item.assignmentStatus === 'pending')
                ? item.assignmentStatus
                : 'confirmed',
              instructions: item.instructions || item.description,
              rehearsals,
              setlist: plan.setlist || []
            });
          }
        });

        // 2. Check Setlist assignments (Song leader or Musician)
        (plan.setlist || []).forEach(song => {
          if (song.ledByMemberId === memberId) {
            duties.push({
              id: `${plan.id}_setlist_lead_${song.id}`,
              serviceId: plan.id,
              serviceTitle: plan.serviceTitle,
              serviceType: plan.serviceType,
              date: plan.date,
              startTime: plan.startTime,
              endTime: plan.endTime,
              location: plan.location,
              preacher: plan.preacher,
              roleId: `song_lead_${song.id}`,
              roleTitle: `Worship Leader: ${song.title}`,
              activityName: `Praise & Worship (Key ${song.key || 'G'})`,
              callTime: defaultCallTime,
              status: 'confirmed',
              instructions: song.rehearsalNotes,
              rehearsals,
              setlist: plan.setlist || []
            });
          }
          if (song.musicianAssignments) {
            Object.entries(song.musicianAssignments).forEach(([roleKey, mus]) => {
              if (mus.memberId === memberId) {
                duties.push({
                  id: `${plan.id}_setlist_mus_${song.id}_${roleKey}`,
                  serviceId: plan.id,
                  serviceTitle: plan.serviceTitle,
                  serviceType: plan.serviceType,
                  date: plan.date,
                  startTime: plan.startTime,
                  endTime: plan.endTime,
                  location: plan.location,
                  preacher: plan.preacher,
                  roleId: roleKey,
                  roleTitle: `${roleKey.toUpperCase()}: ${song.title}`,
                  activityName: `Band / Worship Setlist`,
                  callTime: defaultCallTime,
                  status: 'confirmed',
                  instructions: song.rehearsalNotes,
                  rehearsals,
                  setlist: plan.setlist || []
                });
              }
            });
          }
        });

        // 3. Check sequential assignment queues (Pending invitations or Confirmed)
        try {
          const queuesSnap = await this.getAssignmentQueuesCol(churchId, plan.id).get();
          for (const qDoc of queuesSnap.docs) {
            const queue = qDoc.data() as ServiceAssignmentQueue;
            const candidates = queue.candidates || [];
            const curIdx = queue.currentCandidateIndex ?? 0;
            const activeCand = candidates[curIdx];

            // If this member is the current active candidate and status is pending -> INVITATION!
            if (activeCand && activeCand.candidateId === memberId && activeCand.status === 'pending' && queue.status === 'pending') {
              if (!duties.some(d => d.roleId === queue.roleId && d.serviceId === plan.id)) {
                duties.push({
                  id: `${plan.id}_${queue.roleId}_invite`,
                  serviceId: plan.id,
                  serviceTitle: plan.serviceTitle,
                  serviceType: plan.serviceType,
                  date: plan.date,
                  startTime: plan.startTime,
                  endTime: plan.endTime,
                  location: plan.location,
                  preacher: plan.preacher,
                  roleId: queue.roleId,
                  roleTitle: queue.roleTitle,
                  activityName: queue.activityName || queue.roleTitle,
                  callTime: defaultCallTime,
                  status: 'pending',
                  deadline: activeCand.deadline,
                  queueId: queue.id,
                  candidateIndex: curIdx,
                  rehearsals,
                  setlist: plan.setlist || []
                });
              }
            } else if (queue.confirmedCandidateId === memberId && queue.status === 'confirmed') {
              if (!duties.some(d => d.roleId === queue.roleId && d.serviceId === plan.id)) {
                duties.push({
                  id: `${plan.id}_${queue.roleId}_confirmed`,
                  serviceId: plan.id,
                  serviceTitle: plan.serviceTitle,
                  serviceType: plan.serviceType,
                  date: plan.date,
                  startTime: plan.startTime,
                  endTime: plan.endTime,
                  location: plan.location,
                  preacher: plan.preacher,
                  roleId: queue.roleId,
                  roleTitle: queue.roleTitle,
                  activityName: queue.activityName || queue.roleTitle,
                  callTime: defaultCallTime,
                  status: 'confirmed',
                  rehearsals,
                  setlist: plan.setlist || []
                });
              }
            }
          }
        } catch (_) {}
      }

      return duties.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        return a.date.localeCompare(b.date);
      });
    } catch (err) {
      console.error('[ServiceRosterService] getMemberUpcomingDuties error:', err);
      return [];
    }
  }

  /**
   * Real-time listener for member upcoming duties
   */
  listenMemberUpcomingDuties(
    churchId: string,
    memberId: string,
    onUpdate: (duties: MemberServiceDuty[]) => void
  ): () => void {
    if (!churchId || !memberId) return () => {};

    return this.getServicePlansCol(churchId).onSnapshot(
      async () => {
        const duties = await this.getMemberUpcomingDuties(churchId, memberId);
        onUpdate(duties);
      },
      (err: any) => console.error('[ServiceRosterService] listenMemberUpcomingDuties error:', err)
    );
  }

  /**
   * Add a blockout date for member availability
   */
  async addMemberBlockoutDate(
    churchId: string,
    memberId: string,
    memberName: string,
    date: string,
    reason?: string
  ): Promise<void> {
    const col = this.getMemberAvailabilityCol(churchId);
    const existingSnap = await col.where('memberId', '==', memberId).limit(1).get();

    const blockout = {
      date,
      reason: reason || 'Personal blockout'
    };

    if (!existingSnap.empty) {
      const doc = existingSnap.docs[0];
      await col.doc(doc.id).update({
        blockouts: firestore.FieldValue.arrayUnion(blockout),
        unavailableDates: firestore.FieldValue.arrayUnion(date),
        updatedAt: firestore.FieldValue.serverTimestamp()
      });
    } else {
      await col.add({
        memberId,
        memberName,
        churchId: churchId || 'rhema',
        monthYear: date.substring(0, 7),
        unavailableDates: [date],
        blockouts: [blockout],
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp()
      });
    }
  }

  /**
   * Remove a blockout date for member availability
   */
  async removeMemberBlockoutDate(
    churchId: string,
    memberId: string,
    date: string
  ): Promise<void> {
    const col = this.getMemberAvailabilityCol(churchId);
    const existingSnap = await col.where('memberId', '==', memberId).limit(1).get();
    if (existingSnap.empty) return;

    const doc = existingSnap.docs[0];
    const data = doc.data() as MemberAvailabilityRecord;
    const remaining = (data.blockouts || []).filter(b => b.date !== date);
    const remainingDates = (data.unavailableDates || []).filter(d => d !== date);

    await col.doc(doc.id).update({
      blockouts: remaining,
      unavailableDates: remainingDates,
      updatedAt: firestore.FieldValue.serverTimestamp()
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. PDF RUN-SHEET, CSV EXPORT & ROSTER ANALYTICS (PHASE 9)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generates clean, high-fidelity print-ready HTML for Order of Worship Run-Sheet
   */
  generateRunSheetHtml(plan: ServicePlan, churchName: string = 'Rhema Global Ministries'): string {
    const formattedDate = plan.date || 'Worship Service';
    const runSheetItems = plan.runSheet || [];
    const setlistItems = plan.setlist || [];

    const runSheetRows = runSheetItems.map(item => `
      <tr>
        <td style="text-align: center; font-weight: bold; width: 35px;">${item.order || '-'}</td>
        <td style="white-space: nowrap; font-weight: 600; width: 100px;">${item.startTime} - ${item.endTime}</td>
        <td>
          <div style="font-weight: 700; font-size: 13.5px; color: #0F172A;">${item.program}</div>
          ${item.instructions ? `<div style="font-size: 11px; color: #64748B; margin-top: 2px;">${item.instructions}</div>` : ''}
        </td>
        <td style="font-size: 11px; text-transform: uppercase; color: #475569;">${item.category?.replace('_', ' ') || '-'}</td>
        <td style="text-align: center; font-weight: 600; width: 55px;">${item.durationMinutes}m</td>
        <td style="font-weight: 600; color: #1E3A8A;">${item.responsiblePerson || 'Unassigned'}</td>
        <td style="font-size: 11.5px; color: #475569;">${item.supportingTeam || '-'}</td>
      </tr>
    `).join('');

    const setlistRows = setlistItems.map((s, idx) => `
      <tr>
        <td style="text-align: center; font-weight: bold; width: 35px;">${idx + 1}</td>
        <td>
          <div style="font-weight: 700; font-size: 13px;">${s.title}</div>
          ${s.titleTe ? `<div style="font-size: 11.5px; color: #64748B;">${s.titleTe}</div>` : ''}
        </td>
        <td style="text-align: center; font-weight: 800; color: #2563EB;">${s.key || 'G'}</td>
        <td style="text-align: center; font-weight: 600;">${s.tempo ? `${s.tempo} BPM` : '120'}</td>
        <td style="text-align: center;">${s.timeSignature || '4/4'}</td>
        <td style="font-weight: 600;">${s.ledBy || 'Worship Leader'}</td>
        <td style="font-size: 11px; color: #64748B;">${s.rehearsalNotes || '-'}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${plan.serviceTitle} - Run-Sheet</title>
        <style>
          @page { size: A4 portrait; margin: 14mm 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0F172A; margin: 0; padding: 0; font-size: 12px; }
          .header { text-align: center; border-bottom: 2.5px solid #1E3A8A; padding-bottom: 10px; margin-bottom: 12px; }
          .church-name { font-size: 17px; font-weight: 900; letter-spacing: 0.8px; color: #1E3A8A; text-transform: uppercase; margin-bottom: 2px; }
          .doc-title { font-size: 13px; font-weight: 800; color: #D97706; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; }
          .service-meta-grid { display: flex; justify-content: space-between; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 11.5px; }
          .meta-item { margin: 2px 0; }
          .meta-label { font-weight: 700; color: #475569; }
          .meta-val { font-weight: 800; color: #0F172A; }
          .section-heading { font-size: 12px; font-weight: 800; color: #1E3A8A; text-transform: uppercase; letter-spacing: 0.5px; border-left: 4px solid #1E3A8A; padding-left: 6px; margin: 12px 0 6px 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
          th { background: #1E3A8A; color: #FFFFFF; font-weight: 800; text-align: left; padding: 6px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; }
          td { padding: 5px 8px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
          tr:nth-child(even) td { background-color: #F8FAFC; }
          .notes-box { background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 8px; margin-top: 10px; font-size: 11px; }
          .footer { text-align: center; font-size: 9.5px; color: #94A3B8; margin-top: 16px; border-top: 1px solid #E2E8F0; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="church-name">${churchName}</div>
          <div class="doc-title">ORDER OF WORSHIP & SERVICE RUN-SHEET</div>
        </div>

        <div class="service-meta-grid">
          <div>
            <div class="meta-item"><span class="meta-label">SERVICE:</span> <span class="meta-val">${plan.serviceTitle}</span></div>
            <div class="meta-item"><span class="meta-label">DATE & TIME:</span> <span class="meta-val">${formattedDate} · ${plan.startTime} - ${plan.endTime} (${plan.totalDurationMinutes || 120}m)</span></div>
            <div class="meta-item"><span class="meta-label">SANCTUARY:</span> <span class="meta-val">${plan.location || 'Church Sanctuary'}</span></div>
          </div>
          <div>
            <div class="meta-item"><span class="meta-label">PREACHER:</span> <span class="meta-val">${plan.preacher || 'Pastor'}</span></div>
            ${plan.theme ? `<div class="meta-item"><span class="meta-label">THEME:</span> <span class="meta-val">"${plan.theme}"</span></div>` : ''}
            ${plan.bibleReference ? `<div class="meta-item"><span class="meta-label">SCRIPTURE:</span> <span class="meta-val">${plan.bibleReference}</span></div>` : ''}
          </div>
        </div>

        <div class="section-heading">CHRONOLOGICAL RUN-SHEET TIMELINE (${runSheetItems.length} SEGMENTS)</div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Segment / Program</th>
              <th>Category</th>
              <th>Dur</th>
              <th>Minister / Leader</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            ${runSheetRows || '<tr><td colspan="7" style="text-align: center; color: #94A3B8;">No activities scheduled</td></tr>'}
          </tbody>
        </table>

        ${setlistItems.length > 0 ? `
          <div class="section-heading">WORSHIP SETLIST (${setlistItems.length} SONGS)</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Song Title</th>
                <th style="text-align: center;">Key</th>
                <th style="text-align: center;">BPM</th>
                <th style="text-align: center;">Time</th>
                <th>Song Leader</th>
                <th>Notes / Musician Cues</th>
              </tr>
            </thead>
            <tbody>
              ${setlistRows}
            </tbody>
          </table>
        ` : ''}

        ${plan.additionalInstructions ? `
          <div class="notes-box">
            <strong>DIRECTOR & BOOTH NOTES:</strong><br/>
            ${plan.additionalInstructions}
          </div>
        ` : ''}

        <div class="footer">
          Generated automatically by Rhema Service Roster & Worship Operations Management System · ${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Export service plan to a print-ready PDF and open system share dialog
   */
  async exportServicePlanPdf(plan: ServicePlan, churchName?: string): Promise<string> {
    const html = this.generateRunSheetHtml(plan, churchName);
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Share Run-Sheet PDF: ${plan.serviceTitle}`
      });
    }
    return uri;
  }

  /**
   * Direct Print dialog
   */
  async printServicePlanDirectly(plan: ServicePlan, churchName?: string): Promise<void> {
    const html = this.generateRunSheetHtml(plan, churchName);
    await Print.printAsync({ html });
  }

  /**
   * Generates structured CSV string for Order of Service and Worship Setlist
   */
  generateRunSheetCsv(plan: ServicePlan): string {
    const escapeCsv = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;
    const lines: string[] = [];

    // Header info
    lines.push(`Service Title,${escapeCsv(plan.serviceTitle)}`);
    lines.push(`Date,${escapeCsv(plan.date)}`);
    lines.push(`Scheduled Time,${escapeCsv(`${plan.startTime} - ${plan.endTime}`)}`);
    lines.push(`Location,${escapeCsv(plan.location)}`);
    lines.push(`Preacher,${escapeCsv(plan.preacher)}`);
    lines.push(`Theme,${escapeCsv(plan.theme)}`);
    lines.push(`Bible Reference,${escapeCsv(plan.bibleReference)}`);
    lines.push('');

    // Order of Service table
    lines.push('ORDER OF SERVICE');
    lines.push('Order,Start Time,End Time,Duration (Mins),Program,Category,Minister,Supporting Team,Instructions');

    (plan.runSheet || []).forEach(item => {
      lines.push([
        item.order || '',
        escapeCsv(item.startTime),
        escapeCsv(item.endTime),
        item.durationMinutes || 0,
        escapeCsv(item.program),
        escapeCsv(item.category),
        escapeCsv(item.responsiblePerson),
        escapeCsv(item.supportingTeam),
        escapeCsv(item.instructions)
      ].join(','));
    });

    // Setlist table if exists
    if (plan.setlist && plan.setlist.length > 0) {
      lines.push('');
      lines.push('WORSHIP SETLIST');
      lines.push('Index,Song Title,Telugu Title,Key,Tempo (BPM),Time Signature,Duration (Mins),Song Leader,Notes');
      plan.setlist.forEach((s, idx) => {
        lines.push([
          idx + 1,
          escapeCsv(s.title),
          escapeCsv(s.titleTe),
          escapeCsv(s.key),
          escapeCsv(s.tempo),
          escapeCsv(s.timeSignature),
          s.durationMinutes || 6,
          escapeCsv(s.ledBy),
          escapeCsv(s.rehearsalNotes)
        ].join(','));
      });
    }

    return lines.join('\n');
  }

  /**
   * Export service plan to CSV and trigger native share sheet
   */
  async exportServicePlanCsv(plan: ServicePlan): Promise<string> {
    const csv = this.generateRunSheetCsv(plan);
    const cleanDate = (plan.date || 'service').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `RunSheet_${cleanDate}.csv`;
    const targetPath = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(targetPath, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(targetPath, {
        mimeType: 'text/csv',
        dialogTitle: `Export Run-Sheet CSV: ${plan.serviceTitle}`
      });
    }
    return targetPath;
  }

  /**
   * Intelligent Roster Analytics Engine:
   * Computes volunteer health / burnout risk, song usage distribution, and queue acceptance metrics.
   */
  async getRosterAnalytics(churchId: string): Promise<RosterAnalyticsData> {
    try {
      const plansSnap = await this.getServicePlansCol(churchId).get();
      const allPlans = plansSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as ServicePlan));

      const totalServices = allPlans.length;
      const completedServices = allPlans.filter(p => p.status === 'completed').length;

      // Volunteer Serving Frequency & Burnout Tracker
      const volunteerMap = new Map<string, { memberName: string; count: number; lastDate: string; roles: Set<string>; dates: string[] }>();
      const songUsageMap = new Map<string, { title: string; titleTe?: string; count: number; lastDate: string; key: string }>();

      let totalAssignments = 0;
      let totalAttendanceRecords = 0;
      let totalPresent = 0;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoIso = thirtyDaysAgo.toISOString().split('T')[0];

      for (const plan of allPlans) {
        const pDate = plan.date || '';

        // Scan runsheet items
        (plan.runSheet || []).forEach(item => {
          if (item.responsibleMemberId) {
            totalAssignments++;
            const existing = volunteerMap.get(item.responsibleMemberId) || {
              memberName: item.responsiblePerson || 'Volunteer',
              count: 0,
              lastDate: '',
              roles: new Set<string>(),
              dates: []
            };
            existing.count++;
            existing.roles.add(item.program);
            existing.dates.push(pDate);
            if (!existing.lastDate || pDate > existing.lastDate) existing.lastDate = pDate;
            volunteerMap.set(item.responsibleMemberId, existing);
          }
        });

        // Scan setlist items
        (plan.setlist || []).forEach(song => {
          if (song.title) {
            const sKey = song.title.toLowerCase().trim();
            const existing = songUsageMap.get(sKey) || {
              title: song.title,
              titleTe: song.titleTe,
              count: 0,
              lastDate: '',
              key: song.key || 'G'
            };
            existing.count++;
            if (!existing.lastDate || pDate > existing.lastDate) existing.lastDate = pDate;
            songUsageMap.set(sKey, existing);
          }

          if (song.ledByMemberId) {
            totalAssignments++;
            const existing = volunteerMap.get(song.ledByMemberId) || {
              memberName: song.ledBy || 'Worship Leader',
              count: 0,
              lastDate: '',
              roles: new Set<string>(),
              dates: []
            };
            existing.count++;
            existing.roles.add('Worship Leader');
            existing.dates.push(pDate);
            if (!existing.lastDate || pDate > existing.lastDate) existing.lastDate = pDate;
            volunteerMap.set(song.ledByMemberId, existing);
          }
        });
      }

      // 2. Fetch queues for acceptance rate metrics
      let totalInvites = 0;
      let totalAccepted = 0;
      let totalDeclined = 0;
      let totalTimedOut = 0;

      for (const plan of allPlans.slice(0, 20)) {
        try {
          const qSnap = await this.getAssignmentQueuesCol(churchId, plan.id).get();
          qSnap.docs.forEach((qDoc: any) => {
            const queue = qDoc.data() as ServiceAssignmentQueue;
            (queue.candidates || []).forEach(c => {
              if (c.status !== 'waiting') totalInvites++;
              if (c.status === 'accepted') totalAccepted++;
              if (c.status === 'declined') totalDeclined++;
              if (c.status === 'timed_out') totalTimedOut++;
            });
          });

          const aSnap = await this.getAttendanceCol(churchId, plan.id).get();
          aSnap.docs.forEach((aDoc: any) => {
            const att = aDoc.data() as VolunteerAttendanceRecord;
            totalAttendanceRecords++;
            if (att.attendanceStatus === 'present' || att.attendanceStatus === 'late') {
              totalPresent++;
            }
          });
        } catch (_) {}
      }

      const acceptanceRatePercent = totalInvites > 0 ? Math.round((totalAccepted / totalInvites) * 100) : 100;
      const averageTurnoutPercent = totalAttendanceRecords > 0 ? Math.round((totalPresent / totalAttendanceRecords) * 100) : 92;

      // Compile Volunteer Serving Stats
      const volunteerServingCounts: VolunteerServingStat[] = Array.from(volunteerMap.entries())
        .map(([mId, data]) => {
          const recentServes = data.dates.filter(d => d >= thirtyDaysAgoIso).length;
          return {
            memberId: mId,
            memberName: data.memberName,
            servingCount: data.count,
            lastServedDate: data.lastDate,
            fatigueRisk: recentServes >= 3,
            rolesServed: Array.from(data.roles)
          };
        })
        .sort((a, b) => b.servingCount - a.servingCount);

      // Compile Top Worship Songs
      const topWorshipSongs: SongUsageStat[] = Array.from(songUsageMap.values())
        .map(s => ({
          title: s.title,
          titleTe: s.titleTe,
          count: s.count,
          lastSungDate: s.lastDate || 'N/A',
          key: s.key || 'Standard'
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalServices,
        completedServices,
        averageTurnoutPercent,
        totalVolunteerAssignments: totalAssignments,
        acceptanceRatePercent,
        totalQueueInvites: totalInvites,
        totalAccepted,
        totalDeclined,
        totalTimedOut,
        volunteerServingCounts,
        topWorshipSongs
      };
    } catch (err) {
      console.error('[ServiceRosterService] getRosterAnalytics error:', err);
      return {
        totalServices: 0,
        completedServices: 0,
        averageTurnoutPercent: 0,
        totalVolunteerAssignments: 0,
        acceptanceRatePercent: 100,
        totalQueueInvites: 0,
        totalAccepted: 0,
        totalDeclined: 0,
        totalTimedOut: 0,
        volunteerServingCounts: [],
        topWorshipSongs: []
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. UTILITIES
  // ─────────────────────────────────────────────────────────────────────────────

  timeStringToMinutes(timeStr: string): number {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  minutesToTimeString(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  addMinutesToTime(timeStr: string, minutesToAdd: number): string {
    const total = this.timeStringToMinutes(timeStr) + minutesToAdd;
    return this.minutesToTimeString(total);
  }
}

export default new ServiceRosterService();

