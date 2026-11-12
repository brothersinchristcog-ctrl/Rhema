import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  TextInput, 
  Dimensions, 
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Share,
  KeyboardAvoidingView,
  Image,
  Linking
} from 'react-native';
import { Users, Phone, Mail, ChevronDown, ChevronUp, Clock, UserCheck, UserX, Shield, Plus, X, Trash2, Edit2, ChevronLeft, UserPlus, Search, MoreVertical, Award, Sparkles, Check, Briefcase, ArrowLeft, Calendar, Heart, Droplets, ChevronRight } from 'lucide-react-native';
import FirestoreService from '../../services/FirestoreService';
import { isGuestMemberDoc, stripGuestSuffix } from '../../utils/phoneUtils';
import { useChurch } from '../../context/ChurchContext';
import { formatDateDisplay } from '../../utils/DateUtils';
import { CustomAlert, AlertButton } from '../../components/CustomAlert';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { AdminTabContext } from '../../context/AdminTabContext';
import InviteMembersModal from '../../components/InviteMembersModal';
import { CHURCH_SKILL_CATEGORIES, ALL_PREDEFINED_SKILLS } from '../../constants/churchSkills';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';

const { width } = Dimensions.get('window');
const serifFont = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const MemberAvatar = ({ member, initials, styles, size, style }: any) => {
  const { isDark } = useAdminTheme();
  const [imgError, setImgError] = React.useState(false);
  
  const possibleUrls = [
    member.profilePhoto,
    member.photoURL,
    member.photoUrl,
    member.profileImageUrl,
    member.PhotoUrl
  ];
  
  const validUrl = possibleUrls.find(
    (url: any) => typeof url === 'string' && url.trim() !== '' && url !== 'null' && url !== 'undefined'
  );

  const avatarSize = size || 56;

  const dynamicStyle = {
    width: avatarSize,
    height: avatarSize,
    borderRadius: avatarSize / 2,
    backgroundColor: isDark ? '#000000' : '#000000',
    borderWidth: isDark ? 1.5 : 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
  };

  const dynamicTxtStyle = {
    fontSize: Math.round(avatarSize * 0.36),
    color: '#FFFFFF',
    fontWeight: '800' as const,
  };

  if (validUrl && !imgError) {
    return (
      <Image 
        source={{ uri: validUrl }} 
        style={[styles.avatar, dynamicStyle, style, { borderRadius: avatarSize / 2 }]} 
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <View style={[styles.avatar, dynamicStyle, style, { borderRadius: avatarSize / 2 }]}>
      <Text style={[styles.avatarTxt, dynamicTxtStyle]}>{initials}</Text>
    </View>
  );
};

// Helper to parse multiple skills from string or array
const parseSkillsList = (val: any): string[] => {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string' && val.trim()) {
    return val.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
};

export default function AdminMembers() {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const { activeChurch, churchId } = useChurch();
  const { setActiveTab } = React.useContext(AdminTabContext);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [roleFilter, setRoleFilter] = useState<'All' | 'Members' | 'Guests'>('All');
  const [villageFilter, setVillageFilter] = useState<string>('All');
  const [villageDropdownVisible, setVillageDropdownVisible] = useState(false);
  const [skillPickerModalVisible, setSkillPickerModalVisible] = useState(false);
  const [activeSkillPickerField, setActiveSkillPickerField] = useState<'primarySkill' | 'secondarySkill' | null>(null);
  const [skillSearchText, setSkillSearchText] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedHouseholdIds, setExpandedHouseholdIds] = useState<Record<string, boolean>>({});
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false);

  // Selected Member for Dedicated Details View
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const detailsScrollRef = useRef<ScrollView>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [memberDetailsForm, setMemberDetailsForm] = useState({
    name: '',
    phone: '',
    email: '',
    city: '',
    dob: '',
    baptismDate: '',
    anniversaryDate: '',
    primarySkill: '',
    secondarySkill: '',
    userType: 'member'
  });

  // Add/Edit Member State
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const isSubmittingRef = useRef(false); // Prevents double-tap race condition
  const [newMemberForm, setNewMemberForm] = useState({
    name: '',
    phone: '',
    userType: 'member',
    dob: '',
    city: '',
    baptismDate: '',
    anniversaryDate: '',
    primarySkill: '',
    secondarySkill: ''
  });
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [activeDateField, setActiveDateField] = useState<'dob' | 'baptismDate' | 'anniversaryDate'>('dob');

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'info' | 'error' | 'warning';
    buttons?: AlertButton[];
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info'
  });

  const fetchMembers = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await FirestoreService.getAllMembers();
      setMembers(data);
    } catch (err: any) {
      console.error('Error fetching members:', err);
      setError(err?.message || 'Failed to fetch members');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handlePromoteAdmin = async (memberId: string) => {
    // Optimistic UI Update
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, userType: 'Admin' } : m));
    setSelectedMember(prev => (prev && prev.id === memberId ? { ...prev, userType: 'Admin' } : prev));
    setMemberDetailsForm(prev => ({ ...prev, userType: 'Admin' }));
    
    setAlertConfig({
      visible: true,
      title: 'Promoted',
      message: 'Member has been promoted to Admin.',
      type: 'success',
      buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
    });

    try {
      const success = await FirestoreService.updateMemberRole(memberId, 'Admin');
      if (!success) {
        // Revert optimistic update on failure
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, userType: 'Member' } : m));
        setSelectedMember(prev => (prev && prev.id === memberId ? { ...prev, userType: 'Member' } : prev));
        setMemberDetailsForm(prev => ({ ...prev, userType: 'Member' }));
        setAlertConfig({
          visible: true,
          title: 'Error',
          message: 'Failed to promote member.',
          type: 'error',
          buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
        });
      }
    } catch (err) {
      console.error(err);
      // Revert optimistic update on failure
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, userType: 'Member' } : m));
      setSelectedMember(prev => (prev && prev.id === memberId ? { ...prev, userType: 'Member' } : prev));
      setMemberDetailsForm(prev => ({ ...prev, userType: 'Member' }));
    }
  };

  const handleRemoveAdmin = async (memberId: string, memberName: string) => {
    // Optimistic UI Update
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, userType: 'Member' } : m));
    setSelectedMember(prev => (prev && prev.id === memberId ? { ...prev, userType: 'Member' } : prev));
    setMemberDetailsForm(prev => ({ ...prev, userType: 'Member' }));
    
    setAlertConfig({
      visible: true,
      title: 'Access Removed',
      message: `${memberName} is now a regular member.`,
      type: 'success',
      buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
    });

    try {
      const success = await FirestoreService.updateMemberRole(memberId, 'Member');
      if (!success) {
        // Revert optimistic update on failure
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, userType: 'Admin' } : m));
        setSelectedMember(prev => (prev && prev.id === memberId ? { ...prev, userType: 'Admin' } : prev));
        setMemberDetailsForm(prev => ({ ...prev, userType: 'Admin' }));
        setAlertConfig({
          visible: true,
          title: 'Error',
          message: 'Failed to remove admin role.',
          type: 'error',
          buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
        });
      }
    } catch (err) {
      console.error(err);
      // Revert optimistic update on failure
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, userType: 'Admin' } : m));
      setSelectedMember(prev => (prev && prev.id === memberId ? { ...prev, userType: 'Admin' } : prev));
      setMemberDetailsForm(prev => ({ ...prev, userType: 'Admin' }));
    }
  };

  const handleDeleteMember = (memberId: string, memberName: string) => {
    setAlertConfig({
      visible: true,
      title: 'Remove Member',
      message: `Are you sure you want to permanently remove ${memberName || 'this member'} from the church?`,
      type: 'warning',
      buttons: [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              setAlertConfig(prev => ({ ...prev, visible: false }));
              if (activeChurch?.id) {
                const res = await FirestoreService.adminRemoveMember(activeChurch.id, memberId);
                if (res.success) {
                  const removedSet = new Set([memberId, ...(res.removedIds || [])]);
                  setMembers(prev => prev.filter(m => !removedSet.has(m.id)));
                  if (selectedMember && removedSet.has(selectedMember.id)) {
                    setSelectedMember(null);
                  }
                  setTimeout(() => {
                    setAlertConfig({
                      visible: true,
                      title: 'Success!',
                      message: `${memberName || 'Member'} has been permanently removed.`,
                      type: 'success',
                      buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
                    });
                  }, 500);
                } else {
                  setError('Failed to remove member');
                }
              }
            } catch (err) {
                console.error(err);
                setError('Failed to remove member');
            } finally {
                setLoading(false);
            }
          }
        }
      ]
    });
  };

  const handleSelectMember = (member: any) => {
    setSelectedMember(member);
    setIsEditingMember(false);
    const memberName = (member.name && member.name.trim()) ||
      (member.displayName && member.displayName.trim()) ||
      (member.fullName && member.fullName.trim()) ||
      (`${member.firstName || ''} ${member.lastName || ''}`.trim()) ||
      '';
    setMemberDetailsForm({
      name: memberName,
      phone: member.phone || '',
      email: member.email || '',
      city: member.city || member.village || member.mailingCity || '',
      dob: member.dob || '',
      baptismDate: member.baptismDate || member.Baptism_Date__c || '',
      anniversaryDate: member.anniversaryDate || member.Anniversary_Date__c || '',
      primarySkill: member.primarySkill || '',
      secondarySkill: member.secondarySkill || '',
      userType: member.userType || 'member'
    });
  };

  const handleSaveMemberDetails = async () => {
    if (!selectedMember) return;
    const targetChurchId = activeChurch?.id || churchId || (await FirestoreService.getChurchId());
    if (!targetChurchId) {
      setAlertConfig({
        visible: true,
        title: 'Error',
        message: 'Church identifier could not be determined. Please re-login or switch church.',
        type: 'error',
        buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
      });
      return;
    }

    if (!memberDetailsForm.name.trim() || !memberDetailsForm.phone.trim()) {
      setAlertConfig({
        visible: true,
        title: 'Missing Info',
        message: 'Please provide both name and phone number.',
        type: 'warning',
        buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
      });
      return;
    }

    const digitsOnly = memberDetailsForm.phone.replace(/\D/g, '');
    const last10 = digitsOnly.slice(-10);
    const formattedPhone = digitsOnly.startsWith('91') && digitsOnly.length > 10
      ? `+${digitsOnly}`
      : (last10 ? `+91${last10}` : memberDetailsForm.phone.trim());

    const trimmedName = memberDetailsForm.name.trim();
    const nameParts = trimmedName.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    try {
      setSavingDetails(true);
      const updatedPayload: any = {
        name: trimmedName,
        displayName: trimmedName,
        firstName: firstName,
        lastName: lastName,
        phone: formattedPhone,
        email: memberDetailsForm.email.trim(),
        city: memberDetailsForm.city.trim(),
        village: memberDetailsForm.city.trim(),
        mailingCity: memberDetailsForm.city.trim(),
        dob: memberDetailsForm.dob || '',
        baptismDate: memberDetailsForm.baptismDate || '',
        Baptism_Date__c: memberDetailsForm.baptismDate || '',
        anniversaryDate: memberDetailsForm.anniversaryDate || '',
        Anniversary_Date__c: memberDetailsForm.anniversaryDate || '',
        primarySkill: memberDetailsForm.primarySkill?.trim() || '',
        secondarySkill: memberDetailsForm.secondarySkill?.trim() || '',
        userType: memberDetailsForm.userType || selectedMember.userType || 'member',
      };

      const res = await FirestoreService.adminUpdateMember(targetChurchId, selectedMember.id, updatedPayload);
      if (res.success) {
        setMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, ...updatedPayload } : m));
        setSelectedMember((prev: any) => (prev ? { ...prev, ...updatedPayload } : null));
        setIsEditingMember(false);
        fetchMembers(true);
        setAlertConfig({
          visible: true,
          title: 'Saved Successfully',
          message: `${trimmedName}'s details have been updated.`,
          type: 'success',
          buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
        });
      } else {
        setAlertConfig({
          visible: true,
          title: 'Error',
          message: res.error === 'DUPLICATE_MEMBER' ? 'Another member with this phone number already exists.' : (res.error || 'Failed to update member.'),
          type: 'error',
          buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
        });
      }
    } catch (err: any) {
      console.error('Error saving member details:', err);
      setAlertConfig({
        visible: true,
        title: 'Error',
        message: err.message || 'An unexpected error occurred.',
        type: 'error',
        buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
      });
    } finally {
      setSavingDetails(false);
    }
  };

  // Compute unique villages for dropdown filter
  const uniqueVillages = useMemo(() => {
    const villages = members.map(m => (m.city || m.village || '').trim()).filter(Boolean);
    const unique = Array.from(new Set(villages)).sort();
    return ['All', ...unique];
  }, [members]);

  // Filter skills for Skill Picker bottom sheet modal
  const filteredSkillList = useMemo(() => {
    let list: string[] = [];
    if (selectedCategoryTab === 'all') {
      list = ALL_PREDEFINED_SKILLS;
    } else {
      const cat = CHURCH_SKILL_CATEGORIES.find(c => c.id === selectedCategoryTab);
      list = cat ? cat.skills : ALL_PREDEFINED_SKILLS;
    }

    if (skillSearchText.trim()) {
      const query = skillSearchText.trim().toLowerCase();
      return ALL_PREDEFINED_SKILLS.filter(s => s.toLowerCase().includes(query));
    }
    return list;
  }, [selectedCategoryTab, skillSearchText]);

  const openSkillPicker = (field: 'primarySkill' | 'secondarySkill') => {
    setActiveSkillPickerField(field);
    setSkillSearchText('');
    setSelectedCategoryTab('all');
    setCustomSkillInput('');
    setSkillPickerModalVisible(true);
  };

  // Village Filtered Members (used for stats based on the selected village)
  const villageFilteredMembers = useMemo(() => {
    return members.filter(m => villageFilter === 'All' || (m.city || m.village || '').trim() === villageFilter);
  }, [members, villageFilter]);

  // Stats calculation
  const totalMembers = villageFilteredMembers.length;
  const guestMembersCount = villageFilteredMembers.filter(m => isGuestMemberDoc(m)).length;
  const fullMembersCount = totalMembers - guestMembersCount;
  const activeMembers = villageFilteredMembers.length; // Assuming all firebase members are active for now
  const inactiveMembers = 0;

  const handleConvertGuestToMember = (targetMemberId: string, targetName: string) => {
    setAlertConfig({
      visible: true,
      title: 'Convert to Full Member?',
      message: `Upgrade "${stripGuestSuffix(targetName) || 'this guest'}" from Guest to a permanent Church Member?`,
      type: 'info',
      buttons: [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        },
        {
          text: 'Convert to Member',
          onPress: async () => {
            setAlertConfig(prev => ({ ...prev, visible: false }));
            try {
              const targetChurchId = activeChurch?.id || churchId || (await FirestoreService.getChurchId());
              const res = await FirestoreService.convertGuestToMember(targetChurchId, targetMemberId);
              if (res.success) {
                setMembers(prev =>
                  prev.map(m =>
                    m.id === targetMemberId
                      ? { ...m, userType: 'member', isGuest: false }
                      : m
                  )
                );
                setSelectedMember((prev: any) =>
                  prev && prev.id === targetMemberId
                    ? { ...prev, userType: 'member', isGuest: false }
                    : prev
                );
                setMemberDetailsForm(prev => ({ ...prev, userType: 'member' }));
                Alert.alert('Success', 'Guest has been converted to a Full Church Member.');
              } else {
                Alert.alert('Error', res.error || 'Could not convert guest.');
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not convert guest.');
            }
          },
        },
      ],
    });
  };

  const handleAddMember = async () => {
    if (!newMemberForm.name.trim() || !newMemberForm.phone.trim()) {
      setAlertConfig({
        visible: true,
        title: 'Missing Info',
        message: 'Please provide both name and phone number.',
        type: 'warning',
        buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
      });
      return;
    }
    
    const digitsOnly = newMemberForm.phone.replace(/\D/g, '');
    const last10 = digitsOnly.slice(-10);
    const formattedPhone = `+91${last10}`;

    try {
      // ── Guard: block concurrent submissions (double-tap / fast network race) ──
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;

      setAddMemberLoading(true);

      const targetChurchId = activeChurch?.id || churchId || await FirestoreService.getChurchId();

      // ── Real-time Firestore duplicate check (source of truth, not stale local array) ──
      if (!editMemberId) {
        const isDuplicate = await FirestoreService.checkMemberExistsInChurch(
          targetChurchId,
          formattedPhone
        );
        if (isDuplicate) {
          setAlertConfig({
            visible: true,
            title: 'Duplicate Member',
            message: 'A member with this phone number already exists in this church.',
            type: 'warning',
            buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
          });
          setAddMemberLoading(false);
          isSubmittingRef.current = false;
          return;
        }
      }

      const trimmedAddName = newMemberForm.name.trim();
      const addNameParts = trimmedAddName.split(/\s+/);
      const addFirstName = addNameParts[0] || '';
      const addLastName = addNameParts.length > 1 ? addNameParts.slice(1).join(' ') : '';

      let res;
      if (editMemberId) {
        res = await FirestoreService.adminUpdateMember(targetChurchId, editMemberId, {
          name: trimmedAddName,
          displayName: trimmedAddName,
          firstName: addFirstName,
          lastName: addLastName,
          phone: formattedPhone,
          userType: newMemberForm.userType,
          dob: newMemberForm.dob,
          city: newMemberForm.city,
          baptismDate: newMemberForm.baptismDate,
          anniversaryDate: newMemberForm.anniversaryDate,
          primarySkill: newMemberForm.primarySkill?.trim() || '',
          secondarySkill: newMemberForm.secondarySkill?.trim() || '',
        });
      } else {
        res = await FirestoreService.adminAddMember(targetChurchId, {
          name: trimmedAddName,
          displayName: trimmedAddName,
          firstName: addFirstName,
          lastName: addLastName,
          phone: formattedPhone,
          userType: newMemberForm.userType,
          dob: newMemberForm.dob,
          churchId: targetChurchId,
          city: newMemberForm.city,
          baptismDate: newMemberForm.baptismDate,
          anniversaryDate: newMemberForm.anniversaryDate,
          primarySkill: newMemberForm.primarySkill?.trim() || '',
          secondarySkill: newMemberForm.secondarySkill?.trim() || '',
        });
      }

      if (res.success) {
        setAddModalVisible(false);
        setEditMemberId(null);
        setNewMemberForm({ name: '', phone: '', userType: 'member', dob: '', city: '', baptismDate: '', anniversaryDate: '', primarySkill: '', secondarySkill: '' });
        fetchMembers();

        setTimeout(() => {
          setAlertConfig({
            visible: true,
            title: 'Success!',
            message: editMemberId ? 'Member updated successfully!' : 'Member added successfully!',
            type: 'success',
            buttons: [{ 
              text: 'OK', 
              onPress: () => {
                setAlertConfig(prev => ({ ...prev, visible: false }));
                if (!editMemberId) {
                  // Share functionality after OK for new members
                  const churchName = activeChurch?.name || 'Rhema Global Ministries';
                  const memberPhone = newMemberForm.phone || '';
                  const memberDigits = memberPhone.replace(/\D/g, '').slice(-10);
                  const playStoreLink = `https://play.google.com/store/apps/details?id=com.rhemaglobalministries.app`;

                  const shareMsg = 
`Greetings in Jesus' Name! 🙏✨

Dear ${newMemberForm.name || 'Brother/Sister'},

You are warmly invited to join the ${churchName} Mobile Application! ⛪

Your church profile has already been registered for you, so you DO NOT need to sign up. Simply download the app and Sign In directly with your mobile number${memberDigits ? `: ${memberDigits}` : ''}.

📲 Download App from Google Play Store:
${playStoreLink}

May God bless you abundantly! ❤️`;

                  Share.share({
                    message: shareMsg,
                    title: `Church Invitation - ${churchName}`,
                  });
                }
              }
            }]
          });
        }, 500);

      } else {
        setAlertConfig({
          visible: true,
          title: 'Error',
          message: res.error === 'DUPLICATE_MEMBER' ? 'A member with this phone number already exists in this church.' : (res.error || 'Failed to add member'),
          type: 'error',
          buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
        });
      }
    } catch (e: any) {
      setAlertConfig({
        visible: true,
        title: 'Error',
        message: e.message === 'DUPLICATE_MEMBER' ? 'A member with this phone number already exists in this church.' : e.message,
        type: 'error',
        buttons: [{ text: 'OK', onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
      });
    } finally {
      setAddMemberLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .filter(Boolean)
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const formatLastAppOpened = (dateVal: any) => {
    if (!dateVal) return 'Never';
    try {
      let date: Date;
      // Handle Firestore Timestamp objects
      if (dateVal && typeof dateVal.toDate === 'function') {
        date = dateVal.toDate();
      } else if (dateVal && typeof dateVal._seconds === 'number') {
        date = new Date(dateVal._seconds * 1000);
      } else if (dateVal && typeof dateVal.seconds === 'number') {
        date = new Date(dateVal.seconds * 1000);
      } else {
        date = new Date(dateVal);
      }
      
      if (isNaN(date.getTime())) return String(dateVal);
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const day = date.getDate();
      const year = date.getFullYear();
      
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      
      return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
    } catch (e) {
      return String(dateVal);
    }
  };

  const filteredMembers = villageFilteredMembers.filter(m => {
    // Map Firebase schema fields
    const nameStr = (m.name || (`${m.firstName || ''} ${m.lastName || ''}`.trim()) || '').toLowerCase();
    const emailStr = (m.email || '').toLowerCase();
    const phoneStr = m.phone || '';
    const villageStr = (m.city || m.village || '').toLowerCase();
    const primarySkillStr = (m.primarySkill || '').toLowerCase();
    const secondarySkillStr = (m.secondarySkill || '').toLowerCase();
    
    const matchesSearch = 
      nameStr.includes(searchQuery.toLowerCase()) ||
      emailStr.includes(searchQuery.toLowerCase()) ||
      villageStr.includes(searchQuery.toLowerCase()) ||
      phoneStr.includes(searchQuery) ||
      primarySkillStr.includes(searchQuery.toLowerCase()) ||
      secondarySkillStr.includes(searchQuery.toLowerCase());

    const isActive = true; // Assuming active by default in Firebase
    const matchesStatus = 
      statusFilter === 'All' || 
      (statusFilter === 'Active' && isActive) ||
      (statusFilter === 'Inactive' && !isActive);

    const isGuest = isGuestMemberDoc(m);
    const matchesRole =
      roleFilter === 'All' ||
      (roleFilter === 'Guests' && isGuest) ||
      (roleFilter === 'Members' && !isGuest);

    return matchesSearch && matchesStatus && matchesRole;
  });

  if (loading && members.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a2d5a" />
        <Text style={{ marginTop: 10, color: '#1a2d5a', fontWeight: '600' }}>Loading members...</Text>
      </View>
    );
  }

  if (error && members.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTxt}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchMembers()}>
          <Text style={styles.retryBtnTxt}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderMemberDetails = () => {
    if (!selectedMember) return null;

    const displayName = (memberDetailsForm.name && memberDetailsForm.name.trim()) ||
      (selectedMember.name && selectedMember.name.trim()) ||
      (selectedMember.displayName && selectedMember.displayName.trim()) ||
      (selectedMember.fullName && selectedMember.fullName.trim()) ||
      (`${selectedMember.firstName || ''} ${selectedMember.lastName || ''}`.trim()) ||
      (selectedMember.phone ? `Member (${selectedMember.phone})` : 'Unknown');
    const displayRole = (memberDetailsForm.userType || selectedMember.userType || 'member').toLowerCase();
    const isAdminRole = displayRole === 'admin' || displayRole === 'super_admin' || displayRole === 'super admin';
    const familyMembers = selectedMember.accountId
      ? members.filter(m => m.accountId === selectedMember.accountId && m.id !== selectedMember.id)
      : [];

    return (
      <>
        {/* Top Mini Card Header for Member Details */}
        <View style={[styles.hero, {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: isDark ? '#27272A' : '#E2E8F0',
          paddingBottom: 14,
          marginBottom: 4,
        }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <View style={{ minWidth: 40, alignItems: 'flex-start', justifyContent: 'center' }}>
              <TouchableOpacity
                onPress={() => {
                  setSelectedMember(null);
                  setIsEditingMember(false);
                }}
                style={styles.circularBackBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
              <Text
                style={[
                  styles.heroTitle,
                  {
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    textAlign: 'center',
                    fontSize: 20,
                    fontWeight: '800',
                    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                    letterSpacing: -0.4,
                  }
                ]}
                numberOfLines={1}
              >
                Member Details
              </Text>
            </View>
            
            <View style={{ minWidth: 40, alignItems: 'center', justifyContent: 'center' }}>
              <TouchableOpacity 
                onPress={() => setIsEditingMember(prev => !prev)} 
                style={[
                  styles.circularBackBtn,
                  isEditingMember ? {
                    backgroundColor: isDark ? '#2563EB' : '#1A2D5A',
                    borderColor: isDark ? '#3B82F6' : '#1A2D5A',
                    borderWidth: 1.5,
                  } : {
                    backgroundColor: isDark ? '#000000' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#E2E8F0',
                    borderWidth: 1.5,
                  }
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Edit2 
                  size={18} 
                  color={isEditingMember ? '#FFFFFF' : (isDark ? '#FFFFFF' : '#0F172A')} 
                  strokeWidth={2.2} 
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <ScrollView
          ref={detailsScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 }}
        >
          {/* Top Profile Header Section (Clean Circle, No Card Container) */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 22 }}>
            <View style={{
              width: 106,
              height: 106,
              borderRadius: 53,
              padding: 3,
              borderWidth: 2.5,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#CBD5E1',
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.3 : 0.08,
              shadowRadius: 8,
              elevation: 4,
            }}>
              <MemberAvatar
                member={selectedMember}
                initials={getInitials(displayName)}
                styles={styles}
                size={98}
              />
            </View>

            <Text style={[
              styles.detailsHeroName,
              { marginTop: 12, fontSize: 22, fontWeight: '800' },
              isDark ? { color: '#FFFFFF' } : { color: '#0F172A' }
            ]}>
              {displayName}
            </Text>

            {/* Active Status Badge */}
            <View style={{ marginTop: 8 }}>
              <View style={[
                styles.statusBadge,
                { paddingHorizontal: 12, paddingVertical: 4 },
                !isDark && { backgroundColor: '#DCFCE7', borderColor: '#86EFAC', borderWidth: 1 },
                isDark && { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: 'rgba(16, 185, 129, 0.35)', borderWidth: 1 }
              ]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? '#34D399' : '#15803D' }} />
                  <Text style={[styles.statusTxt, !isDark ? { color: '#15803D' } : { color: '#34D399' }, { fontWeight: '700' }]}>
                    Active
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Form Fields Section */}
          <View style={styles.detailsSectionHeaderRow}>
            <Text style={styles.detailsSectionHeader}>MEMBER INFORMATION</Text>
          </View>

          {/* Name Field */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Name</Text>
            <TextInput
              style={[
                styles.formInput,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)', color: '#FFFFFF' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', color: '#0F172A' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              value={memberDetailsForm.name}
              onChangeText={(t) => setMemberDetailsForm(prev => ({ ...prev, name: t }))}
              placeholder="Full Name"
              placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
              editable={isEditingMember}
            />
          </View>

          {/* Role Field */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Role</Text>
            <TextInput
              style={[
                styles.formInput,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)', color: '#FFFFFF' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', color: '#0F172A' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              value={memberDetailsForm.userType ? memberDetailsForm.userType.split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'Member'}
              onChangeText={(t) => setMemberDetailsForm(prev => ({ ...prev, userType: t }))}
              placeholder="Role"
              placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
              editable={isEditingMember}
            />
          </View>

          {/* Mobile Number Field */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Mobile Number</Text>
            <TextInput
              style={[
                styles.formInput,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)', color: '#FFFFFF' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', color: '#0F172A' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              value={memberDetailsForm.phone}
              onChangeText={(t) => setMemberDetailsForm(prev => ({ ...prev, phone: t }))}
              placeholder="Mobile Number"
              placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
              keyboardType="phone-pad"
              editable={isEditingMember}
            />
          </View>

          {isGuestMemberDoc(selectedMember) && (
            <View
              style={{
                backgroundColor: isDark ? 'rgba(109, 40, 217, 0.16)' : '#F5F3FF',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(167, 139, 250, 0.35)' : '#DDD6FE',
                borderRadius: 14,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#C4B5FD' : '#6D28D9', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Guest Invitation Details
              </Text>
              <Text style={{ fontSize: 13.5, color: isDark ? '#E4E4E7' : '#1E293B', marginTop: 6, fontWeight: '600' }}>
                Relation: {selectedMember?.relation || 'Guest'}
              </Text>
              {selectedMember?.invitedByMemberName ? (
                <Text style={{ fontSize: 12.5, color: isDark ? '#A1A1AA' : '#475569', marginTop: 3 }}>
                  Invited by {selectedMember.invitedByMemberName}
                </Text>
              ) : null}
              <Text style={{ fontSize: 12, color: isDark ? '#34D399' : '#059669', marginTop: 4, fontWeight: '700' }}>
                App Status: {selectedMember?.inviteStatus === 'joined' ? 'Joined App via Invite' : 'Invited (Pending Sign-In)'}
              </Text>
            </View>
          )}

          {/* Email Address Field */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Email Address</Text>
            <TextInput
              style={[
                styles.formInput,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)', color: '#FFFFFF' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', color: '#0F172A' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              value={memberDetailsForm.email}
              onChangeText={(t) => setMemberDetailsForm(prev => ({ ...prev, email: t }))}
              placeholder="Email Address"
              placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={isEditingMember}
            />
          </View>

          {/* Village / City Field */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Village / City</Text>
            <TextInput
              style={[
                styles.formInput,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)', color: '#FFFFFF' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', color: '#0F172A' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              value={memberDetailsForm.city}
              onChangeText={(t) => setMemberDetailsForm(prev => ({ ...prev, city: t }))}
              placeholder="Village or City"
              placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
              editable={isEditingMember}
            />
          </View>

          {/* Date of Birth Field */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Date of Birth</Text>
            <TouchableOpacity
              style={[
                styles.detailsDateField,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              onPress={() => {
                setActiveDateField('dob');
                setDatePickerVisibility(true);
              }}
              activeOpacity={isEditingMember ? 0.7 : 1}
              disabled={!isEditingMember}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Calendar size={18} color={isDark ? '#60A5FA' : '#1A2D5A'} />
                <Text style={[styles.detailsDateTxt, isDark ? { color: '#FFFFFF' } : { color: '#0F172A' }, !memberDetailsForm.dob && { color: isDark ? '#71717A' : '#94A3B8' }]}>
                  {memberDetailsForm.dob ? formatDateDisplay(memberDetailsForm.dob) : 'Select Date of Birth'}
                </Text>
              </View>
              {isEditingMember && <ChevronRight size={18} color={isDark ? '#71717A' : '#94A3B8'} />}
            </TouchableOpacity>
          </View>

          {/* Baptism Date Field */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Baptism Date</Text>
            <TouchableOpacity
              style={[
                styles.detailsDateField,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              onPress={() => {
                setActiveDateField('baptismDate');
                setDatePickerVisibility(true);
              }}
              activeOpacity={isEditingMember ? 0.7 : 1}
              disabled={!isEditingMember}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Droplets size={18} color={isDark ? '#38BDF8' : '#0284C7'} />
                <Text style={[styles.detailsDateTxt, isDark ? { color: '#FFFFFF' } : { color: '#0F172A' }, !memberDetailsForm.baptismDate && { color: isDark ? '#71717A' : '#94A3B8' }]}>
                  {memberDetailsForm.baptismDate ? formatDateDisplay(memberDetailsForm.baptismDate) : 'Select Baptism Date'}
                </Text>
              </View>
              {isEditingMember && <ChevronRight size={18} color={isDark ? '#71717A' : '#94A3B8'} />}
            </TouchableOpacity>
          </View>

          {/* Wedding Anniversary Date Field */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Wedding Anniversary Date</Text>
            <TouchableOpacity
              style={[
                styles.detailsDateField,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              onPress={() => {
                setActiveDateField('anniversaryDate');
                setDatePickerVisibility(true);
              }}
              activeOpacity={isEditingMember ? 0.7 : 1}
              disabled={!isEditingMember}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Heart size={18} color={isDark ? '#F43F5E' : '#E11D48'} />
                <Text style={[styles.detailsDateTxt, isDark ? { color: '#FFFFFF' } : { color: '#0F172A' }, !memberDetailsForm.anniversaryDate && { color: isDark ? '#71717A' : '#94A3B8' }]}>
                  {memberDetailsForm.anniversaryDate ? formatDateDisplay(memberDetailsForm.anniversaryDate) : 'Select Anniversary Date'}
                </Text>
              </View>
              {isEditingMember && <ChevronRight size={18} color={isDark ? '#71717A' : '#94A3B8'} />}
            </TouchableOpacity>
          </View>

          {/* Primary Skill */}
          <View style={styles.formGroup}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.formLabel}>Primary Skill</Text>
              {isEditingMember && memberDetailsForm.primarySkill ? (
                <TouchableOpacity onPress={() => setMemberDetailsForm(prev => ({ ...prev, primarySkill: '' }))}>
                  <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.detailsDateField,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              onPress={() => openSkillPicker('primarySkill')}
              activeOpacity={isEditingMember ? 0.7 : 1}
              disabled={!isEditingMember}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, flexWrap: 'wrap', gap: 6 }}>
                <Award size={18} color={memberDetailsForm.primarySkill ? (isDark ? '#60A5FA' : '#1A2D5A') : (isDark ? '#71717A' : '#94A3B8')} />
                {parseSkillsList(memberDetailsForm.primarySkill).length > 0 ? (
                  parseSkillsList(memberDetailsForm.primarySkill).map((sk, idx) => (
                    <View key={idx} style={[styles.skillChipTag, isDark ? { backgroundColor: 'rgba(59, 130, 246, 0.2)', borderColor: 'rgba(59, 130, 246, 0.4)' } : { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                      <Text style={[styles.skillChipTagTxt, isDark ? { color: '#93C5FD' } : { color: '#1E40AF' }]}>{sk}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.detailsDateTxt, { color: isDark ? '#71717A' : '#94A3B8' }]}>Select Primary Skills</Text>
                )}
              </View>
              {isEditingMember && <ChevronRight size={18} color={isDark ? '#71717A' : '#94A3B8'} />}
            </TouchableOpacity>
          </View>

          {/* Secondary Skill */}
          <View style={styles.formGroup}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.formLabel}>Secondary Skill</Text>
              {isEditingMember && memberDetailsForm.secondarySkill ? (
                <TouchableOpacity onPress={() => setMemberDetailsForm(prev => ({ ...prev, secondarySkill: '' }))}>
                  <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.detailsDateField,
                isDark
                  ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
                !isEditingMember && { opacity: 0.85 }
              ]}
              onPress={() => openSkillPicker('secondarySkill')}
              activeOpacity={isEditingMember ? 0.7 : 1}
              disabled={!isEditingMember}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, flexWrap: 'wrap', gap: 6 }}>
                <Sparkles size={18} color={memberDetailsForm.secondarySkill ? (isDark ? '#C084FC' : '#7C3AED') : (isDark ? '#71717A' : '#94A3B8')} />
                {parseSkillsList(memberDetailsForm.secondarySkill).length > 0 ? (
                  parseSkillsList(memberDetailsForm.secondarySkill).map((sk, idx) => (
                    <View key={idx} style={[styles.skillChipTag, isDark ? { backgroundColor: 'rgba(192, 132, 252, 0.2)', borderColor: 'rgba(192, 132, 252, 0.4)' } : { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}>
                      <Text style={[styles.skillChipTagTxt, isDark ? { color: '#C084FC' } : { color: '#7E22CE' }]}>{sk}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.detailsDateTxt, { color: isDark ? '#71717A' : '#94A3B8' }]}>Select Secondary Skills</Text>
                )}
              </View>
              {isEditingMember && <ChevronRight size={18} color={isDark ? '#71717A' : '#94A3B8'} />}
            </TouchableOpacity>
          </View>

          {/* Update Member Details Button (Circle Badge, White in Dark Mode, Black in White Theme) */}
          <View style={{ alignItems: 'center', marginTop: 14 }}>
            <TouchableOpacity
              style={[
                styles.saveChangesBtn,
                isDark
                  ? { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' }
                  : { backgroundColor: '#000000', borderColor: '#000000' },
                {
                  borderRadius: 30,
                  paddingVertical: 13,
                  paddingHorizontal: 26,
                  borderWidth: 1.5,
                  alignSelf: 'center',
                },
                (!isEditingMember || savingDetails) && { opacity: isEditingMember ? 0.7 : 0.4 }
              ]}
              onPress={handleSaveMemberDetails}
              disabled={!isEditingMember || savingDetails}
              activeOpacity={0.8}
            >
              {savingDetails ? (
                <ActivityIndicator color={isDark ? '#000000' : '#FFFFFF'} size="small" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.25)',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}>
                    <Check size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />
                  </View>
                  <Text style={[styles.saveChangesBtnTxt, { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }]}>
                    Update Member Details
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Administrative Controls Section */}
          <View style={[styles.detailsSectionHeaderRow, { marginTop: 28 }]}>
            <Text style={styles.detailsSectionHeader}>ADMINISTRATIVE CONTROLS</Text>
          </View>

          <View style={{ gap: 10 }}>
            {isGuestMemberDoc(selectedMember) && (
              <TouchableOpacity
                style={[
                  styles.adminActionBtn,
                  {
                    backgroundColor: '#059669',
                    borderColor: '#059669',
                    shadowColor: '#059669',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: isDark ? 0.35 : 0.2,
                    shadowRadius: 5,
                    elevation: 3,
                  }
                ]}
                onPress={() => handleConvertGuestToMember(selectedMember.id, memberDetailsForm.name)}
                activeOpacity={0.8}
              >
                <UserCheck size={18} color="#FFFFFF" strokeWidth={2.3} />
                <View style={{ alignItems: 'center', flexShrink: 1 }}>
                  <Text style={[styles.adminActionBtnTxt, { color: '#FFFFFF' }]}>Convert to Full Member</Text>
                  <Text style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.92)', marginTop: 2, fontWeight: '600', textAlign: 'center' }}>
                    Upgrade {stripGuestSuffix(memberDetailsForm.name) || 'this guest'} into regular church roster
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {isAdminRole ? (
              <TouchableOpacity
                style={[
                  styles.adminActionBtn,
                  {
                    backgroundColor: '#FF3800',
                    borderColor: '#FF3800',
                    shadowColor: '#FF3800',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: isDark ? 0.35 : 0.2,
                    shadowRadius: 5,
                    elevation: 3,
                  }
                ]}
                onPress={() => handleRemoveAdmin(selectedMember.id, memberDetailsForm.name)}
                activeOpacity={0.8}
              >
                <UserX size={18} color="#FFFFFF" strokeWidth={2.3} />
                <View style={{ alignItems: 'center', flexShrink: 1 }}>
                  <Text style={[styles.adminActionBtnTxt, { color: '#FFFFFF' }]}>Remove Admin Role</Text>
                  <Text style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.9)', marginTop: 2, fontWeight: '600', textAlign: 'center' }}>
                    Demote {memberDetailsForm.name} back to regular member
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.adminActionBtn,
                  {
                    backgroundColor: '#FF3800',
                    borderColor: '#FF3800',
                    shadowColor: '#FF3800',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: isDark ? 0.35 : 0.2,
                    shadowRadius: 5,
                    elevation: 3,
                  }
                ]}
                onPress={() => handlePromoteAdmin(selectedMember.id)}
                activeOpacity={0.8}
              >
                <Shield size={18} color="#FFFFFF" strokeWidth={2.3} />
                <View style={{ alignItems: 'center', flexShrink: 1 }}>
                  <Text style={[styles.adminActionBtnTxt, { color: '#FFFFFF' }]}>Promote to Admin</Text>
                  <Text style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.9)', marginTop: 2, fontWeight: '600', textAlign: 'center' }}>
                    Grant administrative permissions for this church
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Remove Member from Church Button */}
            <TouchableOpacity
              style={[
                styles.adminActionBtn,
                {
                  backgroundColor: '#FF3800',
                  borderColor: '#FF3800',
                  shadowColor: '#FF3800',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.35 : 0.2,
                  shadowRadius: 5,
                  elevation: 3,
                }
              ]}
              onPress={() => handleDeleteMember(selectedMember.id, memberDetailsForm.name)}
              activeOpacity={0.8}
            >
              <Trash2 size={18} color="#FFFFFF" strokeWidth={2.3} />
              <View style={{ alignItems: 'center', flexShrink: 1 }}>
                <Text style={[styles.adminActionBtnTxt, { color: '#FFFFFF' }]}>Remove Member from Church</Text>
                <Text style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.9)', marginTop: 2, fontWeight: '600', textAlign: 'center' }}>
                  Permanently remove from church member directory
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Household & Family Members Section */}
          <View style={[styles.detailsSectionHeaderRow, { marginTop: 28 }]}>
            <Text style={styles.detailsSectionHeader}>FAMILY & HOUSEHOLD MEMBERS</Text>
            {familyMembers.length > 0 && (
              <View style={[styles.familyCountBadge, isDark ? { backgroundColor: 'rgba(59, 130, 246, 0.2)' } : { backgroundColor: '#EFF6FF' }]}>
                <Text style={[styles.familyCountTxt, isDark ? { color: '#60A5FA' } : { color: '#1A2D5A' }]}>
                  {familyMembers.length} {familyMembers.length === 1 ? 'Member' : 'Members'}
                </Text>
              </View>
            )}
          </View>

          {familyMembers.length > 0 ? (
            <View style={{ gap: 10 }}>
              {familyMembers.map((famMember, fIdx) => {
                const famName = (famMember.name && famMember.name.trim()) ||
                  (famMember.displayName && famMember.displayName.trim()) ||
                  (famMember.fullName && famMember.fullName.trim()) ||
                  (`${famMember.firstName || ''} ${famMember.lastName || ''}`.trim()) ||
                  (famMember.phone ? `Member (${famMember.phone})` : 'Unknown');
                const famRole = famMember.userType || 'member';
                return (
                  <TouchableOpacity
                    key={`fam-${famMember.id || fIdx}`}
                    style={[
                      styles.familyMemberCard,
                      isDark
                        ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.12)' }
                        : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 }
                    ]}
                    onPress={() => {
                      handleSelectMember(famMember);
                      detailsScrollRef.current?.scrollTo({ y: 0, animated: true });
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <MemberAvatar member={famMember} initials={getInitials(famName)} styles={styles} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.familyNameTxt, isDark ? { color: '#FFFFFF' } : { color: '#0F172A' }]} numberOfLines={1}>
                            {famName}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <View style={[styles.familyRoleBadge, isDark ? { backgroundColor: 'rgba(255,255,255,0.08)' } : { backgroundColor: '#F1F5F9' }]}>
                              <Text style={[styles.familyRoleTxt, isDark ? { color: '#D4D4D8' } : { color: '#475569' }]}>
                                {famRole.toUpperCase()}
                              </Text>
                            </View>
                            {(famMember.city || famMember.village) ? (
                              <Text style={{ fontSize: 11, color: isDark ? '#A1A1AA' : '#64748B' }}>
                                📍 {(famMember.city || famMember.village).trim()}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.viewMemberPill, isDark ? { backgroundColor: 'rgba(255,255,255,0.08)' } : { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', borderWidth: 1 }]}>
                          <Text style={[styles.viewMemberPillTxt, isDark ? { color: '#FFFFFF' } : { color: '#1A2D5A' }]}>View</Text>
                          <ChevronRight size={14} color={isDark ? '#FFFFFF' : '#1A2D5A'} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={[
              styles.emptyFamilyCard,
              isDark
                ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.1)' }
                : { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }
            ]}>
              <Users size={28} color={isDark ? '#71717A' : '#94A3B8'} style={{ marginBottom: 6 }} />
              <Text style={[styles.emptyFamilyTitle, isDark ? { color: '#E4E4E7' } : { color: '#334155' }]}>
                No Linked Family Members
              </Text>
              <Text style={[styles.emptyFamilyDesc, isDark ? { color: '#A1A1AA' } : { color: '#64748B' }]}>
                No other family or household members are linked under this member's account.
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </>
    );
  };

  return (
    <View style={styles.container}>
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />

      {selectedMember ? renderMemberDetails() : (
        <>
          {/* ── Hero Section (Top Mini Card Header) ── */}
      <View style={[styles.hero, {
        backgroundColor: isDark ? '#000000' : '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#27272A' : '#E2E8F0',
        paddingBottom: 14,
        marginBottom: 4,
      }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <View style={{ minWidth: 40, alignItems: 'flex-start', justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={() => setActiveTab(0)}
              style={styles.circularBackBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text
              style={[
                styles.heroTitle,
                {
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  textAlign: 'center',
                  fontSize: 20,
                  fontWeight: '800',
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                  letterSpacing: -0.4,
                }
              ]}
              numberOfLines={1}
            >
              Members
            </Text>
          </View>
          
          <View style={{ minWidth: 40, alignItems: 'center', justifyContent: 'center' }}>
            <TouchableOpacity 
              onPress={() => setHeaderMenuVisible(true)} 
              style={[
                styles.circularBackBtn,
                {
                  backgroundColor: isDark ? '#000000' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#E2E8F0',
                  borderWidth: 1.5,
                }
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <MoreVertical size={20} color={isDark ? '#FFFFFF' : '#0F172A'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchMembers(true)}
            colors={['#1a2d5a']}
          />
        }
      >
        
        <View style={{ height: 4 }} />

        {/* Stats Row (Matching Promise Screen Glassmorphic Stat Cards) */}
        <View style={styles.statsRow}>
          {/* 1. Total Members Card */}
          <TouchableOpacity 
            style={[
              styles.statBox, 
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: isDark ? '#60A5FA' : '#1A2D5A',
                borderWidth: statusFilter === 'All' ? 2 : 1.5,
                paddingVertical: 0,
                overflow: 'hidden',
              }
            ]}
            onPress={() => setStatusFilter('All')}
            activeOpacity={0.75}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(59, 130, 246, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                  : ['#FFFFFF', '#F8FAFC', '#EFF6FF']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statGlassInner}
            >
              <View style={[styles.statNotch, { backgroundColor: isDark ? '#60A5FA' : '#1A2D5A' }]} />
              <Text style={[styles.num, { color: isDark ? '#60A5FA' : '#1A2D5A' }]}>{totalMembers}</Text>
              <View style={styles.statLabelRow}>
                <Text style={[styles.statLabel, { color: isDark ? '#E4E4E7' : '#475569' }, statusFilter === 'All' && { color: isDark ? '#60A5FA' : '#1A2D5A' }]}>Total</Text>
                {statusFilter === 'All' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#60A5FA' : '#1A2D5A' }]} />}
              </View>
              <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{statusFilter === 'All' ? 'Active ✓' : 'Tap to filter'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* 2. Active Card */}
          <TouchableOpacity 
            style={[
              styles.statBox, 
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: isDark ? '#34D399' : '#15803D',
                borderWidth: statusFilter === 'Active' ? 2 : 1.5,
                paddingVertical: 0,
                overflow: 'hidden',
              }
            ]}
            onPress={() => setStatusFilter(prev => prev === 'Active' ? 'All' : 'Active')}
            activeOpacity={0.75}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(52, 211, 153, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                  : ['#FFFFFF', '#F7FCF9', '#ECFDF5']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statGlassInner}
            >
              <View style={[styles.statNotch, { backgroundColor: isDark ? '#34D399' : '#15803D' }]} />
              <Text style={[styles.num, { color: isDark ? '#34D399' : '#15803D' }]}>{activeMembers}</Text>
              <View style={styles.statLabelRow}>
                <Text style={[styles.statLabel, { color: isDark ? '#E4E4E7' : '#475569' }, statusFilter === 'Active' && { color: isDark ? '#34D399' : '#15803D' }]}>Active</Text>
                {statusFilter === 'Active' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#34D399' : '#15803D' }]} />}
              </View>
              <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{statusFilter === 'Active' ? 'Active ✓' : 'Tap to filter'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* 3. Inactive Card */}
          <TouchableOpacity 
            style={[
              styles.statBox, 
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: isDark ? '#F87171' : '#DC2626',
                borderWidth: statusFilter === 'Inactive' ? 2 : 1.5,
                paddingVertical: 0,
                overflow: 'hidden',
              }
            ]}
            onPress={() => setStatusFilter(prev => prev === 'Inactive' ? 'All' : 'Inactive')}
            activeOpacity={0.75}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(248, 113, 113, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                  : ['#FFFFFF', '#FFF9F8', '#FEE2E2']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statGlassInner}
            >
              <View style={[styles.statNotch, { backgroundColor: isDark ? '#F87171' : '#DC2626' }]} />
              <Text style={[styles.num, { color: isDark ? '#F87171' : '#DC2626' }]}>{inactiveMembers}</Text>
              <View style={styles.statLabelRow}>
                <Text style={[styles.statLabel, { color: isDark ? '#E4E4E7' : '#475569' }, statusFilter === 'Inactive' && { color: isDark ? '#F87171' : '#DC2626' }]}>Inactive</Text>
                {statusFilter === 'Inactive' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#F87171' : '#DC2626' }]} />}
              </View>
              <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{statusFilter === 'Inactive' ? 'Active ✓' : 'Tap to filter'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={[
          styles.searchBarContainer,
          !isDark && {
            backgroundColor: '#FFFFFF',
            borderWidth: 1.5,
            borderColor: '#94A3B8',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 2,
          },
          isDark && {
            backgroundColor: '#18181B',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.14)',
          }
        ]}>
          <Search size={18} color={isDark ? '#94A3B8' : '#64748B'} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search members..."
            placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
            style={[styles.searchInput, isDark && { color: '#FFFFFF' }, !isDark && { color: '#0F172A' }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Badges Row: Guests | All | Active | Inactive | Village/City */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: 'center', gap: 8, paddingRight: 16 }}
          style={{ marginBottom: 14 }}
        >
          {/* Guests Badge */}
          <TouchableOpacity
            key="role-Guests"
            style={[
              styles.filterChip,
              isDark
                ? (roleFilter === 'Guests'
                    ? { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }
                    : { backgroundColor: '#18181B', borderColor: 'rgba(167,139,250,0.4)' })
                : (roleFilter === 'Guests'
                    ? { backgroundColor: '#6D28D9', borderColor: '#6D28D9' }
                    : { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' })
            ]}
            onPress={() => setRoleFilter(prev => prev === 'Guests' ? 'All' : 'Guests')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterChipTxt,
                isDark
                  ? (roleFilter === 'Guests' ? { color: '#FFFFFF', fontWeight: '800' } : { color: '#C4B5FD' })
                  : (roleFilter === 'Guests' ? { color: '#FFFFFF', fontWeight: '800' } : { color: '#6D28D9' })
              ]}
            >
              {`Guests (${guestMembersCount})`}
            </Text>
          </TouchableOpacity>

          {(['All', 'Active', 'Inactive'] as const).map(filter => {
            const isActive = statusFilter === filter;
            return (
              <TouchableOpacity 
                key={filter} 
                style={[
                  styles.filterChip,
                  isDark
                    ? (isActive
                        ? { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' }
                        : { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)' })
                    : (isActive
                        ? { backgroundColor: '#000000', borderColor: '#000000' }
                        : { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' })
                ]}
                onPress={() => setStatusFilter(filter)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipTxt,
                    isDark
                      ? (isActive ? { color: '#000000', fontWeight: '800' } : { color: '#A1A1AA' })
                      : (isActive ? { color: '#FFFFFF', fontWeight: '800' } : { color: '#64748B' })
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Village / City Dropdown Badge */}
          <TouchableOpacity 
            style={[
              styles.filterChip,
              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
              isDark
                ? (villageFilter !== 'All'
                    ? { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' }
                    : { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.14)' })
                : (villageFilter !== 'All'
                    ? { backgroundColor: '#000000', borderColor: '#000000' }
                    : { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' })
            ]}
            onPress={() => setVillageDropdownVisible(true)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterChipTxt,
                { marginRight: 4, maxWidth: 120 },
                isDark
                  ? (villageFilter !== 'All' ? { color: '#000000', fontWeight: '800' } : { color: '#A1A1AA' })
                  : (villageFilter !== 'All' ? { color: '#FFFFFF', fontWeight: '800' } : { color: '#64748B' })
              ]}
              numberOfLines={1}
            >
              {villageFilter === 'All' ? 'Village/City' : villageFilter}
            </Text>
            <ChevronDown
              size={14}
              color={
                isDark
                  ? (villageFilter !== 'All' ? '#000000' : '#A1A1AA')
                  : (villageFilter !== 'All' ? '#FFFFFF' : '#64748B')
              }
            />
          </TouchableOpacity>
        </ScrollView>

        {/* Member Cards List */}
        <View style={styles.membersList}>
          {filteredMembers.map((member, index) => {
            const isExpanded = expandedId === member.id;
            const associated = member.accountId
              ? members.filter(m => m.accountId === member.accountId && m.id !== member.id)
              : [];
            const isActive = true; // Placeholder for future active/inactive flag in Firebase
            const rawDisplayName = (member.name && member.name.trim()) ||
              (member.displayName && member.displayName.trim()) ||
              (member.fullName && member.fullName.trim()) ||
              (`${member.firstName || ''} ${member.lastName || ''}`.trim()) ||
              (member.phone ? `Member (${member.phone})` : 'Unknown');
            const displayName = stripGuestSuffix(rawDisplayName) || rawDisplayName;
            const displayRole = member.userType || 'member';
            const normalizedRole = displayRole.trim().toLowerCase().replace('_', ' ');
            const isSuperAdmin = normalizedRole === 'super admin' || normalizedRole === 'superadmin';
            const isAdmin = normalizedRole === 'admin';
            const isGuest = !isSuperAdmin && !isAdmin && isGuestMemberDoc(member);

            return (
              <View 
                key={`${member.id || 'admin-member'}-${index}`} 
                style={[
                  styles.memberCard,
                  !isDark && {
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: isGuest ? '#DDD6FE' : '#CBD5E1',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 6,
                    elevation: 2,
                  },
                  isDark && {
                    backgroundColor: '#18181B',
                    borderWidth: 1,
                    borderColor: isGuest ? 'rgba(167, 139, 250, 0.35)' : 'rgba(255, 255, 255, 0.12)',
                  },
                  isExpanded && styles.memberCardExpanded,
                  { position: 'relative', overflow: 'hidden' }
                ]}
              >
                {/* Cross Badge for Role (E-commerce Style Top-Right Corner Ribbon) */}
                <View 
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 18,
                    right: -34,
                    width: 125,
                    transform: [{ rotate: '45deg' }],
                    backgroundColor: isSuperAdmin 
                      ? '#228B22' // Forest Green
                      : (isAdmin ? (isDark ? '#D97706' : '#B45309') : isGuest ? '#6D28D9' : (isDark ? '#3F3F46' : '#64748B')),
                    paddingVertical: 3.5,
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.25,
                    shadowRadius: 2,
                    elevation: 3,
                  }}
                >
                  <Text 
                    numberOfLines={1}
                    style={{
                      color: '#FFFFFF',
                      fontSize: isSuperAdmin ? 7.8 : 9.5,
                      fontWeight: '900',
                      letterSpacing: isSuperAdmin ? 0.3 : 0.8,
                      textTransform: 'uppercase',
                    }}
                  >
                    {isSuperAdmin ? 'SUPER ADMIN' : (isAdmin ? 'ADMIN' : (isGuest ? 'GUEST' : 'MEMBER'))}
                  </Text>
                </View>

                <TouchableOpacity 
                  style={styles.cardHeader} 
                  activeOpacity={0.7}
                  onPress={() => handleSelectMember(member)}
                >
                  <View style={{ flex: 1, paddingRight: 28 }}>
                    {/* Top Row: Avatar + Name / Location + Clickable Phone */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <MemberAvatar member={member} initials={getInitials(displayName)} styles={styles} size={56} />
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                        {isGuest && (
                          <Text style={{ fontSize: 11.5, color: isDark ? '#C4B5FD' : '#6D28D9', fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
                            {member.relation ? `${member.relation}` : 'Guest'}
                            {member.invitedByMemberName ? ` · Invited by ${member.invitedByMemberName}` : ''}
                            {member.inviteStatus === 'joined' ? ' · Joined' : ' · Invited'}
                          </Text>
                        )}
                        {(member.city || member.village) && (
                          <Text style={{ fontSize: 12, color: isDark ? '#A1A1AA' : '#64748B', marginTop: 2 }}>
                            📍 {(member.city || member.village).trim()}
                          </Text>
                        )}
                        {member.phone ? (
                          <TouchableOpacity 
                            onPress={() => Linking.openURL(`tel:${member.phone.replace(/[^0-9+]/g, '')}`)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}
                          >
                            <Phone size={12} color={isDark ? '#60A5FA' : '#1D4ED8'} strokeWidth={2.4} />
                            <Text style={{
                              fontSize: 13,
                              fontWeight: '600',
                              color: isDark ? '#93C5FD' : '#1D4ED8',
                            }}>
                              {member.phone}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.expandedContent}>


                    {/* App Activity Stats */}
                    <View style={styles.statsSubGrid}>
                      <View style={styles.subStatBox}>
                        <View style={styles.subStatLabelRow}>
                          <Clock size={12} color="#c0392b" />
                          <Text style={styles.subStatLabel}>Last App Opened</Text>
                        </View>
                        <Text style={styles.subStatValue}>{formatLastAppOpened(member.lastLogin || member.lastAppOpened)}</Text>
                      </View>
                      <View style={styles.subStatBox}>
                        <View style={styles.subStatLabelRow}>
                          <UserCheck size={12} color="#15803D" />
                          <Text style={styles.subStatLabel}>Household Contacts</Text>
                        </View>
                        <Text style={styles.subStatValue}>
                          {associated.length} Associated
                        </Text>
                      </View>
                    </View>

                    {/* Admin Actions */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        {member.userType?.trim().toLowerCase() === 'super_admin' || member.userType?.trim().toLowerCase() === 'super admin' ? (
                          <View style={[styles.promoteBtn, { backgroundColor: '#7c3aed', opacity: 0.8 }]}>
                            <Shield size={14} color="#fff" />
                            <Text style={styles.promoteBtnTxt}>App Admin</Text>
                          </View>
                        ) : displayRole.toLowerCase() === 'admin' ? (
                          <TouchableOpacity 
                            style={[styles.promoteBtn, { backgroundColor: '#dc2626' }]}
                            onPress={() => handleRemoveAdmin(member.id, displayName)}
                          >
                            <UserX size={14} color="#fff" />
                            <Text style={styles.promoteBtnTxt}>Remove Admin</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity 
                            style={styles.promoteBtn}
                            onPress={() => handlePromoteAdmin(member.id)}
                          >
                            <UserCheck size={14} color="#fff" />
                            <Text style={styles.promoteBtnTxt}>Promote Admin</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {member.userType?.trim().toLowerCase() !== 'super_admin' && member.userType?.trim().toLowerCase() !== 'super admin' && (
                        <View style={{ flex: 1 }}>
                          <TouchableOpacity 
                            style={[styles.promoteBtn, { backgroundColor: '#4b5563' }]}
                            onPress={() => handleDeleteMember(member.id, displayName)}
                          >
                            <Trash2 size={14} color="#fff" />
                            <Text style={styles.promoteBtnTxt}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Skills & Talents Breakdown (Shown ONLY when expanded) */}
                    <View style={styles.skillsSectionBox}>
                      <View style={styles.skillsSectionHeader}>
                        <Briefcase size={13} color="#1a2d5a" style={{ marginRight: 6 }} />
                        <Text style={styles.skillsSectionTitle}>SKILLS & TALENTS</Text>
                      </View>
                      <View style={styles.skillsGrid}>
                        <View style={styles.skillBox}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <Award size={12} color="#B45309" style={{ marginRight: 4 }} />
                            <Text style={styles.skillBoxTag}>PRIMARY SKILLS</Text>
                          </View>
                          {parseSkillsList(member.primarySkill).length > 0 ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {parseSkillsList(member.primarySkill).map((sk, idx) => (
                                <View key={idx} style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FDE68A' }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#B45309' }}>{sk}</Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={[styles.skillBoxValue, { color: '#9CA3AF', fontStyle: 'italic', fontWeight: '500' }]}>
                              Not specified
                            </Text>
                          )}
                        </View>
                        <View style={styles.skillBox}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <Sparkles size={12} color="#4338CA" style={{ marginRight: 4 }} />
                            <Text style={styles.skillBoxTag}>SECONDARY SKILLS</Text>
                          </View>
                          {parseSkillsList(member.secondarySkill).length > 0 ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {parseSkillsList(member.secondarySkill).map((sk, idx) => (
                                <View key={idx} style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#4338CA' }}>{sk}</Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={[styles.skillBoxValue, { color: '#9CA3AF', fontStyle: 'italic', fontWeight: '500' }]}>
                              Not specified
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>

                    {/* Household Members breakdown */}
                    <Text style={styles.householdHeader}>
                      HOUSEHOLD: {displayName.toUpperCase()}
                    </Text>

                    <View style={styles.householdList}>
                      {associated.length > 0 ? (
                        associated.map((assoc, idx) => (
                          <View key={`${assoc.id || 'assoc'}-${idx}`}>
                            <TouchableOpacity 
                              style={styles.householdItem}
                              onPress={() => {
                                const key = assoc.id || String(idx);
                                setExpandedHouseholdIds(prev => ({ ...prev, [key]: !prev[key] }));
                              }}
                            >
                              <View style={styles.hiLeft}>
                                <Text style={styles.hiName}>{assoc.name || (`${assoc.firstName || ''} ${assoc.lastName || ''}`.trim()) || 'Family Member'}</Text>
                                {(assoc.city || assoc.village) && (
                                  <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1, marginBottom: 1 }}>
                                    📍 {(assoc.city || assoc.village).trim()}
                                  </Text>
                                )}
                                <Text style={styles.hiEmail}>{assoc.email || assoc.phone || 'No contact details'}</Text>
                              </View>
                              <View style={styles.hiRight}>
                                <Text style={styles.hiRelation}>{assoc.userType || 'Member'}</Text>
                                {expandedHouseholdIds[assoc.id || String(idx)] ? <ChevronUp size={16} color="#6B7280" style={{marginTop: 4}}/> : <ChevronDown size={16} color="#6B7280" style={{marginTop: 4}}/>}
                              </View>
                            </TouchableOpacity>
                            {expandedHouseholdIds[assoc.id || String(idx)] && (() => {
                              const details = assoc.id ? (members.find(m => m.id === assoc.id) || assoc) : assoc;
                              return (
                                <View style={{ padding: 12, backgroundColor: '#F9FAFB', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, marginBottom: 8, marginTop: -8, marginHorizontal: 2 }}>
                                  {details.phone ? (
                                    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }} onPress={() => Linking.openURL(`tel:${details.phone.replace(/[^0-9+]/g, '')}`)}>
                                      <Phone size={14} color="#6B7280" style={{ marginRight: 8 }} />
                                      <Text style={{ color: '#007AFF', fontSize: 13 }}>{details.phone}</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                  {details.email ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                      <Mail size={14} color="#6B7280" style={{ marginRight: 8 }} />
                                      <Text style={{ color: '#4B5563', fontSize: 13 }}>{details.email}</Text>
                                    </View>
                                  ) : null}
                                  {details.dob ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                      <Text style={{ fontSize: 14, marginRight: 8 }}>🎂</Text>
                                      <Text style={{ color: '#4B5563', fontSize: 13 }}>DOB: {formatDateDisplay(details.dob)}</Text>
                                    </View>
                                  ) : null}
                                  {details.gender ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                      <Text style={{ fontSize: 14, marginRight: 8 }}>👤</Text>
                                      <Text style={{ color: '#4B5563', fontSize: 13 }}>Gender: {details.gender}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              );
                            })()}
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyHouseholdTxt}>
                          No other household contacts registered.
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Text style={styles.footerBranding}>Church Admin · Member Activity Logs</Text>
        <View style={{ height: 100 }} />
      </ScrollView>
      </>
    )}

      <InviteMembersModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        churchName={activeChurch?.name || 'Our Church'}
        churchCode={activeChurch?.subdomain?.toUpperCase() || (activeChurch as any)?.churchCode?.toUpperCase() || ''}
        churchId={activeChurch?.id || ''}
        onMembersAdded={() => fetchMembers(true)}
        existingMembers={members}
      />

      {/* Add/Edit Member Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide" onRequestClose={() => { setAddModalVisible(false); setEditMemberId(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'flex-end' }}>
          <View style={{ width: '100%', backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 10 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#F3F4F6' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: isDark ? '#FFFFFF' : '#1a2d5a', letterSpacing: -0.5 }}>
                {editMemberId ? 'Edit Member' : 'Add New Member'}
              </Text>
              <TouchableOpacity onPress={() => { setAddModalVisible(false); setEditMemberId(null); }} style={{ backgroundColor: isDark ? '#27272A' : '#F3F4F6', padding: 6, borderRadius: 20 }}>
                <X size={20} color={isDark ? '#FFFFFF' : '#1a2d5a'} />
              </TouchableOpacity>
            </View>

            {/* Scrollable Form */}
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: Platform.OS === 'android' ? 68 : 40 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ fontSize: 13, color: isDark ? '#A1A1AA' : '#6B7280', marginBottom: 20, fontWeight: '500' }}>
                {editMemberId ? 'Update member details below.' : `They will receive a shareable link to join ${activeChurch?.name}`}
              </Text>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D4D4D8' : '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Full Name</Text>
                <TextInput
                  style={{ borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(26,45,90,0.1)', borderRadius: 12, padding: 14, backgroundColor: isDark ? '#27272A' : '#FFFFFF', color: isDark ? '#FFFFFF' : '#1a2d5a', fontWeight: '600' }}
                  placeholder="Enter member's name"
                  placeholderTextColor={isDark ? '#71717A' : '#9CA3AF'}
                  value={newMemberForm.name}
                  onChangeText={(t) => setNewMemberForm({...newMemberForm, name: t})}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D4D4D8' : '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone Number</Text>
                <TextInput
                  style={{ borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(26,45,90,0.1)', borderRadius: 12, padding: 14, backgroundColor: isDark ? '#27272A' : '#FFFFFF', color: isDark ? '#FFFFFF' : '#1a2d5a', fontWeight: '600' }}
                  placeholder="e.g. 9876543210"
                  placeholderTextColor={isDark ? '#71717A' : '#9CA3AF'}
                  keyboardType="phone-pad"
                  value={newMemberForm.phone}
                  onChangeText={(t) => setNewMemberForm({...newMemberForm, phone: t})}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D4D4D8' : '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>City / Village</Text>
                <TextInput
                  style={{ borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(26,45,90,0.1)', borderRadius: 12, padding: 14, backgroundColor: isDark ? '#27272A' : '#FFFFFF', color: isDark ? '#FFFFFF' : '#1a2d5a', fontWeight: '600' }}
                  placeholder="Enter city or village"
                  placeholderTextColor={isDark ? '#71717A' : '#9CA3AF'}
                  value={newMemberForm.city}
                  onChangeText={(t) => setNewMemberForm({...newMemberForm, city: t})}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D4D4D8' : '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Date of Birth (DOB)</Text>
                <TouchableOpacity
                  style={{ borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(26,45,90,0.1)', borderRadius: 12, padding: 14, backgroundColor: isDark ? '#27272A' : '#FFFFFF' }}
                  onPress={() => setDatePickerVisibility(true)}
                >
                  <Text style={{ color: newMemberForm.dob ? (isDark ? '#FFFFFF' : '#1a2d5a') : (isDark ? '#71717A' : '#9CA3AF'), fontWeight: '600' }}>
                    {newMemberForm.dob ? formatDateDisplay(newMemberForm.dob) : 'Select Date'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Baptism Date */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D4D4D8' : '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Baptism Date</Text>
                <TouchableOpacity
                  style={{ borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(26,45,90,0.1)', borderRadius: 12, padding: 14, backgroundColor: isDark ? '#27272A' : '#FFFFFF' }}
                  onPress={() => { setActiveDateField('baptismDate'); setDatePickerVisibility(true); }}
                >
                  <Text style={{ color: newMemberForm.baptismDate ? (isDark ? '#FFFFFF' : '#1a2d5a') : (isDark ? '#71717A' : '#9CA3AF'), fontWeight: '600' }}>
                    {newMemberForm.baptismDate ? formatDateDisplay(newMemberForm.baptismDate) : 'Select Date'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Anniversary Date */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D4D4D8' : '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Wedding Anniversary Date</Text>
                <TouchableOpacity
                  style={{ borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(26,45,90,0.1)', borderRadius: 12, padding: 14, backgroundColor: isDark ? '#27272A' : '#FFFFFF' }}
                  onPress={() => { setActiveDateField('anniversaryDate'); setDatePickerVisibility(true); }}
                >
                  <Text style={{ color: newMemberForm.anniversaryDate ? (isDark ? '#FFFFFF' : '#1a2d5a') : (isDark ? '#71717A' : '#9CA3AF'), fontWeight: '600' }}>
                    {newMemberForm.anniversaryDate ? formatDateDisplay(newMemberForm.anniversaryDate) : 'Select Date'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Primary Skill */}
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D4D4D8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>Primary Skill</Text>
                  {newMemberForm.primarySkill ? (
                    <TouchableOpacity onPress={() => setNewMemberForm({ ...newMemberForm, primarySkill: '' })}>
                      <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '600' }}>Clear</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={{ borderWidth: 1.5, borderColor: newMemberForm.primarySkill ? (isDark ? '#60A5FA' : '#1a2d5a') : (isDark ? 'rgba(255,255,255,0.16)' : 'rgba(26,45,90,0.1)'), borderRadius: 12, padding: 14, backgroundColor: isDark ? '#27272A' : (newMemberForm.primarySkill ? '#F0F4FF' : '#FFFFFF'), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  onPress={() => openSkillPicker('primarySkill')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, flexWrap: 'wrap', gap: 4 }}>
                    <Award size={16} color={newMemberForm.primarySkill ? (isDark ? '#60A5FA' : '#1a2d5a') : (isDark ? '#71717A' : '#9CA3AF')} style={{ marginRight: 4 }} />
                    {parseSkillsList(newMemberForm.primarySkill).length > 0 ? (
                      parseSkillsList(newMemberForm.primarySkill).map((sk, idx) => (
                        <View key={idx} style={{ backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(59, 130, 246, 0.4)' : '#C7D2FE' }}>
                          <Text style={{ fontSize: 12, color: isDark ? '#93C5FD' : '#1a2d5a', fontWeight: '700' }}>{sk}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: isDark ? '#71717A' : '#9CA3AF', fontWeight: '600', fontSize: 14 }}>Select Primary Skills</Text>
                    )}
                  </View>
                  <ChevronDown size={16} color={newMemberForm.primarySkill ? (isDark ? '#60A5FA' : '#1a2d5a') : (isDark ? '#71717A' : '#9CA3AF')} />
                </TouchableOpacity>
              </View>

              {/* Secondary Skill */}
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D4D4D8' : '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>Secondary Skill</Text>
                  {newMemberForm.secondarySkill ? (
                    <TouchableOpacity onPress={() => setNewMemberForm({ ...newMemberForm, secondarySkill: '' })}>
                      <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '600' }}>Clear</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={{ borderWidth: 1.5, borderColor: newMemberForm.secondarySkill ? (isDark ? '#C084FC' : '#4338CA') : (isDark ? 'rgba(255,255,255,0.16)' : 'rgba(26,45,90,0.1)'), borderRadius: 12, padding: 14, backgroundColor: isDark ? '#27272A' : (newMemberForm.secondarySkill ? '#EEF2FF' : '#FFFFFF'), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  onPress={() => openSkillPicker('secondarySkill')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, flexWrap: 'wrap', gap: 4 }}>
                    <Sparkles size={16} color={newMemberForm.secondarySkill ? (isDark ? '#C084FC' : '#4338CA') : (isDark ? '#71717A' : '#9CA3AF')} style={{ marginRight: 4 }} />
                    {parseSkillsList(newMemberForm.secondarySkill).length > 0 ? (
                      parseSkillsList(newMemberForm.secondarySkill).map((sk, idx) => (
                        <View key={idx} style={{ backgroundColor: isDark ? 'rgba(192, 132, 252, 0.2)' : '#F5F3FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(192, 132, 252, 0.4)' : '#DDD6FE' }}>
                          <Text style={{ fontSize: 12, color: isDark ? '#C084FC' : '#4338CA', fontWeight: '700' }}>{sk}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: isDark ? '#71717A' : '#9CA3AF', fontWeight: '600', fontSize: 14 }}>Select Secondary Skills</Text>
                    )}
                  </View>
                  <ChevronDown size={16} color={newMemberForm.secondarySkill ? (isDark ? '#C084FC' : '#4338CA') : (isDark ? '#71717A' : '#9CA3AF')} />
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D4D4D8' : '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Role</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 14,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      alignItems: 'center',
                      borderColor: newMemberForm.userType.trim().toLowerCase() === 'member'
                        ? (isDark ? '#60A5FA' : '#1a2d5a')
                        : (isDark ? 'rgba(255,255,255,0.14)' : 'rgba(26,45,90,0.1)'),
                      backgroundColor: newMemberForm.userType.trim().toLowerCase() === 'member'
                        ? (isDark ? '#2563EB' : '#1a2d5a')
                        : (isDark ? '#27272A' : '#FFFFFF')
                    }}
                    onPress={() => setNewMemberForm({...newMemberForm, userType: 'member'})}
                  >
                    <Text style={{ fontWeight: '800', color: newMemberForm.userType.trim().toLowerCase() === 'member' ? '#FFFFFF' : (isDark ? '#A1A1AA' : '#6B7280') }}>Member</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 14,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      alignItems: 'center',
                      borderColor: newMemberForm.userType.trim().toLowerCase() === 'admin'
                        ? (isDark ? '#60A5FA' : '#1a2d5a')
                        : (isDark ? 'rgba(255,255,255,0.14)' : 'rgba(26,45,90,0.1)'),
                      backgroundColor: newMemberForm.userType.trim().toLowerCase() === 'admin'
                        ? (isDark ? '#2563EB' : '#1a2d5a')
                        : (isDark ? '#27272A' : '#FFFFFF')
                    }}
                    onPress={() => setNewMemberForm({...newMemberForm, userType: 'admin'})}
                  >
                    <Text style={{ fontWeight: '800', color: newMemberForm.userType.trim().toLowerCase() === 'admin' ? '#FFFFFF' : (isDark ? '#A1A1AA' : '#6B7280') }}>Admin</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ alignItems: 'center', marginTop: 8, marginBottom: Platform.OS === 'android' ? 24 : 12 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: isDark ? '#FFFFFF' : '#000000',
                    borderColor: isDark ? '#FFFFFF' : '#000000',
                    borderWidth: 1.5,
                    borderRadius: 30,
                    paddingVertical: 14,
                    paddingHorizontal: 28,
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    shadowColor: '#000',
                    shadowOpacity: isDark ? 0.3 : 0.15,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 4,
                    opacity: addMemberLoading ? 0.7 : 1,
                  }}
                  onPress={handleAddMember}
                  disabled={addMemberLoading}
                  activeOpacity={0.8}
                >
                  {addMemberLoading ? (
                    <ActivityIndicator color={isDark ? '#000000' : '#FFFFFF'} size="small" />
                  ) : (
                    <Text style={{
                      color: isDark ? '#000000' : '#FFFFFF',
                      fontWeight: '800',
                      letterSpacing: 0.5,
                      fontSize: 15
                    }}>
                      {editMemberId ? 'SAVE CHANGES' : 'ADD MEMBER'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={(date) => {
          setDatePickerVisibility(false);
          const formatted = date.toISOString().split('T')[0];
          if (selectedMember) {
            setMemberDetailsForm(prev => ({ ...prev, [activeDateField]: formatted }));
          } else {
            setNewMemberForm(prev => ({ ...prev, [activeDateField]: formatted }));
          }
        }}
        onCancel={() => setDatePickerVisibility(false)}
        maximumDate={new Date()}
      />

      {/* Village Dropdown Modal */}
      <Modal visible={villageDropdownVisible} transparent animationType="fade" onRequestClose={() => setVillageDropdownVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setVillageDropdownVisible(false)}>
          <View style={{ width: '80%', maxHeight: '60%', backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 5 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a2d5a', marginBottom: 12 }}>Select Village/City</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {uniqueVillages.map((v) => (
                <TouchableOpacity 
                  key={v} 
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', justifyContent: 'space-between' }}
                  onPress={() => {
                    setVillageFilter(v);
                    setVillageDropdownVisible(false);
                  }}
                >
                  <Text style={{ fontSize: 15, color: villageFilter === v ? '#1a2d5a' : '#4b5563', fontWeight: villageFilter === v ? '600' : '400' }}>
                    {v}
                  </Text>
                  {villageFilter === v && <Plus size={16} color="#1a2d5a" style={{ transform: [{ rotate: '45deg' }] }} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Header Menu Modal */}
      <Modal
        visible={headerMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setHeaderMenuVisible(false)}
      >
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} 
          activeOpacity={1} 
          onPress={() => setHeaderMenuVisible(false)}
        >
          <View style={{
            backgroundColor: isDark ? '#18181B' : '#FFFFFF',
            borderRadius: 16,
            width: '80%',
            padding: 20,
            elevation: 10,
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? '#27272A' : 'transparent',
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: isDark ? '#FFFFFF' : '#1a2d5a', marginBottom: 16, textAlign: 'center' }}>Member Options</Text>
            
            <TouchableOpacity 
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                backgroundColor: isDark ? '#27272A' : '#f1f5f9',
                borderRadius: 12,
                marginBottom: 12,
              }} 
              onPress={() => {
                setHeaderMenuVisible(false);
                setTimeout(() => setInviteModalVisible(true), 150);
              }}
            >
              <UserPlus size={20} color={isDark ? '#FFFFFF' : '#1a2d5a'} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: isDark ? '#FFFFFF' : '#1a2d5a', marginLeft: 12 }}>Add From Contacts</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                backgroundColor: isDark ? '#27272A' : '#f1f5f9',
                borderRadius: 12,
              }} 
              onPress={() => {
                setHeaderMenuVisible(false);
                setTimeout(() => setAddModalVisible(true), 150);
              }}
            >
              <Plus size={20} color={isDark ? '#FFFFFF' : '#1a2d5a'} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: isDark ? '#FFFFFF' : '#1a2d5a', marginLeft: 12 }}>Add Member</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Skill Picker Modal */}
      <Modal visible={skillPickerModalVisible} transparent animationType="slide" onRequestClose={() => setSkillPickerModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'flex-end' }}>
          {/* Backdrop Dismiss */}
          <TouchableOpacity 
            style={{ flex: 1 }} 
            activeOpacity={1} 
            onPress={() => setSkillPickerModalVisible(false)} 
          />

          <View style={{
            width: '100%',
            backgroundColor: isDark ? '#18181B' : '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '90%',
            paddingBottom: Platform.OS === 'android' ? 44 : 26,
            borderTopWidth: isDark ? 1 : 0,
            borderColor: isDark ? '#27272A' : 'transparent',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 10,
          }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? '#27272A' : '#F3F4F6'
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {activeSkillPickerField === 'primarySkill' ? (
                  <Award size={20} color={isDark ? '#60A5FA' : '#1a2d5a'} style={{ marginRight: 8 }} />
                ) : (
                  <Sparkles size={20} color={isDark ? '#C084FC' : '#4338CA'} style={{ marginRight: 8 }} />
                )}
                <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#FFFFFF' : '#1a2d5a' }}>
                  {activeSkillPickerField === 'primarySkill' ? 'Select Primary Skill' : 'Select Secondary Skill'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSkillPickerModalVisible(false)}
                style={{
                  backgroundColor: isDark ? '#3B82F6' : '#1a2d5a',
                  paddingHorizontal: 16,
                  paddingVertical: 7,
                  borderRadius: 16
                }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Category Tabs */}
            <View style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.catTab,
                    isDark && { backgroundColor: '#27272A' },
                    selectedCategoryTab === 'all' && (isDark ? { backgroundColor: '#3B82F6' } : styles.catTabActive)
                  ]}
                  onPress={() => setSelectedCategoryTab('all')}
                >
                  <Text style={[styles.catTabTxt, isDark && { color: '#D4D4D8' }, selectedCategoryTab === 'all' && styles.catTabTxtActive]}>All Skills</Text>
                </TouchableOpacity>
                {CHURCH_SKILL_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.catTab,
                      isDark && { backgroundColor: '#27272A' },
                      selectedCategoryTab === cat.id && (isDark ? { backgroundColor: '#3B82F6' } : styles.catTabActive)
                    ]}
                    onPress={() => setSelectedCategoryTab(cat.id)}
                  >
                    <Text style={[styles.catTabTxt, isDark && { color: '#D4D4D8' }, selectedCategoryTab === cat.id && styles.catTabTxtActive]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Search Input */}
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark ? '#27272A' : '#F3F4F6',
                borderRadius: 12,
                paddingHorizontal: 12,
                height: 42
              }}>
                <Search size={16} color={isDark ? '#A1A1AA' : '#9CA3AF'} style={{ marginRight: 8 }} />
                <TextInput
                  placeholder="Search skill (e.g. Keyboard, Singer, Sound)..."
                  placeholderTextColor={isDark ? '#71717A' : '#9CA3AF'}
                  value={skillSearchText}
                  onChangeText={setSkillSearchText}
                  style={{ flex: 1, fontSize: 13, color: isDark ? '#FFFFFF' : '#1a2d5a' }}
                />
                {skillSearchText ? (
                  <TouchableOpacity onPress={() => setSkillSearchText('')}>
                    <X size={14} color={isDark ? '#A1A1AA' : '#9CA3AF'} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Skills List */}
            <ScrollView style={{ paddingHorizontal: 16, maxHeight: 230 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {filteredSkillList.map((skill) => {
                const currentSelected = activeSkillPickerField
                  ? parseSkillsList(selectedMember ? (memberDetailsForm as any)[activeSkillPickerField] : (newMemberForm as any)[activeSkillPickerField])
                  : [];
                const isSelected = currentSelected.includes(skill);
                return (
                  <TouchableOpacity
                    key={skill}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? '#27272A' : '#F3F4F6',
                      backgroundColor: isSelected ? (isDark ? 'rgba(59, 130, 246, 0.18)' : '#EFF6FF') : 'transparent',
                      borderRadius: 8
                    }}
                    onPress={() => {
                      if (activeSkillPickerField) {
                        const exists = currentSelected.includes(skill);
                        const updated = exists
                          ? currentSelected.filter(s => s !== skill)
                          : [...currentSelected, skill];
                        const joined = updated.join(', ');
                        if (selectedMember) {
                          setMemberDetailsForm(prev => ({ ...prev, [activeSkillPickerField]: joined }));
                        } else {
                          setNewMemberForm(prev => ({ ...prev, [activeSkillPickerField]: joined }));
                        }
                      }
                    }}
                  >
                    <Text style={{
                      fontSize: 14,
                      fontWeight: isSelected ? '700' : '500',
                      color: isSelected ? (isDark ? '#60A5FA' : '#1a2d5a') : (isDark ? '#E4E4E7' : '#374151')
                    }}>
                      {skill}
                    </Text>
                    {isSelected && <Check size={18} color={isDark ? '#60A5FA' : '#1a2d5a'} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Custom Skill Input & Apply Button (Elevated for Device Navigation Buttons) */}
            <View style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: Platform.OS === 'android' ? 18 : 6,
              borderTopWidth: 1,
              borderTopColor: isDark ? '#27272A' : '#F3F4F6',
              marginTop: 6
            }}>
              <Text style={{
                fontSize: 11,
                fontWeight: '700',
                color: isDark ? '#A1A1AA' : '#6B7280',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}>
                Or Add Custom Skill
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={{
                    flex: 1,
                    borderWidth: 1.5,
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(26,45,90,0.15)',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    height: 44,
                    color: isDark ? '#FFFFFF' : '#1a2d5a',
                    backgroundColor: isDark ? '#27272A' : '#FFFFFF',
                    fontSize: 13
                  }}
                  placeholder="Type custom skill..."
                  placeholderTextColor={isDark ? '#71717A' : '#9CA3AF'}
                  value={customSkillInput}
                  onChangeText={setCustomSkillInput}
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: isDark ? '#3B82F6' : '#1a2d5a',
                    paddingHorizontal: 18,
                    borderRadius: 10,
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: 44
                  }}
                  onPress={() => {
                    if (customSkillInput.trim() && activeSkillPickerField) {
                      const trimmed = customSkillInput.trim();
                      const current = parseSkillsList(selectedMember ? (memberDetailsForm as any)[activeSkillPickerField] : (newMemberForm as any)[activeSkillPickerField]);
                      if (!current.includes(trimmed)) {
                        const updated = [...current, trimmed].join(', ');
                        if (selectedMember) {
                          setMemberDetailsForm(prev => ({ ...prev, [activeSkillPickerField]: updated }));
                        } else {
                          setNewMemberForm(prev => ({ ...prev, [activeSkillPickerField]: updated }));
                        }
                      }
                      setCustomSkillInput('');
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

// Separate function for dynamic badge styling to keep code clean
const badgeRowStyles = (isActive: boolean) => createAdminThemedStyles(StyleSheet.create({
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }
}));

const styles = createAdminThemedStyles(StyleSheet.create({
  circularBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: { flex: 1, backgroundColor: '#EDE8DC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EDE8DC', padding: 20 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EDE8DC', padding: 20 },
  errorTxt: { fontSize: 14, color: '#c0392b', textAlign: 'center', marginBottom: 15, fontWeight: '600' },
  retryBtn: { backgroundColor: '#1a2d5a', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 100 },

  hero: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    overflow: 'visible',
    position: 'relative',
    marginBottom: 6,
  },
  heroTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroSub: { color: '#AEB8D4', fontSize: 13 },
  
  newBtn: { 
    backgroundColor: '#C9A84C', 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 10,
    shadowColor: '#C9A84C',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4
  },
  newBtnTxt: { color: '#1a2d5a', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: 1,
    position: 'relative',
  },
  statGlassInner: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  statNotch: {
    position: 'absolute',
    top: -1,
    width: 32,
    height: 3.5,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  num: { fontFamily: serifFont, fontSize: 24, fontWeight: '700', marginBottom: 2 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: '#475569', fontWeight: '700' },
  activeIndicatorDot: { width: 6, height: 6, borderRadius: 3 },
  statHintTxt: { fontSize: 8.5, color: '#94A3B8', fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },
  statCard: { 
    flex: 1, 
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(26,45,90,0.08)',
    borderTopWidth: 3,
    borderTopColor: '#1a2d5a',
    shadowColor: '#1a2d5a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLbl: { fontSize: 10, color: '#6B7280', marginTop: 2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  searchBarContainer: { 
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', 
    borderRadius: 12, 
    paddingHorizontal: 14, 
    height: 46, 
    borderWidth: 1.5, 
    borderColor: '#94A3B8', 
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: '#0F172A', fontWeight: '500', paddingVertical: 0 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  filterChip: { 
    paddingHorizontal: 14, 
    paddingVertical: 7, 
    borderRadius: 20, 
    backgroundColor: '#F8FAFC', 
    borderWidth: 1.5, 
    borderColor: '#CBD5E1', 
    marginRight: 0,
  },
  filterChipActive: { backgroundColor: '#000000', borderColor: '#000000' },
  filterChipTxt: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  filterChipTxtActive: { color: '#FFFFFF', fontWeight: '800' },

  membersList: { gap: 12 },
  memberCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: 'rgba(26,45,90,0.08)', 
    padding: 14, 
    shadowColor: '#1a2d5a',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2 
  },
  memberCardExpanded: { borderColor: '#C9A84C', borderWidth: 1.5, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  cardHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start' 
  },
  profileSection: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  avatar: { 
    width: 56, 
    height: 56, 
    borderRadius: 28, 
    backgroundColor: '#000000', 
    justifyContent: 'center', 
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  nameSection: { flexDirection: 'column', gap: 4, marginTop: 2 },
  name: { fontSize: 15, fontWeight: '800', color: '#1a2d5a' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 },
  
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  roleTxt: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  statusActive: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  statusInactive: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  statusTxt: { fontSize: 10, fontWeight: '800' },
  
  chevronWrap: { padding: 4, marginTop: 2 },

  contactDetails: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8, 
    marginTop: 12, 
    alignItems: 'center' 
  },
  contactBadgePhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  contactIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactPhoneTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  contactBadgeEmail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    maxWidth: '100%',
  },
  contactEmailTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  contactTxt: { fontSize: 12, color: '#0F172A', fontWeight: '700' },

  expandedContent: { 
    marginTop: 14, 
    borderTopWidth: 1, 
    borderTopColor: 'rgba(26,45,90,0.08)', 
    paddingTop: 14 
  },
  statsSubGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  subStatBox: { 
    flex: 1,
    backgroundColor: '#F9F6F0', 
    borderRadius: 10, 
    padding: 12, 
    borderWidth: 1, 
    borderColor: '#E2DDD5' 
  },
  subStatLabelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 6 },
  subStatLabel: { fontSize: 9, textTransform: 'uppercase', color: '#6B7280', fontWeight: '800', letterSpacing: 0.5 },
  subStatValue: { fontSize: 14, fontWeight: '800', color: '#1a2d5a' },

  promoteBtn: {
    backgroundColor: '#1a2d5a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 14,
    shadowColor: '#1a2d5a',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  promoteBtnTxt: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3
  },

  householdHeader: { 
    fontSize: 11, 
    fontWeight: '800', 
    color: '#374151', 
    textTransform: 'uppercase', 
    letterSpacing: 0.8, 
    marginBottom: 10, 
    marginTop: 4,
    paddingLeft: 4
  },
  householdList: { gap: 8 },
  householdItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: '#FFFFFF', 
    borderWidth: 1, 
    borderColor: 'rgba(26,45,90,0.08)', 
    borderRadius: 10, 
    padding: 12 
  },
  hiLeft: { flex: 1, gap: 4 },
  hiName: { fontSize: 13, fontWeight: '800', color: '#1a2d5a' },
  hiEmail: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  hiRight: { 
    backgroundColor: '#F0EBE0', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 6 
  },
  hiRelation: { fontSize: 9, color: '#1a2d5a', fontWeight: '700' },
  emptyHouseholdTxt: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', paddingLeft: 4 },
  primarySkillPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  primarySkillPillTxt: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '700',
    maxWidth: 120,
  },
  secondarySkillPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  secondarySkillPillTxt: {
    color: '#4338CA',
    fontSize: 10,
    fontWeight: '700',
    maxWidth: 120,
  },
  skillsSectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  skillsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  skillsSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1a2d5a',
    letterSpacing: 0.6,
  },
  skillsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  skillBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  skillBoxTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  skillBoxValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a2d5a',
    marginTop: 2,
  },
  catTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  catTabActive: {
    backgroundColor: '#1a2d5a',
  },
  catTabTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  catTabTxtActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  detailsHeroCard: {
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  detailsHeroName: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
  },
  detailsContactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
  },
  detailsSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  detailsSectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  detailsDateField: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsDateTxt: {
    fontSize: 15,
    fontWeight: '600',
  },
  skillChipTag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  skillChipTagTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  saveChangesBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#1A2D5A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  saveChangesBtnTxt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  adminActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  adminActionBtnTxt: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  adminActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 12,
  },
  adminActionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminActionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  adminActionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  familyCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  familyCountTxt: {
    fontSize: 11,
    fontWeight: '800',
  },
  familyMemberCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
  },
  familyNameTxt: {
    fontSize: 15,
    fontWeight: '800',
  },
  familyRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  familyRoleTxt: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  viewMemberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 2,
  },
  viewMemberPillTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyFamilyCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFamilyTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyFamilyDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  footerBranding: { fontSize: 10, color: '#9CA3AF', textAlign: 'center', marginTop: 20 }
}));
