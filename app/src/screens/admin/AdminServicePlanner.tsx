import React, { useState, useEffect, useContext, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Share,
  Dimensions,
  Alert,
  StatusBar,
  Platform
} from 'react-native';
import {
  CalendarDays,
  Plus,
  ArrowLeft,
  RefreshCw,
  Share2,
  Clock,
  Music,
  Users,
  CheckCircle2,
  Edit2,
  Trash2,
  Search,
  X,
  BookOpen,
  Mic,
  Video,
  Sparkles,
  AlertCircle,
  Check,
  MapPin,
  ChevronUp,
  ChevronDown,
  MessageCircle,
  FileText,
  User,
  Heart,
  ChevronRight
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import firestore from '@react-native-firebase/firestore';

import { useChurch } from '../../context/ChurchContext';
import { useAuth } from '../../context/AuthContext';
import { AdminTabContext } from '../../context/AdminTabContext';
import FirestoreService from '../../services/FirestoreService';
import ServiceRosterService, {
  ServicePlan,
  DEFAULT_DEPARTMENTS,
  SetlistItem,
  RunSheetItem,
  ServiceDepartment,
  TimetableCategory
} from '../../services/ServiceRosterService';
import { useAdminTheme } from '../../utils/adminThemeHelper';

const { width } = Dimensions.get('window');

const SERVICE_TYPE_PRESETS = [
  'Sunday 1st Service',
  'Sunday 2nd Service',
  'Sunday Evening Service',
  'Bible Study',
  'Friday Fasting Prayer',
  'Youth Fellowship',
  'Holy Communion Service',
  'Special Conference'
];

const RUNSHEET_PRESETS: { category: TimetableCategory; name: string; dur: number }[] = [
  { category: 'starting_prayer', name: 'Opening Prayer', dur: 10 },
  { category: 'opening_song', name: 'Opening Praise Song', dur: 10 },
  { category: 'worship_songs', name: 'Praise & Worship', dur: 30 },
  { category: 'bible_reading', name: 'Bible Reading', dur: 10 },
  { category: 'sermon', name: 'Sermon / Message', dur: 45 },
  { category: 'additional', name: 'Offertory & Announcements', dur: 15 },
  { category: 'closing_prayer', name: 'Closing Prayer & Benediction', dur: 5 },
];

export default function AdminServicePlanner({ navigation }: any) {
  const { isDark, colors: adminColors, screenBg } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const { activeChurch } = useChurch();
  const { setActiveTab } = useContext(AdminTabContext);
  const { member } = useAuth();

  const churchId = activeChurch?.id || 'rhema';

  // State: Plans & Loading
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ServicePlan | null>(null);
  const [activePlanTab, setActivePlanTab] = useState<'roster' | 'runSheet' | 'setlist' | 'sermon'>('roster');

  // State: Church Members & Songs
  const [churchMembers, setChurchMembers] = useState<any[]>([]);
  const [churchSongs, setChurchSongs] = useState<any[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [assigningRoleId, setAssigningRoleId] = useState<string | null>(null);
  const [assigningRoleName, setAssigningRoleName] = useState<string>('');
  const [showMemberPickerModal, setShowMemberPickerModal] = useState(false);

  // State: Quick Create Service Wizard Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('Sunday 1st Service');
  const [createDate, setCreateDate] = useState('');
  const [createStartTime, setCreateStartTime] = useState('09:30');
  const [createEndTime, setCreateEndTime] = useState('12:00');
  const [createLocation, setCreateLocation] = useState('Rhema Church Sanctuary');
  const [createTemplateType, setCreateTemplateType] = useState<'standard' | 'blank'>('standard');
  const [creatingPlan, setCreatingPlan] = useState(false);

  // State: Edit Service Details Modal
  const [showEditDetailsModal, setShowEditDetailsModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editSermonTitle, setEditSermonTitle] = useState('');
  const [editSermonSpeaker, setEditSermonSpeaker] = useState('');
  const [editSermonVerses, setEditSermonVerses] = useState('');

  // State: Add/Edit Run-Sheet Activity Modal
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingActivityIndex, setEditingActivityIndex] = useState<number | null>(null);
  const [activityForm, setActivityForm] = useState<RunSheetItem>({
    id: '',
    time: '09:30 to 09:40',
    startTime: '09:30',
    endTime: '09:40',
    durationMinutes: 10,
    program: '',
    category: 'starting_prayer',
    assignedTo: '',
    passage: '',
    place: 'Sanctuary',
    notes: '',
  });

  // State: Add/Edit Setlist Song Modal
  const [showSongModal, setShowSongModal] = useState(false);
  const [editingSongIndex, setEditingSongIndex] = useState<number | null>(null);
  const [songSearchQuery, setSongSearchQuery] = useState('');
  const [songForm, setSongForm] = useState<SetlistItem>({
    id: '',
    title: '',
    ledBy: '',
    key: 'F',
    timeSignature: '4/4',
    tempo: '100',
    verses: '',
    prelude: '',
    interlude: '',
    notes: '',
    isOffertory: false
  });

  // ── Load Church Data ─────────────────────────────────────
  useEffect(() => {
    loadData();
  }, [churchId]);

  const loadData = async () => {
    if (!churchId) return;
    setLoading(true);
    try {
      const [fetchedPlans, members, songs] = await Promise.all([
        ServiceRosterService.getServicePlans(churchId, 40),
        FirestoreService.getAllMembers(),
        FirestoreService.getWorshipSongs({ forceRefresh: false }).catch(() => [])
      ]);
      setPlans(fetchedPlans);
      setChurchMembers(members);
      setChurchSongs(songs || []);

      if (fetchedPlans.length > 0) {
        setSelectedPlan(prev => {
          if (prev) {
            const fresh = fetchedPlans.find(p => p.id === prev.id);
            if (fresh) return fresh;
          }
          return fetchedPlans[0];
        });
      } else {
        setSelectedPlan(null);
      }
    } catch (e) {
      console.error('[AdminServicePlanner] loadData error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Calculate Next Sunday Date ───────────────────────────
  const getNextSundayDate = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = (7 - day) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  };

  // ── Open Quick Create Wizard ─────────────────────────────
  const openCreateWizard = () => {
    setCreateTitle('Sunday 1st Service');
    setCreateDate(getNextSundayDate());
    setCreateStartTime('09:30');
    setCreateEndTime('12:00');
    setCreateLocation(activeChurch?.name ? `${activeChurch.name} Sanctuary` : 'Rhema Church Sanctuary');
    setCreateTemplateType('standard');
    setShowCreateModal(true);
  };

  // ── Create Service Plan ──────────────────────────────────
  const handleCreateServicePlan = async () => {
    if (!createTitle.trim() || !createDate.trim()) {
      Alert.alert('Required', 'Please provide a service title and date.');
      return;
    }

    setCreatingPlan(true);
    try {
      const runSheet = createTemplateType === 'standard'
        ? ServiceRosterService.getStandardSundayServiceSample()
        : [];

      const newPlan: Partial<ServicePlan> = {
        churchId,
        churchName: activeChurch?.name || 'Rhema Church',
        serviceTitle: createTitle.trim(),
        serviceType: 'sunday_service',
        date: createDate.trim(),
        startTime: createStartTime.trim() || '09:30',
        endTime: createEndTime.trim() || '12:00',
        location: createLocation.trim() || 'Rhema Church Sanctuary',
        status: 'published',
        assignments: {},
        assignmentMemberIds: {},
        assignmentStatus: {},
        setlist: [],
        runSheet,
        sermon: {
          title: '',
          code: '',
          keyVerses: '',
          speaker: '',
          translation: ''
        }
      };

      const newId = await ServiceRosterService.saveServicePlan(churchId, newPlan);
      setShowCreateModal(false);
      await loadData();
      const created = { id: newId, ...newPlan } as ServicePlan;
      setSelectedPlan(created);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create service plan.');
    } finally {
      setCreatingPlan(false);
    }
  };

  // ── Toggle Publish Status ────────────────────────────────
  const handleToggleStatus = async () => {
    if (!selectedPlan) return;
    const nextStatus = selectedPlan.status === 'published' ? 'draft' : 'published';
    const updated = { ...selectedPlan, status: nextStatus as 'published' | 'draft' };
    setSelectedPlan(updated);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updated : p));
    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      status: nextStatus
    });
  };

  // ── Open Edit Details Modal ──────────────────────────────
  const openEditDetails = () => {
    if (!selectedPlan) return;
    setEditTitle(selectedPlan.serviceTitle || '');
    setEditDate(selectedPlan.date || '');
    setEditStartTime(selectedPlan.startTime || '09:30');
    setEditEndTime(selectedPlan.endTime || '12:00');
    setEditLocation(selectedPlan.location || '');
    setEditSermonTitle(selectedPlan.sermon?.title || '');
    setEditSermonSpeaker(selectedPlan.sermon?.speaker || '');
    setEditSermonVerses(selectedPlan.sermon?.keyVerses || '');
    setShowEditDetailsModal(true);
  };

  // ── Save Edited Details ──────────────────────────────────
  const handleSaveDetails = async () => {
    if (!selectedPlan) return;
    const updated: ServicePlan = {
      ...selectedPlan,
      serviceTitle: editTitle.trim() || selectedPlan.serviceTitle,
      date: editDate.trim() || selectedPlan.date,
      startTime: editStartTime.trim(),
      endTime: editEndTime.trim(),
      location: editLocation.trim(),
      sermon: {
        ...(selectedPlan.sermon || { code: '', translation: '' }),
        title: editSermonTitle.trim(),
        speaker: editSermonSpeaker.trim(),
        keyVerses: editSermonVerses.trim()
      }
    };
    setSelectedPlan(updated);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updated : p));
    setShowEditDetailsModal(false);
    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      serviceTitle: updated.serviceTitle,
      date: updated.date,
      startTime: updated.startTime,
      endTime: updated.endTime,
      location: updated.location,
      sermon: updated.sermon
    });
  };

  // ── Delete Service Plan ──────────────────────────────────
  const handleDeletePlan = () => {
    if (!selectedPlan) return;
    Alert.alert(
      'Delete Service Plan',
      `Are you sure you want to delete "${selectedPlan.serviceTitle}" (${selectedPlan.date})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ServiceRosterService.deleteServicePlan(churchId, selectedPlan.id);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete plan.');
            }
          }
        }
      ]
    );
  };

  // ── Assign Role to Member ────────────────────────────────
  const handleAssignRole = async (memberItem: any) => {
    if (!selectedPlan || !assigningRoleId) return;
    const memberName = memberItem.name || memberItem.firstName || 'Member';
    const memberId = memberItem.id;

    const updatedAssignments = {
      ...selectedPlan.assignments,
      [assigningRoleId]: memberName
    };
    const updatedMemberIds = {
      ...(selectedPlan.assignmentMemberIds || {}),
      ...(memberId ? { [assigningRoleId]: memberId } : {})
    };
    const updatedStatus = {
      ...(selectedPlan.assignmentStatus || {}),
      [assigningRoleId]: 'pending' as const
    };

    const updatedPlan: ServicePlan = {
      ...selectedPlan,
      assignments: updatedAssignments,
      assignmentMemberIds: updatedMemberIds,
      assignmentStatus: updatedStatus
    };

    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updatedPlan : p));
    setShowMemberPickerModal(false);
    setAssigningRoleId(null);

    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      assignments: updatedAssignments,
      assignmentMemberIds: updatedMemberIds,
      assignmentStatus: updatedStatus
    });
  };

  // ── Remove Role Assignment ───────────────────────────────
  const handleRemoveRole = async (roleId: string) => {
    if (!selectedPlan) return;
    const updatedAssignments = { ...selectedPlan.assignments };
    delete updatedAssignments[roleId];

    const updatedMemberIds = { ...(selectedPlan.assignmentMemberIds || {}) };
    delete updatedMemberIds[roleId];

    const updatedStatus = { ...(selectedPlan.assignmentStatus || {}) };
    delete updatedStatus[roleId];

    const updatedPlan: ServicePlan = {
      ...selectedPlan,
      assignments: updatedAssignments,
      assignmentMemberIds: updatedMemberIds,
      assignmentStatus: updatedStatus
    };

    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updatedPlan : p));

    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      assignments: updatedAssignments,
      assignmentMemberIds: updatedMemberIds,
      assignmentStatus: updatedStatus
    });
  };

  // ── Filter Members with Skill Matching ────────────────────
  const filteredMembers = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase();
    let list = churchMembers;

    if (q) {
      list = list.filter(m => {
        const name = (m.name || m.firstName || '').toLowerCase();
        const phone = (m.phone || '').toLowerCase();
        const skill = (m.primarySkill || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || skill.includes(q);
      });
    }

    // Sort matching skill members to top
    if (assigningRoleName) {
      const target = assigningRoleName.toLowerCase();
      list = [...list].sort((a, b) => {
        const aSkill = ((a.primarySkill || '') + ' ' + (a.secondarySkill || '')).toLowerCase();
        const bSkill = ((b.primarySkill || '') + ' ' + (b.secondarySkill || '')).toLowerCase();
        const aMatch = aSkill.includes(target) ? 1 : 0;
        const bMatch = bSkill.includes(target) ? 1 : 0;
        return bMatch - aMatch;
      });
    }

    return list;
  }, [churchMembers, memberSearchQuery, assigningRoleName]);

  // ── Run Sheet Duration Adjustment (+5m / -5m) ─────────────
  const handleAdjustRunSheetDuration = async (index: number, deltaMinutes: number) => {
    if (!selectedPlan || !selectedPlan.runSheet) return;
    const list = [...selectedPlan.runSheet];
    const item = list[index];
    if (!item) return;

    const newDuration = Math.max(5, (item.durationMinutes || 10) + deltaMinutes);
    const startMin = ServiceRosterService.parseTimeToMinutes(item.startTime || '09:30');
    const endMin = startMin + newDuration;
    const newEnd = ServiceRosterService.minutesToTimeString(endMin);

    list[index] = {
      ...item,
      durationMinutes: newDuration,
      endTime: newEnd,
      time: ServiceRosterService.formatTimeRange(item.startTime || '09:30', newEnd)
    };

    // Ripple shift subsequent items forward
    let runningStart = endMin;
    for (let i = index + 1; i < list.length; i++) {
      const nextItem = list[i];
      const nextDur = nextItem.durationMinutes || 10;
      const nextStartStr = ServiceRosterService.minutesToTimeString(runningStart);
      const nextEndStr = ServiceRosterService.minutesToTimeString(runningStart + nextDur);
      list[i] = {
        ...nextItem,
        startTime: nextStartStr,
        endTime: nextEndStr,
        time: ServiceRosterService.formatTimeRange(nextStartStr, nextEndStr)
      };
      runningStart += nextDur;
    }

    const updatedPlan = { ...selectedPlan, runSheet: list };
    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updatedPlan : p));

    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      runSheet: list
    });
  };

  // ── Reorder Run Sheet Item ───────────────────────────────
  const handleMoveRunSheetItem = async (index: number, direction: 'up' | 'down') => {
    if (!selectedPlan || !selectedPlan.runSheet) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= selectedPlan.runSheet.length) return;

    const list = [...selectedPlan.runSheet];
    const temp = list[index];
    list[index] = list[target];
    list[target] = temp;

    // Recalculate times sequentially
    let curMin = ServiceRosterService.parseTimeToMinutes(selectedPlan.startTime || '09:30');
    for (let i = 0; i < list.length; i++) {
      const dur = list[i].durationMinutes || 10;
      const s = ServiceRosterService.minutesToTimeString(curMin);
      const e = ServiceRosterService.minutesToTimeString(curMin + dur);
      list[i] = {
        ...list[i],
        startTime: s,
        endTime: e,
        time: ServiceRosterService.formatTimeRange(s, e)
      };
      curMin += dur;
    }

    const updatedPlan = { ...selectedPlan, runSheet: list };
    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updatedPlan : p));

    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      runSheet: list
    });
  };

  // ── Delete Run Sheet Item ────────────────────────────────
  const handleDeleteRunSheetItem = async (index: number) => {
    if (!selectedPlan || !selectedPlan.runSheet) return;
    const list = selectedPlan.runSheet.filter((_, i) => i !== index);
    const updatedPlan = { ...selectedPlan, runSheet: list };
    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updatedPlan : p));

    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      runSheet: list
    });
  };

  // ── Save Run Sheet Activity (New or Edit) ────────────────
  const handleSaveActivity = async () => {
    if (!selectedPlan) return;
    if (!activityForm.program.trim()) {
      Alert.alert('Required', 'Please enter an activity title');
      return;
    }

    const dur = activityForm.durationMinutes || 10;
    const sMin = ServiceRosterService.parseTimeToMinutes(activityForm.startTime || '09:30');
    const eMin = sMin + dur;
    const eStr = ServiceRosterService.minutesToTimeString(eMin);

    const newItem: RunSheetItem = {
      ...activityForm,
      durationMinutes: dur,
      endTime: eStr,
      time: ServiceRosterService.formatTimeRange(activityForm.startTime || '09:30', eStr)
    };

    let list = [...(selectedPlan.runSheet || [])];
    if (editingActivityIndex !== null) {
      list[editingActivityIndex] = newItem;
    } else {
      list.push(newItem);
    }

    const updatedPlan = { ...selectedPlan, runSheet: list };
    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updatedPlan : p));
    setShowActivityModal(false);

    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      runSheet: list
    });
  };

  // ── Filter Church Songs for Setlist Picker ───────────────
  const filteredChurchSongs = useMemo(() => {
    const q = songSearchQuery.trim().toLowerCase();
    if (!q) return churchSongs.slice(0, 20);
    return churchSongs.filter(s => {
      const t = (s.title || '').toLowerCase();
      const te = (s.titleTe || '').toLowerCase();
      const cat = (s.category || '').toLowerCase();
      return t.includes(q) || te.includes(q) || cat.includes(q);
    }).slice(0, 20);
  }, [churchSongs, songSearchQuery]);

  // ── Save Setlist Song ────────────────────────────────────
  const handleSaveSong = async () => {
    if (!selectedPlan) return;
    if (!songForm.title.trim()) {
      Alert.alert('Required', 'Please enter or select a song title');
      return;
    }

    let list = [...(selectedPlan.setlist || [])];
    if (editingSongIndex !== null) {
      list[editingSongIndex] = { ...songForm };
    } else {
      list.push({ ...songForm, id: Math.random().toString(36).substring(7) });
    }

    const updatedPlan = { ...selectedPlan, setlist: list };
    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updatedPlan : p));
    setShowSongModal(false);

    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      setlist: list
    });
  };

  // ── Move Setlist Song Up/Down ────────────────────────────
  const handleMoveSetlistSong = async (index: number, direction: 'up' | 'down') => {
    if (!selectedPlan || !selectedPlan.setlist) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= selectedPlan.setlist.length) return;

    const list = [...selectedPlan.setlist];
    const temp = list[index];
    list[index] = list[target];
    list[target] = temp;

    const updatedPlan = { ...selectedPlan, setlist: list };
    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updatedPlan : p));

    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      setlist: list
    });
  };

  // ── Delete Setlist Song ──────────────────────────────────
  const handleDeleteSetlistSong = async (index: number) => {
    if (!selectedPlan || !selectedPlan.setlist) return;
    const list = selectedPlan.setlist.filter((_, i) => i !== index);
    const updatedPlan = { ...selectedPlan, setlist: list };
    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? updatedPlan : p));

    await ServiceRosterService.saveServicePlan(churchId, {
      id: selectedPlan.id,
      setlist: list
    });
  };

  // ── WhatsApp Share ───────────────────────────────────────
  const handleShareToWhatsApp = async () => {
    if (!selectedPlan) return;
    const text = ServiceRosterService.generateWhatsAppShareText(selectedPlan);
    try {
      await Share.share({ message: text });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  // ── Departments Matrix ───────────────────────────────────
  const departments = selectedPlan?.departments || DEFAULT_DEPARTMENTS;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A2D5A" />

      {/* ── TOP NAV HERO (RHEMA NAVY & GOLD) ───────────────── */}
      <View style={[styles.hero, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.heroRow}>
          <TouchableOpacity
            style={styles.heroBackBtn}
            onPress={() => setActiveTab(0)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingHorizontal: 10 }}>
            <Text style={styles.heroPreTitle}>RHEMA CHURCH OPERATIONS</Text>
            <Text style={styles.heroMainTitle}>Service Roster & Planner</Text>
          </View>
          <TouchableOpacity style={styles.heroRefreshBtn} onPress={loadData}>
            <RefreshCw size={16} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.heroNewBtn} onPress={openCreateWizard}>
            <Plus size={16} color="#1A2D5A" strokeWidth={2.5} />
            <Text style={styles.heroNewBtnTxt}>New</Text>
          </TouchableOpacity>
        </View>

        {/* ── HORIZONTAL SERVICE CAROUSEL ──────────────────── */}
        {plans.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContainer}>
            {plans.map(p => {
              const isSelected = selectedPlan?.id === p.id;
              const dateParts = p.date ? p.date.split('-') : ['2026', '11', '08'];
              const dayNum = dateParts[2] || '08';
              const monthNum = parseInt(dateParts[1] || '11', 10);
              const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
              const monthStr = months[monthNum - 1] || 'NOV';

              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.serviceCardChip, isSelected && styles.serviceCardChipActive]}
                  onPress={() => setSelectedPlan(p)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.chipDateBox, isSelected && styles.chipDateBoxActive]}>
                    <Text style={[styles.chipDayNum, isSelected && styles.chipDayNumActive]}>{dayNum}</Text>
                    <Text style={[styles.chipMonthTxt, isSelected && styles.chipMonthTxtActive]}>{monthStr}</Text>
                  </View>
                  <View style={{ flex: 1, paddingLeft: 8 }}>
                    <Text style={[styles.chipTitle, isSelected && styles.chipTitleActive]} numberOfLines={1}>
                      {p.serviceTitle}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Text style={[styles.chipTime, isSelected && styles.chipTimeActive]}>
                        {p.startTime || '09:30'}
                      </Text>
                      <View style={[styles.chipStatusDot, { backgroundColor: p.status === 'published' ? '#10B981' : '#F59E0B' }]} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* ── MAIN CONTENT AREA ──────────────────────────────── */}
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color="#1A2D5A" />
          <Text style={styles.loadingTxt}>Loading Rhema service planner...</Text>
        </View>
      ) : !selectedPlan ? (
        <View style={styles.emptyWrap}>
          <CalendarDays size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No Service Plans Created</Text>
          <Text style={styles.emptySub}>
            Plan your upcoming Sunday services, assign church members to ministry roles, and build setlists.
          </Text>
          <TouchableOpacity style={styles.emptyCreateBtn} onPress={openCreateWizard}>
            <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.emptyCreateBtnTxt}>Create First Service</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          {/* ── 1. ACTIVE SERVICE BANNER ────────────────────── */}
          <View style={styles.activeServiceBanner}>
            <View style={styles.activeBannerTop}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <View style={styles.activeBadgeRow}>
                  <View style={styles.activeDateBadge}>
                    <CalendarDays size={12} color="#1A2D5A" />
                    <Text style={styles.activeDateBadgeTxt}>{selectedPlan.date}</Text>
                  </View>
                  <View style={styles.activeTimeBadge}>
                    <Clock size={12} color="#059669" />
                    <Text style={styles.activeTimeBadgeTxt}>
                      {selectedPlan.startTime || '09:30'} – {selectedPlan.endTime || '12:00'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.statusTogglePill,
                      selectedPlan.status === 'published' ? styles.statusTogglePublished : styles.statusToggleDraft
                    ]}
                    onPress={handleToggleStatus}
                  >
                    <View style={[styles.statusSmallDot, { backgroundColor: selectedPlan.status === 'published' ? '#059669' : '#B45309' }]} />
                    <Text style={[styles.statusToggleTxt, { color: selectedPlan.status === 'published' ? '#059669' : '#B45309' }]}>
                      {selectedPlan.status === 'published' ? 'Published' : 'Draft'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.activeBannerTitle} numberOfLines={1}>
                  {selectedPlan.serviceTitle}
                </Text>
                {selectedPlan.location ? (
                  <View style={styles.activeLocationRow}>
                    <MapPin size={12} color="#64748B" />
                    <Text style={styles.activeLocationTxt} numberOfLines={1}>
                      {selectedPlan.location}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Quick Action Buttons */}
            <View style={styles.activeBannerActions}>
              <TouchableOpacity style={styles.actionBtnEdit} onPress={openEditDetails}>
                <Edit2 size={13} color="#FFFFFF" />
                <Text style={styles.actionBtnEditTxt}>Edit Details</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtnShare} onPress={handleShareToWhatsApp}>
                <MessageCircle size={14} color="#059669" />
                <Text style={styles.actionBtnShareTxt}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtnDelete} onPress={handleDeletePlan}>
                <Trash2 size={14} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 2. SEGMENTED TABS (CLEAN & MODERN) ───────────── */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activePlanTab === 'roster' && styles.tabItemActive]}
              onPress={() => setActivePlanTab('roster')}
            >
              <Users size={14} color={activePlanTab === 'roster' ? '#1A2D5A' : '#64748B'} />
              <Text style={[styles.tabItemTxt, activePlanTab === 'roster' && styles.tabItemTxtActive]}>
                Team Roster
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activePlanTab === 'runSheet' && styles.tabItemActive]}
              onPress={() => setActivePlanTab('runSheet')}
            >
              <Clock size={14} color={activePlanTab === 'runSheet' ? '#1A2D5A' : '#64748B'} />
              <Text style={[styles.tabItemTxt, activePlanTab === 'runSheet' && styles.tabItemTxtActive]}>
                Run-Sheet ({selectedPlan.runSheet?.length || 0})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activePlanTab === 'setlist' && styles.tabItemActive]}
              onPress={() => setActivePlanTab('setlist')}
            >
              <Music size={14} color={activePlanTab === 'setlist' ? '#1A2D5A' : '#64748B'} />
              <Text style={[styles.tabItemTxt, activePlanTab === 'setlist' && styles.tabItemTxtActive]}>
                Setlist ({selectedPlan.setlist?.length || 0})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activePlanTab === 'sermon' && styles.tabItemActive]}
              onPress={() => setActivePlanTab('sermon')}
            >
              <BookOpen size={14} color={activePlanTab === 'sermon' ? '#1A2D5A' : '#64748B'} />
              <Text style={[styles.tabItemTxt, activePlanTab === 'sermon' && styles.tabItemTxtActive]}>
                Sermon
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── TAB 1: TEAM ROSTER (ASSIGN MEMBERS) ──────────── */}
          {activePlanTab === 'roster' && (
            <View style={{ gap: 14 }}>
              {departments.map(dept => (
                <View key={dept.id} style={styles.deptCard}>
                  <View style={[styles.deptHeader, { backgroundColor: dept.badgeBg || '#F8FAFC' }]}>
                    <View style={styles.deptHeaderLeft}>
                      <View style={[styles.deptDot, { backgroundColor: dept.color }]} />
                      <Text style={[styles.deptTitle, { color: dept.color }]}>{dept.name}</Text>
                    </View>
                  </View>

                  <View style={styles.roleList}>
                    {dept.roles.map(role => {
                      const assignedName = selectedPlan.assignments[role.id];
                      const assignedStatus = selectedPlan.assignmentStatus?.[role.id] || 'pending';

                      return (
                        <View key={role.id} style={styles.roleRow}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={styles.roleName}>{role.name}</Text>
                            {assignedName ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                <Text style={styles.assignedMemberName}>{assignedName}</Text>
                                <View style={[styles.assignedStatusBadge, assignedStatus === 'confirmed' ? styles.statusConfirmed : styles.statusPending]}>
                                  <Text style={[styles.assignedStatusTxt, { color: assignedStatus === 'confirmed' ? '#059669' : '#B45309' }]}>
                                    {assignedStatus === 'confirmed' ? '✓ Confirmed' : '⏳ Pending'}
                                  </Text>
                                </View>
                              </View>
                            ) : (
                              <Text style={styles.unassignedPlaceholder}>{role.placeholder || 'No member assigned'}</Text>
                            )}
                          </View>

                          <View style={styles.roleActionBtns}>
                            {assignedName ? (
                              <>
                                <TouchableOpacity
                                  style={styles.roleEditBtn}
                                  onPress={() => {
                                    setAssigningRoleId(role.id);
                                    setAssigningRoleName(role.name);
                                    setMemberSearchQuery('');
                                    setShowMemberPickerModal(true);
                                  }}
                                >
                                  <Text style={styles.roleEditBtnTxt}>Change</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.roleRemoveBtn}
                                  onPress={() => handleRemoveRole(role.id)}
                                >
                                  <X size={14} color="#DC2626" />
                                </TouchableOpacity>
                              </>
                            ) : (
                              <TouchableOpacity
                                style={styles.roleAssignBtn}
                                onPress={() => {
                                  setAssigningRoleId(role.id);
                                  setAssigningRoleName(role.name);
                                  setMemberSearchQuery('');
                                  setShowMemberPickerModal(true);
                                }}
                              >
                                <Plus size={13} color="#1A2D5A" />
                                <Text style={styles.roleAssignBtnTxt}>Assign</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── TAB 2: RUN-SHEET (ORDER OF SERVICE) ──────────── */}
          {activePlanTab === 'runSheet' && (
            <View style={{ gap: 12 }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>Chronological Order of Service</Text>
                <TouchableOpacity
                  style={styles.addSmallBtn}
                  onPress={() => {
                    setEditingActivityIndex(null);
                    setActivityForm({
                      id: Math.random().toString(36).substring(7),
                      time: '09:30 to 09:40',
                      startTime: '09:30',
                      endTime: '09:40',
                      durationMinutes: 10,
                      program: '',
                      category: 'starting_prayer',
                      assignedTo: '',
                      place: selectedPlan.location || 'Sanctuary',
                      notes: ''
                    });
                    setShowActivityModal(true);
                  }}
                >
                  <Plus size={14} color="#1A2D5A" />
                  <Text style={styles.addSmallBtnTxt}>Add Item</Text>
                </TouchableOpacity>
              </View>

              {(!selectedPlan.runSheet || selectedPlan.runSheet.length === 0) ? (
                <View style={styles.emptyTabCard}>
                  <Clock size={32} color="#94A3B8" />
                  <Text style={styles.emptyTabCardTitle}>No Run-Sheet Items</Text>
                  <TouchableOpacity
                    style={styles.loadTemplateBtn}
                    onPress={async () => {
                      const template = ServiceRosterService.getStandardSundayServiceSample();
                      const updatedPlan = { ...selectedPlan, runSheet: template };
                      setSelectedPlan(updatedPlan);
                      await ServiceRosterService.saveServicePlan(churchId, {
                        id: selectedPlan.id,
                        runSheet: template
                      });
                    }}
                  >
                    <Sparkles size={14} color="#FFFFFF" />
                    <Text style={styles.loadTemplateBtnTxt}>Load Sunday Service Template</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                selectedPlan.runSheet.map((item, idx) => (
                  <View key={item.id || idx} style={styles.runSheetRowCard}>
                    {/* Time Pillar */}
                    <View style={styles.runSheetTimePillar}>
                      <Text style={styles.runSheetTimeTxt}>{item.startTime || '09:30'}</Text>
                      <View style={styles.durationPill}>
                        <TouchableOpacity onPress={() => handleAdjustRunSheetDuration(idx, -5)}>
                          <Text style={styles.durationAdjTxt}>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.durationMainTxt}>{item.durationMinutes || 10}m</Text>
                        <TouchableOpacity onPress={() => handleAdjustRunSheetDuration(idx, 5)}>
                          <Text style={styles.durationAdjTxt}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Content */}
                    <View style={{ flex: 1, paddingHorizontal: 8 }}>
                      <Text style={styles.runSheetProgramTxt}>{item.program}</Text>
                      {item.assignedTo ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <User size={12} color="#64748B" />
                          <Text style={styles.runSheetAssignedTxt}>{item.assignedTo}</Text>
                        </View>
                      ) : null}
                      {item.passage ? (
                        <Text style={styles.runSheetMetaTxt}>📖 {item.passage}</Text>
                      ) : null}
                      {item.songTitle ? (
                        <Text style={styles.runSheetMetaTxt}>🎵 {item.songTitle}</Text>
                      ) : null}
                    </View>

                    {/* Order Controls */}
                    <View style={styles.runSheetActions}>
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        disabled={idx === 0}
                        onPress={() => handleMoveRunSheetItem(idx, 'up')}
                      >
                        <ChevronUp size={14} color={idx === 0 ? '#CBD5E1' : '#1A2D5A'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        disabled={idx === selectedPlan.runSheet.length - 1}
                        onPress={() => handleMoveRunSheetItem(idx, 'down')}
                      >
                        <ChevronDown size={14} color={idx === selectedPlan.runSheet.length - 1 ? '#CBD5E1' : '#1A2D5A'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.reorderDeleteBtn}
                        onPress={() => handleDeleteRunSheetItem(idx)}
                      >
                        <Trash2 size={13} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ── TAB 3: WORSHIP SETLIST ───────────────────────── */}
          {activePlanTab === 'setlist' && (
            <View style={{ gap: 12 }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>Worship Songs ({selectedPlan.setlist?.length || 0})</Text>
                <TouchableOpacity
                  style={styles.addSmallBtn}
                  onPress={() => {
                    setEditingSongIndex(null);
                    setSongSearchQuery('');
                    setSongForm({
                      id: '',
                      title: '',
                      ledBy: '',
                      key: 'F',
                      timeSignature: '4/4',
                      tempo: '100',
                      verses: '',
                      prelude: '',
                      interlude: '',
                      notes: '',
                      isOffertory: false
                    });
                    setShowSongModal(true);
                  }}
                >
                  <Plus size={14} color="#1A2D5A" />
                  <Text style={styles.addSmallBtnTxt}>Add Song</Text>
                </TouchableOpacity>
              </View>

              {(!selectedPlan.setlist || selectedPlan.setlist.length === 0) ? (
                <View style={styles.emptyTabCard}>
                  <Music size={32} color="#94A3B8" />
                  <Text style={styles.emptyTabCardTitle}>No Songs in Setlist</Text>
                  <Text style={styles.emptyTabCardSub}>Add worship songs from your church song library.</Text>
                </View>
              ) : (
                selectedPlan.setlist.map((song, idx) => (
                  <View key={song.id || idx} style={styles.setlistSongCard}>
                    <View style={styles.setlistSongTop}>
                      <View style={styles.setlistSongIndexBadge}>
                        <Text style={styles.setlistSongIndexTxt}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, paddingHorizontal: 10 }}>
                        <Text style={styles.setlistSongTitle}>{song.title}</Text>
                        {song.ledBy ? (
                          <Text style={styles.setlistSongLeader}>🎤 Led by {song.ledBy}</Text>
                        ) : null}
                      </View>

                      <View style={styles.setlistActions}>
                        <TouchableOpacity
                          style={styles.reorderBtn}
                          disabled={idx === 0}
                          onPress={() => handleMoveSetlistSong(idx, 'up')}
                        >
                          <ChevronUp size={14} color={idx === 0 ? '#CBD5E1' : '#1A2D5A'} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.reorderBtn}
                          disabled={idx === selectedPlan.setlist.length - 1}
                          onPress={() => handleMoveSetlistSong(idx, 'down')}
                        >
                          <ChevronDown size={14} color={idx === selectedPlan.setlist.length - 1 ? '#CBD5E1' : '#1A2D5A'} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.reorderDeleteBtn}
                          onPress={() => handleDeleteSetlistSong(idx)}
                        >
                          <Trash2 size={13} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Badges: Key, Tempo, Time Sig */}
                    <View style={styles.setlistBadgesRow}>
                      <View style={styles.setlistKeyBadge}>
                        <Text style={styles.setlistKeyBadgeTxt}>Key: {song.key || 'F'}</Text>
                      </View>
                      {song.tempo ? (
                        <View style={styles.setlistTempoBadge}>
                          <Text style={styles.setlistTempoBadgeTxt}>BPM: {song.tempo}</Text>
                        </View>
                      ) : null}
                      {song.timeSignature ? (
                        <View style={styles.setlistMeterBadge}>
                          <Text style={styles.setlistMeterBadgeTxt}>{song.timeSignature}</Text>
                        </View>
                      ) : null}
                      {song.isOffertory ? (
                        <View style={styles.setlistOffertoryBadge}>
                          <Text style={styles.setlistOffertoryBadgeTxt}>Offertory</Text>
                        </View>
                      ) : null}
                    </View>

                    {song.prelude || song.interlude || song.notes ? (
                      <View style={styles.setlistNotesBox}>
                        {song.prelude ? <Text style={styles.setlistNoteTxt}><Text style={{ fontWeight: '700' }}>Prelude:</Text> {song.prelude}</Text> : null}
                        {song.interlude ? <Text style={styles.setlistNoteTxt}><Text style={{ fontWeight: '700' }}>Interlude:</Text> {song.interlude}</Text> : null}
                        {song.notes ? <Text style={styles.setlistNoteTxt}><Text style={{ fontWeight: '700' }}>Notes:</Text> {song.notes}</Text> : null}
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ── TAB 4: SERMON & BULLETIN ─────────────────────── */}
          {activePlanTab === 'sermon' && (
            <View style={styles.sermonTabCard}>
              <View style={styles.sermonCardHeader}>
                <BookOpen size={20} color="#D4AF37" />
                <Text style={styles.sermonCardHeaderTitle}>Sermon & Liturgy Overview</Text>
              </View>

              <View style={styles.sermonFieldRow}>
                <Text style={styles.sermonFieldLabel}>Sermon Title:</Text>
                <Text style={styles.sermonFieldVal}>{selectedPlan.sermon?.title || 'Not specified'}</Text>
              </View>

              <View style={styles.sermonFieldRow}>
                <Text style={styles.sermonFieldLabel}>Preacher / Speaker:</Text>
                <Text style={styles.sermonFieldVal}>{selectedPlan.sermon?.speaker || 'Senior Pastor'}</Text>
              </View>

              <View style={styles.sermonFieldRow}>
                <Text style={styles.sermonFieldLabel}>Key Scripture Verses:</Text>
                <Text style={[styles.sermonFieldVal, { color: '#2563EB', fontWeight: '700' }]}>
                  {selectedPlan.sermon?.keyVerses || 'To be announced'}
                </Text>
              </View>

              <TouchableOpacity style={styles.sermonEditBtn} onPress={openEditDetails}>
                <Edit2 size={14} color="#1A2D5A" />
                <Text style={styles.sermonEditBtnTxt}>Edit Sermon Details</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── MODAL 1: QUICK CREATE SERVICE WIZARD ───────────── */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCardTitle}>Create Service Plan</Text>
                <Text style={styles.modalCardSub}>Rhema Church Operations</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={styles.inputLabel}>Service Title</Text>
              <TextInput
                style={styles.textInput}
                value={createTitle}
                onChangeText={setCreateTitle}
                placeholder="e.g. Sunday Morning Worship"
                placeholderTextColor="#94A3B8"
              />

              {/* Presets Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                {SERVICE_TYPE_PRESETS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.presetChip, createTitle === p && styles.presetChipActive]}
                    onPress={() => setCreateTitle(p)}
                  >
                    <Text style={[styles.presetChipTxt, createTitle === p && styles.presetChipTxtActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={createDate}
                    onChangeText={setCreateDate}
                    placeholder="2026-11-08"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Start Time</Text>
                  <TextInput
                    style={styles.textInput}
                    value={createStartTime}
                    onChangeText={setCreateStartTime}
                    placeholder="09:30"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>End Time</Text>
                  <TextInput
                    style={styles.textInput}
                    value={createEndTime}
                    onChangeText={setCreateEndTime}
                    placeholder="12:00"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Location</Text>
                  <TextInput
                    style={styles.textInput}
                    value={createLocation}
                    onChangeText={setCreateLocation}
                    placeholder="Sanctuary"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Template</Text>
              <View style={styles.templatePickerRow}>
                <TouchableOpacity
                  style={[styles.templateChoice, createTemplateType === 'standard' && styles.templateChoiceActive]}
                  onPress={() => setCreateTemplateType('standard')}
                >
                  <Sparkles size={16} color={createTemplateType === 'standard' ? '#1A2D5A' : '#64748B'} />
                  <Text style={[styles.templateChoiceTitle, createTemplateType === 'standard' && styles.templateChoiceTitleActive]}>
                    Standard Sunday
                  </Text>
                  <Text style={styles.templateChoiceSub}>Auto-generates 7 service items</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.templateChoice, createTemplateType === 'blank' && styles.templateChoiceActive]}
                  onPress={() => setCreateTemplateType('blank')}
                >
                  <FileText size={16} color={createTemplateType === 'blank' ? '#1A2D5A' : '#64748B'} />
                  <Text style={[styles.templateChoiceTitle, createTemplateType === 'blank' && styles.templateChoiceTitleActive]}>
                    Blank Service
                  </Text>
                  <Text style={styles.templateChoiceSub}>Build timetable from scratch</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalCancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                disabled={creatingPlan}
                onPress={handleCreateServicePlan}
              >
                {creatingPlan ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnTxt}>Create Service</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 2: FAST MEMBER PICKER MODAL ──────────────── */}
      <Modal visible={showMemberPickerModal} transparent animationType="slide" onRequestClose={() => setShowMemberPickerModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCardTitle}>Assign {assigningRoleName}</Text>
                <Text style={styles.modalCardSub}>Pick a registered church member</Text>
              </View>
              <TouchableOpacity onPress={() => setShowMemberPickerModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search Box */}
            <View style={styles.searchBox}>
              <Search size={15} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search member by name, phone, or skill..."
                placeholderTextColor="#94A3B8"
                value={memberSearchQuery}
                onChangeText={setMemberSearchQuery}
              />
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {filteredMembers.map((m, mIdx) => {
                const name = m.name || m.firstName || 'Member';
                const hasSkill = m.primarySkill || m.secondarySkill;

                return (
                  <TouchableOpacity
                    key={`mem_${m.id || mIdx}`}
                    style={styles.memberRow}
                    onPress={() => handleAssignRole(m)}
                  >
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarTxt}>{name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 10 }}>
                      <Text style={styles.memberName}>{name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {m.phone ? <Text style={styles.memberPhone}>{m.phone}</Text> : null}
                        {hasSkill ? (
                          <View style={styles.memberSkillBadge}>
                            <Text style={styles.memberSkillBadgeTxt}>{m.primarySkill || m.secondarySkill}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Check size={16} color="#059669" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 3: ADD SONG TO SETLIST WITH LIVE SEARCH ──── */}
      <Modal visible={showSongModal} transparent animationType="slide" onRequestClose={() => setShowSongModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCardTitle}>
                  {editingSongIndex !== null ? 'Edit Worship Song' : 'Add Song to Setlist'}
                </Text>
                <Text style={styles.modalCardSub}>Rhema Church Song Library</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSongModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* Song Search / Autocomplete from Church Songs */}
              <Text style={styles.inputLabel}>Search from Church Worship Songs</Text>
              <View style={styles.searchBox}>
                <Search size={15} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search existing song..."
                  placeholderTextColor="#94A3B8"
                  value={songSearchQuery}
                  onChangeText={setSongSearchQuery}
                />
              </View>

              {filteredChurchSongs.length > 0 && !songForm.title ? (
                <View style={styles.songSuggestionsBox}>
                  {filteredChurchSongs.slice(0, 5).map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.songSuggestionRow}
                      onPress={() => {
                        setSongForm(prev => ({
                          ...prev,
                          title: s.title || '',
                          key: s.key || prev.key || 'F',
                          tempo: s.tempo ? String(s.tempo) : prev.tempo
                        }));
                        setSongSearchQuery('');
                      }}
                    >
                      <Music size={13} color="#1A2D5A" />
                      <Text style={styles.songSuggestionTxt} numberOfLines={1}>
                        {s.title} {s.titleTe ? `(${s.titleTe})` : ''}
                      </Text>
                      {s.key ? <Text style={styles.songSuggestionKey}>Key: {s.key}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Song Title</Text>
              <TextInput
                style={styles.textInput}
                value={songForm.title}
                onChangeText={t => setSongForm(prev => ({ ...prev, title: t }))}
                placeholder="Song Title"
                placeholderTextColor="#94A3B8"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Key (e.g. F, G, D, Bb)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={songForm.key}
                    onChangeText={t => setSongForm(prev => ({ ...prev, key: t }))}
                    placeholder="Key"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>BPM / Tempo</Text>
                  <TextInput
                    style={styles.textInput}
                    value={songForm.tempo}
                    onChangeText={t => setSongForm(prev => ({ ...prev, tempo: t }))}
                    placeholder="100"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Song Leader</Text>
                  <TextInput
                    style={styles.textInput}
                    value={songForm.ledBy}
                    onChangeText={t => setSongForm(prev => ({ ...prev, ledBy: t }))}
                    placeholder="Lead Vocalist"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Time Signature</Text>
                  <TextInput
                    style={styles.textInput}
                    value={songForm.timeSignature}
                    onChangeText={t => setSongForm(prev => ({ ...prev, timeSignature: t }))}
                    placeholder="4/4"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Arrangement / Practice Notes</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
                value={songForm.notes}
                onChangeText={t => setSongForm(prev => ({ ...prev, notes: t }))}
                placeholder="Prelude notes, transitions, chords..."
                placeholderTextColor="#94A3B8"
                multiline
              />
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowSongModal(false)}>
                <Text style={styles.modalCancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveSong}>
                <Text style={styles.modalSubmitBtnTxt}>Save Song</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 4: EDIT DETAILS MODAL ────────────────────── */}
      <Modal visible={showEditDetailsModal} transparent animationType="slide" onRequestClose={() => setShowEditDetailsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCardTitle}>Edit Service Details</Text>
                <Text style={styles.modalCardSub}>Title, timings & sermon overview</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEditDetailsModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={styles.inputLabel}>Service Title</Text>
              <TextInput
                style={styles.textInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Service Title"
                placeholderTextColor="#94A3B8"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDate}
                    onChangeText={setEditDate}
                    placeholder="2026-11-08"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Location</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editLocation}
                    onChangeText={setEditLocation}
                    placeholder="Sanctuary"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Start Time</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editStartTime}
                    onChangeText={setEditStartTime}
                    placeholder="09:30"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>End Time</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editEndTime}
                    onChangeText={setEditEndTime}
                    placeholder="12:00"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { marginTop: 14, color: '#D4AF37' }]}>SERMON & LITURGY</Text>
              <Text style={styles.inputLabel}>Sermon Title</Text>
              <TextInput
                style={styles.textInput}
                value={editSermonTitle}
                onChangeText={setEditSermonTitle}
                placeholder="e.g. Walking in Faith"
                placeholderTextColor="#94A3B8"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Preacher / Speaker</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editSermonSpeaker}
                    onChangeText={setEditSermonSpeaker}
                    placeholder="Speaker"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Key Verses</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editSermonVerses}
                    onChangeText={setEditSermonVerses}
                    placeholder="Romans 3:17-25"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowEditDetailsModal(false)}>
                <Text style={styles.modalCancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveDetails}>
                <Text style={styles.modalSubmitBtnTxt}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 5: ADD / EDIT RUN-SHEET ACTIVITY ──────────── */}
      <Modal visible={showActivityModal} transparent animationType="slide" onRequestClose={() => setShowActivityModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCardTitle}>
                  {editingActivityIndex !== null ? 'Edit Service Activity' : 'Add Service Activity'}
                </Text>
                <Text style={styles.modalCardSub}>Order of Service Timetable</Text>
              </View>
              <TouchableOpacity onPress={() => setShowActivityModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* Presets */}
              <Text style={styles.inputLabel}>Quick Activity Presets</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                {RUNSHEET_PRESETS.map(p => (
                  <TouchableOpacity
                    key={p.name}
                    style={styles.presetChip}
                    onPress={() => setActivityForm(prev => ({
                      ...prev,
                      program: p.name,
                      category: p.category,
                      durationMinutes: p.dur
                    }))}
                  >
                    <Text style={styles.presetChipTxt}>{p.name} ({p.dur}m)</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Activity / Program Title</Text>
              <TextInput
                style={styles.textInput}
                value={activityForm.program}
                onChangeText={t => setActivityForm(prev => ({ ...prev, program: t }))}
                placeholder="e.g. Praise & Worship"
                placeholderTextColor="#94A3B8"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Start Time</Text>
                  <TextInput
                    style={styles.textInput}
                    value={activityForm.startTime}
                    onChangeText={t => setActivityForm(prev => ({ ...prev, startTime: t }))}
                    placeholder="09:30"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Duration (Minutes)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={String(activityForm.durationMinutes || 10)}
                    onChangeText={t => setActivityForm(prev => ({ ...prev, durationMinutes: parseInt(t, 10) || 10 }))}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Assigned Minister / Person</Text>
              <TextInput
                style={styles.textInput}
                value={activityForm.assignedTo}
                onChangeText={t => setActivityForm(prev => ({ ...prev, assignedTo: t }))}
                placeholder="e.g. Bro. David / Worship Team"
                placeholderTextColor="#94A3B8"
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Scripture / Song Reference (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={activityForm.passage || activityForm.songTitle || ''}
                onChangeText={t => setActivityForm(prev => ({ ...prev, passage: t }))}
                placeholder="e.g. Romans 3:17-25"
                placeholderTextColor="#94A3B8"
              />
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowActivityModal(false)}>
                <Text style={styles.modalCancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveActivity}>
                <Text style={styles.modalSubmitBtnTxt}>Save Activity</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2'
  },
  hero: {
    backgroundColor: '#1A2D5A',
    paddingHorizontal: 16,
    paddingBottom: 14
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  heroBackBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  heroPreTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D4AF37',
    letterSpacing: 0.8
  },
  heroMainTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF'
  },
  heroRefreshBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginRight: 8
  },
  heroNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14
  },
  heroNewBtnTxt: {
    color: '#1A2D5A',
    fontSize: 12,
    fontWeight: '800'
  },

  // Carousel
  carouselContainer: {
    gap: 10,
    paddingVertical: 2
  },
  serviceCardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 8,
    paddingRight: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minWidth: 170
  },
  serviceCardChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D4AF37'
  },
  chipDateBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  chipDateBoxActive: {
    backgroundColor: '#1A2D5A'
  },
  chipDayNum: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF'
  },
  chipDayNumActive: {
    color: '#D4AF37'
  },
  chipMonthTxt: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.8)'
  },
  chipMonthTxtActive: {
    color: '#FFFFFF'
  },
  chipTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  chipTitleActive: {
    color: '#1A2D5A'
  },
  chipTime: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)'
  },
  chipTimeActive: {
    color: '#64748B'
  },
  chipStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },

  // Content
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  loadingTxt: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B'
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A2D5A',
    marginTop: 14
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A2D5A',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 18
  },
  emptyCreateBtnTxt: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },

  scrollArea: {
    flex: 1
  },
  scrollContent: {
    padding: 16
  },

  // Active Service Banner
  activeServiceBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6
  },
  activeBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  activeBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6
  },
  activeDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  activeDateBadgeTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E'
  },
  activeTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  activeTimeBadgeTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46'
  },
  statusTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  statusTogglePublished: {
    backgroundColor: '#D1FAE5'
  },
  statusToggleDraft: {
    backgroundColor: '#FEF3C7'
  },
  statusSmallDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusToggleTxt: {
    fontSize: 11,
    fontWeight: '800'
  },
  activeBannerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1A2D5A'
  },
  activeLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3
  },
  activeLocationTxt: {
    fontSize: 11,
    color: '#64748B'
  },
  activeBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  actionBtnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A2D5A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10
  },
  actionBtnEditTxt: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12
  },
  actionBtnShare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10
  },
  actionBtnShareTxt: {
    color: '#059669',
    fontWeight: '800',
    fontSize: 12
  },
  actionBtnDelete: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    marginLeft: 'auto'
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    padding: 3,
    borderRadius: 12,
    marginBottom: 16
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: 9
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  tabItemTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B'
  },
  tabItemTxtActive: {
    color: '#1A2D5A'
  },

  // Team Roster Dept Cards
  deptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden'
  },
  deptHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  deptHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  deptDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  deptTitle: {
    fontSize: 13,
    fontWeight: '800'
  },
  roleList: {
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC'
  },
  roleName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A'
  },
  assignedMemberName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A2D5A'
  },
  unassignedPlaceholder: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  assignedStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  statusConfirmed: {
    backgroundColor: '#D1FAE5'
  },
  statusPending: {
    backgroundColor: '#FEF3C7'
  },
  assignedStatusTxt: {
    fontSize: 9.5,
    fontWeight: '800'
  },
  roleActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  roleAssignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  roleAssignBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1A2D5A'
  },
  roleEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#EFF6FF'
  },
  roleEditBtnTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB'
  },
  roleRemoveBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2'
  },

  // Run Sheet
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A2D5A'
  },
  addSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  addSmallBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E'
  },
  emptyTabCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  emptyTabCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A2D5A',
    marginTop: 10
  },
  emptyTabCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4
  },
  loadTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A2D5A',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 14
  },
  loadTemplateBtnTxt: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12
  },
  runSheetRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  runSheetTimePillar: {
    width: 68,
    alignItems: 'center'
  },
  runSheetTimeTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A2D5A'
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3
  },
  durationAdjTxt: {
    fontSize: 11,
    fontWeight: '900',
    color: '#2563EB',
    paddingHorizontal: 2
  },
  durationMainTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB'
  },
  runSheetProgramTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A'
  },
  runSheetAssignedTxt: {
    fontSize: 11,
    color: '#64748B'
  },
  runSheetMetaTxt: {
    fontSize: 10.5,
    color: '#059669',
    marginTop: 2
  },
  runSheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  reorderBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9'
  },
  reorderDeleteBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    marginLeft: 2
  },

  // Setlist
  setlistSongCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  setlistSongTop: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  setlistSongIndexBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  setlistSongIndexTxt: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1A2D5A'
  },
  setlistSongTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A'
  },
  setlistSongLeader: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1
  },
  setlistActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  setlistBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8
  },
  setlistKeyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  setlistKeyBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E'
  },
  setlistTempoBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  setlistTempoBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46'
  },
  setlistMeterBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  setlistMeterBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B21A8'
  },
  setlistOffertoryBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  setlistOffertoryBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569'
  },
  setlistNotesBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    gap: 2
  },
  setlistNoteTxt: {
    fontSize: 10.5,
    color: '#475569'
  },

  // Sermon Tab Card
  sermonTabCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12
  },
  sermonCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  sermonCardHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A2D5A'
  },
  sermonFieldRow: {
    gap: 2
  },
  sermonFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase'
  },
  sermonFieldVal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A'
  },
  sermonEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 6
  },
  sermonEditBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A2D5A'
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16
  },
  modalContentCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%'
  },
  modalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  modalCardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#1A2D5A'
  },
  modalCardSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B'
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC'
  },
  presetChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 6
  },
  presetChipActive: {
    backgroundColor: '#1A2D5A'
  },
  presetChipTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569'
  },
  presetChipTxtActive: {
    color: '#FFFFFF'
  },
  templatePickerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  templateChoice: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  templateChoiceActive: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFDF5'
  },
  templateChoiceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginTop: 4
  },
  templateChoiceTitleActive: {
    color: '#1A2D5A'
  },
  templateChoiceSub: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center'
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC'
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1A2D5A',
    alignItems: 'center',
    justifyContent: 'center'
  },
  memberAvatarTxt: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },
  memberName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A'
  },
  memberPhone: {
    fontSize: 11,
    color: '#64748B'
  },
  memberSkillBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4
  },
  memberSkillBadgeTxt: {
    fontSize: 9,
    fontWeight: '700',
    color: '#92400E'
  },
  songSuggestionsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4
  },
  songSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6
  },
  songSuggestionTxt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#1A2D5A'
  },
  songSuggestionKey: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D4AF37'
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center'
  },
  modalCancelBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B'
  },
  modalSubmitBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#1A2D5A',
    alignItems: 'center'
  },
  modalSubmitBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF'
  }
});
