import React, { useState, useContext, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  Share,
  Image
} from 'react-native';
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as Notifications from 'expo-notifications';
import { formatDateDisplay, parseLocalDate, toStandardDateString } from '../../utils/DateUtils';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  Plus, 
  Search, 
  Calendar as LucideCalendar, 
  ChevronDown, 
  ChevronLeft, 
  FileText, 
  Calendar as CalendarIcon, 
  Film, 
  Mic2, 
  Image as ImageIcon, 
  Folder, 
  FolderPlus,
  Radio, 
  Clock, 
  Type, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Monitor, 
  ChevronRight, 
  ArrowLeft, 
  ArrowRight,
  X, 
  Bell, 
  Save,
  Send,
  Check,
  User,
  Trash2,
  Upload,
  BookOpen,
  Paperclip
} from 'lucide-react-native';
import { AdminTabContext } from '../../context/AdminTabContext';

import FirestoreService from '../../services/FirestoreService';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';

const { width } = Dimensions.get('window');

const SERMON_CATEGORIES = [
  'Bible Study',
  "Women's Fasting Prayer",
  'Second Saturday Prayer',
  'Sunday Service',
  'All-Night Prayer',
  'Youth Meeting',
  'Revival Meeting',
  'Special Messages',
  'Shorts',
  'Testimonies',
];

const extractYoutubeId = (url: string) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();
  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]+)/);
  return match ? match[1] : cleanUrl;
};

