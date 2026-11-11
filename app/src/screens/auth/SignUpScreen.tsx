import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  AlertTriangle,
  Calendar,
  Phone,
  Clock,
} from 'lucide-react-native';
import FirestoreService from '../../services/FirestoreService';
import auth from '@react-native-firebase/auth';

import { useChurch } from '../../context/ChurchContext';

export default function SignUpScreen({ navigation }: any) {
  const { churchId, activeChurch } = useChurch();
  const [loading, setLoading] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingReqData, setPendingReqData] = useState<any>(null);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [datePickerField, setDatePickerField] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    phone: '',
    email: '',
    gender: 'Male',
    maritalStatus: 'Single',
    anniversaryDate: '',
    numberOfChildren: '',
    baptized: 'No',
    baptismDate: '',
    baptismChurch: '',
    churchName: '',
    street: '',
    mandal: '',
    city: '',
    district: '',
    state: '',
    zip: '',
    nationality: 'Indian',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const showDatePicker = (field: string) => {
    setDatePickerField(field);
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleConfirm = (date: Date) => {
    const formattedDate = date.toISOString().split('T')[0];
    handleInputChange(datePickerField, formattedDate);
    hideDatePicker();
  };

  const handleSignUp = async () => {
    if (!formData.firstName || !formData.lastName || !formData.phone) {
      Alert.alert('Required Fields', 'Please fill in your name and phone number.');
      return;
    }

    if (formData.baptized === 'Yes' && (!formData.baptismDate || !formData.baptismChurch)) {
      Alert.alert('Baptism Details', 'Please provide the Date and Church of your baptism.');
      return;
    }

    if (formData.maritalStatus !== 'Single' && (!formData.anniversaryDate || !formData.numberOfChildren)) {
      Alert.alert('Marital Details', 'Please provide your Anniversary Date and Number of Children.');
      return;
    }

    setLoading(true);
    try {
      const checkResult = await FirestoreService.checkContactExists(formData.phone);
      
      if (checkResult?.error) {
        Alert.alert('Database Error', 'Unable to verify phone number. Please try again later.');
        setLoading(false);
        return;
      }
      
      if (checkResult?.exists) {
        setShowDuplicateModal(true);
        setLoading(false);
        return;
      }

      if (checkResult?.isPending) {
        setPendingReqData(checkResult.registrationRequest || {
          phone: formData.phone,
          firstName: formData.firstName,
          lastName: formData.lastName,
          city: formData.city,
          gender: formData.gender,
        });
        setShowPendingModal(true);
        setLoading(false);
        return;
      }

      // Format phone number for Firebase
      let cleanNum = formData.phone.replace(/[^0-9+]/g, '');
      if (cleanNum.length === 10 && !cleanNum.startsWith('+')) {
        cleanNum = `+91${cleanNum}`;
      }
      
      if (!cleanNum.startsWith('+') || cleanNum.length < 12) {
        Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number.');
        setLoading(false);
        return;
      }

      // Send OTP
      const confirmation = await auth().signInWithPhoneNumber(cleanNum);
      
      // Navigate to OTP screen and pass the formData so it can be saved after verification
      navigation.navigate('VerifyOtp', { 
        confirmation, 
        phoneNumber: cleanNum,
        formData: formData, // Pass all form data to save after OTP
        isSignUp: true      // Flag to indicate this is a new registration
      });

    } catch (error: any) {
      if (error?.message?.includes('failed-precondition') || error?.message?.includes('index')) {
        Alert.alert('System Updating', 'The database is currently updating its indexes. Please try registering again in 1-2 minutes.');
      } else {
        Alert.alert('Registration Error', error.message || 'Unable to send SMS. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDF6F2" />
      
      {/* Top safe area matches top peach header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FDF6F2' }} />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.keyboardAvoid}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          bounces={true}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Top Header with Peach Gradient (Scrolls as part of the full screen) ── */}
          <LinearGradient 
            colors={['#FDF6F2', '#FEF7F3', '#FCEEE2']} 
            style={styles.topHeaderArea}
          >
            {/* Top Bar with Clean Back Arrow */}
            <View style={styles.topBar}>
              <TouchableOpacity 
                style={styles.backArrowBtn} 
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.navigate('Login');
                  }
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <ChevronLeft size={28} color="#0F172A" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            {/* 3D Character Illustration Area with Semi-Circle Arch */}
            <View style={styles.characterContainer}>
              <View style={styles.semiCircleArch} />
              <Image 
                source={require('../../../assets/login_character.png')}
                style={styles.characterImg}
                resizeMode="contain"
              />
            </View>
          </LinearGradient>

          {/* ── Pure White Form Section (Seamless full-screen scroll) ── */}
          <View style={styles.formContainer}>
            <Text style={styles.cardHeading}>Create Account</Text>
            <Text style={styles.cardSubheading}>Join our faith family & fellowship</Text>

            {/* ── First Name and Last Name in ONE Row ── */}
            <View style={styles.nameRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>FIRST NAME</Text>
                <View style={styles.inputWrapper}>
                  <TextInput 
                    style={styles.input} 
                    value={formData.firstName} 
                    onChangeText={(v) => handleInputChange('firstName', v)} 
                    placeholder="John" 
                    placeholderTextColor="#94A3B8" 
                  />
                </View>
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>LAST NAME</Text>
                <View style={styles.inputWrapper}>
                  <TextInput 
                    style={styles.input} 
                    value={formData.lastName} 
                    onChangeText={(v) => handleInputChange('lastName', v)} 
                    placeholder="Mathew" 
                    placeholderTextColor="#94A3B8" 
                  />
                </View>
              </View>
            </View>

            {/* ── Mobile Number Pill ── */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MOBILE NUMBER</Text>
              <View style={styles.pillInputWrapper}>
                <View style={styles.phoneIconWrap}>
                  <Phone size={19} color="#FA6203" strokeWidth={2.4} />
                </View>
                <Text style={styles.countryCodeTxt}>+91</Text>
                <View style={styles.pillDivider} />
                <TextInput 
                  style={styles.pillTextInput} 
                  value={formData.phone} 
                  onChangeText={(v) => handleInputChange('phone', v)} 
                  placeholder="Phone number" 
                  placeholderTextColor="#94A3B8" 
                  keyboardType="phone-pad" 
                  maxLength={10} 
                />
              </View>
            </View>

            {/* ── Village / City ── */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>VILLAGE / CITY</Text>
              <View style={styles.inputWrapper}>
                <TextInput 
                  style={styles.input} 
                  value={formData.city} 
                  onChangeText={(v) => handleInputChange('city', v)} 
                  placeholder="Enter your village or city" 
                  placeholderTextColor="#94A3B8" 
                />
              </View>
            </View>

            {/* ── Date of Birth & Gender in One Row ── */}
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>DATE OF BIRTH</Text>
                <TouchableOpacity onPress={() => showDatePicker('dob')} activeOpacity={0.8}>
                  <View style={[styles.inputWrapper, styles.dateInputWrapper]}>
                    <Text style={formData.dob ? styles.inputValue : styles.inputPlaceholder}>
                      {formData.dob ? formData.dob.split('-').reverse().join('-') : 'DD-MM-YYYY'}
                    </Text>
                    <Calendar size={18} color="#FA6203" />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>GENDER</Text>
                <View style={styles.genderRow}>
                  <TouchableOpacity 
                    style={[styles.genderBtn, formData.gender === 'Male' && styles.genderBtnActive]} 
                    onPress={() => handleInputChange('gender', 'Male')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.genderTxt, formData.gender === 'Male' && styles.genderTxtActive]}>Male</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.genderBtn, formData.gender === 'Female' && styles.genderBtnActive]} 
                    onPress={() => handleInputChange('gender', 'Female')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.genderTxt, formData.gender === 'Female' && styles.genderTxtActive]}>Female</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── Submit Registration Button ── */}
            <TouchableOpacity 
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]} 
              onPress={handleSignUp} 
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnTxt}>Create Account</Text>
              )}
            </TouchableOpacity>

            {/* ── Footer Link ── */}
            <View style={styles.footerRow}>
              <Text style={styles.footerPrefix}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login', { showPhoneInput: true })} activeOpacity={0.7}>
                <Text style={styles.footerLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom safe area is pure white */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF' }} />

      {/* ── Duplicate Member Alert Modal ── */}
      <Modal animationType="fade" transparent={true} visible={showDuplicateModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.alertCard}>
            <View style={styles.alertIcon}>
              <AlertTriangle size={30} color="#DC2626" />
            </View>
            <Text style={styles.alertTitle}>Already a Member</Text>
            <Text style={styles.alertSub}>
              This phone number is already registered in church records. Please sign in instead.
            </Text>
            <TouchableOpacity 
              style={styles.modalBtn} 
              onPress={() => { 
                setShowDuplicateModal(false); 
                navigation.navigate('Login', { showPhoneInput: true }); 
              }}
              activeOpacity={0.88}
            >
              <Text style={styles.modalBtnTxt}>Go to Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.modalSecBtn} 
              onPress={() => setShowDuplicateModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalSecBtnTxt}>Change Number</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Pending Approval Modal Popup Card ── */}
      <Modal visible={showPendingModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.alertCard}>
            <View style={[styles.alertIcon, { backgroundColor: '#FEF3C7' }]}>
              <Clock size={32} color="#D97706" />
            </View>
            <Text style={styles.alertTitle}>Application Under Review</Text>
            <Text style={styles.alertSub}>
              A registration application with mobile number {formData.phone} has already been submitted and is currently awaiting administrator review. You do not need to register again.
            </Text>
            <TouchableOpacity 
              style={[styles.modalBtn, { backgroundColor: '#FA6203', marginBottom: 10 }]} 
              onPress={async () => { 
                setShowPendingModal(false);
                const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                const cleanPhone = formData.phone.replace(/[^0-9+]/g, '');
                const fullName = pendingReqData?.fullName || `${pendingReqData?.firstName || formData.firstName} ${pendingReqData?.lastName || formData.lastName || ''}`.trim();
                await AsyncStorage.setItem('@pending_registration_phone', cleanPhone).catch(() => {});
                await AsyncStorage.setItem('@pending_registration_name', fullName).catch(() => {});
                await AsyncStorage.setItem('@pending_registration_city', pendingReqData?.city || formData.city || '').catch(() => {});
                await AsyncStorage.setItem('@pending_registration_gender', pendingReqData?.gender || formData.gender || '').catch(() => {});
                await AsyncStorage.setItem('@is_pending_approval', 'true').catch(() => {});

                navigation.navigate('ApprovalPending', {
                  phoneNumber: cleanPhone,
                  churchId: activeChurch?.id,
                  applicantName: fullName,
                  city: pendingReqData?.city || formData.city,
                  gender: pendingReqData?.gender || formData.gender,
                  applicantData: pendingReqData,
                });
              }}
              activeOpacity={0.88}
            >
              <Text style={styles.modalBtnTxt}>View Approval Status</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.modalSecBtn} 
              onPress={() => setShowPendingModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalSecBtnTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DateTimePickerModal 
        isVisible={isDatePickerVisible} 
        mode="date" 
        onConfirm={handleConfirm} 
        onCancel={hideDatePicker} 
        maximumDate={new Date()} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoid: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    paddingBottom: Platform.OS === 'ios' ? 44 : 64,
  },
  topHeaderArea: {
    width: '100%',
    backgroundColor: '#FDF6F2',
    paddingBottom: 0,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 0,
  },
  backArrowBtn: {
    padding: 6,
    alignSelf: 'flex-start',
  },
  characterContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
    paddingTop: 0,
  },
  semiCircleArch: {
    position: 'absolute',
    bottom: 0,
    width: 250,
    height: 165,
    borderTopLeftRadius: 125,
    borderTopRightRadius: 125,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: '#FCEEE2',
    alignSelf: 'center',
  },
  characterImg: {
    width: '100%',
    height: 175,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 24,
    marginTop: -20,
  },
  cardHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0A1629',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  cardSubheading: {
    fontSize: 14,
    fontWeight: '400',
    color: '#5E6F88',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  nameRow: {
    flexDirection: 'row',
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 1.2,
    borderColor: '#EDF2F6',
    shadowColor: '#718096',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0A1629',
    paddingVertical: 0,
  },
  pillInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 1.2,
    borderColor: '#EDF2F6',
    shadowColor: '#718096',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  phoneIconWrap: {
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countryCodeTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A1629',
    marginLeft: 2,
  },
  pillDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 12,
  },
  pillTextInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0A1629',
    paddingVertical: 0,
  },
  dateInputWrapper: {
    justifyContent: 'space-between',
  },
  inputPlaceholder: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  inputValue: {
    color: '#0A1629',
    fontSize: 14,
    fontWeight: '600',
  },
  genderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    padding: 3,
    height: 52,
  },
  genderBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 15,
  },
  genderBtnActive: {
    backgroundColor: '#0F172A',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  genderTxt: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  genderTxtActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#991B1B',
    borderRadius: 22,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#991B1B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnTxt: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: Platform.OS === 'android' ? 16 : 8,
  },
  footerPrefix: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '500',
  },
  footerLink: {
    color: '#FA6203',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.65)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 24 
  },
  alertCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 26, 
    width: '100%', 
    alignItems: 'center', 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  alertIcon: { 
    width: 60, 
    height: 60, 
    borderRadius: 30, 
    backgroundColor: '#FEE2E2', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  alertTitle: { 
    fontSize: 20, 
    fontWeight: '800', 
    color: '#0A1629', 
    marginBottom: 8 
  },
  alertSub: { 
    fontSize: 14, 
    color: '#64748B', 
    textAlign: 'center', 
    lineHeight: 20, 
    marginBottom: 24 
  },
  modalBtn: { 
    backgroundColor: '#0F172A', 
    height: 48,
    width: '100%', 
    borderRadius: 20, 
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  modalBtnTxt: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '700' 
  },
  modalSecBtn: { 
    marginTop: 14,
    paddingVertical: 6,
  },
  modalSecBtnTxt: { 
    color: '#64748B', 
    fontSize: 14, 
    fontWeight: '600' 
  },
});
