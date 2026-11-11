import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  Image,
  Share,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  Switch
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Save, Palette, Image as ImageIcon, Link, DollarSign, Building2, Plus, Trash2, Info, Edit2, Clock, MapPin, Navigation , ArrowLeft } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import ChurchService, { ChurchDetails, ServiceTiming } from '../../services/ChurchService';
import LocationService from '../../services/LocationService';
import { useChurch } from '../../context/ChurchContext';
import { useAuth } from '../../context/AuthContext';
import { AdminTabContext } from '../../context/AdminTabContext';
import storage from '@react-native-firebase/storage';
import { CustomAlert } from '../../components/CustomAlert';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';

const PRESET_COLORS = [
  '#1a2d5a', '#c0392b', '#16a34a', '#7c3aed',
  '#b45309', '#0891b2', '#be185d', '#334155',
];

export default function AdminChurchSettings({ navigation }: any) {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const { churchId, activeChurch, setActiveChurch } = useChurch();
  const { goBack } = React.useContext(AdminTabContext);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<'logo' | 'banner' | null>(null);

  const [form, setForm] = useState<Partial<ChurchDetails>>({});
  const [linkCode, setLinkCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [secrets, setSecrets] = useState<{ razorpayKeyId?: string; razorpayKeySecret?: string; whatsappAccessToken?: string; whatsappPhoneId?: string; useWeChristianWhatsApp?: boolean }>({});
  const [activeTab, setActiveTab] = useState<'info' | 'giving'>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'info' | 'error' | 'warning';
  }>({ visible: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    loadChurchData();
  }, [churchId]);

  const loadChurchData = async () => {
    if (!churchId) return;
    const data = await ChurchService.getChurchDetails(churchId);
    if (data) {
      setForm(data);
    }
    const churchSecrets = await ChurchService.getChurchSecrets(churchId);
    if (churchSecrets) {
      setSecrets(churchSecrets);
    }
    setLoading(false);
  };

  const updateSecret = (field: string, value: string | boolean) => {
    setSecrets(prev => ({ ...prev, [field]: value }));
  };

  const [acquiringLocation, setAcquiringLocation] = useState(false);

  const handleUseCurrentLocation = async () => {
    setAcquiringLocation(true);
    try {
      const loc = await LocationService.getCurrentLocation();
      if (!loc.success || !loc.coords) {
        setAlertConfig({
          visible: true,
          title: 'Location Error',
          message: loc.error || 'Failed to get current GPS location.',
          type: 'error',
        });
        return;
      }
      setForm(prev => ({
        ...prev,
        latitude: Number(loc.coords!.latitude.toFixed(6)),
        longitude: Number(loc.coords!.longitude.toFixed(6)),
        attendanceRadiusMeters: 100,
      }));
      setAlertConfig({
        visible: true,
        title: 'Church Location Set',
        message: `Registered GPS Coordinates:\nLatitude: ${loc.coords.latitude.toFixed(6)}\nLongitude: ${loc.coords.longitude.toFixed(6)}\n\nAttendance Radius: 100 meters\n\nPlease tap 'Save' at the top right to save these settings.`,
        type: 'success',
      });
    } catch (e: any) {
      setAlertConfig({
        visible: true,
        title: 'Error',
        message: e?.message || 'Could not fetch device location.',
        type: 'error',
      });
    } finally {
      setAcquiringLocation(false);
    }
  };

  const updateField = (section: keyof ChurchDetails, field: string, value: any) => {
    setForm(prev => {
      const newForm = { ...prev };
      if (section === 'name' || section === 'tagline' || section === 'contactEmail' || section === 'contactPhone' || section === 'address' || section === 'aboutUs' || section === 'latitude' || section === 'longitude') {
        (newForm as any)[section] = value;
      } else {
        (newForm as any)[section] = { ...((newForm as any)[section] || {}), [field]: value };
      }
      return newForm;
    });
  };

  const [timePickerConfig, setTimePickerConfig] = useState<{
    visible: boolean;
    index: number;
    field: 'startTime' | 'endTime';
  }>({ visible: false, index: -1, field: 'startTime' });

  const addServiceTiming = () => {
    const timings = form.serviceTimings || [];
    setForm(prev => ({
      ...prev,
      serviceTimings: [
        ...timings,
        { id: Date.now().toString(), name: '', startTime: '', endTime: '', note: '' }
      ]
    }));
  };

  const updateServiceTiming = (index: number, key: keyof ServiceTiming, value: string) => {
    const timings = [...(form.serviceTimings || [])];
    timings[index] = { ...timings[index], [key]: value };
    setForm(prev => ({ ...prev, serviceTimings: timings }));
  };

  const removeServiceTiming = (index: number) => {
    const timings = [...(form.serviceTimings || [])];
    timings.splice(index, 1);
    setForm(prev => ({ ...prev, serviceTimings: timings }));
  };

  const formatPickerTime = (date: Date) => {
    const h24 = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    h12 = h12 ? h12 : 12;
    return `${h12}:${m} ${ampm}`;
  };

  const handleTimeConfirm = (date: Date) => {
    if (timePickerConfig.index >= 0) {
      updateServiceTiming(timePickerConfig.index, timePickerConfig.field, formatPickerTime(date));
    }
    setTimePickerConfig(prev => ({ ...prev, visible: false }));
  };

  const addUpi = () => {
    const upis = form.givingDetails?.upis || [];
    updateField('givingDetails', 'upis', [...upis, { id: Date.now().toString(), name: '', upiId: '', phonepeNumber: '' }]);
  };

  const updateUpi = (index: number, key: string, value: string) => {
    const upis = [...(form.givingDetails?.upis || [])];
    upis[index] = { ...upis[index], [key]: value };
    updateField('givingDetails', 'upis', upis);
  };

  const removeUpi = (index: number) => {
    const upis = [...(form.givingDetails?.upis || [])];
    upis.splice(index, 1);
    updateField('givingDetails', 'upis', upis);
  };

  const addBank = () => {
    const banks = form.givingDetails?.banks || [];
    updateField('givingDetails', 'banks', [...banks, { id: Date.now().toString(), name: '', accountName: '', bankName: '', accountNumber: '', ifscCode: '' }]);
  };

  const updateBank = (index: number, key: string, value: string) => {
    const banks = [...(form.givingDetails?.banks || [])];
    banks[index] = { ...banks[index], [key]: value };
    updateField('givingDetails', 'banks', banks);
  };

  const removeBank = (index: number) => {
    const banks = [...(form.givingDetails?.banks || [])];
    banks.splice(index, 1);
    updateField('givingDetails', 'banks', banks);
  };

  const pickImage = async (type: 'logo' | 'banner') => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'logo' ? [1, 1] : [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      uploadImage(result.assets[0].uri, type);
    }
  };

  const uploadImage = async (uri: string, type: 'logo' | 'banner') => {
    if (!churchId) return;
    setUploadingImage(type);
    try {
      const ext = uri.substring(uri.lastIndexOf('.') + 1) || 'jpg';
      const storagePath = `Rhema Church/${churchId}/brand/${type}_${Date.now()}.${ext}`;

      const reference = storage().ref(storagePath);
      await reference.putFile(uri);
      const downloadURL = await reference.getDownloadURL();

      updateField('theme', type === 'logo' ? 'logoUrl' : 'bannerUrl', downloadURL);
      setUploadingImage(null);
    } catch (e: any) {
      console.error(e);
      setAlertConfig({ visible: true, title: 'Error', message: 'Failed to prepare image for upload', type: 'error' });
      setUploadingImage(null);
    }
  };

  const handleSave = async () => {
    if (!churchId) return;
    setSaving(true);
    try {
      await ChurchService.updateChurch(churchId, form);
      await ChurchService.updateChurchSecrets(churchId, secrets);
      // Refresh the context so the app updates immediately
      const updated = await ChurchService.getChurchDetails(churchId);
      if (updated) setActiveChurch(updated);
      setAlertConfig({ visible: true, title: 'Success', message: 'Church settings updated successfully!', type: 'success' });
    } catch (e) {
      console.error(e);
      setAlertConfig({ visible: true, title: 'Error', message: 'Failed to save settings.', type: 'error' });
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  };

  const handleLinkParent = async () => {
    if (!churchId) return;
    if (!linkCode.trim()) {
      setAlertConfig({ visible: true, title: 'Required', message: 'Please enter a Church Code.', type: 'error' });
      return;
    }
    setLinking(true);
    try {
      const parent = await ChurchService.getChurchBySubdomain(linkCode.trim().toLowerCase());
      if (!parent) {
        setAlertConfig({ visible: true, title: 'Not Found', message: 'No church found with that code.', type: 'error' });
        setLinking(false);
        return;
      }
      if (!parent.isParentOrganization) {
        setAlertConfig({ visible: true, title: 'Invalid Parent', message: 'This church is not configured as a Main Branch. They must enable multiple branches in their settings.', type: 'error' });
        setLinking(false);
        return;
      }
      if (parent.id === churchId) {
        setAlertConfig({ visible: true, title: 'Invalid Code', message: 'You cannot link a church to itself.', type: 'error' });
        setLinking(false);
        return;
      }
      
      await ChurchService.updateChurch(churchId, { parentChurchId: parent.id });
      
      setForm(prev => ({ ...prev, parentChurchId: parent.id }));
      const updated = await ChurchService.getChurchDetails(churchId);
      if (updated) setActiveChurch(updated);
      
      setAlertConfig({ visible: true, title: 'Success', message: `Successfully linked to ${parent.name}!`, type: 'success' });
      setLinkCode('');
    } catch (e) {
      console.error(e);
      setAlertConfig({ visible: true, title: 'Error', message: 'Failed to link church.', type: 'error' });
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#fbbf24" />
      </View>
    );
  }

  const primaryColor = form.theme?.primaryColor || '#1a2d5a';

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={barStyle} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <CustomAlert 
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type}
          onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
        />
        {/* ── Modern Centered Header Bar ── */}
        <View
          style={[
            styles.topbar,
            {
              backgroundColor: isDark ? '#000000' : '#FFFFFF',
              borderBottomWidth: 1.5,
              borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
              paddingTop: Platform.OS === 'ios' ? Math.max(insets.top, 20) : 12,
              paddingBottom: 12,
              paddingHorizontal: 16,
            }
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity
              onPress={goBack}
              style={[
                styles.circularBackBtn,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : '#CBD5E1',
                  borderWidth: 1.5,
                }
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.4} />
            </TouchableOpacity>

            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '800',
                  color: isDark ? '#B9C8BD' : '#98713D',
                  textAlign: 'center',
                  letterSpacing: -0.3,
                }}
                numberOfLines={1}
              >
                Settings
              </Text>
            </View>

            {isEditing ? (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 10,
                  gap: 5,
                  minWidth: 64,
                  justifyContent: 'center',
                }}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {saving ? (
                  <ActivityIndicator color={isDark ? '#000000' : '#FFFFFF'} size="small" />
                ) : (
                  <>
                    <Save size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.4} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#000000' : '#FFFFFF', letterSpacing: 0.3 }}>
                      Save
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 10,
                  gap: 5,
                  minWidth: 64,
                  justifyContent: 'center',
                }}
                onPress={() => setIsEditing(true)}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Edit2 size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.4} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#000000' : '#FFFFFF', letterSpacing: 0.3 }}>
                  Edit
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0', borderBottomWidth: 1 }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'info' && { borderBottomColor: isDark ? '#FFFFFF' : primaryColor }]}
            onPress={() => setActiveTab('info')}
          >
            <Building2 size={18} color={activeTab === 'info' ? (isDark ? '#FFFFFF' : primaryColor) : secondaryText} />
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tabTxt, { color: activeTab === 'info' ? (isDark ? '#FFFFFF' : primaryColor) : secondaryText, fontWeight: activeTab === 'info' ? '700' : '600' }]}>Info</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'giving' && { borderBottomColor: isDark ? '#FFFFFF' : primaryColor }]}
            onPress={() => setActiveTab('giving')}
          >
            <DollarSign size={18} color={activeTab === 'giving' ? (isDark ? '#FFFFFF' : primaryColor) : secondaryText} />
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tabTxt, { color: activeTab === 'giving' ? (isDark ? '#FFFFFF' : primaryColor) : secondaryText, fontWeight: activeTab === 'giving' ? '700' : '600' }]}>Giving</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* INFO TAB */}
          {activeTab === 'info' && (
            <View>
              {!isEditing && (
                <Text
                  style={[
                    styles.viewModeHint,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F0EBE0',
                      color: isDark ? '#FFFFFF' : '#1a2d5a',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2DDD5',
                    }
                  ]}
                >
                  Tap 'Edit' in the top right to make changes.
                </Text>
              )}

              {/* Church Logo */}
              <Text style={[styles.sectionLabel, { marginTop: 12, marginBottom: 10 }]}>Church Logo</Text>
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 18,
                  paddingHorizontal: 16,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                  backgroundColor: isDark ? (cardSurface || '#18181B') : '#FFFFFF',
                  marginBottom: 20,
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: isDark ? 0 : 0.04,
                  shadowRadius: 3,
                  elevation: isDark ? 0 : 1,
                }}
              >
                <TouchableOpacity
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 60,
                    borderWidth: 2.5,
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F8FAFC',
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                  }}
                  onPress={() => isEditing && pickImage('logo')}
                  disabled={!isEditing}
                  activeOpacity={0.8}
                >
                  {uploadingImage === 'logo' ? (
                    <ActivityIndicator color={isDark ? '#FFFFFF' : primaryColor} size="small" />
                  ) : form.theme?.logoUrl ? (
                    <Image source={{ uri: form.theme.logoUrl }} style={{ width: 115, height: 115, borderRadius: 57.5 }} resizeMode="cover" />
                  ) : (
                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      <ImageIcon size={34} color={isDark ? '#94A3B8' : '#64748B'} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B', marginTop: 4 }}>
                        {isEditing ? 'Upload' : 'No Logo'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {isEditing && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => pickImage('logo')}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: isDark ? '#FFFFFF' : '#000000',
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#000000' : '#FFFFFF' }}>
                        {form.theme?.logoUrl ? 'Change' : 'Upload'}
                      </Text>
                    </TouchableOpacity>

                    {form.theme?.logoUrl ? (
                      <TouchableOpacity
                        onPress={() => updateField('theme', 'logoUrl', '')}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#EF4444',
                          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                        }}
                        activeOpacity={0.8}
                      >
                        <Trash2 size={12} color="#EF4444" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>

              <Text style={styles.sectionLabel}>Basic Information</Text>

              <Text style={styles.label}>Church Name</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    borderWidth: 1.5,
                  }
                ]}
                value={form.name}
                onChangeText={v => updateField('name' as any, '', v)}
                editable={isEditing}
              />

              <Text style={styles.label}>Tagline / Motto</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    borderWidth: 1.5,
                  }
                ]}
                value={form.tagline}
                onChangeText={v => updateField('tagline' as any, '', v)}
                placeholder="e.g. A Gateway to Heaven"
                placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                editable={isEditing}
              />

              <Text style={styles.label}>About Us</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    borderWidth: 1.5,
                  }
                ]}
                multiline
                numberOfLines={4}
                value={form.aboutUs}
                onChangeText={v => updateField('aboutUs' as any, '', v)}
                placeholder="Describe your church..."
                placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                editable={isEditing}
              />

              <Text style={styles.label}>Address</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    borderWidth: 1.5,
                  }
                ]}
                multiline
                numberOfLines={2}
                value={form.address}
                onChangeText={v => updateField('address' as any, '', v)}
                editable={isEditing}
              />

              {/* ── Church GPS Location & 100m Attendance Geofence ── */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                  <MapPin size={16} color={isDark ? '#B9C8BD' : '#315C50'} />
                  <Text
                    style={[
                      styles.sectionLabel,
                      {
                        marginBottom: 0,
                        marginTop: 0,
                        fontSize: 13,
                        color: isDark ? '#B9C8BD' : '#315C50',
                      }
                    ]}
                    numberOfLines={1}
                  >
                    Location (100m)
                  </Text>
                </View>
                {isEditing && (
                  <TouchableOpacity
                    onPress={handleUseCurrentLocation}
                    disabled={acquiringLocation}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isDark ? 'rgba(49, 92, 80, 0.25)' : '#F0FDF4',
                      borderColor: isDark ? '#315C50' : '#BBF7D0',
                      borderWidth: 1,
                      paddingHorizontal: 6,
                      paddingVertical: 3.5,
                      borderRadius: 6,
                      gap: 3,
                      flexShrink: 0,
                    }}
                    activeOpacity={0.75}
                  >
                    {acquiringLocation ? (
                      <ActivityIndicator size="small" color={isDark ? '#B9C8BD' : '#16A34A'} />
                    ) : (
                      <>
                        <Navigation size={10} color={isDark ? '#B9C8BD' : '#16A34A'} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#B9C8BD' : '#16A34A' }}>Locate</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.geofenceExplainerTxt}>
                Members can only scan and mark attendance when physically within 100 meters of these registered coordinates.
              </Text>

              <View style={styles.latLngRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Latitude</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        borderWidth: 1.5,
                      }
                    ]}
                    value={form.latitude !== undefined && form.latitude !== null ? String(form.latitude) : ''}
                    onChangeText={v => updateField('latitude' as any, '', v ? parseFloat(v) : undefined)}
                    placeholder="e.g. 15.208545"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    keyboardType="numeric"
                    editable={isEditing}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.label}>Longitude</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        borderWidth: 1.5,
                      }
                    ]}
                    value={form.longitude !== undefined && form.longitude !== null ? String(form.longitude) : ''}
                    onChangeText={v => updateField('longitude' as any, '', v ? parseFloat(v) : undefined)}
                    placeholder="e.g. 78.116505"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    keyboardType="numeric"
                    editable={isEditing}
                  />
                </View>
              </View>

              <Text style={styles.label}>Contact Phone</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    borderWidth: 1.5,
                  }
                ]}
                value={form.contactPhone}
                onChangeText={v => updateField('contactPhone' as any, '', v)}
                keyboardType="phone-pad"
                editable={isEditing}
              />

              <Text style={styles.label}>Contact Email</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    borderWidth: 1.5,
                  }
                ]}
                value={form.contactEmail}
                onChangeText={v => updateField('contactEmail' as any, '', v)}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={isEditing}
              />

              {/* ── SOCIAL LINKS SECTION ── */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24, marginBottom: 12 }}>
                <Link size={16} color="#D99A8C" />
                <Text style={[styles.sectionLabel, { marginBottom: 0, marginTop: 0, color: '#D99A8C' }]}>Social Links</Text>
              </View>

              <View
                style={[
                  styles.inputRow,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    borderWidth: 1.5,
                    marginBottom: 12,
                  }
                ]}
              >
                <Link size={15} color="#D99A8C" />
                <TextInput
                  style={[styles.inputFlex, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
                  placeholder="Website URL"
                  placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                  value={form.socialLinks?.website}
                  onChangeText={v => updateField('socialLinks', 'website', v)}
                  editable={isEditing}
                />
              </View>
              <View
                style={[
                  styles.inputRow,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    borderWidth: 1.5,
                    marginBottom: 12,
                  }
                ]}
              >
                <Text style={[styles.socialPrefix, { color: '#D99A8C' }]}>YouTube</Text>
                <TextInput
                  style={[styles.inputFlex, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
                  placeholder="Channel or Live URL"
                  placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                  value={form.socialLinks?.youtube}
                  onChangeText={v => updateField('socialLinks', 'youtube', v)}
                  editable={isEditing}
                />
              </View>
              <View
                style={[
                  styles.inputRow,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    borderWidth: 1.5,
                    marginBottom: 12,
                  }
                ]}
              >
                <Text style={[styles.socialPrefix, { color: '#D99A8C' }]}>Facebook</Text>
                <TextInput
                  style={[styles.inputFlex, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
                  placeholder="Page URL"
                  placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                  value={form.socialLinks?.facebook}
                  onChangeText={v => updateField('socialLinks', 'facebook', v)}
                  editable={isEditing}
                />
              </View>
              <View
                style={[
                  styles.inputRow,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                    borderWidth: 1.5,
                    marginBottom: 16,
                  }
                ]}
              >
                <Text style={[styles.socialPrefix, { color: '#D99A8C' }]}>Instagram</Text>
                <TextInput
                  style={[styles.inputFlex, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
                  placeholder="Profile URL"
                  placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                  value={form.socialLinks?.instagram}
                  onChangeText={v => updateField('socialLinks', 'instagram', v)}
                  editable={isEditing}
                />
              </View>

              {/* ── SERVICE TIMINGS SECTION ── */}
              <View style={[styles.sectionHeaderRow, { marginTop: 24, marginBottom: 12, alignItems: 'center' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Clock size={18} color="#B8A5D6" />
                  <Text style={[styles.sectionLabel, { marginBottom: 0, color: '#B8A5D6' }]}>Service Timings</Text>
                </View>
                {isEditing && (
                  <TouchableOpacity
                    onPress={addServiceTiming}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isDark ? 'rgba(184, 165, 214, 0.16)' : '#F3EFFB',
                      borderColor: '#B8A5D6',
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      gap: 4,
                    }}
                    activeOpacity={0.75}
                  >
                    <Plus size={14} color="#B8A5D6" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#B8A5D6' }}>Add Service</Text>
                  </TouchableOpacity>
                )}
              </View>

              {(!form.serviceTimings || form.serviceTimings.length === 0) ? (
                <View
                  style={{
                    alignItems: 'center',
                    paddingVertical: 24,
                    backgroundColor: isDark ? (cardSurface || '#18181B') : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : (adminBorderColor || '#E2DDD5'),
                    borderWidth: 1.5,
                    borderRadius: 14,
                    marginBottom: 16,
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: isDark ? 0 : 0.04,
                    shadowRadius: 3,
                    elevation: isDark ? 0 : 1,
                  }}
                >
                  <Clock size={32} color="#B8A5D6" style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#FFFFFF' : '#4B5563', marginBottom: 4 }}>
                    No Service Timings Configured
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#6B7280', textAlign: 'center', lineHeight: 18 }}>
                    {isEditing ? "Tap 'Add Service' above to configure worship services for your congregation." : "Tap 'Edit' in the top right to add service schedules."}
                  </Text>
                  {isEditing && (
                    <TouchableOpacity
                      onPress={addServiceTiming}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isDark ? 'rgba(184, 165, 214, 0.16)' : '#F3EFFB',
                        borderColor: '#B8A5D6',
                        borderWidth: 1,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        gap: 4,
                        marginTop: 14,
                      }}
                      activeOpacity={0.75}
                    >
                      <Plus size={14} color="#B8A5D6" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#B8A5D6' }}>Add First Service</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                form.serviceTimings.map((service, i) => {
                  const cardBg = isDark ? (cardSurface || '#18181B') : '#FFFFFF';
                  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : (adminBorderColor || '#E2DDD5');
                  const inputBg = isDark ? (secondarySurface || 'rgba(255, 255, 255, 0.05)') : (isEditing ? '#FFFFFF' : '#F8FAFC');
                  const inputBorder = isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1';
                  const inputTextColor = isDark ? '#FFFFFF' : '#0F172A';

                  return (
                    <View
                      key={service.id || i}
                      style={{
                        backgroundColor: cardBg,
                        borderColor: cardBorder,
                        borderWidth: 1.5,
                        marginBottom: 16,
                        padding: 16,
                        borderRadius: 14,
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isDark ? 0 : 0.04,
                        shadowRadius: 3,
                        elevation: isDark ? 0 : 1,
                      }}
                    >
                      <View style={styles.cardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Clock size={16} color="#B8A5D6" />
                          <Text style={[styles.cardTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                            {service.name?.trim() ? service.name : `Service #${i + 1}`}
                          </Text>
                        </View>
                        {isEditing && (
                          <TouchableOpacity onPress={() => removeServiceTiming(i)} style={{ padding: 4 }}>
                            <Trash2 size={16} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Service Name Input */}
                      <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>Service Name</Text>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: inputBg,
                            borderColor: inputBorder,
                            borderWidth: 1.5,
                            color: inputTextColor,
                            marginBottom: 12,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 10,
                          }
                        ]}
                        value={service.name}
                        onChangeText={v => updateServiceTiming(i, 'name', v)}
                        placeholder="e.g. Sunday Service / Special Meeting"
                        placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                        editable={isEditing}
                      />

                      {/* Schedule Note Input (Optional) */}
                      {(isEditing || service.note) && (
                        <>
                          <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>Schedule Note / Subtext (Optional)</Text>
                          <TextInput
                            style={[
                              styles.input,
                              {
                                backgroundColor: inputBg,
                                borderColor: inputBorder,
                                borderWidth: 1.5,
                                color: inputTextColor,
                                marginBottom: 12,
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                borderRadius: 10,
                              }
                            ]}
                            value={service.note || ''}
                            onChangeText={v => updateServiceTiming(i, 'note', v)}
                            placeholder="e.g. (2nd Saturday in every month)"
                            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                            editable={isEditing}
                          />
                        </>
                      )}

                      {/* Start Time & End Time Row */}
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        {/* Start Time */}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>Start Time</Text>
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              backgroundColor: inputBg,
                              borderColor: inputBorder,
                              borderWidth: 1.5,
                              borderRadius: 10,
                              paddingHorizontal: 12,
                              paddingVertical: 11,
                              marginBottom: 0,
                            }}
                            onPress={() => {
                              if (isEditing) {
                                setTimePickerConfig({ visible: true, index: i, field: 'startTime' });
                              }
                            }}
                            disabled={!isEditing}
                            activeOpacity={0.7}
                          >
                            <Clock size={15} color="#B8A5D6" />
                            <Text
                              style={{
                                flex: 1,
                                fontSize: 14,
                                fontWeight: '600',
                                color: service.startTime ? inputTextColor : (isDark ? '#64748B' : '#94A3B8')
                              }}
                            >
                              {service.startTime || 'Select Start Time'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* End Time */}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>End Time</Text>
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              backgroundColor: inputBg,
                              borderColor: inputBorder,
                              borderWidth: 1.5,
                              borderRadius: 10,
                              paddingHorizontal: 12,
                              paddingVertical: 11,
                              marginBottom: 0,
                            }}
                            onPress={() => {
                              if (isEditing) {
                                setTimePickerConfig({ visible: true, index: i, field: 'endTime' });
                              }
                            }}
                            disabled={!isEditing}
                            activeOpacity={0.7}
                          >
                            <Clock size={15} color="#B8A5D6" />
                            <Text
                              style={{
                                flex: 1,
                                fontSize: 14,
                                fontWeight: '600',
                                color: service.endTime ? inputTextColor : (isDark ? '#64748B' : '#94A3B8')
                              }}
                            >
                              {service.endTime || 'Select End Time'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Formatted Preview in View Mode (NO blue! Lavender / #B8A5D6 badge) */}
                      {!isEditing && (service.startTime || service.endTime) && (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 10,
                            gap: 6,
                            backgroundColor: isDark ? 'rgba(184, 165, 214, 0.12)' : '#F3EFFB',
                            borderColor: isDark ? 'rgba(184, 165, 214, 0.25)' : '#DDD6FE',
                            borderWidth: 1,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 8,
                          }}
                        >
                          <Clock size={14} color="#B8A5D6" />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#D8CCEE' : '#6D28D9' }}>
                            {service.startTime} {service.endTime ? `– ${service.endTime}` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              {member?.userType === 'super_admin' && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Advanced Features</Text>
                  <View style={[styles.switchRow, !isEditing && styles.inputDisabled]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchLabel}>Enable WhatsApp Automation</Text>
                      <Text style={styles.switchHint}>Unlock the Celebrations tab and WhatsApp integration settings.</Text>
                    </View>
                    <Switch
                      value={form.features?.hasWhatsAppAutomation || false}
                      onValueChange={v => {
                        const currentFeatures = form.features || { hasSermons: false, hasDailyPromises: false, hasWorshipSongs: false, hasGiving: false };
                        setForm({ ...form, features: { ...currentFeatures, hasWhatsAppAutomation: v } });
                      }}
                      disabled={!isEditing}
                      trackColor={{ false: '#cbd5e1', true: primaryColor }}
                    />
                  </View>
                </>
              )}

              {/* Branch Management - Link to Parent */}
              {member?.userType === 'super_admin' && !form.isParentOrganization && !form.parentChurchId && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Branch Management</Text>
                  <View style={{ backgroundColor: '#f8fafc', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 4 }}>Link to Parent Church</Text>
                    <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 18 }}>If this church is a branch of a larger organization, enter the Main Branch's Church Code below to link your accounts.</Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <TextInput 
                        style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 12, backgroundColor: '#ffffff' }]} 
                        placeholder="Enter Church Code" 
                        placeholderTextColor="#94a3b8"
                        autoCapitalize="characters"
                        value={linkCode}
                        onChangeText={setLinkCode}
                      />
                      <TouchableOpacity 
                        style={{ backgroundColor: primaryColor, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}
                        onPress={handleLinkParent}
                        disabled={linking}
                      >
                        {linking ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 14 }}>Link Branch</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}

              {/* Connected Parent Info */}
              {form.parentChurchId && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Branch Management</Text>
                  <View style={{ backgroundColor: '#f0fdf4', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0', flexDirection: 'row', alignItems: 'center' }}>
                    <Link size={20} color="#16a34a" style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#166534', marginBottom: 2 }}>Connected to Main Branch</Text>
                      <Text style={{ fontSize: 12, color: '#15803d' }}>This church is successfully linked as a child branch.</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}



          {/* GIVING TAB */}
          {activeTab === 'giving' && (
            <View>
              {!isEditing && <Text style={styles.viewModeHint}>Tap 'Edit' in the top right to make changes.</Text>}

              <View style={[styles.switchRow, { marginBottom: 20 }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.switchLabel}>Enable Giving / Tithe</Text>
                  <Text style={styles.switchHint}>If enabled, members will be able to make donations securely using Razorpay in the app.</Text>
                </View>
                <Switch
                  value={form.features?.hasGiving}
                  onValueChange={v => updateField('features', 'hasGiving', v)}
                  trackColor={{ false: '#cbd5e1', true: '#10b981' }}
                  thumbColor={form.features?.hasGiving ? '#fff' : '#f8fafc'}
                  disabled={!isEditing}
                />
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Razorpay Gateway Configuration</Text>

              <Text style={styles.label}>Key ID</Text>
              <TextInput style={[styles.input, !isEditing && styles.inputDisabled]} value={secrets.razorpayKeyId} onChangeText={v => updateSecret('razorpayKeyId', v)} placeholder="e.g. rzp_live_XXXXX" placeholderTextColor="#64748b" editable={isEditing} />

              <Text style={styles.label}>Key Secret</Text>
              <TextInput style={[styles.input, !isEditing && styles.inputDisabled]} value={secrets.razorpayKeySecret} onChangeText={v => updateSecret('razorpayKeySecret', v)} placeholder="e.g. 099eb0cd-02cf-4e2a-8aca-3e6c6aff0399" placeholderTextColor="#64748b" editable={isEditing} secureTextEntry={!isEditing} />

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Primary UPI & Mobile Payments</Text>

              <Text style={styles.label}>UPI ID</Text>
              <TextInput style={[styles.input, !isEditing && styles.inputDisabled]} value={form.givingDetails?.upiId} onChangeText={v => updateField('givingDetails', 'upiId', v)} placeholder="e.g. church@okicici" placeholderTextColor="#64748b" editable={isEditing} />

              <Text style={styles.label}>PhonePe Number</Text>
              <TextInput style={[styles.input, !isEditing && styles.inputDisabled]} value={form.givingDetails?.phonepeNumber} onChangeText={v => updateField('givingDetails', 'phonepeNumber', v)} placeholder="e.g. 9876543210" placeholderTextColor="#64748b" keyboardType="phone-pad" editable={isEditing} />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
                <Text style={[styles.sectionLabel, { marginBottom: 0, marginTop: 0, flex: 1, marginRight: 8 }]} numberOfLines={1}>
                  Additional UPI Accounts
                </Text>
                {isEditing && (
                  <TouchableOpacity
                    onPress={addUpi}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isDark ? '#FFFFFF' : '#000000',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      gap: 4,
                      flexShrink: 0,
                    }}
                    activeOpacity={0.8}
                  >
                    <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.4} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#000000' : '#FFFFFF' }}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {form.givingDetails?.upis?.map((upi, i) => (
                <View
                  key={upi.id}
                  style={{
                    backgroundColor: isDark ? (cardSurface || '#18181B') : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : (adminBorderColor || '#CBD5E1'),
                    borderWidth: 1.5,
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 16,
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: isDark ? 0 : 0.04,
                    shadowRadius: 3,
                    elevation: isDark ? 0 : 1,
                  }}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>UPI Account #{i + 1}</Text>
                    {isEditing && (
                      <TouchableOpacity onPress={() => removeUpi(i)}>
                        <Trash2 size={16} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>Label (e.g. Building Fund)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? (secondarySurface || 'rgba(255, 255, 255, 0.05)') : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        borderWidth: 1.5,
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        marginBottom: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                      }
                    ]}
                    value={upi.name}
                    onChangeText={v => updateUpi(i, 'name', v)}
                    placeholder="Fund Name"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    editable={isEditing}
                  />
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>UPI ID</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? (secondarySurface || 'rgba(255, 255, 255, 0.05)') : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        borderWidth: 1.5,
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        marginBottom: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                      }
                    ]}
                    value={upi.upiId}
                    onChangeText={v => updateUpi(i, 'upiId', v)}
                    placeholder="church@okicici"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    editable={isEditing}
                  />
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>PhonePe Number</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? (secondarySurface || 'rgba(255, 255, 255, 0.05)') : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        borderWidth: 1.5,
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        marginBottom: 0,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                      }
                    ]}
                    value={upi.phonepeNumber}
                    onChangeText={v => updateUpi(i, 'phonepeNumber', v)}
                    placeholder="Optional"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    keyboardType="phone-pad"
                    editable={isEditing}
                  />
                </View>
              ))}

              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Primary Bank Transfer Details</Text>

              <Text style={styles.label}>Account Name</Text>
              <TextInput style={[styles.input, !isEditing && styles.inputDisabled]} value={form.givingDetails?.accountName} onChangeText={v => updateField('givingDetails', 'accountName', v)} placeholder="Brothers in Christ" placeholderTextColor="#64748b" editable={isEditing} />

              <Text style={styles.label}>Bank Name</Text>
              <TextInput style={[styles.input, !isEditing && styles.inputDisabled]} value={form.givingDetails?.bankName} onChangeText={v => updateField('givingDetails', 'bankName', v)} placeholder="HDFC Bank" placeholderTextColor="#64748b" editable={isEditing} />

              <Text style={styles.label}>Account Number</Text>
              <TextInput style={[styles.input, !isEditing && styles.inputDisabled]} value={form.givingDetails?.accountNumber} onChangeText={v => updateField('givingDetails', 'accountNumber', v)} placeholder="50100XXXXXXX" placeholderTextColor="#64748b" keyboardType="numeric" editable={isEditing} />

              <Text style={styles.label}>IFSC Code</Text>
              <TextInput style={[styles.input, !isEditing && styles.inputDisabled]} value={form.givingDetails?.ifscCode} onChangeText={v => updateField('givingDetails', 'ifscCode', v)} placeholder="HDFC0001234" placeholderTextColor="#64748b" autoCapitalize="characters" editable={isEditing} />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 }}>
                <Text style={[styles.sectionLabel, { marginBottom: 0, marginTop: 0, flex: 1, marginRight: 8 }]} numberOfLines={1}>
                  Additional Bank Accounts
                </Text>
                {isEditing && (
                  <TouchableOpacity
                    onPress={addBank}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isDark ? '#FFFFFF' : '#000000',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      gap: 4,
                      flexShrink: 0,
                    }}
                    activeOpacity={0.8}
                  >
                    <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.4} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#000000' : '#FFFFFF' }}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {form.givingDetails?.banks?.map((bank, i) => (
                <View
                  key={bank.id}
                  style={{
                    backgroundColor: isDark ? (cardSurface || '#18181B') : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : (adminBorderColor || '#CBD5E1'),
                    borderWidth: 1.5,
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 16,
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: isDark ? 0 : 0.04,
                    shadowRadius: 3,
                    elevation: isDark ? 0 : 1,
                  }}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Bank Account #{i + 1}</Text>
                    {isEditing && (
                      <TouchableOpacity onPress={() => removeBank(i)}>
                        <Trash2 size={16} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>Label (e.g. Charity Fund)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? (secondarySurface || 'rgba(255, 255, 255, 0.05)') : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        borderWidth: 1.5,
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        marginBottom: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                      }
                    ]}
                    value={bank.name}
                    onChangeText={v => updateBank(i, 'name', v)}
                    placeholder="Fund Name"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    editable={isEditing}
                  />
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>Account Name</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? (secondarySurface || 'rgba(255, 255, 255, 0.05)') : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        borderWidth: 1.5,
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        marginBottom: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                      }
                    ]}
                    value={bank.accountName}
                    onChangeText={v => updateBank(i, 'accountName', v)}
                    placeholder="Brothers in Christ"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    editable={isEditing}
                  />
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>Bank Name</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? (secondarySurface || 'rgba(255, 255, 255, 0.05)') : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        borderWidth: 1.5,
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        marginBottom: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                      }
                    ]}
                    value={bank.bankName}
                    onChangeText={v => updateBank(i, 'bankName', v)}
                    placeholder="HDFC Bank"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    editable={isEditing}
                  />
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>Account Number</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? (secondarySurface || 'rgba(255, 255, 255, 0.05)') : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        borderWidth: 1.5,
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        marginBottom: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                      }
                    ]}
                    value={bank.accountNumber}
                    onChangeText={v => updateBank(i, 'accountNumber', v)}
                    placeholder="50100XXXXXXX"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    keyboardType="numeric"
                    editable={isEditing}
                  />
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>IFSC Code</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? (secondarySurface || 'rgba(255, 255, 255, 0.05)') : (isEditing ? '#FFFFFF' : '#F8FAFC'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1',
                        borderWidth: 1.5,
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        marginBottom: 0,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                      }
                    ]}
                    value={bank.ifscCode}
                    onChangeText={v => updateBank(i, 'ifscCode', v)}
                    placeholder="HDFC0001234"
                    placeholderTextColor={isDark ? '#64748B' : '#94a3b8'}
                    autoCapitalize="characters"
                    editable={isEditing}
                  />
                </View>
              ))}

            </View>
          )}

          <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        <DateTimePickerModal
          isVisible={timePickerConfig.visible}
          mode="time"
          onConfirm={handleTimeConfirm}
          onCancel={() => setTimePickerConfig(prev => ({ ...prev, visible: false }))}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  topbar: {
    zIndex: 10,
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  container: { flex: 1, backgroundColor: '#EDE8DC' },
  hero: {
    backgroundColor: 'transparent',
    
    
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    overflow: 'visible',
    position: 'relative',
    marginBottom: 6,
  },
  heroTitle: { color: '#1a2d5a', fontSize: 20, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '600', letterSpacing: -0.5 },
  heroSub: { color: '#64748b', fontSize: 13 },

  saveBtn: { 
    backgroundColor: '#C9A84C', 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 12,
    shadowColor: '#C9A84C',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    flexShrink: 0
  },
  saveBtnTxt: { color: '#1a2d5a', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  
  editBtn: { 
    backgroundColor: '#C9A84C', 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 12,
    shadowColor: '#C9A84C',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    flexShrink: 0
  },
  editBtnTxt: { color: '#1a2d5a', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  viewModeHint: { backgroundColor: '#F0EBE0', color: '#1a2d5a', padding: 12, borderRadius: 12, marginBottom: 16, fontSize: 13, fontWeight: '700', textAlign: 'center', borderWidth: 1, borderColor: '#E2DDD5' },

  tabs: {
    flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 0,
    shadowColor: '#1a2d5a', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4, zIndex: 10
  },
  tab: {
    flex: 1, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 16, borderBottomWidth: 3, borderBottomColor: 'transparent', paddingHorizontal: 2,
  },
  tabTxt: { fontSize: 13, color: '#64748b', fontWeight: '700' },

  content: { padding: 20, paddingBottom: 60 },
  sectionLabel: { fontSize: 14, fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16, marginTop: 8, paddingLeft: 4 },

  label: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#0F172A', fontWeight: '600', borderWidth: 1.5, borderColor: '#CBD5E1', marginBottom: 16,
  },
  textArea: { height: 100, textAlignVertical: 'top' },

  inputRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#CBD5E1', marginBottom: 16,
  },
  socialPrefix: { fontSize: 13, color: '#D99A8C', fontWeight: '700', width: 70 },
  inputFlex: { flex: 1, fontSize: 15, color: '#0F172A', fontWeight: '600' },

  inputDisabled: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', color: '#6B7280', opacity: 0.95 },

  imageUpload: {
    backgroundColor: '#F9F6F0', borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(26,45,90,0.2)', borderStyle: 'dashed',
    height: 120, justifyContent: 'center', alignItems: 'center', marginBottom: 24, gap: 10,
    overflow: 'hidden',
  },
  bannerUpload: { height: 180 },
  logoPreview: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#fff' },
  bannerPreview: { width: '100%', height: '100%' },
  uploadTxt: { color: '#1a2d5a', fontSize: 13, fontWeight: '700' },

  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 24 },
  colorSwatch: { width: 48, height: 48, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  colorSwatchSelected: { borderWidth: 4, borderColor: '#fff', shadowColor: '#1a2d5a', shadowOpacity: 0.3, shadowRadius: 6 },
  colorSwatchDisabled: {
    opacity: 0.6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(26,45,90,0.08)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#1a2d5a',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a2d5a',
    marginBottom: 4,
  },
  switchHint: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    fontWeight: '500'
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#C9A84C', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, shadowColor: '#C9A84C', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  addBtnTxt: { fontSize: 12, fontWeight: '800', color: '#1a2d5a', marginLeft: 6, letterSpacing: 0.3 },
  cardItem: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#E2DDD5', marginBottom: 16, shadowColor: '#000000', shadowOpacity: 0.03, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1a2d5a' },

  churchCodeCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, marginBottom: 28,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(26,45,90,0.08)',
    shadowColor: '#1a2d5a', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6
  },
  churchCodeLabel: {
    fontSize: 11, fontWeight: '800', color: '#C9A84C', letterSpacing: 2, marginBottom: 10,
  },
  churchCodeValue: {
    fontSize: 36, fontWeight: '900', letterSpacing: 8, marginBottom: 8, color: '#1a2d5a'
  },
  churchCodeHint: {
    fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 20, fontWeight: '500'
  },
  churchCodeActions: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%'
  },
  churchCodeBtn: {
    borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flex: 1, alignItems: 'center', backgroundColor: '#F9F6F0', borderColor: '#E2DDD5'
  },
  churchCodeBtnTxt: {
    fontSize: 13, fontWeight: '800', color: '#1a2d5a'
  },
  geofenceExplainerTxt: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 10,
    marginTop: -4,
  },
  latLngRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
}));
