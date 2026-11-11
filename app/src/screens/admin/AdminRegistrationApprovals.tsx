import React, { useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  StatusBar,
  ScrollView,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  CheckCircle,
  XCircle,
  Search,
  Clock,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Heart,
  Droplets,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  X,
  RotateCcw,
  Trash2,
} from 'lucide-react-native';
import FirestoreService, { RegistrationRequest } from '../../services/FirestoreService';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../constants/ChurchConfig';
import { useAdminTheme } from '../../utils/adminThemeHelper';

const { width } = Dimensions.get('window');

const PRESET_REASONS = [
  'Incomplete or inaccurate information',
  'Duplicate registration record',
  'Contact number could not be reached',
  'Not affiliated with this church branch',
  'Other / Custom reason',
];

export default function AdminRegistrationApprovals({ navigation }: any) {
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const churchId = activeChurch?.id || RHEMA_CHURCH_ID;
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor,
    barStyle,
  } = useAdminTheme();

  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Reject Modal State
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [targetRequest, setTargetRequest] = useState<RegistrationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchRequests = async () => {
    try {
      const data = await FirestoreService.getRegistrationRequests(churchId, 'all');
      if (data) {
        setRequests(data);
      }
    } catch (e) {
      console.warn('fetchRequests error:', e);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  // Live real-time listener for requests + initial fetch fallback
  useEffect(() => {
    setLoading(true);
    fetchRequests().finally(() => setLoading(false));

    const unsubscribe = FirestoreService.subscribeToRegistrationRequests(
      churchId,
      'all',
      (data) => {
        setRequests(data);
        setLoading(false);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [churchId]);

  // Tab counts: strictly divided into Pending, Approved, and Rejected lists
  const pendingRequests = useMemo(
    () => requests.filter((r) => !r.status || r.status === 'pending'),
    [requests]
  );
  const approvedRequests = useMemo(
    () => requests.filter((r) => r.status === 'approved'),
    [requests]
  );
  const rejectedRequests = useMemo(
    () => requests.filter((r) => r.status === 'rejected'),
    [requests]
  );

  // Filtered requests based on active tab & search query
  const filteredList = useMemo(() => {
    let list: RegistrationRequest[] = [];
    if (activeTab === 'pending') {
      list = pendingRequests;
    } else if (activeTab === 'approved') {
      list = approvedRequests;
    } else {
      list = rejectedRequests;
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase();
    return list.filter((r) => {
      const name = (r.fullName || `${r.firstName || ''} ${r.lastName || ''}`).toLowerCase();
      const phone = (r.phone || '').toLowerCase();
      const city = (r.city || r.village || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || city.includes(q) || email.includes(q);
    });
  }, [activeTab, pendingRequests, approvedRequests, rejectedRequests, searchQuery]);

  // Handle Approve
  const handleApprove = (req: RegistrationRequest) => {
    const name = req.fullName || `${req.firstName || ''} ${req.lastName || ''}`.trim();
    Alert.alert(
      'Approve Registration',
      `Are you sure you want to approve ${name} as an official member of ${activeChurch?.name || 'Rhema Church'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve Member',
          style: 'default',
          onPress: async () => {
            setActionLoadingId(req.id);
            try {
              const res = await FirestoreService.approveRegistrationRequest(
                churchId,
                req.id,
                user?.uid,
                member?.name || member?.firstName || 'Admin'
              );
              if (res.success) {
                setRequests((prev) =>
                  prev.map((r) =>
                    r.id === req.id
                      ? {
                          ...r,
                          status: 'approved',
                          reviewedAt: new Date().toISOString(),
                          reviewedByName: member?.name || member?.firstName || 'Admin',
                        }
                      : r
                  )
                );
                Alert.alert(
                  'Approved! 🎉',
                  `${name} is now approved and added to the Approved list.`,
                  [
                    { text: 'Stay Here', style: 'cancel' },
                    { text: 'View Approved', onPress: () => setActiveTab('approved') },
                  ]
                );
              } else {
                Alert.alert('Approval Failed', res.error || 'Please try again.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to approve');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // Format Date of Birth to DD-MM-YYYY
  const formatDob = (dobStr?: string) => {
    if (!dobStr) return '—';
    try {
      const clean = String(dobStr).trim();
      // If YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        const [y, m, d] = clean.split('-');
        return `${d}-${m}-${y}`;
      }
      // If already DD-MM-YYYY
      if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
        return clean;
      }
      // If ISO timestamp or valid Date string
      const dateObj = new Date(clean);
      if (!isNaN(dateObj.getTime())) {
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        return `${day}-${month}-${year}`;
      }
      return clean;
    } catch {
      return dobStr;
    }
  };

  // Open Reject Modal
  const openRejectModal = (req: RegistrationRequest) => {
    setTargetRequest(req);
    setRejectionReason('');
    setRejectModalVisible(true);
  };

  // Submit Reject
  const handleSubmitReject = async () => {
    if (!targetRequest) return;
    const targetName = targetRequest.fullName || `${targetRequest.firstName || ''} ${targetRequest.lastName || ''}`.trim() || 'this applicant';
    const reasonToSave = rejectionReason.trim() || 'Registration not approved by administrator';

    setActionLoadingId(targetRequest.id);
    setRejectModalVisible(false);

    try {
      const res = await FirestoreService.rejectRegistrationRequest(
        churchId,
        targetRequest.id,
        reasonToSave,
        user?.uid,
        member?.name || member?.firstName || 'Admin'
      );
      if (res.success) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === targetRequest.id
              ? {
                  ...r,
                  status: 'rejected',
                  rejectionReason: reasonToSave,
                  reviewedAt: new Date().toISOString(),
                  reviewedByName: member?.name || member?.firstName || 'Admin',
                }
              : r
          )
        );
        Alert.alert(
          'Registration Rejected',
          `${targetName} has been rejected and added to the Rejections list.`,
          [
            { text: 'Stay Here', style: 'cancel' },
            { text: 'View Rejections', onPress: () => setActiveTab('rejected') },
          ]
        );
      } else {
        Alert.alert('Reject Failed', res.error || 'Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reject');
    } finally {
      setActionLoadingId(null);
      setTargetRequest(null);
      setRejectionReason('');
    }
  };

  // Reconsider & Approve from Rejections tab
  const handleReconsider = (req: RegistrationRequest) => {
    const name = req.fullName || `${req.firstName || ''} ${req.lastName || ''}`.trim();
    Alert.alert(
      'Reconsider & Approve',
      `Overturn previous rejection and approve ${name} as a member?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Approve',
          onPress: () => handleApprove(req),
        },
      ]
    );
  };

  // Permanently delete registration record from Firebase
  const handleDeleteRequest = (req: RegistrationRequest) => {
    const name = req.fullName || `${req.firstName || ''} ${req.lastName || ''}`.trim() || 'this record';
    Alert.alert(
      'Delete Permanently',
      `Are you sure you want to permanently delete the registration record for ${name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(req.id);
            try {
              const res = await FirestoreService.deleteRegistrationRequest(churchId, req.id);
              if (res.success) {
                setRequests((prev) => prev.filter((r) => r.id !== req.id));
                Alert.alert('Deleted', 'Registration record removed from Firebase.');
              } else {
                Alert.alert('Delete Failed', res.error || 'Please try again.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const renderCard = ({ item }: { item: RegistrationRequest }) => {
    const name = (item.fullName || `${item.firstName || ''} ${item.lastName || ''}`).trim();
    const isPending = item.status === 'pending';
    const isApproved = item.status === 'approved';
    const isRejected = item.status === 'rejected';
    const isBusy = actionLoadingId === item.id;

    const formattedDate = item.createdAt
      ? new Date(item.createdAt).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

    return (
      <View style={[styles.card, { backgroundColor: cardSurface, borderColor }]}>
        {/* Card Header */}
        <View style={styles.cardHeaderRow}>
          <View style={[styles.avatar, { backgroundColor: isDark ? '#374151' : '#1A2D5A' }]}>
            <Text style={styles.avatarTxt}>{(name[0] || 'U').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.cardName, { color: primaryText }]}>{name}</Text>
            <View style={styles.cardMetaRow}>
              <Clock size={12} color={secondaryText} />
              <Text style={[styles.cardMetaTxt, { color: secondaryText }]}>Submitted: {formattedDate}</Text>
            </View>
          </View>
          {!isPending && (
            <View
              style={[
                styles.badge,
                isApproved ? styles.badgeApproved : styles.badgeRejected,
              ]}
            >
              <Text
                style={[
                  styles.badgeTxt,
                  isApproved ? styles.badgeTxtApproved : styles.badgeTxtRejected,
                ]}
              >
                {isApproved ? 'APPROVED' : 'REJECTED'}
              </Text>
            </View>
          )}
        </View>

        {/* Rejection Note if already rejected */}
        {!isPending && item.rejectionReason && (
          <View style={styles.rejectedBanner}>
            <AlertCircle size={15} color="#DC2626" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectedBannerTitle}>Rejection Reason:</Text>
              <Text style={styles.rejectedBannerTxt}>{item.rejectionReason}</Text>
              {item.reviewedByName && (
                <Text style={[styles.reviewedByTxt, { color: secondaryText }]}>
                  Reviewed by {item.reviewedByName}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Details Grid */}
        <View style={[styles.detailsGrid, { backgroundColor: isDark ? '#1F2937' : '#F8FAFC', borderColor }]}>
          {/* Applicant Name */}
          <View style={styles.detailItem}>
            <User size={14} color="#1A2D5A" />
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Applicant Name:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {name || '—'}
            </Text>
          </View>

          {/* Mobile Number */}
          <View style={styles.detailItem}>
            <Phone size={14} color="#2563EB" />
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Mobile Number:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {item.phone || '—'}
            </Text>
          </View>

          {/* Village / City */}
          <View style={styles.detailItem}>
            <MapPin size={14} color="#059669" />
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Village / City:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {item.city || item.village || item.street || '—'}
            </Text>
          </View>

          {/* Gender */}
          <View style={styles.detailItem}>
            <User size={14} color="#7C3AED" />
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Gender:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {item.gender || '—'}
            </Text>
          </View>

          {/* Date of Birth */}
          {item.dob ? (
            <View style={styles.detailItem}>
              <Calendar size={14} color="#D97706" />
              <Text style={[styles.detailLabel, { color: secondaryText }]}>Date of Birth:</Text>
              <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
                {formatDob(item.dob)}
              </Text>
            </View>
          ) : null}

          {/* Email */}
          {item.email ? (
            <View style={styles.detailItem}>
              <Mail size={14} color="#0284C7" />
              <Text style={[styles.detailLabel, { color: secondaryText }]}>Email:</Text>
              <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
                {item.email}
              </Text>
            </View>
          ) : null}

          {/* Marital Status */}
          {item.maritalStatus ? (
            <View style={styles.detailItem}>
              <Heart size={14} color="#DB2777" />
              <Text style={[styles.detailLabel, { color: secondaryText }]}>Marital:</Text>
              <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
                {item.maritalStatus}
                {item.maritalStatus !== 'Single' && item.numberOfChildren
                  ? ` • ${item.numberOfChildren} Child(ren)`
                  : ''}
              </Text>
            </View>
          ) : null}

          {/* Baptism */}
          {item.baptized && item.baptized !== 'No' ? (
            <View style={styles.detailItem}>
              <Droplets size={14} color="#0284C7" />
              <Text style={[styles.detailLabel, { color: secondaryText }]}>Baptized:</Text>
              <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
                Yes {item.baptismDate ? `(${formatDob(item.baptismDate)})` : ''}
              </Text>
            </View>
          ) : null}

          {/* Full Address */}
          {(item.street || item.mandal || item.district || item.state) ? (
            <View style={styles.detailItem}>
              <MapPin size={14} color="#059669" />
              <Text style={[styles.detailLabel, { color: secondaryText }]}>Address:</Text>
              <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={2}>
                {[item.street, item.mandal, item.city || item.village, item.district, item.state]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          {isPending ? (
            <>
              <TouchableOpacity
                style={[styles.rejectBtn, isBusy && styles.btnDisabled]}
                onPress={() => openRejectModal(item)}
                disabled={isBusy}
                activeOpacity={0.8}
              >
                <XCircle size={17} color="#DC2626" strokeWidth={2.2} />
                <Text style={styles.rejectBtnTxt}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.approveBtn, isBusy && styles.btnDisabled]}
                onPress={() => handleApprove(item)}
                disabled={isBusy}
                activeOpacity={0.8}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <CheckCircle size={17} color="#fff" strokeWidth={2.2} />
                    <Text style={styles.approveBtnTxt}>Approve</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : isApproved ? (
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', alignItems: 'center' }}>
              <View
                style={[
                  styles.disabledApprovedPill,
                  {
                    flex: 1,
                    backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5',
                    borderColor: isDark ? 'rgba(5, 150, 105, 0.4)' : '#A7F3D0',
                  },
                ]}
              >
                <CheckCircle size={16} color="#059669" strokeWidth={2.2} />
                <Text style={styles.disabledApprovedTxt}>Approved (Active Member)</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.deleteBtn,
                  { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' },
                  isBusy && styles.btnDisabled,
                ]}
                onPress={() => handleDeleteRequest(item)}
                disabled={isBusy}
                activeOpacity={0.8}
              >
                <Trash2 size={16} color="#DC2626" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', alignItems: 'center' }}>
              <TouchableOpacity
                style={[styles.reconsiderBtn, { flex: 1 }, isBusy && styles.btnDisabled]}
                onPress={() => handleReconsider(item)}
                disabled={isBusy}
                activeOpacity={0.8}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color="#059669" />
                ) : (
                  <>
                    <RotateCcw size={16} color="#059669" strokeWidth={2.2} />
                    <Text style={styles.reconsiderBtnTxt}>Reconsider</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteBtn,
                  { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' },
                  isBusy && styles.btnDisabled,
                ]}
                onPress={() => handleDeleteRequest(item)}
                disabled={isBusy}
                activeOpacity={0.8}
              >
                <Trash2 size={16} color="#DC2626" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={barStyle} backgroundColor={screenBg} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Top Header */}
        <View style={[styles.header, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: isDark ? '#1F2937' : 'rgba(0,0,0,0.05)' }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <ChevronLeft color={primaryText} size={22} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: primaryText }]}>Registration Approvals</Text>
            <Text style={[styles.headerSub, { color: secondaryText }]}>
              {activeChurch?.name || 'Rhema Global Ministries'}
            </Text>
          </View>
          <View style={styles.headerRightPlaceholder} />
        </View>

        {/* Scrollable Round Badge Tabs */}
        <View style={styles.tabScrollWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScrollContent}
          >
            {/* Pending Badge - Charcoal */}
            <TouchableOpacity
              style={[
                styles.roundBadge,
                activeTab === 'pending'
                  ? {
                      backgroundColor: '#262626',
                      borderColor: '#262626',
                    }
                  : {
                      backgroundColor: isDark ? '#1F2937' : '#F1F5F9',
                      borderColor: isDark ? '#374151' : '#E2E8F0',
                    },
              ]}
              onPress={() => setActiveTab('pending')}
              activeOpacity={0.8}
            >
              <Clock
                size={14}
                color={
                  activeTab === 'pending'
                    ? '#FFFFFF'
                    : isDark
                    ? '#E5E7EB'
                    : '#374151'
                }
              />
              <Text
                style={[
                  styles.roundBadgeTxt,
                  {
                    color:
                      activeTab === 'pending'
                        ? '#FFFFFF'
                        : isDark
                        ? '#E5E7EB'
                        : '#374151',
                  },
                ]}
              >
                Pending ({pendingRequests.length})
              </Text>
            </TouchableOpacity>

            {/* Approved Badge - Green */}
            <TouchableOpacity
              style={[
                styles.roundBadge,
                activeTab === 'approved'
                  ? {
                      backgroundColor: '#059669',
                      borderColor: '#059669',
                    }
                  : {
                      backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5',
                      borderColor: isDark ? 'rgba(5, 150, 105, 0.3)' : '#A7F3D0',
                    },
              ]}
              onPress={() => setActiveTab('approved')}
              activeOpacity={0.8}
            >
              <CheckCircle
                size={14}
                color={activeTab === 'approved' ? '#FFFFFF' : '#059669'}
              />
              <Text
                style={[
                  styles.roundBadgeTxt,
                  {
                    color: activeTab === 'approved' ? '#FFFFFF' : '#059669',
                  },
                ]}
              >
                Approved ({approvedRequests.length})
              </Text>
            </TouchableOpacity>

            {/* Rejected Badge - Red */}
            <TouchableOpacity
              style={[
                styles.roundBadge,
                activeTab === 'rejected'
                  ? {
                      backgroundColor: '#DC2626',
                      borderColor: '#DC2626',
                    }
                  : {
                      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2',
                      borderColor: isDark ? 'rgba(220, 38, 38, 0.3)' : '#FECACA',
                    },
              ]}
              onPress={() => setActiveTab('rejected')}
              activeOpacity={0.8}
            >
              <XCircle
                size={14}
                color={activeTab === 'rejected' ? '#FFFFFF' : '#DC2626'}
              />
              <Text
                style={[
                  styles.roundBadgeTxt,
                  {
                    color: activeTab === 'rejected' ? '#FFFFFF' : '#DC2626',
                  },
                ]}
              >
                Rejected ({rejectedRequests.length})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: cardSurface, borderColor }]}>
          <Search size={18} color={secondaryText} />
          <TextInput
            style={[styles.searchInput, { color: primaryText }]}
            placeholder="Search by name, phone or city..."
            placeholderTextColor={secondaryText}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={secondaryText} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#1A2D5A'} />
            <Text style={[styles.centerTxt, { color: secondaryText }]}>Loading registration requests...</Text>
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.centerContainer}>
            <ShieldCheck size={52} color={secondaryText} />
            <Text style={[styles.emptyTitle, { color: primaryText }]}>
              {activeTab === 'pending'
                ? 'No Pending Approvals'
                : activeTab === 'approved'
                ? 'No Approved Registrations'
                : 'No Rejected Registrations'}
            </Text>
            <Text style={[styles.emptySub, { color: secondaryText }]}>
              {activeTab === 'pending'
                ? 'All new member registration requests have been reviewed!'
                : activeTab === 'approved'
                ? 'No approved registration requests in the record.'
                : 'No registration requests have been rejected.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredList}
            renderItem={renderCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[isDark ? '#FFFFFF' : '#1A2D5A']}
                tintColor={isDark ? '#FFFFFF' : '#1A2D5A'}
              />
            }
          />
        )}

        {/* Reject Reason Modal */}
        <Modal
          visible={rejectModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRejectModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: cardSurface, borderColor }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Reject Registration</Text>
                <TouchableOpacity onPress={() => setRejectModalVisible(false)}>
                  <X size={20} color={secondaryText} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalDesc, { color: secondaryText }]}>
                Provide a reason for rejecting the registration of{' '}
                <Text style={{ fontWeight: '700', color: primaryText }}>
                  {targetRequest?.fullName || targetRequest?.firstName || 'this applicant'}
                </Text>
                .
              </Text>

              <TextInput
                style={[
                  styles.rejectionInput,
                  {
                    backgroundColor: isDark ? '#1F2937' : '#F8FAFC',
                    borderColor: isDark ? '#374151' : '#E2E8F0',
                    color: primaryText,
                  },
                ]}
                placeholder="Type rejection reason (e.g. Invalid contact number, details mismatch)..."
                placeholderTextColor={secondaryText}
                value={rejectionReason}
                onChangeText={setRejectionReason}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoFocus
              />

              <View style={styles.quickChipsContainer}>
                <Text style={[styles.quickChipsTitle, { color: secondaryText }]}>Quick suggestions:</Text>
                <View style={styles.presetChipsRow}>
                  {[
                    'Invalid contact number',
                    'Incomplete registration details',
                    'Duplicate account request',
                    'Not in church fellowship territory',
                  ].map((chip) => (
                    <TouchableOpacity
                      key={chip}
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor:
                            rejectionReason === chip
                              ? isDark
                                ? '#7F1D1D'
                                : '#FEE2E2'
                              : isDark
                              ? '#374151'
                              : '#F1F5F9',
                          borderColor: rejectionReason === chip ? '#EF4444' : 'transparent',
                        },
                      ]}
                      onPress={() => setRejectionReason(chip)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.presetChipTxt,
                          {
                            color: rejectionReason === chip ? '#DC2626' : primaryText,
                          },
                        ]}
                      >
                        {chip}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}
                  onPress={() => setRejectModalVisible(false)}
                >
                  <Text style={[styles.modalCancelTxt, { color: secondaryText }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={handleSubmitReject}
                >
                  <Text style={styles.modalConfirmTxt}>Confirm Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  headerRightPlaceholder: {
    width: 38,
  },
  tabScrollWrapper: {
    paddingVertical: 12,
  },
  tabScrollContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  roundBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9999,
    borderWidth: 1.5,
    gap: 7,
  },
  roundBadgeTxt: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaTxt: {
    fontSize: 11.5,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgePending: {
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  badgeApproved: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeRejected: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  badgeTxt: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeTxtPending: {
    color: '#FFFFFF',
  },
  badgeTxtApproved: {
    color: '#059669',
  },
  badgeTxtRejected: {
    color: '#DC2626',
  },
  rejectedBanner: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  rejectedBannerTitle: {
    color: '#DC2626',
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  rejectedBannerTxt: {
    color: '#991B1B',
    fontSize: 13,
    lineHeight: 18,
  },
  reviewedByTxt: {
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  detailsGrid: {
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginBottom: 14,
    borderWidth: 1,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  detailVal: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rejectBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rejectBtnTxt: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  approveBtn: {
    flex: 1.4,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  approveBtnTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledApprovedPill: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabledApprovedTxt: {
    color: '#059669',
    fontSize: 13.5,
    fontWeight: '700',
  },
  reconsiderBtn: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reconsiderBtnTxt: {
    color: '#059669',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteBtn: {
    width: 44,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    marginTop: 60,
  },
  centerTxt: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: {
    color: '#DC2626',
    fontSize: 18,
    fontWeight: '700',
  },
  modalDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
  },
  reasonOptionSelected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94A3B8',
  },
  radioCircleSelected: {
    borderColor: '#DC2626',
    backgroundColor: '#DC2626',
  },
  reasonOptionTxt: {
    fontSize: 13,
    flex: 1,
  },
  reasonOptionTxtSelected: {
    color: '#DC2626',
    fontWeight: '600',
  },
  rejectionInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  quickChipsContainer: {
    marginBottom: 8,
  },
  quickChipsTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  presetChipTxt: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelTxt: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1.2,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