export default function AdminSermonEditor() {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const { setActiveTab, editingData, setEditingData, setTabByName } = useContext(AdminTabContext);
  const [loading, setLoading] = useState(false);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastSavedStatus, setLastSavedStatus] = useState<string>('Published');
  const [savingActionText, setSavingActionText] = useState('Saving Sermon…');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showScheduledDatePicker, setShowScheduledDatePicker] = useState(false);
  const [showScheduledTimePicker, setShowScheduledTimePicker] = useState(false);
  const [audioFile, setAudioFile] = useState<any>(null);
  const [thumbnailFile, setThumbnailFile] = useState<any>(null);
  const [notesFile, setNotesFile] = useState<any>(null);
  const [notesUrl, setNotesUrl] = useState<string>('');
  const [notesFileName, setNotesFileName] = useState<string>('');
  const [notesFileType, setNotesFileType] = useState<string>('');
  const [notesText, setNotesText] = useState<string>('');
  const [notesFileSize, setNotesFileSize] = useState<number | undefined>(undefined);
  
  const [form, setForm] = useState({
    titleEn: '',
    titleTe: '',
    pastor: '',
    date: toStandardDateString(new Date()),
    ref: '',
    duration: '',
    youtubeId: '',
    description: '',
    thumbnailUrl: '',
    status: 'Published',
    scheduledDate: (() => {
      const now = new Date();
      if (now.getHours() >= 20) now.setDate(now.getDate() + 1);
      return toStandardDateString(now);
    })(),
    scheduledTime: (() => {
      const now = new Date();
      return now.getHours() >= 20 ? '09:00 AM' : '08:00 PM';
    })(),
    scheduledPublishAt: '',
    notifyMembers: true,
    autoSend: false
  });
  const [categories, setCategories] = useState<string[]>(SERMON_CATEGORIES);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    FirestoreService.getSermonCategories().then(cats => {
      if (Array.isArray(cats) && cats.length > 0) {
        setCategories(cats);
      }
    }).catch(err => console.warn('Could not fetch sermon categories:', err));
  }, []);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleAddNewCategory = async () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Please enter a category name.');
      return;
    }

    const existingMatch = categories.find(c => c.toLowerCase() === trimmed.toLowerCase());
    if (existingMatch) {
      if (!selectedCategories.includes(existingMatch)) {
        setSelectedCategories(prev => [...prev, existingMatch]);
      }
      setShowNewCategoryModal(false);
      setNewCatInput('');
      return;
    }

    setSavingCategory(true);
    try {
      const updated = await FirestoreService.addSermonCategory(trimmed);
      setCategories(updated);
      setSelectedCategories(prev => [...prev, trimmed]);
      setShowNewCategoryModal(false);
      setNewCatInput('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save category. Please try again.');
    } finally {
      setSavingCategory(false);
    }
  };

  useEffect(() => {
    if (editingData) {
      setForm(prev => ({
        ...prev,
        titleEn: editingData.title || '',
        titleTe: editingData.titleTelugu || '',
        pastor: editingData.pastor || '',
        date: editingData.date ? toStandardDateString(editingData.date) : toStandardDateString(new Date()),
        ref: editingData.scripture || '',
        duration: editingData.duration || '45 mins',
        youtubeId: editingData.youtubeId || '',
        description: editingData.description || '',
        thumbnailUrl: editingData.thumbnailUrl || editingData.imageUrl || '',
        status: editingData.status || 'Published',
        scheduledDate: editingData.scheduledDate 
          ? toStandardDateString(editingData.scheduledDate) 
          : (editingData.status === 'Scheduled' && editingData.date ? toStandardDateString(editingData.date) : toStandardDateString(new Date())),
        scheduledTime: editingData.scheduledTime || '08:00 PM',
        scheduledPublishAt: editingData.scheduledPublishAt || '',
      }));
      setNotesUrl(editingData.notesUrl || '');
      setNotesFileName(editingData.notesFileName || '');
      setNotesFileType(editingData.notesFileType || '');
      setNotesText(editingData.notesText || '');
      setNotesFileSize(editingData.notesFileSize);
      setNotesFile(null);
      // Load existing categories
      if (editingData.categories) {
        const loaded = typeof editingData.categories === 'string'
          ? editingData.categories.split(';').map((c: string) => c.trim()).filter(Boolean)
          : editingData.categories;
        setSelectedCategories(loaded);
        setCategories(prev => {
          const merged = [...prev];
          loaded.forEach((c: string) => {
            if (!merged.includes(c)) merged.push(c);
          });
          return merged;
        });
      }
    } else {
      setNotesUrl('');
      setNotesFileName('');
      setNotesFileType('');
      setNotesText('');
      setNotesFileSize(undefined);
      setNotesFile(null);
    }
  }, [editingData]);

  const handleAudioPick = async () => {
    try {
      const DocumentPicker = require('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
      if (!res.canceled) setAudioFile(res.assets[0]);
    } catch (err) { 
      console.error('Audio Pick Error:', err);
      Alert.alert("Feature Unavailable", "Audio picking requires a new development build. Please contact your developer.");
    }
  };

  const uploadImageToCloud = async (localUri: string): Promise<string> => {
    try {
      const storage = require('@react-native-firebase/storage').default;
      const churchId = await FirestoreService.getChurchId();
      const ext = localUri.substring(localUri.lastIndexOf('.') + 1) || 'jpg';
      const storagePath = `Rhema Church/${churchId || 'common'}/sermons/thumbnails/thumb_${Date.now()}.${ext}`;
      
      const reference = storage().ref(storagePath);
      await reference.putFile(localUri);
      const downloadURL = await reference.getDownloadURL();
      return downloadURL;
    } catch (error) {
      console.error('Storage upload failed:', error);
      throw new Error('Cloud upload failed');
    }
  };

  const handleImagePick = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [16, 9], quality: 0.8 });
      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        const localUri = res.assets[0].uri;
        setThumbnailFile(res.assets[0]);
        setUploadingThumbnail(true);
        try {
          const cloudUrl = await uploadImageToCloud(localUri);
          setForm(prev => ({ ...prev, thumbnailUrl: cloudUrl }));
        } catch (uploadErr) {
          Alert.alert("Upload Failed", "Could not upload thumbnail to cloud storage. Please check your connection.");
        } finally {
          setUploadingThumbnail(false);
        }
      }
    } catch (err) { 
      console.error('Image Pick Error:', err);
      Alert.alert("Feature Unavailable", "Image picking requires a new development build. Please contact your developer.");
    }
  };

  const uploadNotesToCloud = async (localUri: string, fileName: string): Promise<string> => {
    try {
      const storage = require('@react-native-firebase/storage').default;
      const churchId = await FirestoreService.getChurchId();
      const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `Rhema Church/${churchId || 'common'}/sermons/notes/${Date.now()}_${cleanName}`;
      
      const reference = storage().ref(storagePath);
      try {
        await reference.putFile(localUri);
      } catch (putErr) {
        const res = await fetch(localUri);
        const blob = await res.blob();
        await reference.put(blob);
      }
      const downloadURL = await reference.getDownloadURL();
      return downloadURL;
    } catch (error) {
      console.error('Notes upload failed:', error);
      throw new Error('Cloud notes upload failed');
    }
  };

  const handlePickNotesDocument = async () => {
    try {
      const DocumentPicker = require('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          '*/*'
        ],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const name = asset.name || 'sermon_notes';
        const ext = name.split('.').pop()?.toLowerCase() || '';

        if (!['pdf', 'doc', 'docx', 'txt'].includes(ext)) {
          Alert.alert(
            'Unsupported File Format',
            'Please select a PDF (.pdf), Word document (.doc, .docx), or Text document (.txt).'
          );
          return;
        }

        // Max file size limit: 20 MB
        const MAX_DOC_SIZE_BYTES = 20 * 1024 * 1024;
        if (asset.size && asset.size > MAX_DOC_SIZE_BYTES) {
          Alert.alert(
            'Document Limit Exceeded',
            `The selected file is ${(asset.size / (1024 * 1024)).toFixed(1)} MB. The maximum allowed file size for sermon notes is 20 MB. Please upload a file within 20 MB.`
          );
          return;
        }

        let fType = 'pdf';
        if (ext === 'doc' || ext === 'docx') fType = ext;
        else if (ext === 'txt') fType = 'txt';

        setNotesFile(asset);
        setNotesFileName(name);
        setNotesFileType(fType);
        setNotesFileSize(asset.size);

        if (ext === 'txt') {
          try {
            let text = '';
            try {
              const { readAsStringAsync } = require('expo-file-system/legacy');
              text = await readAsStringAsync(asset.uri);
            } catch (e1) {
              const resp = await fetch(asset.uri);
              text = await resp.text();
            }
            if (text) {
              setNotesText(text);
            }
          } catch (textErr) {
            console.warn('Could not read txt file content:', textErr);
          }
        } else {
          setNotesText('');
        }
      }
    } catch (err: any) {
      console.error('Pick Document Error:', err);
      Alert.alert('Error', 'Unable to pick document. Please try again.');
    }
  };

  const handleRemoveNotes = () => {
    setNotesFile(null);
    setNotesUrl('');
    setNotesFileName('');
    setNotesFileType('');
    setNotesText('');
    setNotesFileSize(undefined);
  };

  const handleConfirmSermonDate = (date: Date) => {
    const formattedDate = toStandardDateString(date);
    setForm(prev => ({ ...prev, date: formattedDate }));
    setShowDatePicker(false);
  };

  const handleConfirmScheduledDate = (date: Date) => {
    const formattedDate = toStandardDateString(date);
    setForm(prev => ({ ...prev, scheduledDate: formattedDate }));
    setShowScheduledDatePicker(false);
  };

  const handleConfirmScheduledTime = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
    setForm(prev => ({ ...prev, scheduledTime: strTime }));
    setShowScheduledTimePicker(false);
  };

  const setPresetTonight = () => {
    setForm(prev => ({
      ...prev,
      scheduledDate: toStandardDateString(new Date()),
      scheduledTime: '08:00 PM'
    }));
  };

  const setPresetTomorrowMorning = () => {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    setForm(prev => ({
      ...prev,
      scheduledDate: toStandardDateString(tmrw),
      scheduledTime: '09:00 AM'
    }));
  };

  const setPresetTomorrowNight = () => {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    setForm(prev => ({
      ...prev,
      scheduledDate: toStandardDateString(tmrw),
      scheduledTime: '08:00 PM'
    }));
  };

  const isTomorrow = (dateStr: string) => {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    return toStandardDateString(dateStr) === toStandardDateString(tmrw);
  };

  const isToday = (dateStr: string) => {
    return toStandardDateString(dateStr) === toStandardDateString(new Date());
  };

  const computeScheduledPublishAt = (schedDateStr: string, schedTimeStr: string): string => {
    const cleanDate = toStandardDateString(schedDateStr) || toStandardDateString(new Date());
    const timeMatch = String(schedTimeStr || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    let hours = 20;
    let mins = 0;
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      mins = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[3]?.toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
    }
    const [y, m, d] = cleanDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d, hours, mins, 0);
    return dt.toISOString();
  };

  const handleSave = async (status: string) => {
    const finalStatus = status || form.status || 'Published';
    setLastSavedStatus(finalStatus);
    setSavingActionText(
      finalStatus === 'Published' 
        ? 'Publishing Sermon…' 
        : finalStatus === 'Scheduled' 
        ? 'Scheduling Sermon…' 
        : 'Saving Sermon Draft…'
    );
    setLoading(true);
    let finalNotesUrl = notesUrl;
    if (notesFile) {
      setSavingActionText('Uploading Sermon Notes…');
      try {
        finalNotesUrl = await uploadNotesToCloud(notesFile.uri, notesFileName || notesFile.name);
        setNotesUrl(finalNotesUrl);
      } catch (notesErr) {
        console.warn('Could not upload sermon notes document:', notesErr);
        Alert.alert('Notes Upload Warning', 'Failed to upload sermon notes document to cloud storage. Saving sermon without notes.');
        finalNotesUrl = '';
      }
    }

    try {
      const finalScheduledPublishAt = finalStatus === 'Scheduled' 
        ? computeScheduledPublishAt(form.scheduledDate, form.scheduledTime)
        : '';

      const payload: any = {
        id: editingData?.id,
        ...form,
        title: form.titleEn,
        titleTelugu: form.titleTe,
        status: finalStatus,
        date: form.date, // Actual preaching/service date (e.g. 2026-10-25)
        scheduledDate: finalStatus === 'Scheduled' ? form.scheduledDate : null,
        scheduledTime: finalStatus === 'Scheduled' ? form.scheduledTime : null,
        scheduledPublishAt: finalScheduledPublishAt || null,
        notificationSent: finalStatus === 'Published',
        publishedAt: finalStatus === 'Published' ? (editingData?.publishedAt || new Date().toISOString()) : null,
        scripture: form.ref,
        categories: selectedCategories.join(';'),
        thumbnailUrl: form.thumbnailUrl || '',
        imageUrl: form.thumbnailUrl || '',
        notesUrl: finalNotesUrl || '',
        notesFileName: notesFileName || '',
        notesFileType: notesFileType || '',
        notesText: notesText || '',
        notesFileSize: notesFileSize || 0,
      };
      const savedSermonId = await FirestoreService.createSermon(payload);

      // 🔔 Push notification handling
      if (payload.status === 'Published') {
        try {
          const churchId = await FirestoreService.getChurchId();
          const todayIsoStr = toStandardDateString(new Date());
          await FirestoreService.createNotificationBroadcast({
            title: `🎧 New Sermon: ${form.titleEn}`,
            content: `New sermon "${form.titleEn}" preached on ${formatDateDisplay(form.date)} by ${form.pastor || 'Pastor'} is now available. Watch/listen now!`,
            date: todayIsoStr,
            sermonDate: form.date,
            type: 'sermon',
            targetChurchId: churchId,
            sermonId: savedSermonId,
            imageUrl: payload.thumbnailUrl || payload.imageUrl || '',
            screen: 'SermonVideo',
          });
          console.log('🔔 Sermon push notification queued.');
        } catch (notifErr) {
          console.warn('⚠️ Sermon push notification failed:', notifErr);
        }
      } else if (payload.status === 'Scheduled' && finalScheduledPublishAt) {
        try {
          const targetDate = new Date(finalScheduledPublishAt);
          if (targetDate.getTime() <= Date.now()) {
            // Already due: immediately auto-publish
            await FirestoreService.autoPublishDueScheduledSermons();
          }
        } catch (schedErr) {
          console.warn('⚠️ Could not check scheduled sermon:', schedErr);
        }
      }

      setForm(prev => ({ ...prev, status: finalStatus }));
      setShowSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save sermon. Please check your connection.');
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  const closeSuccess = () => {
    setShowSuccess(false);
    setTabByName?.('Sermons');
  };

  const cleanYId = extractYoutubeId(form.youtubeId || '');
  const autoYoutubeThumb = cleanYId && cleanYId.length === 11 ? `https://img.youtube.com/vi/${cleanYId}/hqdefault.jpg` : null;
  const currentThumbnailUri = form.thumbnailUrl || (thumbnailFile ? thumbnailFile.uri : null);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── Hero Section (Top Mini Card Header) ── */}
      <View style={[styles.hero, {
        backgroundColor: isDark ? '#000000' : '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#27272A' : '#E2E8F0',
        paddingBottom: 14,
        marginBottom: 8
      }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => setTabByName?.('Sermons')}
            style={[
              styles.circularBackBtn,
              {
                backgroundColor: isDark ? '#000000' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#E2E8F0',
                borderWidth: 1.5,
              }
            ]}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2.2} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text
              style={[
                styles.heroTitle,
                {
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  textAlign: 'center',
                  fontSize: 22,
                  fontWeight: '800',
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                  letterSpacing: -0.4,
                }
              ]}
              numberOfLines={1}
            >
              {editingData ? 'Edit Sermon' : 'New Sermon'}
            </Text>
            <Text style={[styles.heroSub, { color: isDark ? '#A1A1AA' : '#64748B', textAlign: 'center', marginTop: 3, fontSize: 12.5 }]}>
              {editingData ? 'Update sermon details & media' : 'Create & publish sermon video'}
            </Text>
          </View>

          {/* Symmetrical placeholder balancing back button */}
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* 1. Sermon Info */}
        <View style={[styles.modBox, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#E2E8F0', borderWidth: 1.5 }]}>
          <View style={[styles.modHd, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
            <FileText size={15} color={isDark ? '#F2F0E8' : '#202923'} />
            <Text style={[styles.modHdTxt, { color: isDark ? '#F2F0E8' : '#202923' }]}>Sermon Info</Text>
          </View>
          
          <View style={styles.fGroup}>
            <Text style={[styles.fLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Title — English <Text style={{color:'#c0392b'}}>*</Text></Text>
            <TextInput 
              style={[styles.input, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, color: isDark ? '#FFFFFF' : '#0F172A', elevation: 0, shadowOpacity: 0 }]} 
              value={form.titleEn} 
              onChangeText={(v) => setForm({...form, titleEn: v})} 
              placeholder="e.g. Walking in Faith Through Trials" 
              placeholderTextColor={isDark ? '#A1A1AA' : '#64748B'} 
            />
          </View>

          <View style={styles.fGroup}>
            <Text style={[styles.fLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Title — Telugu</Text>
            <TextInput 
              style={[styles.input, styles.teIn, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, color: isDark ? '#FFFFFF' : '#0F172A', elevation: 0, shadowOpacity: 0 }]} 
              value={form.titleTe} 
              onChangeText={(v) => setForm({...form, titleTe: v})} 
              placeholder="తెలుగులో శీర్షిక..." 
              placeholderTextColor={isDark ? '#A1A1AA' : '#64748B'} 
            />
          </View>

          <View style={styles.fGroup}>
            <Text style={[styles.fLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Pastor Name <Text style={{color:'#c0392b'}}>*</Text></Text>
            <TextInput 
              style={[styles.input, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, color: isDark ? '#FFFFFF' : '#0F172A', elevation: 0, shadowOpacity: 0 }]} 
              value={form.pastor} 
              onChangeText={(v) => setForm({...form, pastor: v})} 
              placeholder="e.g. Pastor Daniel Raju" 
              placeholderTextColor={isDark ? '#A1A1AA' : '#64748B'} 
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.fGroup, { flex: 1.8 }]}>
              <Text style={[styles.fLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                Sermon Date <Text style={{ color: '#c0392b' }}>*</Text>
              </Text>
              <TouchableOpacity 
                style={[styles.inputWithIcon, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, elevation: 0, shadowOpacity: 0 }]} 
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.inputTxt, { flex: 1, fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                  {formatDateDisplay(form.date)}
                </Text>
                <CalendarIcon size={16} color={isDark ? '#E2E8F0' : '#0F172A'} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
              <Text style={[styles.fHelper, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                Actual date the service or sermon took place (e.g. 25-10-2026). Displayed to members on the sermon card.
              </Text>
            </View>

            <View style={[styles.fGroup, { flex: 1.2 }]}>
              <Text style={[styles.fLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Duration</Text>
              <TextInput 
                style={[styles.input, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, color: isDark ? '#FFFFFF' : '#0F172A', elevation: 0, shadowOpacity: 0 }]} 
                value={form.duration} 
                onChangeText={(v) => setForm({ ...form, duration: v })} 
                placeholder="e.g. 42 min" 
                placeholderTextColor={isDark ? '#A1A1AA' : '#64748B'} 
              />
              <Text style={[styles.fHelper, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                Length in minutes or hours (e.g. 120 min).
              </Text>
            </View>
          </View>

          <DateTimePickerModal
            isVisible={showDatePicker}
            mode="date"
            onConfirm={handleConfirmSermonDate}
            onCancel={() => setShowDatePicker(false)}
            date={parseLocalDate(form.date)}
          />

          <View style={styles.fGroup}>
            <Text style={[styles.fLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Scripture reference</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, color: isDark ? '#FFFFFF' : '#0F172A', elevation: 0, shadowOpacity: 0 }]} 
              value={form.ref} 
              onChangeText={(v) => setForm({...form, ref: v})} 
              placeholder="e.g. James 1:2-4" 
              placeholderTextColor={isDark ? '#A1A1AA' : '#64748B'} 
            />
          </View>
        </View>

        {/* Categories */}
        <View style={[styles.modBox, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#E2E8F0', borderWidth: 1.5 }]}>
          <View style={[styles.modHd, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
            <Folder size={15} color={isDark ? '#C6A66B' : '#98713D'} />
            <Text style={[styles.modHdTxt, { color: isDark ? '#C6A66B' : '#98713D' }]}>Sermon Category</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {categories.map(cat => {
              const isSelected = selectedCategories.includes(cat);
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => toggleCategory(cat)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: isSelected 
                      ? (isDark ? '#FFFFFF' : '#000000') 
                      : (isDark ? 'rgba(255,255,255,0.18)' : '#CBD5E1'),
                    backgroundColor: isSelected 
                      ? (isDark ? '#FFFFFF' : '#000000') 
                      : (isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF'),
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {isSelected && <CheckCircle2 size={13} color={isDark ? '#000000' : '#FCD34D'} />}
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : (isDark ? '#E4E4E7' : '#374151') }}>{cat}</Text>
                </TouchableOpacity>
              );
            })}

            {/* + New Category Button */}
            <TouchableOpacity
              onPress={() => setShowNewCategoryModal(true)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: isDark ? 'rgba(255,255,255,0.35)' : '#64748B',
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Plus size={14} color={isDark ? '#FFFFFF' : '#0F172A'} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#FFFFFF' : '#0F172A' }}>New</Text>
            </TouchableOpacity>
          </View>
          {selectedCategories.length > 0 && (
            <View style={{ 
              marginTop: 14, 
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : '#F1F5F9', 
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
              borderRadius: 10, 
              padding: 10 
            }}>
              <Text style={{ fontSize: 11, color: isDark ? '#F1F5F9' : '#0F172A', fontWeight: '600' }}>Selected: {selectedCategories.join(' · ')}</Text>
            </View>
          )}
        </View>

        {/* 2. Media & Details */}
        <View style={[styles.modBox, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#E2E8F0', borderWidth: 1.5 }]}>
          <View style={[styles.modHd, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
            <Film size={15} color={isDark ? '#B9C8BD' : '#315C50'} />
            <Text style={[styles.modHdTxt, { color: isDark ? '#B9C8BD' : '#315C50' }]}>Media & Details</Text>
          </View>

          <View style={styles.fGroup}>
            <Text style={[styles.fLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>YouTube video URL</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, color: isDark ? '#FFFFFF' : '#0F172A', elevation: 0, shadowOpacity: 0 }]} 
              value={form.youtubeId} 
              onChangeText={(v) => setForm({...form, youtubeId: v})} 
              placeholder="https://youtube.com/watch?v=..." 
              placeholderTextColor={isDark ? '#A1A1AA' : '#64748B'} 
            />
            <Text style={[styles.fHint, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Paste full URL or 11-character video ID</Text>
          </View>

          <View style={styles.fGroup}>
            <Text style={[styles.fLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Thumbnail <Text style={[styles.fHint, { color: isDark ? '#A1A1AA' : '#64748B' }]}>16:9 Landscape Banner</Text></Text>
            {uploadingThumbnail ? (
              <View style={[styles.dashBox, { height: 160, justifyContent: 'center', alignItems: 'center', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#CBD5E1', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC' }]}>
                <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#0F172A'} />
                <Text style={[styles.dashTxt, { marginTop: 10, color: isDark ? '#FFFFFF' : '#0F172A' }]}>Uploading thumbnail to cloud...</Text>
              </View>
            ) : currentThumbnailUri ? (
              <View style={[styles.thumbPreviewCard, { borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#E2E8F0' }]}>
                <Image 
                  source={{ uri: currentThumbnailUri }} 
                  style={styles.thumbPreviewImg} 
                  resizeMode="cover" 
                />
                <View style={styles.thumbOverlayBar}>
                  <TouchableOpacity style={styles.thumbBtnEdit} onPress={handleImagePick}>
                    <ImageIcon size={13} color="#fff" />
                    <Text style={styles.thumbBtnTxt}>Change Image</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.thumbBtnDelete} 
                    onPress={() => {
                      setThumbnailFile(null);
                      setForm(prev => ({ ...prev, thumbnailUrl: '' }));
                    }}
                  >
                    <X size={13} color="#fff" />
                    <Text style={styles.thumbBtnTxt}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : autoYoutubeThumb ? (
              <View style={[styles.thumbPreviewCard, { borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#E2E8F0' }]}>
                <Image 
                  source={{ uri: autoYoutubeThumb }} 
                  style={styles.thumbPreviewImg} 
                  resizeMode="cover" 
                />
                <View style={styles.thumbYoutubeBadge}>
                  <Text style={styles.thumbYoutubeBadgeTxt}>📺 Auto-fetched from YouTube</Text>
                </View>
                <TouchableOpacity 
                  style={[
                    styles.thumbBtnUploadCustom, 
                    { 
                      backgroundColor: isDark ? '#27272A' : '#FFFFFF',
                      borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#CBD5E1',
                      borderWidth: 1
                    }
                  ]} 
                  onPress={handleImagePick}
                >
                  <ImageIcon size={13} color={isDark ? '#FFFFFF' : '#0F172A'} />
                  <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 11, fontWeight: '700' }}>Upload Custom Thumbnail</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={[
                  styles.dashBox, 
                  { 
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#CBD5E1', 
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC' 
                  }
                ]} 
                onPress={handleImagePick}
              >
                <ImageIcon size={26} color={isDark ? '#A1A1AA' : '#9CA3AF'} />
                <Text style={[styles.dashTxt, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Upload custom thumbnail</Text>
                <Text style={[styles.dashHint, { color: isDark ? '#A1A1AA' : '#64748B' }]}>JPG or PNG — 16:9 recommended</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.fGroup}>
            <Text style={[styles.fLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Description <Text style={[styles.fHint, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Shown below title in app</Text></Text>
            <TextInput 
              style={[styles.input, styles.textarea, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, color: isDark ? '#FFFFFF' : '#0F172A', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12.5, elevation: 0, shadowOpacity: 0 }]} 
              multiline 
              numberOfLines={3} 
              value={form.description} 
              onChangeText={(v) => setForm({...form, description: v})} 
              placeholder="Brief summary of this sermon..." 
              placeholderTextColor={isDark ? '#A1A1AA' : '#64748B'} 
            />
          </View>
        </View>

        {/* 3. Sermon Notes Document */}
        <View style={[styles.modBox, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#E2E8F0', borderWidth: 1.5 }]}>
          <View style={[styles.modHd, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
            <BookOpen size={15} color={isDark ? '#B8A5D6' : '#79649B'} />
            <Text style={[styles.modHdTxt, { color: isDark ? '#B8A5D6' : '#79649B' }]}>Sermon Notes Document</Text>
            <View style={[styles.optionalBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9', borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#E2E8F0' }]}>
              <Text style={[styles.optionalBadgeTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Optional</Text>
            </View>
          </View>

          <Text style={[styles.notesSectionSubtitle, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
            Attach sermon notes or study outline in PDF, Word, or Text format (Max 20 MB). Members can read these notes directly inside the app while watching.
          </Text>

          {/* Format pills */}
          <View style={styles.formatPillsRow}>
            <View style={[styles.formatPill, { borderColor: isDark ? 'rgba(239,68,68,0.4)' : '#FCA5A5', backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2' }]}>
              <Text style={[styles.formatPillTxt, { color: '#DC2626' }]}>PDF</Text>
              <Text style={[styles.formatPillExt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>.pdf</Text>
            </View>
            <View style={[styles.formatPill, { borderColor: isDark ? 'rgba(59,130,246,0.4)' : '#93C5FD', backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : '#EFF6FF' }]}>
              <Text style={[styles.formatPillTxt, { color: '#2563EB' }]}>Word</Text>
              <Text style={[styles.formatPillExt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>.doc, .docx</Text>
            </View>
            <View style={[styles.formatPill, { borderColor: isDark ? 'rgba(34,197,94,0.4)' : '#86EFAC', backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4' }]}>
              <Text style={[styles.formatPillTxt, { color: '#16A34A' }]}>Text</Text>
              <Text style={[styles.formatPillExt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>.txt</Text>
            </View>
          </View>

          {notesFileName || notesUrl || notesFile ? (
            <View style={[styles.notesDocCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0' }]}>
              <View style={styles.notesDocHeader}>
                <View style={[
                  styles.notesDocTypeBadge,
                  notesFileType === 'pdf' ? { backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2', borderColor: isDark ? 'rgba(239,68,68,0.4)' : '#FCA5A5' } :
                  (notesFileType === 'doc' || notesFileType === 'docx') ? { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : '#DBEAFE', borderColor: isDark ? 'rgba(59,130,246,0.4)' : '#93C5FD' } :
                  { backgroundColor: isDark ? 'rgba(34,197,94,0.2)' : '#DCFCE7', borderColor: isDark ? 'rgba(34,197,94,0.4)' : '#86EFAC' }
                ]}>
                  <Text style={[
                    styles.notesDocTypeTxt,
                    notesFileType === 'pdf' ? { color: '#DC2626' } :
                    (notesFileType === 'doc' || notesFileType === 'docx') ? { color: '#2563EB' } :
                    { color: '#16A34A' }
                  ]}>
                    {(notesFileType || 'DOC').toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notesDocName, { color: isDark ? '#FFFFFF' : '#1E293B' }]} numberOfLines={1}>{notesFileName || 'Sermon_Notes'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {notesFileSize ? (
                      <Text style={[styles.notesDocMeta, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{(notesFileSize / 1024).toFixed(0)} KB · </Text>
                    ) : null}
                    <Text style={[styles.notesDocMeta, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                      {notesFile ? 'Ready to upload on save' : 'Uploaded to Cloud'}
                    </Text>
                    <CheckCircle2 size={11} color="#059669" />
                  </View>
                </View>
              </View>

              {notesText ? (
                <View style={[styles.notesTextPreviewBox, { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.3)' : '#F8FAFC', borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]}>
                  <Text style={[styles.notesTextPreviewLabel, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Text Content Preview:</Text>
                  <Text style={[styles.notesTextPreviewContent, { color: isDark ? '#E4E4E7' : '#334155' }]} numberOfLines={3}>
                    {notesText}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.notesDocActions, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
                <TouchableOpacity 
                  style={[styles.notesDocChangeBtn, { backgroundColor: isDark ? '#27272A' : '#F0F4FF' }]} 
                  onPress={handlePickNotesDocument}
                >
                  <Paperclip size={13} color={isDark ? '#93C5FD' : '#1a2d5a'} />
                  <Text style={[styles.notesDocChangeBtnTxt, { color: isDark ? '#93C5FD' : '#1a2d5a' }]}>Replace Document</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.notesDocRemoveBtn} 
                  onPress={handleRemoveNotes}
                >
                  <Trash2 size={13} color="#DC2626" />
                  <Text style={styles.notesDocRemoveBtnTxt}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={[
                styles.notesUploadDashedBox,
                {
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#CBD5E1',
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
                }
              ]} 
              onPress={handlePickNotesDocument}
            >
              <View style={[
                styles.notesUploadIconCircle,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.09)' : '#EEF2FF' }
              ]}>
                <Upload size={20} color={isDark ? '#FFFFFF' : '#1a2d5a'} />
              </View>
              <Text style={[styles.notesUploadTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Choose Sermon Notes Document</Text>
              <Text style={[styles.notesUploadSubtitle, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                Tap to select PDF, Word (.doc, .docx), or Text (.txt) file · Up to 20 MB
              </Text>
              <View style={[
                styles.notesUploadButton,
                { 
                  backgroundColor: isDark ? '#27272A' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#CBD5E1',
                  borderWidth: 1.2
                }
              ]}>
                <Paperclip size={13} color={isDark ? '#FFFFFF' : '#0F172A'} />
                <Text style={[styles.notesUploadButtonTxt, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Browse Files (Max 20 MB)</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* 4. Publish Status */}
        <View style={[styles.modBox, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#E2E8F0', borderWidth: 1.5 }]}>
          <View style={[styles.modHd, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
            <Radio size={15} color={isDark ? '#FFFFFF' : '#0F172A'} />
            <Text style={[styles.modHdTxt, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Publish Status</Text>
          </View>
          <View style={styles.statusSelectorContainer}>
            {/* Option 1: Publish Now */}
            <TouchableOpacity
              style={[
                styles.statusOptionCard,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FAFAF9',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2DDD5',
                },
                form.status === 'Published' && [
                  styles.statusOptionCardPublished,
                  { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.14)' : '#F0FDF4' }
                ]
              ]}
              onPress={() => setForm({ ...form, status: 'Published' })}
              activeOpacity={0.8}
            >
              <View style={[
                styles.statusOptionIconBox,
                form.status === 'Published' ? styles.statusOptionIconBoxPublished : { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB' }
              ]}>
                <Send size={15} color={form.status === 'Published' ? '#fff' : (isDark ? '#34D399' : '#059669')} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[
                    styles.statusOptionTitle,
                    { color: isDark ? '#FFFFFF' : '#374151' },
                    form.status === 'Published' && [
                      styles.statusOptionTitlePublished,
                      { color: isDark ? '#34D399' : '#065F46' }
                    ]
                  ]}>
                    Publish Now
                  </Text>
                  {form.status === 'Published' && (
                    <View style={styles.activeDotGreen} />
                  )}
                </View>
                <Text style={[styles.statusOptionSub, { color: isDark ? '#A1A1AA' : '#6B7280' }]}>Live immediately on Member Sermons View</Text>
              </View>
              <View style={[
                styles.statusRadioCircle,
                { borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1' },
                form.status === 'Published' && styles.statusRadioCirclePublished
              ]}>
                {form.status === 'Published' && <Check size={12} color="#fff" strokeWidth={3} />}
              </View>
            </TouchableOpacity>

            {/* Option 2: Scheduled */}
            <TouchableOpacity
              style={[
                styles.statusOptionCard,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FAFAF9',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2DDD5',
                },
                form.status === 'Scheduled' && [
                  styles.statusOptionCardScheduled,
                  { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB' }
                ]
              ]}
              onPress={() => setForm({ ...form, status: 'Scheduled' })}
              activeOpacity={0.8}
            >
              <View style={[
                styles.statusOptionIconBox,
                form.status === 'Scheduled' ? styles.statusOptionIconBoxScheduled : { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB' }
              ]}>
                <Clock size={15} color={form.status === 'Scheduled' ? '#fff' : (isDark ? '#FBBF24' : '#D97706')} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[
                    styles.statusOptionTitle,
                    { color: isDark ? '#FFFFFF' : '#374151' },
                    form.status === 'Scheduled' && [
                      styles.statusOptionTitleScheduled,
                      { color: isDark ? '#FBBF24' : '#92400E' }
                    ]
                  ]}>
                    Scheduled
                  </Text>
                  {form.status === 'Scheduled' && (
                    <View style={styles.activeDotAmber} />
                  )}
                </View>
                <Text style={[styles.statusOptionSub, { color: isDark ? '#A1A1AA' : '#6B7280' }]}>
                  Auto-publishes on {formatDateDisplay(form.scheduledDate)} at {form.scheduledTime}
                </Text>
              </View>
              <View style={[
                styles.statusRadioCircle,
                { borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1' },
                form.status === 'Scheduled' && styles.statusRadioCircleScheduled
              ]}>
                {form.status === 'Scheduled' && <Check size={12} color="#fff" strokeWidth={3} />}
              </View>
            </TouchableOpacity>

            {/* Option 3: Draft */}
            <TouchableOpacity
              style={[
                styles.statusOptionCard,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FAFAF9',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2DDD5',
                },
                form.status === 'Draft' && [
                  styles.statusOptionCardDraft,
                  { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.14)' : '#F8FAFC' }
                ]
              ]}
              onPress={() => setForm({ ...form, status: 'Draft' })}
              activeOpacity={0.8}
            >
              <View style={[
                styles.statusOptionIconBox,
                form.status === 'Draft' ? styles.statusOptionIconBoxDraft : { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB' }
              ]}>
                <FileText size={15} color={form.status === 'Draft' ? '#fff' : (isDark ? '#E2E8F0' : '#475569')} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[
                    styles.statusOptionTitle,
                    { color: isDark ? '#FFFFFF' : '#374151' },
                    form.status === 'Draft' && [
                      styles.statusOptionTitleDraft,
                      { color: isDark ? '#E2E8F0' : '#1E293B' }
                    ]
                  ]}>
                    Save as Draft
                  </Text>
                  {form.status === 'Draft' && (
                    <View style={styles.activeDotSlate} />
                  )}
                </View>
                <Text style={[styles.statusOptionSub, { color: isDark ? '#A1A1AA' : '#6B7280' }]}>Saved privately, hidden from members</Text>
              </View>
              <View style={[
                styles.statusRadioCircle,
                { borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1' },
                form.status === 'Draft' && styles.statusRadioCircleDraft
              ]}>
                {form.status === 'Draft' && <Check size={12} color="#fff" strokeWidth={3} />}
              </View>
            </TouchableOpacity>
          </View>

          {/* Dedicated Future Scheduling Box */}
          {form.status === 'Scheduled' && (
            <View style={[styles.schedBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : '#FFFBEB', borderColor: isDark ? 'rgba(245, 158, 11, 0.28)' : '#FDE68A' }]}>
              <View style={styles.schedHeader}>
                <Clock size={16} color={isDark ? '#FBBF24' : '#B45309'} />
                <Text style={[styles.schedHeaderTitle, { color: isDark ? '#FBBF24' : '#92400E' }]}>Schedule Future Publish Date & Time</Text>
              </View>
              
              <Text style={[styles.schedNotice, { color: isDark ? '#FDE68A' : '#78350F' }]}>
                Sermon Date: <Text style={{ fontWeight: '700', color: isDark ? '#60A5FA' : '#1a2d5a' }}>{formatDateDisplay(form.date)}</Text> (when service took place).
                {`\n`}Choose when this video should be published and announced to members:
              </Text>

              {/* Quick Presets */}
              <View style={styles.presetChipsRow}>
                <TouchableOpacity 
                  style={[
                    styles.presetChip,
                    { backgroundColor: isDark ? '#27272A' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#FCD34D' },
                    isToday(form.scheduledDate) && form.scheduledTime === '08:00 PM' && styles.presetChipActive
                  ]}
                  onPress={setPresetTonight}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.presetChipTxt,
                    { color: isDark ? '#FDE68A' : '#92400E' },
                    isToday(form.scheduledDate) && form.scheduledTime === '08:00 PM' && styles.presetChipTxtActive
                  ]}>
                    🌙 Tonight (8:00 PM)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[
                    styles.presetChip,
                    { backgroundColor: isDark ? '#27272A' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#FCD34D' },
                    isTomorrow(form.scheduledDate) && form.scheduledTime === '09:00 AM' && styles.presetChipActive
                  ]}
                  onPress={setPresetTomorrowMorning}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.presetChipTxt,
                    { color: isDark ? '#FDE68A' : '#92400E' },
                    isTomorrow(form.scheduledDate) && form.scheduledTime === '09:00 AM' && styles.presetChipTxtActive
                  ]}>
                    🌅 Tomorrow (9:00 AM)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[
                    styles.presetChip,
                    { backgroundColor: isDark ? '#27272A' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#FCD34D' },
                    isTomorrow(form.scheduledDate) && form.scheduledTime === '08:00 PM' && styles.presetChipActive
                  ]}
                  onPress={setPresetTomorrowNight}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.presetChipTxt,
                    { color: isDark ? '#FDE68A' : '#92400E' },
                    isTomorrow(form.scheduledDate) && form.scheduledTime === '08:00 PM' && styles.presetChipTxtActive
                  ]}>
                    ☀️ Tomorrow (8:00 PM)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Independent Date & Time Inputs */}
              <View style={styles.schedInputsRow}>
                <View style={{ flex: 1.2 }}>
                  <Text style={[styles.schedFieldLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Scheduled Publish Date</Text>
                  <TouchableOpacity 
                    style={[styles.schedInputBtn, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, elevation: 0, shadowOpacity: 0 }]} 
                    onPress={() => setShowScheduledDatePicker(true)}
                    activeOpacity={0.75}
                  >
                    <CalendarIcon size={15} color={isDark ? '#FBBF24' : '#0F172A'} />
                    <Text style={[styles.schedInputBtnTxt, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                      {formatDateDisplay(form.scheduledDate)}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.schedFieldLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Scheduled Publish Time</Text>
                  <TouchableOpacity 
                    style={[styles.schedInputBtn, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, elevation: 0, shadowOpacity: 0 }]} 
                    onPress={() => setShowScheduledTimePicker(true)}
                    activeOpacity={0.75}
                  >
                    <Clock size={15} color={isDark ? '#FBBF24' : '#0F172A'} />
                    <Text style={[styles.schedInputBtnTxt, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                      {form.scheduledTime}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.schedStatusCallout, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4', borderColor: isDark ? 'rgba(16, 185, 129, 0.28)' : '#BBF7D0' }]}>
                <CheckCircle2 size={14} color="#059669" />
                <Text style={[styles.schedStatusCalloutTxt, { color: isDark ? '#34D399' : '#166534' }]}>
                  Auto-publishes on {formatDateDisplay(form.scheduledDate)} at {form.scheduledTime}. Members will receive push notifications then.
                </Text>
              </View>
            </View>
          )}

          {/* Scheduled Publish Date & Time Pickers */}
          <DateTimePickerModal
            isVisible={showScheduledDatePicker}
            mode="date"
            onConfirm={handleConfirmScheduledDate}
            onCancel={() => setShowScheduledDatePicker(false)}
            date={parseLocalDate(form.scheduledDate)}
          />

          <DateTimePickerModal
            isVisible={showScheduledTimePicker}
            mode="time"
            onConfirm={handleConfirmScheduledTime}
            onCancel={() => setShowScheduledTimePicker(false)}
            date={parseLocalDate(form.scheduledDate)}
          />
        </View>

        {/* Footer Action Buttons */}
        <View style={styles.footerBtnRow}>
          {form.status === 'Published' ? (
            <>
              {/* Row 1: Save & Publish Now (White in Dark theme, Black in White theme) */}
              <TouchableOpacity 
                style={[
                  styles.btnSave, 
                  { 
                    backgroundColor: isDark ? '#FFFFFF' : '#000000',
                    borderColor: isDark ? '#FFFFFF' : '#000000',
                    borderWidth: 1.5,
                  }, 
                  loading && { opacity: 0.85 }
                ]} 
                onPress={() => handleSave('Published')}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                ) : (
                  <Send size={16} color={isDark ? '#000000' : '#FFFFFF'} />
                )}
                <Text style={[styles.btnSaveTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                  {loading ? 'Publishing…' : 'Save & Publish Now'}
                </Text>
              </TouchableOpacity>

              {/* Row 2: Save as Draft (Highlighted) */}
              <TouchableOpacity 
                style={[
                  styles.btnDraft, 
                  { 
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
                    borderColor: isDark ? '#FFFFFF' : '#000000',
                    borderWidth: 2,
                  }
                ]} 
                onPress={() => handleSave('Draft')}
                disabled={loading}
                activeOpacity={0.8}
              >
                <FileText size={16} color={isDark ? '#FFFFFF' : '#000000'} />
                <Text style={[styles.btnDraftTxt, { color: isDark ? '#FFFFFF' : '#000000' }]}>Save as Draft</Text>
              </TouchableOpacity>
            </>
          ) : form.status === 'Scheduled' ? (
            <>
              {/* Row 1: Save & Schedule (White in Dark theme, Black in White theme) */}
              <TouchableOpacity 
                style={[
                  styles.btnSave, 
                  { 
                    backgroundColor: isDark ? '#FFFFFF' : '#000000',
                    borderColor: isDark ? '#FFFFFF' : '#000000',
                    borderWidth: 1.5,
                  }, 
                  loading && { opacity: 0.85 }
                ]} 
                onPress={() => handleSave('Scheduled')}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                ) : (
                  <Clock size={16} color={isDark ? '#000000' : '#FFFFFF'} />
                )}
                <Text style={[styles.btnSaveTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                  {loading ? 'Scheduling…' : 'Save & Schedule'}
                </Text>
              </TouchableOpacity>

              {/* Row 2: Save as Draft (Highlighted) */}
              <TouchableOpacity 
                style={[
                  styles.btnDraft, 
                  { 
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
                    borderColor: isDark ? '#FFFFFF' : '#000000',
                    borderWidth: 2,
                  }
                ]} 
                onPress={() => handleSave('Draft')}
                disabled={loading}
                activeOpacity={0.8}
              >
                <FileText size={16} color={isDark ? '#FFFFFF' : '#000000'} />
                <Text style={[styles.btnDraftTxt, { color: isDark ? '#FFFFFF' : '#000000' }]}>Save as Draft</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Row 1: Save as Draft (White in Dark theme, Black in White theme) */}
              <TouchableOpacity 
                style={[
                  styles.btnSave, 
                  { 
                    backgroundColor: isDark ? '#FFFFFF' : '#000000',
                    borderColor: isDark ? '#FFFFFF' : '#000000',
                    borderWidth: 1.5,
                  }, 
                  loading && { opacity: 0.85 }
                ]} 
                onPress={() => handleSave('Draft')}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                ) : (
                  <Save size={16} color={isDark ? '#000000' : '#FFFFFF'} />
                )}
                <Text style={[styles.btnSaveTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                  {loading ? 'Saving…' : 'Save as Draft'}
                </Text>
              </TouchableOpacity>

              {/* Row 2: Publish Now (Highlighted) */}
              <TouchableOpacity 
                style={[
                  styles.btnDraft, 
                  { 
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                    borderColor: isDark ? '#34D399' : '#15803D',
                    borderWidth: 2,
                  }
                ]} 
                onPress={() => handleSave('Published')}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Send size={16} color={isDark ? '#34D399' : '#15803D'} />
                <Text style={[styles.btnDraftTxt, { color: isDark ? '#34D399' : '#15803D' }]}>Publish Now</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Saving / Publishing Full-Screen Loading State */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.savingCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderWidth: 1.5, borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0' }]}>
            <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#1a2d5a'} />
            <Text style={[styles.savingTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>{savingActionText}</Text>
            <Text style={[styles.savingSub, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Syncing sermon details and media with Member View…</Text>
          </View>
        </View>
      </Modal>

      {/* ── New Category Modal ── */}
      <Modal visible={showNewCategoryModal} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={styles.modalOverlay}
        >
          <View style={[styles.newCatCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderWidth: 1.5, borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0' }]}>
            <View style={styles.newCatHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FolderPlus size={20} color={isDark ? '#FFFFFF' : '#1a2d5a'} />
                <Text style={[styles.newCatTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>New Sermon Category</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowNewCategoryModal(false); setNewCatInput(''); }} hitSlop={{top:10, bottom:10, left:10, right:10}}>
                <X size={20} color={isDark ? '#A1A1AA' : '#6b7280'} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.newCatSubtitle, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
              Enter a name for the new category. It will be saved and visible to members.
            </Text>

            <TextInput
              style={[styles.newCatInput, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#94A3B8', borderWidth: 1.5, color: isDark ? '#FFFFFF' : '#0F172A', elevation: 0, shadowOpacity: 0 }]}
              placeholder="e.g. Youth Camp, Healing Revival..."
              placeholderTextColor={isDark ? '#A1A1AA' : '#64748B'}
              value={newCatInput}
              onChangeText={setNewCatInput}
              autoFocus
            />

            <View style={styles.newCatActions}>
              <TouchableOpacity 
                style={styles.newCatBtnCancel} 
                onPress={() => { setShowNewCategoryModal(false); setNewCatInput(''); }}
              >
                <Text style={[styles.newCatBtnCancelTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.newCatBtnSave, 
                  { backgroundColor: isDark ? '#FFFFFF' : '#000000' },
                  savingCategory && { opacity: 0.7 }
                ]} 
                onPress={handleAddNewCategory}
                disabled={savingCategory}
              >
                {savingCategory ? (
                  <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                ) : (
                  <Text style={[styles.newCatBtnSaveTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>Save Category</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Redesigned Celebratory Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.successModalCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0' }]}>
            {/* Top Decorative Accent Bar */}
            <LinearGradient
              colors={
                lastSavedStatus === 'Published'
                  ? ['#059669', '#10B981', '#34D399']
                  : lastSavedStatus === 'Scheduled'
                  ? ['#1E3A8A', '#2563EB', '#F59E0B']
                  : ['#475569', '#64748B', '#94A3B8']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.successTopAccentBar}
            />

            <View style={styles.successModalBody}>
              {/* Close Button */}
              <TouchableOpacity 
                style={[styles.successCloseBtn, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]} 
                onPress={() => setShowSuccess(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={isDark ? '#A1A1AA' : '#64748B'} />
              </TouchableOpacity>

              {/* Layered Multi-Ring Glowing Icon Badge */}
              <View style={[
                styles.successIconOuterRing,
                lastSavedStatus === 'Published' && styles.outerRingPublished,
                lastSavedStatus === 'Scheduled' && styles.outerRingScheduled,
                lastSavedStatus === 'Draft' && styles.outerRingDraft,
              ]}>
                <View style={[
                  styles.successIconMidRing,
                  lastSavedStatus === 'Published' && styles.midRingPublished,
                  lastSavedStatus === 'Scheduled' && styles.midRingScheduled,
                  lastSavedStatus === 'Draft' && styles.midRingDraft,
                ]}>
                  <LinearGradient
                    colors={
                      lastSavedStatus === 'Published'
                        ? ['#10B981', '#059669']
                        : lastSavedStatus === 'Scheduled'
                        ? ['#F59E0B', '#D97706']
                        : ['#64748B', '#475569']
                    }
                    style={styles.successIconCenter}
                  >
                    {lastSavedStatus === 'Published' ? (
                      <CheckCircle2 size={26} color="#FFFFFF" strokeWidth={2.8} />
                    ) : lastSavedStatus === 'Scheduled' ? (
                      <Clock size={24} color="#FFFFFF" strokeWidth={2.6} />
                    ) : (
                      <FileText size={24} color="#FFFFFF" strokeWidth={2.6} />
                    )}
                  </LinearGradient>
                </View>
              </View>

              {/* Status Pill Badge */}
              <View style={[
                styles.successStatusPill,
                lastSavedStatus === 'Published' && styles.statusPillPublished,
                lastSavedStatus === 'Scheduled' && styles.statusPillScheduled,
                lastSavedStatus === 'Draft' && styles.statusPillDraft,
              ]}>
                <View style={[
                  styles.statusPillDot,
                  lastSavedStatus === 'Published' && { backgroundColor: '#059669' },
                  lastSavedStatus === 'Scheduled' && { backgroundColor: '#D97706' },
                  lastSavedStatus === 'Draft' && { backgroundColor: '#64748B' },
                ]} />
                <Text style={[
                  styles.statusPillTxt,
                  lastSavedStatus === 'Published' && { color: '#065F46' },
                  lastSavedStatus === 'Scheduled' && { color: '#92400E' },
                  lastSavedStatus === 'Draft' && { color: '#334155' },
                ]}>
                  {lastSavedStatus === 'Published' 
                    ? 'LIVE ON MEMBER APP' 
                    : lastSavedStatus === 'Scheduled'
                    ? `SCHEDULED • ${formatDateDisplay(form.scheduledDate)} at ${form.scheduledTime}`
                    : 'SAVED AS PRIVATE DRAFT'}
                </Text>
              </View>

              {/* Headline & Description */}
              <Text style={[styles.successHeading, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                {lastSavedStatus === 'Published'
                  ? 'Sermon Published! 🎉'
                  : lastSavedStatus === 'Scheduled'
                  ? 'Sermon Scheduled! ⏰'
                  : 'Draft Saved! 💾'}
              </Text>

              <Text style={[styles.successDescription, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                {lastSavedStatus === 'Published'
                  ? 'Your sermon is live and visible immediately to church members on the Sermons screen.'
                  : lastSavedStatus === 'Scheduled'
                  ? `Your sermon from ${formatDateDisplay(form.date)} is scheduled and will automatically go live on ${formatDateDisplay(form.scheduledDate)} at ${form.scheduledTime}.`
                  : 'Your sermon draft is safely saved. It remains private and hidden from members until published.'}
              </Text>

              {/* Summary Details Card */}
              <View style={[styles.successDetailsCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC', borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]}>
                <View style={styles.successDetailRow}>
                  <Film size={14} color={isDark ? '#E2E8F0' : '#0F172A'} />
                  <Text style={[styles.successDetailLabel, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Title:</Text>
                  <Text style={[styles.successDetailVal, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1}>
                    {form.titleEn || form.titleTe || 'Sermon'}
                  </Text>
                </View>
                <View style={styles.successDetailRow}>
                  <CalendarIcon size={14} color={isDark ? '#E2E8F0' : '#0F172A'} />
                  <Text style={[styles.successDetailLabel, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Sermon Date:</Text>
                  <Text style={[styles.successDetailVal, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>{formatDateDisplay(form.date)}</Text>
                </View>
                {lastSavedStatus === 'Scheduled' && (
                  <View style={styles.successDetailRow}>
                    <Clock size={14} color="#D97706" />
                    <Text style={[styles.successDetailLabel, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Publishes:</Text>
                    <Text style={[styles.successDetailVal, { color: isDark ? '#FBBF24' : '#B45309', fontWeight: '700' }]}>
                      {formatDateDisplay(form.scheduledDate)} at {form.scheduledTime}
                    </Text>
                  </View>
                )}
                {!!form.pastor?.trim() && (
                  <View style={styles.successDetailRow}>
                    <User size={14} color={isDark ? '#E2E8F0' : '#0F172A'} />
                    <Text style={[styles.successDetailLabel, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Pastor:</Text>
                    <Text style={[styles.successDetailVal, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1}>{form.pastor}</Text>
                  </View>
                )}
              </View>

              {/* Primary Button */}
              <TouchableOpacity 
                style={styles.successPrimaryBtnWrap} 
                onPress={closeSuccess} 
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={
                    lastSavedStatus === 'Published'
                      ? ['#059669', '#10B981']
                      : lastSavedStatus === 'Scheduled'
                      ? ['#1a2d5a', '#2b4c8a']
                      : ['#334155', '#475569']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.successPrimaryBtnGrad}
                >
                  <Text style={styles.successPrimaryBtnTxt}>View Sermons List</Text>
                  <ArrowRight size={16} color="#FFFFFF" strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>

              {/* Secondary Button */}
              <TouchableOpacity 
                style={styles.successSecondaryBtn} 
                onPress={() => setShowSuccess(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.successSecondaryBtnTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>Keep Editing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Error Modal */}
      <Modal visible={showError} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.errorCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderWidth: 1.5, borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0' }]}>
            <View style={styles.errorIconBox}>
              <X size={40} color="#c0392b" strokeWidth={3} />
            </View>
            <Text style={styles.errorTitle}>Save Failed</Text>
            <Text style={[styles.errorSub, { color: isDark ? '#A1A1AA' : '#6B7280' }]}>{errorMsg}</Text>
            <TouchableOpacity style={[styles.successBtn, { backgroundColor: '#c0392b' }]} onPress={() => setShowError(false)}>
              <Text style={styles.successBtnTxt}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  // ─── Layout ──────────────────────────────────────────────────────────────
  container: { flex: 1, backgroundColor: '#EDE8DC' },
  scroll: { padding: 14, paddingBottom: 100 },

  // ─── Hero ────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: 'transparent',
    
    
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    marginBottom: 4,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center' },
  heroTitle: { color: '#1a2d5a', fontSize: 20, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '600', letterSpacing: -0.5 },
  heroSub: { color: '#64748b', fontSize: 13, marginTop: 2 },

  // ─── Cards ───────────────────────────────────────────────────────────────
  modBox: { 
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  modHd: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 12 },
  hdBlue: { },
  hdYellow: { },
  modHdTxt: { fontSize: 13, fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 0.6 },

  fGroup: { marginBottom: 16 },
  fLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 7 },
  fHint: { fontSize: 10, color: '#64748B', fontWeight: '500', marginTop: 4 },
  fHelper: { fontSize: 11, color: '#64748B', lineHeight: 15, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  input: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#94A3B8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13.5, fontWeight: '500', color: '#0F172A' },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#94A3B8', borderRadius: 12, paddingHorizontal: 14, height: 48 },
  inputTxt: { fontSize: 13.5, fontWeight: '600', color: '#0F172A' },
  teIn: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', color: '#0F172A', fontStyle: 'italic', backgroundColor: '#FFFFFF' },
  textarea: { minHeight: 80, textAlignVertical: 'top' },

  selectBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12 },
  selectTxt: { fontSize: 13, color: '#1a2d5a', fontWeight: '600' },

  mediaBanner: { backgroundColor: '#F9F6F0', borderRadius: 8, padding: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 15, marginTop: 5 },
  mediaBannerTxt: { color: '#1a2d5a', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  dashBox: { borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 12, padding: 25, alignItems: 'center', backgroundColor: '#FAFAFA' },
  dashBoxActive: { borderColor: '#2E6B4F', backgroundColor: '#F0FDF4', borderStyle: 'solid' },
  dashTxt: { fontSize: 11, fontWeight: '700', color: '#1a2d5a', marginTop: 10 },
  dashHint: { fontSize: 9, color: '#9CA3AF', marginTop: 4, fontWeight: '500' },

  thumbPreviewCard: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  thumbPreviewImg: {
    width: '100%',
    height: '100%',
  },
  thumbOverlayBar: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  thumbBtnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(26,45,90,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  thumbBtnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(220,38,38,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  thumbBtnTxt: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  thumbYoutubeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  thumbYoutubeBadgeTxt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  thumbBtnUploadCustom: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  toggleTxt: { fontSize: 12, color: '#1a2d5a', fontWeight: '600' },
  switch: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#D1D5DB', padding: 2 },
  switchOn: { backgroundColor: '#1a2d5a' },
  switchDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  switchDotOn: { alignSelf: 'flex-end' },

  notifPreview: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#1a2d5a', shadowOpacity: 0.05, shadowRadius: 5 },
  notifHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 4 },
  notifLogo: { width: 14, height: 14, backgroundColor: '#1a2d5a', borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  notifHeaderTxt: { fontSize: 9, color: '#64748B', fontWeight: '600' },
  notifTitle: { fontSize: 11, fontWeight: '800', color: '#1E293B' },
  notifBody: { fontSize: 10, color: '#64748B', fontWeight: '500' },

  pickerCard: { backgroundColor: '#fff', width: '90%', borderRadius: 12, padding: 8, elevation: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 15 },
  pickerItem: { padding: 15, borderRadius: 8 },
  pickerItemActive: { backgroundColor: '#1a2d5a' },
  pickerItemTxt: { fontSize: 13, color: '#374151', fontWeight: '500' },
  pickerItemTxtActive: { color: '#fff', fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },

  // ─── Publish Status 3-Card Selector ───────────────────────────────────────
  statusSelectorContainer: {
    gap: 8,
    marginTop: 4,
  },
  statusOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FAFAF9',
    borderWidth: 1.5,
    borderColor: '#E2DDD5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusOptionCardPublished: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  statusOptionCardScheduled: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  statusOptionCardDraft: {
    borderColor: '#64748B',
    backgroundColor: '#F8FAFC',
  },
  statusOptionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusOptionIconBoxPublished: {
    backgroundColor: '#059669',
  },
  statusOptionIconBoxScheduled: {
    backgroundColor: '#D97706',
  },
  statusOptionIconBoxDraft: {
    backgroundColor: '#475569',
  },
  statusOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  statusOptionTitlePublished: {
    color: '#065F46',
  },
  statusOptionTitleScheduled: {
    color: '#92400E',
  },
  statusOptionTitleDraft: {
    color: '#1E293B',
  },
  statusOptionSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  activeDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeDotAmber: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  activeDotSlate: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748B',
  },
  statusRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRadioCirclePublished: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  statusRadioCircleScheduled: {
    borderColor: '#D97706',
    backgroundColor: '#D97706',
  },
  statusRadioCircleDraft: {
    borderColor: '#475569',
    backgroundColor: '#475569',
  },

  // ─── Footer Action Buttons ───────────────────────────────────────────────
  footerBtnRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 10,
    marginBottom: 26,
  },
  btnDraft: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 30,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  btnDraftTxt: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#000000',
  },
  btnSave: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 30,
    paddingVertical: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  btnSaveTxt: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },

  // ─── Saving Loader Modal ──────────────────────────────────────────────────
  savingCard: {
    backgroundColor: '#fff',
    width: '82%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 26,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },
  savingTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a2d5a',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  savingSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },

  // ─── Celebratory Success Modal ────────────────────────────────────────────
  successModalCard: {
    backgroundColor: '#FFFFFF',
    width: '88%',
    maxWidth: 380,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
  successTopAccentBar: {
    height: 6,
    width: '100%',
  },
  successModalBody: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    alignItems: 'center',
    position: 'relative',
  },
  successCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  successIconOuterRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  outerRingPublished: { backgroundColor: '#ECFDF5' },
  outerRingScheduled: { backgroundColor: '#FFFBEB' },
  outerRingDraft: { backgroundColor: '#F1F5F9' },
  successIconMidRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  midRingPublished: { backgroundColor: '#D1FAE5' },
  midRingScheduled: { backgroundColor: '#FEF3C7' },
  midRingDraft: { backgroundColor: '#E2E8F0' },
  successIconCenter: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  successStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    marginTop: 14,
    borderWidth: 1,
  },
  statusPillPublished: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusPillScheduled: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusPillDraft: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  statusPillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusPillTxt: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  successHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
    marginBottom: 6,
    textAlign: 'center',
  },
  successDescription: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 6,
    marginBottom: 16,
  },
  successDetailsCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 18,
    gap: 8,
  },
  successDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  successDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  successDetailVal: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#1a2d5a',
  },
  successPrimaryBtnWrap: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  successPrimaryBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  successPrimaryBtnTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successSecondaryBtn: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  successSecondaryBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },

  errorCard: { backgroundColor: '#fff', width: '80%', borderRadius: 24, padding: 30, alignItems: 'center' },
  errorIconBox: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#c0392b', marginBottom: 10 },
  errorSub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 25 },
  successBtn: { backgroundColor: '#1a2d5a', width: '100%', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  successBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  fab: { position: 'absolute', right: 20, bottom: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2E6B4F', justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#1a2d5a', shadowOpacity: 0.3, shadowRadius: 10 },

  pickerCardJS: { backgroundColor: '#fff', width: '90%', borderRadius: 16, padding: 20, elevation: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 15 },
  pickerHd: { fontSize: 16, fontWeight: '800', color: '#1a2d5a', marginBottom: 20, textAlign: 'center' },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, height: 200 },
  pickerCol: { flex: 1 },
  pickerColHd: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' },
  pickerItemJS: { paddingVertical: 10, alignItems: 'center', borderRadius: 8, marginBottom: 4 },
  pickerItemJSActive: { backgroundColor: '#F0FDF4' },
  pickerItemJSTxt: { fontSize: 14, color: '#374151', fontWeight: '500' },
  pickerItemJSTxtActive: { color: '#059669', fontWeight: '800' },
  pickerBtn: { backgroundColor: '#1a2d5a', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 20 },
  pickerBtnTxt: { color: '#fff', fontWeight: '700' },

  // New Category Modal Styles
  newCatCard: { backgroundColor: '#fff', width: '85%', borderRadius: 20, padding: 22, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 15, elevation: 15 },
  newCatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  newCatTitle: { fontSize: 16, fontWeight: '800', color: '#1a2d5a' },
  newCatSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 17 },
  newCatInput: { backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1a2d5a', marginBottom: 20 },
  newCatActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  newCatBtnCancel: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  newCatBtnCancelTxt: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  newCatBtnSave: { backgroundColor: '#1a2d5a', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, minWidth: 110, alignItems: 'center', justifyContent: 'center' },
  newCatBtnSaveTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // ─── Scheduled Publish Box Styles ──────────────────────────────────────────
  schedBox: {
    marginTop: 14,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    padding: 14,
  },
  schedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  schedHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.3,
  },
  schedNotice: {
    fontSize: 11.5,
    color: '#78350F',
    lineHeight: 16,
    marginBottom: 12,
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  presetChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  presetChipActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#D97706',
  },
  presetChipTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  presetChipTxtActive: {
    color: '#FFFFFF',
  },
  schedInputsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  schedFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a2d5a',
    marginBottom: 5,
  },
  schedInputBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  schedInputBtnTxt: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a2d5a',
  },
  schedStatusCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    padding: 10,
  },
  schedStatusCalloutTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
    flex: 1,
    lineHeight: 15,
  },

  // ─── Sermon Notes Document Styles ──────────────────────────────────
  optionalBadge: {
    marginLeft: 'auto',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionalBadgeTxt: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  notesSectionSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 12,
  },
  formatPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  formatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  formatPillTxt: {
    fontSize: 10,
    fontWeight: '800',
  },
  formatPillExt: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '500',
  },
  notesUploadDashedBox: {
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  notesUploadIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  notesUploadTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a2d5a',
    marginBottom: 4,
  },
  notesUploadSubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
  },
  notesUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a2d5a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  notesUploadButtonTxt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1a2d5a',
  },
  notesDocCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  notesDocHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notesDocTypeBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notesDocTypeTxt: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  notesDocName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  notesDocMeta: {
    fontSize: 10.5,
    color: '#64748B',
  },
  notesTextPreviewBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notesTextPreviewLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  notesTextPreviewContent: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  notesDocActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  notesDocChangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F0F4FF',
  },
  notesDocChangeBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a2d5a',
  },
  notesDocRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  notesDocRemoveBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
}));

