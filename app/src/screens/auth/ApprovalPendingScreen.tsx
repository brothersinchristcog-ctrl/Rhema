import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Sparkles,
  ArrowRight,
  Phone,
  User,
  Calendar,
  Building2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  ChevronLeft,
} from 'lucide-react-native';
import FirestoreService, { RegistrationRequest } from '../../services/FirestoreService';
import { useChurch } from '../../context/ChurchContext';
import { useAuth } from '../../context/AuthContext';
import { RHEMA_CHURCH_ID } from '../../constants/ChurchConfig';

export default function ApprovalPendingScreen({ route, navigation }: any) {
  const { churchId: activeChurchId, activeChurch } = useChurch();
  const { user, signOut, refreshApprovalStatus, registrationRequest } = useAuth();

  const targetChurchId = route?.params?.churchId || activeChurchId || RHEMA_CHURCH_ID;
  const [phoneNumber, setPhoneNumber] = useState(route?.params?.phoneNumber || user?.phoneNumber || '');
  const initialName = route?.params?.applicantName || '';

  const [request, setRequest] = useState<RegistrationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // Cached fallback details from AsyncStorage to display instantly without waiting
  const [storedData, setStoredData] = useState<{
    phone?: string;
    name?: string;
    city?: string;
    gender?: string;
  }>({});

  // Back to Sign In handler
  const handleBackToSignIn = async () => {
    try {
      await AsyncStorage.multiRemove([
        '@is_pending_approval',
        '@pending_registration_status',
        '@pending_registration_phone',
        '@pending_registration_name',
        '@pending_registration_city',
        '@pending_registration_gender',
        '@pending_registration_church',
      ]).catch(() => {});
      await signOut().catch(() => {});
      if (navigation?.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
      } else if (navigation?.navigate) {
        try {
          navigation.navigate('Login');
        } catch {
          // Handled by RootNavigator auth state transition
        }
      }
    } catch (e) {
      console.warn('handleBackToSignIn error:', e);
    }
  };

  // 1. Hardware Back Button handler on Android (returns to Sign In safely)
  useEffect(() => {
    const onBackPress = () => {
      handleBackToSignIn();
      return true;
    };
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backSubscription.remove();
  }, []);

  // 2. Retrieve phone number and stored details from storage if not directly provided
  useEffect(() => {
    let isMounted = true;
    const resolveStorage = async () => {
      try {
        const [storedPhone, storedName, storedCity, storedGender] = await Promise.all([
          AsyncStorage.getItem('@pending_registration_phone'),
          AsyncStorage.getItem('@pending_registration_name'),
          AsyncStorage.getItem('@pending_registration_city'),
          AsyncStorage.getItem('@pending_registration_gender'),
        ]);

        if (isMounted) {
          setStoredData({
            phone: storedPhone || undefined,
            name: storedName || undefined,
            city: storedCity || undefined,
            gender: storedGender || undefined,
          });

          if (!phoneNumber && storedPhone) {
            setPhoneNumber(storedPhone);
          } else if (!phoneNumber && user?.phoneNumber) {
            setPhoneNumber(user.phoneNumber);
          }
        }
      } catch (e) {}
    };
    resolveStorage();
    return () => { isMounted = false; };
  }, [phoneNumber, user]);

  // 3. Subscribe to live real-time changes in Firestore
  useEffect(() => {
    const targetPhone = phoneNumber || storedData.phone;
    if (!targetPhone) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = FirestoreService.subscribeToRegistrationRequest(
      targetChurchId,
      targetPhone,
      (updatedReq) => {
        if (updatedReq) {
          setRequest(updatedReq);
        }
        setLoading(false);
      }
    );

    // Immediate direct fetch
    FirestoreService.getRegistrationRequest(targetChurchId, targetPhone)
      .then((fresh) => {
        if (fresh) {
          setRequest(fresh);
        }
        setLoading(false);
      })
      .catch(() => {});

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [phoneNumber, storedData.phone, targetChurchId]);

  const handleManualCheck = async () => {
    const targetPhone = phoneNumber || storedData.phone;
    if (!targetPhone) return;
    setRefreshing(true);
    try {
      const fresh = await FirestoreService.getRegistrationRequest(targetChurchId, targetPhone);
      setRequest(fresh);
      if (fresh?.status === 'approved') {
        Alert.alert('Approved! 🎉', 'Your registration has been approved. You can now sign in.');
      } else if (fresh?.status === 'rejected') {
        Alert.alert(
          'Registration Status',
          fresh.rejectionReason
            ? `Status: Not approved.\nReason: ${fresh.rejectionReason}`
            : 'Your registration was not approved.'
        );
      } else {
        Alert.alert('Still In Review', 'Your registration is currently pending admin review. Please check back shortly.');
      }
    } catch (e: any) {
      Alert.alert('Check Status', 'Unable to reach the church server. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // When approved: clear pending lock and sign in
  const handleProceedToSignIn = async () => {
    setActionBusy(true);
    try {
      await AsyncStorage.multiRemove([
        '@is_pending_approval',
        '@pending_registration_status',
        '@pending_registration_phone',
        '@pending_registration_name',
        '@pending_registration_city',
        '@pending_registration_gender',
        '@pending_registration_church',
      ]).catch(() => {});

      const success = await refreshApprovalStatus();
      if (!success) {
        await signOut();
        if (navigation?.navigate) {
          try {
            navigation.navigate('Login', { showPhoneInput: true });
          } catch {}
        }
      }
    } catch (e) {
      console.warn('handleProceedToSignIn error:', e);
    } finally {
      setActionBusy(false);
    }
  };

  // When rejected: permanently delete applicant data from Firebase and sign out
  const handleAcknowledgeRejection = async () => {
    setActionBusy(true);
    try {
      const phoneToDelete = phoneNumber || storedData.phone;
      if (phoneToDelete) {
        // Permanently delete registration data from Firebase
        await FirestoreService.deleteRegistrationRequest(targetChurchId, phoneToDelete).catch(() => {});
      }
      await AsyncStorage.multiRemove([
        '@is_pending_approval',
        '@pending_registration_status',
        '@pending_registration_phone',
        '@pending_registration_name',
        '@pending_registration_city',
        '@pending_registration_gender',
        '@pending_registration_church',
      ]).catch(() => {});

      await signOut();
      if (navigation?.navigate) {
        try {
          navigation.navigate('Login');
        } catch {}
      }
    } catch (e) {
      console.warn('handleAcknowledgeRejection error:', e);
    } finally {
      setActionBusy(false);
    }
  };

  const status = request?.status || registrationRequest?.status || (storedData as any)?.status || 'pending';
  const rejectionReason = request?.rejectionReason || registrationRequest?.rejectionReason || route?.params?.rejectionReason || '';

  const applicantName =
    request?.fullName ||
    (request?.firstName ? `${request.firstName} ${request.lastName || ''}`.trim() : '') ||
    registrationRequest?.fullName ||
    (registrationRequest?.firstName ? `${registrationRequest.firstName} ${registrationRequest.lastName || ''}`.trim() : '') ||
    route?.params?.applicantName ||
    (route?.params?.applicantData?.fullName) ||
    (route?.params?.applicantData?.firstName ? `${route.params.applicantData.firstName} ${route.params.applicantData.lastName || ''}`.trim() : '') ||
    storedData.name ||
    initialName ||
    '—';

  const effectivePhone =
    phoneNumber ||
    request?.phone ||
    registrationRequest?.phone ||
    storedData.phone ||
    user?.phoneNumber ||
    '';

  const villageCity =
    request?.city ||
    (request as any)?.village ||
    registrationRequest?.city ||
    (registrationRequest as any)?.village ||
    route?.params?.city ||
    (route?.params?.applicantData?.city) ||
    storedData.city ||
    '—';

  const gender =
    request?.gender ||
    registrationRequest?.gender ||
    route?.params?.gender ||
    (route?.params?.applicantData?.gender) ||
    storedData.gender ||
    '—';

  const churchTitle = activeChurch?.name || 'Rhema Global Ministries';

  const formattedDate = request?.createdAt
    ? new Date(request.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

  const formatDisplayPhone = (num?: string) => {
    if (!num) return '—';
    const clean = num.replace(/[^0-9+]/g, '');
    if (clean.startsWith('+91') && clean.length === 13) {
      return `+91 ${clean.slice(3, 8)} ${clean.slice(8)}`;
    }
    if (!clean.startsWith('+') && clean.length === 10) {
      return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
    }
    return num;
  };

  const renderSummaryBox = (showSubmissionDate = true) => (
    <View style={styles.summaryBox}>
      {/* Applicant Name */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryLabelRow}>
          <User size={15} color="#64748B" />
          <Text style={styles.summaryLabel}>Applicant Name</Text>
        </View>
        <Text style={styles.summaryValue}>{applicantName}</Text>
      </View>

      <View style={styles.summaryDivider} />

      {/* Mobile Number */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryLabelRow}>
          <Phone size={15} color="#64748B" />
          <Text style={styles.summaryLabel}>Mobile Number</Text>
        </View>
        <Text style={styles.summaryValue}>{formatDisplayPhone(effectivePhone)}</Text>
      </View>

      <View style={styles.summaryDivider} />

      {/* Village / City */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryLabelRow}>
          <MapPin size={15} color="#64748B" />
          <Text style={styles.summaryLabel}>Village / City</Text>
        </View>
        <Text style={styles.summaryValue}>{villageCity}</Text>
      </View>

      <View style={styles.summaryDivider} />

      {/* Gender */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryLabelRow}>
          <User size={15} color="#64748B" />
          <Text style={styles.summaryLabel}>Gender</Text>
        </View>
        <Text style={styles.summaryValue}>{gender}</Text>
      </View>

      {showSubmissionDate && (
        <>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <View style={styles.summaryLabelRow}>
              <Calendar size={15} color="#64748B" />
              <Text style={styles.summaryLabel}>Submitted On</Text>
            </View>
            <Text style={styles.summaryValue}>{formattedDate}</Text>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDF4ED" />
      
      {/* ── Light Orange & White Gradient Background (matching Sign In / Sign Up) ── */}
      <LinearGradient 
        colors={['#FDF4ED', '#FEF7F3', '#FFFFFF']} 
        style={StyleSheet.absoluteFillObject} 
      />

      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        {/* ── Top Header with Back Button ── */}
        <View style={styles.topNavRow}>
          <TouchableOpacity
            style={styles.headerBackBtn}
            onPress={handleBackToSignIn}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ChevronLeft size={22} color="#0F172A" strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.topNavTitle}>Approval Status</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#FA6203" />
              <Text style={styles.loadingTxt}>Checking application status...</Text>
            </View>
          ) : (
            <View style={styles.stateCard}>
              {/* ── 3D Image in Circle Frame ── */}
              <View style={[
                styles.circleImageContainer,
                status === 'approved' 
                  ? styles.circleBorderApproved 
                  : status === 'rejected' 
                  ? styles.circleBorderRejected 
                  : styles.circleBorderPending
              ]}>
                <Image 
                  source={
                    status === 'approved'
                      ? require('../../../assets/approval_approved.jpg')
                      : status === 'rejected'
                      ? require('../../../assets/approval_rejected.jpg')
                      : require('../../../assets/approval_pending.jpg')
                  }
                  style={styles.circleImage}
                  resizeMode="cover"
                />
              </View>

              {/* ══════════════════════════════════════════════════════
                 STATUS 1: APPROVED
                 ══════════════════════════════════════════════════════ */}
              {status === 'approved' && (
                <>
                  <View style={styles.approvedPill}>
                    <Sparkles size={14} color="#059669" />
                    <Text style={styles.approvedPillTxt}>APPROVED BY ADMIN</Text>
                  </View>

                  <Text style={styles.heading}>Welcome to the Family! 🎉</Text>
                  <Text style={styles.description}>
                    Praise God! Your registration has been approved by church administration. Your membership profile is now active and ready for fellowship.
                  </Text>

                  {/* Summary Box */}
                  {renderSummaryBox(false)}

                  {/* Primary Sign In Button */}
                  <TouchableOpacity
                    style={styles.signInBtn}
                    onPress={handleProceedToSignIn}
                    disabled={actionBusy}
                    activeOpacity={0.88}
                  >
                    {actionBusy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.signInBtnTxt}>Sign In to Your Account</Text>
                        <ArrowRight size={20} color="#FFFFFF" strokeWidth={2.4} style={{ marginLeft: 8 }} />
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* ══════════════════════════════════════════════════════
                 STATUS 2: REJECTED
                 (No sign in button, professional text, delete on close)
                 ══════════════════════════════════════════════════════ */}
              {status === 'rejected' && (
                <>
                  <View style={styles.rejectedPill}>
                    <Text style={styles.rejectedPillTxt}>REGISTRATION NOT APPROVED</Text>
                  </View>

                  <Text style={styles.heading}>Registration Status</Text>
                  <Text style={styles.description}>
                    Thank you for your interest in joining {churchTitle}. After careful review, the church administration was unable to approve this registration application at this time.
                  </Text>

                  {rejectionReason ? (
                    <View style={styles.reasonCard}>
                      <Text style={styles.reasonCardTitle}>Note from Administration:</Text>
                      <Text style={styles.reasonCardTxt}>{rejectionReason}</Text>
                    </View>
                  ) : null}

                  {/* Summary Box */}
                  {renderSummaryBox(false)}

                  <View style={styles.noticeBox}>
                    <Text style={styles.noticeBoxTxt}>
                      If you have questions or wish to speak with church leadership, please contact the church office directly.
                    </Text>
                  </View>

                  {/* Close Button: Deletes applicant data from Firebase and returns */}
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={handleAcknowledgeRejection}
                    disabled={actionBusy}
                    activeOpacity={0.88}
                  >
                    {actionBusy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.closeBtnTxt}>Close & Return to Welcome</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* ══════════════════════════════════════════════════════
                 STATUS 3: PENDING APPROVAL
                 ══════════════════════════════════════════════════════ */}
              {status === 'pending' && (
                <>
                  <View style={styles.pendingPill}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.pendingPillTxt}>APPROVAL PENDING</Text>
                  </View>

                  <Text style={styles.heading}>Application Under Review</Text>
                  <Text style={styles.description}>
                    Thank you for registering with {churchTitle}! Your application has been securely submitted. For community security and fellowship records, an administrator will review and activate your account shortly.
                  </Text>

                  {/* Applicant Summary */}
                  {renderSummaryBox(true)}

                  {/* Live sync indicator */}
                  <View style={styles.liveSyncRow}>
                    <ShieldCheck size={16} color="#059669" />
                    <Text style={styles.liveSyncTxt}>Listening for live administrator approval...</Text>
                  </View>

                  {/* Check Status Button */}
                  <TouchableOpacity
                    style={styles.refreshBtn}
                    onPress={handleManualCheck}
                    disabled={refreshing}
                    activeOpacity={0.88}
                  >
                    {refreshing ? (
                      <ActivityIndicator size="small" color="#0F172A" />
                    ) : (
                      <>
                        <RefreshCw size={17} color="#0F172A" strokeWidth={2.4} style={{ marginRight: 8 }} />
                        <Text style={styles.refreshBtnTxt}>Check Approval Status</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Return to Sign In / Register */}
                  <TouchableOpacity
                    style={styles.backToLoginBtn}
                    onPress={handleBackToSignIn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.backToLoginTxt}>Return to Sign In</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingBottom: 4,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  topNavTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  backToLoginBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backToLoginTxt: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 12 : 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 48,
    alignItems: 'center',
  },

  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  loadingTxt: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 12,
    fontWeight: '500',
  },

  stateCard: {
    width: '100%',
    alignItems: 'center',
  },

  // 3D Image Circle Frame
  circleImageContainer: {
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
    marginTop: 4,
    marginBottom: 24,
  },
  circleBorderPending: {
    borderColor: '#FED7AA',
  },
  circleBorderApproved: {
    borderColor: '#A7F3D0',
  },
  circleBorderRejected: {
    borderColor: '#FECACA',
  },
  circleImage: {
    width: '100%',
    height: '100%',
  },

  // Status pills
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 14,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EA580C',
    marginRight: 7,
  },
  pendingPillTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C2410C',
    letterSpacing: 0.6,
  },
  approvedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 14,
    gap: 6,
  },
  approvedPillTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.6,
  },
  rejectedPill: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 14,
  },
  rejectedPillTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: 0.6,
  },

  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },

  // Summary box
  summaryBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#718096',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    maxWidth: '55%',
    textAlign: 'right',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },

  // Reason card for rejected state
  reasonCard: {
    width: '100%',
    backgroundColor: '#FFF1F2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECDD3',
    marginBottom: 20,
  },
  reasonCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BE123C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  reasonCardTxt: {
    fontSize: 14,
    color: '#881337',
    lineHeight: 20,
    fontWeight: '500',
  },

  noticeBox: {
    width: '100%',
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  noticeBoxTxt: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },

  liveSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  liveSyncTxt: {
    fontSize: 12.5,
    color: '#059669',
    fontWeight: '600',
  },

  // Buttons
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 54,
    borderRadius: 27,
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 8,
  },
  signInBtnTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  closeBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  closeBtnTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  refreshBtnTxt: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },

  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  secondaryBtnTxt: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
});
