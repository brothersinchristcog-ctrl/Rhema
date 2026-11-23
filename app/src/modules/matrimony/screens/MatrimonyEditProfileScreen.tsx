import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  Image as ImageIcon,
  ImagePlus,
  Mail,
  Pencil,
  Phone,
  Search,
  User,
  X,
} from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import {
  CHILDREN_OPTIONS,
  CITIZENSHIP_OPTIONS,
  COUNTRY_OPTIONS,
  DENOMINATION_OPTIONS,
  DIVISION_OPTIONS,
  EATING_HABITS_OPTIONS,
  FAMILY_STATUS_OPTIONS,
  FAMILY_TYPE_OPTIONS,
  FAMILY_VALUES_OPTIONS,
  GENDER_OPTIONS,
  GLOBAL_STATES,
  HEIGHT_OPTIONS,
  INDIA_STATES,
  MARITAL_STATUS_OPTIONS,
  MOTHER_TONGUE_OPTIONS,
  PHYSICAL_STATUS_OPTIONS,
  RELIGION_OPTIONS,
  RELIGIOUS_VALUES_OPTIONS,
  SIBLING_COUNT_OPTIONS,
  SMOKING_DRINKING_OPTIONS,
} from '../constants/profileOptions';
import {
  CURRENCY_OPTIONS,
  EDUCATION_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  INCOME_OPTIONS_GLOBAL,
  INCOME_OPTIONS_INR,
  OCCUPATION_OPTIONS,
  SidebarOptionItem,
} from '../constants/professionalOptions';
import { matrimonyApi } from '../services/matrimonyApi';
import { StartRegistrationResponse } from '../types/matrimony';

const CORAL = '#E05A5A';
const ACCENT_RED = '#C94A4A';
const ORANGE = '#EA580C';
const ORANGE_BORDER = '#FDBA74';
const GREEN = '#16A34A';

type EditModalType =
  | 'mobile'
  | 'email'
  | 'about'
  | 'basic'
  | 'professional'
  | 'location'
  | 'religious'
  | 'habits'
  | 'family'
  | 'aboutFamily'
  | 'prefCompulsory'
  | 'prefAbout'
  | 'prefBasic'
  | 'prefReligious'
  | 'prefProfessional'
  | 'prefLocation'
  | 'prefHabits'
  | null;

type PickerKey =
  | 'religion'
  | 'denomination'
  | 'division'
  | 'religiousValues'
  | 'country'
  | 'state'
  | 'citizenship'
  | 'height'
  | 'motherTongue'
  | 'education'
  | 'employment'
  | 'occupation'
  | 'currency'
  | 'income'
  | 'familyValues'
  | 'prefMinAge'
  | 'prefMaxAge'
  | 'prefMinHeight'
  | 'prefMaxHeight'
  | 'prefMotherTongue'
  | 'prefDenomination'
  | 'prefDivision'
  | 'prefEducation'
  | 'prefEmployedIn'
  | 'prefOccupation'
  | 'prefAnnualIncome'
  | 'prefCountry'
  | 'prefState'
  | null;

const AGE_OPTIONS = Array.from({ length: 53 }, (_, i) => `${18 + i}`);
const PREF_CHILDREN_OPTIONS = ["Doesn't matter", 'No', 'Yes (Living together)', 'Yes (Not living together)'];
const PREF_MARITAL_OPTIONS = ["Doesn't matter", 'Never Married', 'Widowed', 'Divorced', 'Awaiting Divorce'];
const PREF_PHYSICAL_OPTIONS = ['Normal', 'Physically challenged', "Doesn't matter"];
const PREF_EATING_OPTIONS = ["Doesn't matter", 'Vegetarian', 'Non-Vegetarian', 'Eggetarian'];
const PREF_HABIT_OPTIONS = ["Doesn't matter", 'No', 'Occasionally', 'Yes'];
const IMPORTANCE_OPTIONS: { label: string; value: 'essential' | 'preferred' | 'flexible' }[] = [
  { label: 'Compulsory (Essential)', value: 'essential' },
  { label: 'Preferred', value: 'preferred' },
  { label: 'Flexible', value: 'flexible' },
];

function formatShortHeight(cm?: number | null): string {
  if (!cm || cm <= 0) return 'Not Specified';
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet} ft ${inches} in`;
}

function normalizeMaritalStatusLabel(val: string): string {
  const lower = val.trim().toLowerCase();
  if (lower === 'single' || lower === 'unmarried' || lower === 'never married') {
    return 'Never Married';
  }
  return val.trim();
}

function normalizePrefMaritalStatuses(list?: string[]): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    const norm = normalizeMaritalStatusLabel(item);
    if (PREF_MARITAL_OPTIONS.includes(norm) && norm !== "Doesn't matter" && !out.includes(norm)) {
      out.push(norm);
    }
  }
  return out;
}

function isOnlyNeverMarried(list?: string[]): boolean {
  const norm = normalizePrefMaritalStatuses(list);
  return norm.length === 1 && norm[0] === 'Never Married';
}

const SIBLING_RANK: Record<string, number> = {
  None: 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4+': 4,
};

function getMarriedOptions(totalCount: string): string[] {
  const max = SIBLING_RANK[totalCount] ?? 0;
  if (max <= 0) return [];
  return SIBLING_COUNT_OPTIONS.slice(0, max + 1);
}

function formatHeightDisplay(cm?: number | null): string {
  if (!cm || cm <= 0) return 'Not Specified';
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet} ft ${inches} in / ${cm} cm`;
}

function computeAge(dobStr: string): number | null {
  if (!dobStr) return null;
  const d = new Date(dobStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}

export default function MatrimonyEditProfileScreen({ navigation, route }: any) {
  const focusSection: string | undefined = route?.params?.focusSection;
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const scrollY = useRef(new Animated.Value(0)).current;
  const mainScrollRef = useRef<any>(null);
  const bodyContentYRef = useRef(0);
  const partnerPrefYRef = useRef<number | null>(null);
  const hasScrolledToPrefRef = useRef(false);
  const modalScrollRef = useRef<ScrollView>(null);
  const modalScrollYRef = useRef(0);
  const initialCached = matrimonyApi.getCachedRegistration();
  const [loading, setLoading] = useState(!initialCached);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<StartRegistrationResponse | null>(initialCached);
  const [activeModal, setActiveModal] = useState<EditModalType>(null);
  const [activePicker, setActivePicker] = useState<PickerKey>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [openToAnyDivision, setOpenToAnyDivision] = useState(false);
  const [prefMaritalStatuses, setPrefMaritalStatuses] = useState<string[]>([]);
  const [prefAcceptableEducation, setPrefAcceptableEducation] = useState<string[]>([]);
  const [prefOpenToRelocation, setPrefOpenToRelocation] = useState(true);
  const [expandPrefEdu, setExpandPrefEdu] = useState(false);
  const [inPartnerSection, setInPartnerSection] = useState(focusSection === 'partnerPreference');
  const [isScrolledHeader, setIsScrolledHeader] = useState(false);
  const lastProfileLoadRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

  const animatedKeyboard = useAnimatedKeyboard();
  const { height: windowHeight } = useWindowDimensions();
  const closedModalPad = Math.max(insets.bottom + 14, 22);
  const topSafeGap = Math.max(insets.top + 16, 44);
  const modalKeyboardLiftStyle = useAnimatedStyle(() => {
    const kbH = animatedKeyboard.height.value;
    const lift = kbH > 0 ? Math.max(0, kbH - (closedModalPad - 12)) : 0;
    const availableMaxHeight = Math.max(260, windowHeight - kbH - topSafeGap);
    return {
      maxHeight: availableMaxHeight,
      transform: [{ translateY: -lift }],
    };
  }, [closedModalPad, windowHeight, topSafeGap]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadProfile = useCallback(async (force = true) => {
    lastProfileLoadRef.current = Date.now();
    try {
      await matrimonyApi.hydrateCacheFromStorage().catch(() => undefined);
      const cached = matrimonyApi.getCachedRegistration();
      if (cached && mountedRef.current) {
        setData((prev) => prev || cached);
        setLoading(false);
      }
      const res = await matrimonyApi.startRegistration({ force });
      if (mountedRef.current) {
        setData(res);
      }
    } catch (err) {
      console.warn('MatrimonyEditProfile load error:', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadProfile(true);
    const unsub = navigation.addListener('focus', () => {
      const cached = matrimonyApi.getCachedRegistration();
      if (cached) setData(cached);
      if (matrimonyApi.hasPendingDraftSync(4500)) return;
      if (Date.now() - lastProfileLoadRef.current < 1500) return;
      loadProfile(true);
    });
    return unsub;
  }, [loadProfile, navigation]);

  useEffect(() => {
    hasScrolledToPrefRef.current = false;
  }, [focusSection]);

  const scrollToPartnerPreference = useCallback(() => {
    if (
      focusSection === 'partnerPreference' &&
      !loading &&
      partnerPrefYRef.current !== null &&
      !hasScrolledToPrefRef.current
    ) {
      hasScrolledToPrefRef.current = true;
      const targetY = Math.max(0, partnerPrefYRef.current - 12);
      setTimeout(() => {
        mainScrollRef.current?.scrollTo?.({ y: targetY, animated: true });
      }, 120);
    }
  }, [focusSection, loading]);

  useEffect(() => {
    scrollToPartnerPreference();
  }, [scrollToPartnerPreference]);

  useEffect(() => {
    if (
      focusSection === 'family' &&
      !loading &&
      data &&
      !hasScrolledToPrefRef.current
    ) {
      hasScrolledToPrefRef.current = true;
      setTimeout(() => {
        openEditor('family');
      }, 160);
    }
  }, [focusSection, loading, data]);

  const profile = data?.profile;
  const contact = data?.contactInfo;
  const familyDetails = data?.familyDetails;
  const incomeDetails = data?.incomeDetails;
  const preferences = data?.preferences;

  const displayName = profile?.displayName || contact?.fullName || 'Member';
  const photoUri = profile?.signedProfilePhoto || null;
  const totalPhotos =
    (photoUri ? 1 : 0) + (profile?.signedGallery?.length || profile?.gallery?.length || 0);

  const openEditor = (type: EditModalType) => {
    if (!type) return;
    modalScrollYRef.current = 0;
    setActivePicker(null);
    setPickerSearch('');
    if (type === 'mobile') {
      setForm({ phone: contact?.phone || '' });
    } else if (type === 'email') {
      setForm({ email: contact?.email || '' });
    } else if (type === 'about') {
      setForm({ aboutMe: profile?.aboutMe || '' });
    } else if (type === 'basic') {
      const rawMarital = profile?.maritalStatus || 'Never Married';
      const normalizedMarital =
        rawMarital.toLowerCase() === 'single' ? 'Never Married' : rawMarital;
      setForm({
        fullName: displayName,
        gender: profile?.gender || '',
        dob: contact?.dob || '',
        heightCm: profile?.heightCm ? String(profile.heightCm) : '',
        maritalStatus: normalizedMarital,
        numberOfChildren: profile?.numberOfChildren || 'None',
        motherTongue: profile?.motherTongue || '',
        physicalStatus: profile?.physicalStatus || 'Normal',
      });
    } else if (type === 'professional') {
      setForm({
        qualification: profile?.education?.qualification || '',
        employmentType: profile?.career?.employmentType || '',
        profession: profile?.career?.profession || '',
        organization: profile?.career?.organization || '',
        incomeCurrency: incomeDetails?.currency || 'INR - India',
        incomeRange: incomeDetails?.annualIncomeRange || '',
      });
    } else if (type === 'location') {
      setForm({
        country: profile?.location?.country || '',
        state: profile?.location?.state || '',
        city: profile?.location?.village || profile?.location?.city || '',
        pincode: profile?.location?.pincode || '',
        citizenship: profile?.location?.citizenship || '',
      });
    } else if (type === 'religious') {
      setForm({
        religion: profile?.faithSummary?.religion || '',
        denomination: profile?.faithSummary?.denomination || '',
        division: profile?.faithSummary?.division || '',
        religiousValues: profile?.faithSummary?.religiousValues || '',
        baptized:
          profile?.faithSummary?.baptized === true
            ? 'Yes'
            : profile?.faithSummary?.baptized === false
            ? 'No'
            : '',
      });
      setOpenToAnyDivision(Boolean(profile?.faithSummary?.openToAnyDivision));
    } else if (type === 'habits') {
      setForm({
        eatingHabits: profile?.habits?.eatingHabits || 'Not Specified',
        smokingHabits: profile?.habits?.smokingHabits || 'Not Specified',
        drinkingHabits: profile?.habits?.drinkingHabits || 'Not Specified',
      });
    } else if (type === 'family') {
      setForm({
        familyType: profile?.familySummary?.familyType || '',
        familyValues: profile?.familySummary?.familyValues || '',
        familyStatus: profile?.familySummary?.familyStatus || '',
        fatherOccupation: familyDetails?.fatherOccupation || '',
        motherOccupation: familyDetails?.motherOccupation || '',
        familyOrigin: familyDetails?.familyOrigin || '',
        brothers: familyDetails?.brothers || 'None',
        sisters: familyDetails?.sisters || 'None',
        brothersMarried: familyDetails?.brothersMarried || 'None',
        sistersMarried: familyDetails?.sistersMarried || 'None',
      });
    } else if (type === 'aboutFamily') {
      setForm({ familyIntro: familyDetails?.familyIntro || '' });
    } else if (type === 'prefCompulsory') {
      setForm({
        ageImportance: preferences?.age?.importance || 'preferred',
        heightImportance: preferences?.height?.importance || 'flexible',
        educationImportance: preferences?.education?.importance || 'flexible',
      });
    } else if (type === 'prefAbout') {
      setForm({ partnerExpectations: preferences?.partnerExpectations || '' });
    } else if (type === 'prefBasic') {
      setForm({
        minAge: String(preferences?.age?.min ?? 20),
        maxAge: String(preferences?.age?.max ?? 35),
        minHeightCm: String(preferences?.height?.minCm ?? 150),
        maxHeightCm: String(preferences?.height?.maxCm ?? 190),
        haveChildren: preferences?.haveChildren || "Doesn't matter",
        physicalStatus: preferences?.physicalStatus || 'Normal',
        motherTongue: preferences?.motherTongue || 'Any',
      });
      setPrefMaritalStatuses(normalizePrefMaritalStatuses(preferences?.maritalStatuses));
    } else if (type === 'prefReligious') {
      setForm({
        denomination: preferences?.denomination || 'Any',
        division: preferences?.division || 'Any',
      });
    } else if (type === 'prefProfessional') {
      setForm({
        employedIn: preferences?.employedIn || 'Any',
        occupation: preferences?.occupation || 'Any',
        annualIncome: preferences?.annualIncome || 'Any',
      });
      setPrefAcceptableEducation(
        preferences?.education?.acceptable?.length ? preferences.education.acceptable : []
      );
    } else if (type === 'prefLocation') {
      setForm({
        preferredCountry: preferences?.locations?.preferredCountries?.[0] || 'Any',
        preferredState: preferences?.locations?.preferredStates?.[0] || 'Any',
        preferredCity: preferences?.locations?.preferredCities?.join(', ') || '',
      });
      setPrefOpenToRelocation(preferences?.locations?.openToRelocation !== false);
    } else if (type === 'prefHabits') {
      setForm({
        eatingHabits: preferences?.eatingHabits || "Doesn't matter",
        drinkingHabits: preferences?.drinkingHabits || "Doesn't matter",
        smokingHabits: preferences?.smokingHabits || "Doesn't matter",
      });
    }
    setActiveModal(type);
  };

  const closeModal = useCallback(() => {
    Keyboard.dismiss();
    setActivePicker(null);
    setPickerSearch('');
    setActiveModal(null);
  }, []);

  useEffect(() => {
    if (!activeModal) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activePicker) {
        setActivePicker(null);
      } else {
        closeModal();
      }
      return true;
    });
    return () => sub.remove();
  }, [activeModal, activePicker, closeModal]);

  const handleSaveModal = () => {
    if (!activeModal) return;

    if (activeModal === 'religious') {
      if (!form.religion) {
        Alert.alert('Required', 'Please select your religion.');
        return;
      }
      if (!form.denomination) {
        Alert.alert('Required', 'Please select your denomination.');
        return;
      }
    } else if (activeModal === 'location') {
      if (!form.country) {
        Alert.alert('Required', 'Please select your country.');
        return;
      }
      if (!form.state) {
        Alert.alert('Required', 'Please select your resident state.');
        return;
      }
    } else if (activeModal === 'basic') {
      if (!form.fullName?.trim()) {
        Alert.alert('Required', 'Please enter your full name.');
        return;
      }
    }

    const baseContact = (prev: StartRegistrationResponse) => ({
      fullName: prev.profile?.displayName || '',
      email: '',
      phone: '',
      ...(prev.contactInfo || {}),
    });
    const basePrefs = (prev: StartRegistrationResponse) => ({
      age: { min: 20, max: 35, importance: 'preferred' as const },
      height: { minCm: 150, maxCm: 190, importance: 'flexible' as const },
      maritalStatuses: [] as string[],
      education: { acceptable: [] as string[], importance: 'flexible' as const },
      occupationCategories: [] as string[],
      locations: { preferredCities: [] as string[], preferredStates: [] as string[], openToRelocation: true },
      ...(prev.preferences || {}),
    });

    let applyLocalUpdate: ((prev: StartRegistrationResponse) => StartRegistrationResponse) | null = null;
    let commitRemote: (() => Promise<any>) | null = null;

    if (activeModal === 'mobile') {
      const phone = form.phone?.trim() || '';
      applyLocalUpdate = (prev) => ({
        ...prev,
        contactInfo: { ...baseContact(prev), phone },
      });
      commitRemote = () => matrimonyApi.saveDraft('basic', { phone });
    } else if (activeModal === 'email') {
      const email = form.email?.trim() || '';
      applyLocalUpdate = (prev) => ({
        ...prev,
        contactInfo: { ...baseContact(prev), email },
      });
      commitRemote = () => matrimonyApi.saveDraft('basic', { email });
    } else if (activeModal === 'about') {
      const aboutMe = form.aboutMe?.trim() || '';
      applyLocalUpdate = (prev) => ({
        ...prev,
        profile: prev.profile ? { ...prev.profile, aboutMe } : prev.profile,
      });
      commitRemote = () => matrimonyApi.saveDraft('additional', { aboutMe });
    } else if (activeModal === 'basic') {
      const fullName = form.fullName?.trim() || '';
      const heightNum = Number(form.heightCm);
      const validHeight =
        Number.isFinite(heightNum) && heightNum >= 100 && heightNum <= 250 ? Math.round(heightNum) : undefined;
      const recomputedAge = computeAge(form.dob || '');
      const personalPayload = {
        gender: form.gender || undefined,
        dob: form.dob || undefined,
        heightCm: validHeight,
        maritalStatus: form.maritalStatus || undefined,
        numberOfChildren: form.numberOfChildren || undefined,
        motherTongue: form.motherTongue?.trim() ?? undefined,
        physicalStatus: form.physicalStatus || undefined,
      };
      applyLocalUpdate = (prev) => ({
        ...prev,
        contactInfo: {
          ...baseContact(prev),
          fullName,
          ...(form.dob ? { dob: form.dob } : {}),
        },
        profile: prev.profile
          ? {
              ...prev.profile,
              displayName: fullName,
              ...(form.gender ? { gender: form.gender } : {}),
              ...(recomputedAge !== null ? { age: recomputedAge } : {}),
              ...(validHeight !== undefined ? { heightCm: validHeight } : {}),
              ...(form.maritalStatus ? { maritalStatus: form.maritalStatus } : {}),
              ...(form.numberOfChildren ? { numberOfChildren: form.numberOfChildren } : {}),
              ...(form.motherTongue !== undefined ? { motherTongue: form.motherTongue.trim() } : {}),
              ...(form.physicalStatus ? { physicalStatus: form.physicalStatus } : {}),
            }
          : prev.profile,
      });
      commitRemote = () =>
        Promise.all([
          matrimonyApi.saveDraft('basic', { fullName }),
          matrimonyApi.saveDraft('personal', personalPayload),
        ]);
    } else if (activeModal === 'professional') {
      const qualification = form.qualification?.trim() || '';
      const employmentType = form.employmentType?.trim() || '';
      const profession = form.profession?.trim() || '';
      const organization = form.organization?.trim() || '';
      const incomeCurrency = form.incomeCurrency || 'INR - India';
      const incomeRange = form.incomeRange?.trim() || '';
      applyLocalUpdate = (prev) => ({
        ...prev,
        profile: prev.profile
          ? {
              ...prev.profile,
              education: { ...(prev.profile.education || {}), ...(qualification ? { qualification } : {}) },
              career: {
                ...(prev.profile.career || {}),
                employmentType,
                profession,
                organization,
              },
            }
          : prev.profile,
        incomeDetails: {
          ...(prev.incomeDetails || {}),
          currency: incomeCurrency,
          annualIncomeRange: incomeRange,
          visibility: 'private',
        },
      });
      commitRemote = () =>
        matrimonyApi.saveDraft('professional', {
          qualification,
          employmentType,
          profession,
          organization,
          incomeCurrency,
          incomeRange,
        });
    } else if (activeModal === 'location') {
      const country = form.country?.trim() || '';
      const state = form.state?.trim() || '';
      const village = form.city?.trim() || '';
      const pincode = form.pincode?.trim() || '';
      const citizenship = form.citizenship?.trim() || '';
      applyLocalUpdate = (prev) => ({
        ...prev,
        profile: prev.profile
          ? {
              ...prev.profile,
              location: {
                ...(prev.profile.location || {}),
                country: country || prev.profile.location?.country || '',
                state: state || prev.profile.location?.state || '',
                village,
                city: village,
                pincode,
                citizenship,
              },
            }
          : prev.profile,
      });
      commitRemote = () =>
        matrimonyApi.saveDraft('location', {
          country,
          state,
          village,
          pincode,
          citizenship,
        });
    } else if (activeModal === 'religious') {
      const religion = form.religion?.trim() || '';
      const denomination = form.denomination?.trim() || '';
      const division = form.division?.trim() || '';
      const religiousValues = form.religiousValues?.trim() || '';
      const baptizedVal =
        form.baptized === 'Yes' ? true : form.baptized === 'No' ? false : undefined;
      applyLocalUpdate = (prev) => ({
        ...prev,
        profile: prev.profile
          ? {
              ...prev.profile,
              faithSummary: {
                ...(prev.profile.faithSummary || {}),
                ...(religion ? { religion } : {}),
                ...(denomination ? { denomination } : {}),
                division,
                openToAnyDivision,
                religiousValues,
                ...(baptizedVal !== undefined ? { baptized: baptizedVal } : {}),
              },
            }
          : prev.profile,
      });
      commitRemote = () =>
        matrimonyApi.saveDraft('religious', {
          religion,
          denomination,
          division,
          openToAnyDivision,
          religiousValues,
          baptized: baptizedVal,
        });
    } else if (activeModal === 'habits') {
      const eatingHabits = form.eatingHabits || 'Not Specified';
      const smokingHabits = form.smokingHabits || 'Not Specified';
      const drinkingHabits = form.drinkingHabits || 'Not Specified';
      applyLocalUpdate = (prev) => ({
        ...prev,
        profile: prev.profile
          ? {
              ...prev.profile,
              habits: {
                ...(prev.profile.habits || {}),
                eatingHabits,
                smokingHabits,
                drinkingHabits,
              },
            }
          : prev.profile,
      });
      commitRemote = () =>
        matrimonyApi.saveDraft('additional', {
          eatingHabits,
          smokingHabits,
          drinkingHabits,
        });
    } else if (activeModal === 'family') {
      const familyType = form.familyType?.trim() || '';
      const familyValues = form.familyValues?.trim() || '';
      const familyStatus = form.familyStatus?.trim() || '';
      const fatherOccupation = form.fatherOccupation?.trim() || '';
      const motherOccupation = form.motherOccupation?.trim() || '';
      const familyOrigin = form.familyOrigin?.trim() || '';
      const brothers = form.brothers?.trim() || 'None';
      const sisters = form.sisters?.trim() || 'None';
      const brothersMarried = form.brothersMarried?.trim() || 'None';
      const sistersMarried = form.sistersMarried?.trim() || 'None';
      applyLocalUpdate = (prev) => ({
        ...prev,
        profile: prev.profile
          ? {
              ...prev.profile,
              familySummary: {
                ...(prev.profile.familySummary || {}),
                familyType,
                familyValues,
                familyStatus,
              },
            }
          : prev.profile,
        familyDetails: {
          ...(prev.familyDetails || {}),
          fatherOccupation,
          motherOccupation,
          familyOrigin,
          brothers,
          sisters,
          brothersMarried,
          sistersMarried,
        },
      });
      commitRemote = () =>
        matrimonyApi.saveDraft('additional', {
          familyType,
          familyValues,
          familyStatus,
          fatherOccupation,
          motherOccupation,
          familyOrigin,
          brothers,
          sisters,
          brothersMarried,
          sistersMarried,
        });
    } else if (activeModal === 'aboutFamily') {
      const familyIntro = form.familyIntro?.trim() || '';
      applyLocalUpdate = (prev) => ({
        ...prev,
        familyDetails: {
          ...(prev.familyDetails || {}),
          familyIntro,
        },
      });
      commitRemote = () => matrimonyApi.saveDraft('additional', { familyIntro });
    } else if (activeModal === 'prefCompulsory') {
      const ageImportance = (form.ageImportance || 'preferred') as 'essential' | 'preferred' | 'flexible';
      const heightImportance = (form.heightImportance || 'flexible') as 'essential' | 'preferred' | 'flexible';
      const educationImportance = (form.educationImportance || 'flexible') as 'essential' | 'preferred' | 'flexible';
      applyLocalUpdate = (prev) => {
        const prefs = basePrefs(prev);
        return {
          ...prev,
          preferences: {
            ...prefs,
            age: {
              min: prefs.age?.min ?? 20,
              max: prefs.age?.max ?? 35,
              importance: ageImportance,
            },
            height: {
              minCm: prefs.height?.minCm ?? 150,
              maxCm: prefs.height?.maxCm ?? 190,
              importance: heightImportance,
            },
            education: {
              acceptable: prefs.education?.acceptable || [],
              importance: educationImportance,
            },
          },
        };
      };
      commitRemote = () =>
        matrimonyApi.saveDraft('preferences', {
          ageImportance,
          heightImportance,
          educationImportance,
        });
    } else if (activeModal === 'prefAbout') {
      const partnerExpectations = form.partnerExpectations?.trim() || '';
      applyLocalUpdate = (prev) => ({
        ...prev,
        preferences: {
          ...basePrefs(prev),
          partnerExpectations,
        },
      });
      commitRemote = () => matrimonyApi.saveDraft('preferences', { partnerExpectations });
    } else if (activeModal === 'prefBasic') {
      const minA = Number(form.minAge) || 20;
      const maxA = Math.max(minA, Number(form.maxAge) || 35);
      const minH = Number(form.minHeightCm) || 150;
      const maxH = Math.max(minH, Number(form.maxHeightCm) || 190);
      const cleanMarital = normalizePrefMaritalStatuses(prefMaritalStatuses);
      const onlyNeverMarried = isOnlyNeverMarried(cleanMarital);
      const haveChildren = onlyNeverMarried ? 'No' : form.haveChildren || "Doesn't matter";
      const physicalStatus = form.physicalStatus || 'Normal';
      const motherTongue = form.motherTongue || 'Any';
      applyLocalUpdate = (prev) => {
        const prefs = basePrefs(prev);
        return {
          ...prev,
          preferences: {
            ...prefs,
            age: {
              ...(prefs.age || {}),
              min: minA,
              max: maxA,
              importance: prefs.age?.importance || 'preferred',
            },
            height: {
              ...(prefs.height || {}),
              minCm: minH,
              maxCm: maxH,
              importance: prefs.height?.importance || 'flexible',
            },
            haveChildren,
            maritalStatuses: cleanMarital,
            physicalStatus,
            motherTongue,
          },
        };
      };
      commitRemote = () =>
        matrimonyApi.saveDraft('preferences', {
          minAge: minA,
          maxAge: maxA,
          minHeightCm: minH,
          maxHeightCm: maxH,
          haveChildren,
          maritalStatuses: cleanMarital,
          physicalStatus,
          motherTongue,
        });
    } else if (activeModal === 'prefReligious') {
      const denomination = form.denomination || 'Any';
      const division = form.division || 'Any';
      applyLocalUpdate = (prev) => ({
        ...prev,
        preferences: {
          ...basePrefs(prev),
          denomination,
          division,
        },
      });
      commitRemote = () =>
        matrimonyApi.saveDraft('preferences', {
          denomination,
          division,
        });
    } else if (activeModal === 'prefProfessional') {
      const employedIn = form.employedIn || 'Any';
      const occupation = form.occupation || 'Any';
      const annualIncome = form.annualIncome || 'Any';
      applyLocalUpdate = (prev) => {
        const prefs = basePrefs(prev);
        return {
          ...prev,
          preferences: {
            ...prefs,
            education: {
              acceptable: prefAcceptableEducation,
              importance: prefs.education?.importance || 'flexible',
            },
            employedIn,
            occupation,
            annualIncome,
          },
        };
      };
      commitRemote = () =>
        matrimonyApi.saveDraft('preferences', {
          acceptableEducation: prefAcceptableEducation,
          employedIn,
          occupation,
          annualIncome,
        });
    } else if (activeModal === 'prefLocation') {
      const countries =
        form.preferredCountry && form.preferredCountry !== 'Any' ? [form.preferredCountry] : [];
      const states =
        form.preferredState && form.preferredState !== 'Any' ? [form.preferredState] : [];
      const cities = (form.preferredCity || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      applyLocalUpdate = (prev) => ({
        ...prev,
        preferences: {
          ...basePrefs(prev),
          locations: {
            preferredCountries: countries,
            preferredStates: states,
            preferredCities: cities,
            openToRelocation: prefOpenToRelocation,
          },
        },
      });
      commitRemote = () =>
        matrimonyApi.saveDraft('preferences', {
          preferredCountries: countries,
          preferredStates: states,
          preferredCities: cities,
          openToRelocation: prefOpenToRelocation,
        });
    } else if (activeModal === 'prefHabits') {
      const eatingHabits = form.eatingHabits || "Doesn't matter";
      const drinkingHabits = form.drinkingHabits || "Doesn't matter";
      const smokingHabits = form.smokingHabits || "Doesn't matter";
      applyLocalUpdate = (prev) => ({
        ...prev,
        preferences: {
          ...basePrefs(prev),
          eatingHabits,
          drinkingHabits,
          smokingHabits,
        },
      });
      commitRemote = () =>
        matrimonyApi.saveDraft('preferences', {
          eatingHabits,
          drinkingHabits,
          smokingHabits,
        });
    }

    const prevData = data;
    // Instant optimistic UI + cache update, smooth immediate modal dismiss
    if (applyLocalUpdate) {
      const updater = applyLocalUpdate;
      setData((prev) => (prev ? updater(prev) : prev));
      matrimonyApi.patchCachedRegistration(updater);
    }
    closeModal();

    if (commitRemote) {
      setSaving(true);
      commitRemote()
        .catch((err: any) => {
          if (prevData) {
            if (mountedRef.current) setData(prevData);
            matrimonyApi.patchCachedRegistration(() => prevData);
          }
          Alert.alert('Save Failed', err?.message || 'Unable to save changes.');
        })
        .finally(() => {
          if (mountedRef.current) {
            setSaving(false);
          }
        });
    }
  };

  const pickerConfig = useMemo((): {
    title: string;
    searchPlaceholder: string;
    searchable: boolean;
    multiSelect?: boolean;
    options: SidebarOptionItem[];
    selected: string;
    selectedList?: string[];
    onSelect: (val: string) => void;
  } | null => {
    const toItems = (arr: string[]): SidebarOptionItem[] => arr.map((label) => ({ label }));

    switch (activePicker) {
      case 'religion':
        return {
          title: 'Select religion',
          searchPlaceholder: 'Search religion',
          searchable: true,
          options: toItems(RELIGION_OPTIONS),
          selected: form.religion || '',
          onSelect: (val) => setForm((p) => ({ ...p, religion: val })),
        };
      case 'denomination':
        return {
          title: 'Select denomination',
          searchPlaceholder: 'Search denomination',
          searchable: true,
          options: toItems(DENOMINATION_OPTIONS),
          selected: form.denomination || '',
          onSelect: (val) => setForm((p) => ({ ...p, denomination: val })),
        };
      case 'division':
        return {
          title: 'Select division',
          searchPlaceholder: 'Search division',
          searchable: true,
          options: toItems(DIVISION_OPTIONS),
          selected: form.division || '',
          onSelect: (val) => setForm((p) => ({ ...p, division: val })),
        };
      case 'religiousValues':
        return {
          title: 'Select religious values',
          searchPlaceholder: '',
          searchable: false,
          options: toItems(RELIGIOUS_VALUES_OPTIONS),
          selected: form.religiousValues || '',
          onSelect: (val) => setForm((p) => ({ ...p, religiousValues: val })),
        };
      case 'country':
        return {
          title: 'Select country',
          searchPlaceholder: 'Search country',
          searchable: true,
          options: toItems(COUNTRY_OPTIONS),
          selected: form.country || '',
          onSelect: (val) =>
            setForm((p) => ({
              ...p,
              country: val,
              state: val !== p.country ? '' : p.state,
            })),
        };
      case 'state':
        return {
          title: 'Select resident state',
          searchPlaceholder: 'Search state',
          searchable: true,
          options: toItems(form.country === 'India' ? INDIA_STATES : GLOBAL_STATES),
          selected: form.state || '',
          onSelect: (val) => setForm((p) => ({ ...p, state: val })),
        };
      case 'citizenship':
        return {
          title: 'Select citizenship',
          searchPlaceholder: 'Search citizenship',
          searchable: true,
          options: toItems(CITIZENSHIP_OPTIONS),
          selected: form.citizenship || '',
          onSelect: (val) => setForm((p) => ({ ...p, citizenship: val })),
        };
      case 'height':
        return {
          title: 'Select height',
          searchPlaceholder: '',
          searchable: false,
          options: HEIGHT_OPTIONS.map((h) => ({ label: h.label })),
          selected: (() => {
            const cm = Number(form.heightCm);
            const found = HEIGHT_OPTIONS.find((h) => h.cm === cm);
            return found ? found.label : '';
          })(),
          onSelect: (val) => {
            const found = HEIGHT_OPTIONS.find((h) => h.label === val);
            if (found) {
              setForm((p) => ({ ...p, heightCm: String(found.cm) }));
            }
          },
        };
      case 'motherTongue':
        return {
          title: 'Select mother tongue',
          searchPlaceholder: 'Search mother tongue',
          searchable: true,
          options: toItems(MOTHER_TONGUE_OPTIONS),
          selected: form.motherTongue || '',
          onSelect: (val) => setForm((p) => ({ ...p, motherTongue: val })),
        };
      case 'education':
        return {
          title: 'Select education details',
          searchPlaceholder: 'Search education details',
          searchable: true,
          options: EDUCATION_OPTIONS,
          selected: form.qualification || '',
          onSelect: (val) => setForm((p) => ({ ...p, qualification: val })),
        };
      case 'employment':
        return {
          title: 'Select employment type',
          searchPlaceholder: '',
          searchable: false,
          options: EMPLOYMENT_TYPE_OPTIONS,
          selected: form.employmentType || '',
          onSelect: (val) => setForm((p) => ({ ...p, employmentType: val })),
        };
      case 'occupation':
        return {
          title: 'Select occupation',
          searchPlaceholder: 'Search occupation',
          searchable: true,
          options: OCCUPATION_OPTIONS,
          selected: form.profession || '',
          onSelect: (val) => setForm((p) => ({ ...p, profession: val })),
        };
      case 'currency':
        return {
          title: 'Select annual income currency',
          searchPlaceholder: 'Search currency',
          searchable: true,
          options: CURRENCY_OPTIONS,
          selected: form.incomeCurrency || '',
          onSelect: (val) =>
            setForm((p) => ({
              ...p,
              incomeCurrency: val,
              incomeRange: val !== p.incomeCurrency ? '' : p.incomeRange,
            })),
        };
      case 'income':
        return {
          title: 'Select annual income',
          searchPlaceholder: '',
          searchable: false,
          options: (form.incomeCurrency || 'INR').startsWith('INR')
            ? INCOME_OPTIONS_INR
            : INCOME_OPTIONS_GLOBAL,
          selected: form.incomeRange || '',
          onSelect: (val) => setForm((p) => ({ ...p, incomeRange: val })),
        };
      case 'familyValues':
        return {
          title: 'Select family values',
          searchPlaceholder: '',
          searchable: false,
          options: toItems(FAMILY_VALUES_OPTIONS),
          selected: form.familyValues || '',
          onSelect: (val) => setForm((p) => ({ ...p, familyValues: val })),
        };
      case 'prefMinAge':
        return {
          title: 'Minimum age',
          searchPlaceholder: '',
          searchable: false,
          options: toItems(AGE_OPTIONS),
          selected: form.minAge || '20',
          onSelect: (val) =>
            setForm((p) => ({
              ...p,
              minAge: val,
              maxAge: Number(p.maxAge || 35) < Number(val) ? val : p.maxAge,
            })),
        };
      case 'prefMaxAge': {
        const minA = Number(form.minAge || 18);
        return {
          title: 'Maximum age',
          searchPlaceholder: '',
          searchable: false,
          options: toItems(AGE_OPTIONS.filter((a) => Number(a) >= minA)),
          selected: form.maxAge || '35',
          onSelect: (val) => setForm((p) => ({ ...p, maxAge: val })),
        };
      }
      case 'prefMinHeight':
        return {
          title: 'Minimum height',
          searchPlaceholder: '',
          searchable: false,
          options: HEIGHT_OPTIONS.map((h) => ({ label: h.label })),
          selected: (() => {
            const cm = Number(form.minHeightCm);
            return HEIGHT_OPTIONS.find((h) => h.cm === cm)?.label || '';
          })(),
          onSelect: (val) => {
            const found = HEIGHT_OPTIONS.find((h) => h.label === val);
            if (found) {
              setForm((p) => ({
                ...p,
                minHeightCm: String(found.cm),
                maxHeightCm: Number(p.maxHeightCm || 195) < found.cm ? String(found.cm) : p.maxHeightCm,
              }));
            }
          },
        };
      case 'prefMaxHeight': {
        const minCm = Number(form.minHeightCm || 132);
        return {
          title: 'Maximum height',
          searchPlaceholder: '',
          searchable: false,
          options: HEIGHT_OPTIONS.filter((h) => h.cm >= minCm).map((h) => ({ label: h.label })),
          selected: (() => {
            const cm = Number(form.maxHeightCm);
            return HEIGHT_OPTIONS.find((h) => h.cm === cm)?.label || '';
          })(),
          onSelect: (val) => {
            const found = HEIGHT_OPTIONS.find((h) => h.label === val);
            if (found) setForm((p) => ({ ...p, maxHeightCm: String(found.cm) }));
          },
        };
      }
      case 'prefMotherTongue':
        return {
          title: 'Preferred mother tongue',
          searchPlaceholder: 'Search mother tongue',
          searchable: true,
          options: toItems(['Any', ...MOTHER_TONGUE_OPTIONS]),
          selected: form.motherTongue || 'Any',
          onSelect: (val) => setForm((p) => ({ ...p, motherTongue: val })),
        };
      case 'prefDenomination':
        return {
          title: 'Preferred denomination',
          searchPlaceholder: 'Search denomination',
          searchable: true,
          options: toItems(['Any', ...DENOMINATION_OPTIONS]),
          selected: form.denomination || 'Any',
          onSelect: (val) => setForm((p) => ({ ...p, denomination: val })),
        };
      case 'prefDivision':
        return {
          title: 'Preferred division',
          searchPlaceholder: 'Search division',
          searchable: true,
          options: toItems(['Any', ...DIVISION_OPTIONS]),
          selected: form.division || 'Any',
          onSelect: (val) => setForm((p) => ({ ...p, division: val })),
        };
      case 'prefEducation':
        return {
          title: 'Preferred education',
          searchPlaceholder: 'Search education',
          searchable: true,
          multiSelect: true,
          options: [{ label: 'Any' }, ...EDUCATION_OPTIONS],
          selected: prefAcceptableEducation.length === 0 ? 'Any' : '',
          selectedList: prefAcceptableEducation,
          onSelect: (val) => {
            if (val === 'Any') {
              setPrefAcceptableEducation([]);
              return;
            }
            setPrefAcceptableEducation((prev) =>
              prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
            );
          },
        };
      case 'prefEmployedIn':
        return {
          title: 'Preferred employment type',
          searchPlaceholder: '',
          searchable: false,
          options: [{ label: 'Any' }, ...EMPLOYMENT_TYPE_OPTIONS],
          selected: form.employedIn || 'Any',
          onSelect: (val) => setForm((p) => ({ ...p, employedIn: val })),
        };
      case 'prefOccupation':
        return {
          title: 'Preferred occupation',
          searchPlaceholder: 'Search occupation',
          searchable: true,
          options: [{ label: 'Any' }, ...OCCUPATION_OPTIONS],
          selected: form.occupation || 'Any',
          onSelect: (val) => setForm((p) => ({ ...p, occupation: val })),
        };
      case 'prefAnnualIncome':
        return {
          title: 'Preferred annual income',
          searchPlaceholder: '',
          searchable: false,
          options: [{ label: 'Any' }, ...INCOME_OPTIONS_INR, ...INCOME_OPTIONS_GLOBAL],
          selected: form.annualIncome || 'Any',
          onSelect: (val) => setForm((p) => ({ ...p, annualIncome: val })),
        };
      case 'prefCountry':
        return {
          title: 'Preferred country',
          searchPlaceholder: 'Search country',
          searchable: true,
          options: toItems(['Any', ...COUNTRY_OPTIONS]),
          selected: form.preferredCountry || 'Any',
          onSelect: (val) =>
            setForm((p) => ({
              ...p,
              preferredCountry: val,
              preferredState: val !== p.preferredCountry ? 'Any' : p.preferredState,
            })),
        };
      case 'prefState':
        return {
          title: 'Preferred state',
          searchPlaceholder: 'Search state',
          searchable: true,
          options: toItems([
            'Any',
            ...(form.preferredCountry === 'India' || form.preferredCountry === 'Any'
              ? INDIA_STATES
              : GLOBAL_STATES),
          ]),
          selected: form.preferredState || 'Any',
          onSelect: (val) => setForm((p) => ({ ...p, preferredState: val })),
        };
      default:
        return null;
    }
  }, [activePicker, form, prefAcceptableEducation]);

  const filteredPickerOptions = useMemo(() => {
    const list = pickerConfig?.options || [];
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => !item.isHeader && item.label.toLowerCase().includes(q));
  }, [pickerConfig, pickerSearch]);

  const openPicker = (key: PickerKey) => {
    setPickerSearch('');
    setActivePicker(key);
  };

  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [210, 270],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#E5E7EB';
  const surfaceBg = isDark ? colors.bg : '#FFFFFF';
  const cardBg = colors.surface;
  const mutedIcon = isDark ? '#94A3B8' : '#8E959E';
  const setupBorder = isDark ? '#475569' : '#94A3B8';

  const renderSectionHeader = (title: string, onEdit?: () => void) => (
    <View style={styles.sectionHeaderRow}>
      <Text style={[styles.sectionHeading, { color: colors.text, fontFamily, fontSize: scaleFont(19) }]}>
        {title}
      </Text>
      {onEdit ? (
        <TouchableOpacity
          onPress={onEdit}
          style={styles.pencilBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Pencil size={17} color={mutedIcon} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderKeyValue = (label: string, value?: string | null) => (
    <View style={styles.kvRow} key={label}>
      <Text style={[styles.kvLabel, { color: colors.textSecondary, fontFamily }]}>{label}</Text>
      <Text style={[styles.kvColon, { color: colors.textSecondary }]}>:</Text>
      <Text style={[styles.kvValue, { color: colors.text, fontFamily }]}>
        {value && value.trim() ? value : 'Not Specified'}
      </Text>
    </View>
  );

  const interestsList = [
    ...(profile?.interests?.hobbies || []),
    ...(profile?.interests?.music || []),
    ...(profile?.interests?.sports || []),
    ...(profile?.interests?.reading || []),
    ...(profile?.interests?.movies || []),
    ...(profile?.interests?.food || []),
    ...(profile?.interests?.languages || []),
  ];

  // Setup-style dropdown box matching MatrimonyReligiousDetailsScreen / LocationDetailsScreen / ProfessionalDetailsScreen
  const renderSetupDropdown = (
    label: string,
    value: string,
    placeholder: string,
    pickerKey: PickerKey,
    showChevron = true
  ) => (
    <View style={styles.setupSection}>
      {Boolean(label.trim()) && (
        <Text style={[styles.setupSectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(14.5) }]}>
          {label}
        </Text>
      )}
      <TouchableOpacity
        style={[styles.setupDropdownBtn, { backgroundColor: colors.surface, borderColor: setupBorder }]}
        onPress={() => openPicker(pickerKey)}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.setupDropdownText,
            {
              color: value ? colors.text : colors.textSecondary,
              fontFamily,
              fontSize: scaleFont(14),
            },
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        {showChevron ? <ChevronDown size={19} color={ORANGE} /> : null}
      </TouchableOpacity>
    </View>
  );

  // Setup-style glass pills matching MatrimonyPersonalDetailsScreen / AdditionalDetailsScreen
  const renderSetupPills = (
    label: string,
    fieldKey: string,
    options: string[],
    onSelectOverride?: (val: string) => void
  ) => (
    <View style={styles.setupSection}>
      {Boolean(label.trim()) && (
        <Text style={[styles.setupSectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(14.5) }]}>
          {label}
        </Text>
      )}
      <View style={styles.pillRow}>
        {options.map((opt) => {
          const isSelected = (form[fieldKey] || '') === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[
                styles.optionPill,
                {
                  backgroundColor: isSelected
                    ? isDark
                      ? 'rgba(234, 88, 12, 0.22)'
                      : 'rgba(234, 88, 12, 0.12)'
                    : colors.surface,
                  borderColor: isSelected ? ORANGE : ORANGE_BORDER,
                },
              ]}
              onPress={() =>
                onSelectOverride
                  ? onSelectOverride(opt)
                  : setForm((prev) => ({ ...prev, [fieldKey]: opt }))
              }
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.optionPillText,
                  {
                    color: isSelected ? (isDark ? '#FDBA74' : '#C2410C') : colors.text,
                    fontFamily,
                    fontSize: scaleFont(13.5),
                  },
                ]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderSiblingGroup = (
    totalLabel: string,
    totalKey: 'brothers' | 'sisters',
    marriedKey: 'brothersMarried' | 'sistersMarried',
    singularLabel: string,
    pluralLabel: string
  ) => {
    const totalVal = form[totalKey] || 'None';
    const marriedVal = form[marriedKey] || 'None';
    const marriedOpts = getMarriedOptions(totalVal);

    return (
      <>
        {renderSetupPills(totalLabel, totalKey, SIBLING_COUNT_OPTIONS, (val) => {
          const wasNone = totalVal === 'None';
          const max = SIBLING_RANK[val] ?? 0;
          setForm((prev) => {
            const curMarried = SIBLING_RANK[prev[marriedKey] || 'None'] ?? 0;
            return {
              ...prev,
              [totalKey]: val,
              [marriedKey]: max === 0 ? 'None' : curMarried > max ? val : prev[marriedKey],
            };
          });
          if (max > 0) {
            setTimeout(() => {
              if (totalKey === 'sisters') {
                modalScrollRef.current?.scrollToEnd({ animated: true });
              } else if (wasNone) {
                modalScrollRef.current?.scrollTo({
                  y: modalScrollYRef.current + 78,
                  animated: true,
                });
              }
            }, 90);
          }
        })}
        {totalVal === '1' ? (
          <View style={styles.setupSection}>
            <Text style={[styles.setupSectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(14.5) }]}>
              {singularLabel}
            </Text>
            <View style={styles.pillRow}>
              {[
                { label: 'No', stored: 'None' },
                { label: 'Yes', stored: '1' },
              ].map(({ label, stored }) => {
                const isSelected = marriedVal === stored;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[
                      styles.optionPill,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(234, 88, 12, 0.22)'
                            : 'rgba(234, 88, 12, 0.12)'
                          : colors.surface,
                        borderColor: isSelected ? ORANGE : ORANGE_BORDER,
                      },
                    ]}
                    onPress={() => setForm((prev) => ({ ...prev, [marriedKey]: stored }))}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.optionPillText,
                        {
                          color: isSelected ? (isDark ? '#FDBA74' : '#C2410C') : colors.text,
                          fontFamily,
                          fontSize: scaleFont(13.5),
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : marriedOpts.length > 0 ? (
          renderSetupPills(pluralLabel, marriedKey, marriedOpts)
        ) : null}
      </>
    );
  };

  const renderSetupInput = (
    label: string,
    fieldKey: string,
    options?: {
      placeholder?: string;
      multiline?: boolean;
      maxLength?: number;
      keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address' | 'number-pad';
    }
  ) => (
    <View style={styles.setupSection}>
      {Boolean(label.trim()) && (
        <Text style={[styles.setupSectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(14.5) }]}>
          {label}
        </Text>
      )}
      <TextInput
        style={[
          styles.setupInput,
          options?.multiline && styles.setupTextArea,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: setupBorder,
            fontFamily,
            fontSize: scaleFont(14),
          },
        ]}
        value={form[fieldKey] ?? ''}
        onChangeText={(val) => setForm((prev) => ({ ...prev, [fieldKey]: val }))}
        placeholder={options?.placeholder || `Enter ${label.toLowerCase()}`}
        placeholderTextColor={colors.textSecondary}
        multiline={options?.multiline}
        maxLength={options?.maxLength}
        textAlignVertical={options?.multiline ? 'top' : 'center'}
        keyboardType={options?.keyboardType || 'default'}
      />
      {options?.multiline && options?.maxLength ? (
        <Text style={[styles.charCount, { color: colors.textSecondary, fontFamily }]}>
          {(form[fieldKey] || '').length} / {options.maxLength}
        </Text>
      ) : null}
    </View>
  );

  const modalTitleMap: Record<Exclude<EditModalType, null>, string> = {
    mobile: 'Edit Mobile Number',
    email: 'Edit Email',
    about: 'A Few Lines About Myself',
    basic: 'Basic & Personal Details',
    professional: 'Professional Details',
    location: 'Location Details',
    religious: 'Religious Details',
    habits: 'Habits',
    family: 'Family Details',
    aboutFamily: 'About My Family',
    prefCompulsory: 'Compulsory Filters',
    prefAbout: 'A Few Lines About My Partner',
    prefBasic: 'Partner Basic Details',
    prefReligious: 'Religious Preference',
    prefProfessional: 'Professional Preference',
    prefLocation: 'Location Preference',
    prefHabits: 'Habits Preferences',
  };

  const editedAge = computeAge(form.dob || '');
  const selectedHeightLabel = (() => {
    const cm = Number(form.heightCm);
    if (!cm) return '';
    const match = HEIGHT_OPTIONS.find((h) => h.cm === cm);
    return match ? match.label : `${cm} cm`;
  })();

  return (
    <View style={[styles.container, { backgroundColor: surfaceBg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      {/* Persistent Light Orange Gradient Header above the hero image */}
      <View style={styles.stickyHeader}>
        <LinearGradient
          colors={
            isDark
              ? ['rgba(251, 146, 60, 0.28)', 'rgba(234, 88, 12, 0.16)', '#1E293B']
              : ['#FFE2CC', '#FFF0E5', '#FFF9F5']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.stickyHeaderGradient,
            {
              paddingTop: insets.top + 8,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? 'rgba(251, 146, 60, 0.35)' : '#FED7AA',
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.stickyBackBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#1E293B'} />
          </TouchableOpacity>
          <Text
            style={[styles.stickyName, { color: isDark ? '#FFFFFF' : '#1E293B', fontFamily }]}
            numberOfLines={1}
          >
            {inPartnerSection ? 'Partner Preferences' : 'Edit Profile'}
          </Text>
        </LinearGradient>
      </View>

      {loading && !data ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : (
        <Animated.ScrollView
          ref={mainScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 36, 48) }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
            listener: (e: any) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              const nextScrolled = y >= 230;
              if (nextScrolled !== isScrolledHeader) {
                setIsScrolledHeader(nextScrolled);
              }
              const threshold = (partnerPrefYRef.current ?? 99999) - 120;
              const nextInPartner = y >= threshold;
              if (nextInPartner !== inPartnerSection) {
                setInPartnerSection(nextInPartner);
              }
            },
          })}
        >
          {/* Hero Photo Banner */}
          <View style={styles.heroWrap}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={styles.heroPlaceholder}>
                <User size={74} color="#CBD5E1" />
                <Text style={styles.heroPlaceholderText}>No Profile Photo</Text>
              </View>
            )}

            <LinearGradient
              colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.52)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            <View style={styles.heroBottomRow}>
              <View style={styles.tierPill}>
                <Text style={styles.tierPillText}>
                  {data?.profile?.profileStatus === 'approved' ? 'ACTIVE' : 'PROFILE'}
                </Text>
              </View>

              <View style={styles.heroPhotoActions}>
                <TouchableOpacity
                  style={styles.heroPhotoBtn}
                  onPress={() => navigation.navigate('MatrimonyMyPhotos')}
                  activeOpacity={0.85}
                >
                  <ImagePlus size={18} color="#FFFFFF" />
                  <Text style={styles.heroPhotoText}>Add Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.heroCountBtn}
                  onPress={() => navigation.navigate('MatrimonyMyPhotos')}
                  activeOpacity={0.85}
                >
                  <ImageIcon size={16} color="#FFFFFF" />
                  <Text style={styles.heroPhotoText}>{totalPhotos}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Split Contact Quick-Edit Row */}
          <View style={[styles.contactBar, { borderBottomColor: dividerColor, backgroundColor: cardBg }]}>
            <TouchableOpacity
              style={styles.contactAction}
              onPress={() => openEditor('mobile')}
              activeOpacity={0.75}
            >
              <Phone size={18} color={GREEN} />
              <Text style={[styles.contactActionText, { color: colors.text, fontFamily }]}>
                EDIT MOBILE NUMBER
              </Text>
            </TouchableOpacity>

            <View style={[styles.contactDivider, { backgroundColor: dividerColor }]} />

            <TouchableOpacity
              style={styles.contactAction}
              onPress={() => openEditor('email')}
              activeOpacity={0.75}
            >
              <Mail size={18} color={GREEN} />
              <Text style={[styles.contactActionText, { color: colors.text, fontFamily }]}>
                EDIT MAIL
              </Text>
            </TouchableOpacity>
          </View>

          {/* Personal Information Sections (tap any section or pencil to open its setup popup) */}
          <View
            style={styles.bodyContent}
            onLayout={(e) => {
              bodyContentYRef.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.superHeading, { fontFamily, fontSize: scaleFont(19) }]}>
              Personal Information
            </Text>

            {/* A Few Lines About Myself */}
            <TouchableOpacity
              style={styles.sectionBlock}
              onPress={() => openEditor('about')}
              activeOpacity={0.8}
            >
              {renderSectionHeader('A Few Lines About Myself', () => openEditor('about'))}
              <Text style={[styles.paragraphText, { color: colors.text, fontFamily }]}>
                {profile?.aboutMe?.trim() || 'Not Specified'}
              </Text>
            </TouchableOpacity>

            {/* Basic Details */}
            <TouchableOpacity
              style={styles.sectionBlock}
              onPress={() => openEditor('basic')}
              activeOpacity={0.8}
            >
              {renderSectionHeader('Basic Details', () => openEditor('basic'))}
              {renderKeyValue('Name', displayName)}
              {renderKeyValue('Age', profile?.age ? `${profile.age} yrs` : 'Not Specified')}
              {renderKeyValue('Profile Created For', 'Self')}
              {renderKeyValue('Gender', profile?.gender)}
              {renderKeyValue('Height', formatHeightDisplay(profile?.heightCm))}
              {renderKeyValue('Marital Status', profile?.maritalStatus)}
              {renderKeyValue('Mother Tongue', profile?.motherTongue)}
              {renderKeyValue('Physical Status', profile?.physicalStatus || 'Normal')}
            </TouchableOpacity>

            {/* Professional Information */}
            <TouchableOpacity
              style={styles.sectionBlock}
              onPress={() => openEditor('professional')}
              activeOpacity={0.8}
            >
              {renderSectionHeader('Professional Information', () => openEditor('professional'))}
              {renderKeyValue('Education', profile?.education?.qualification)}
              {renderKeyValue('Employed in', profile?.career?.employmentType)}
              {renderKeyValue('Occupation', profile?.career?.profession)}
              {renderKeyValue('Organization', profile?.career?.organization)}
              {renderKeyValue('Annual Income', incomeDetails?.annualIncomeRange)}
            </TouchableOpacity>

            {/* Location */}
            <TouchableOpacity
              style={styles.sectionBlock}
              onPress={() => openEditor('location')}
              activeOpacity={0.8}
            >
              {renderSectionHeader('Location', () => openEditor('location'))}
              {renderKeyValue('Country', profile?.location?.country)}
              {renderKeyValue('State', profile?.location?.state)}
              {renderKeyValue('City', profile?.location?.village || profile?.location?.city)}
              {renderKeyValue('Citizenship', profile?.location?.citizenship || profile?.location?.country)}
            </TouchableOpacity>

            {/* Religious Information */}
            <TouchableOpacity
              style={styles.sectionBlock}
              onPress={() => openEditor('religious')}
              activeOpacity={0.8}
            >
              {renderSectionHeader('Religious Information', () => openEditor('religious'))}
              {renderKeyValue('Religion', profile?.faithSummary?.religion || 'Christian')}
              {renderKeyValue(
                'Baptized',
                profile?.faithSummary?.baptized === true
                  ? 'Yes'
                  : profile?.faithSummary?.baptized === false
                  ? 'No'
                  : 'Not Specified'
              )}
              {renderKeyValue('Religious Values', profile?.faithSummary?.religiousValues)}
              {renderKeyValue('Denomination', profile?.faithSummary?.denomination)}
              {renderKeyValue('Division', profile?.faithSummary?.division)}
            </TouchableOpacity>

            {/* Hobbies & Interests */}
            <TouchableOpacity
              style={styles.sectionBlock}
              onPress={() =>
                navigation.navigate('MatrimonyInterests', {
                  fromEditProfile: true,
                  initialInterests: profile?.interests || {},
                })
              }
              activeOpacity={0.8}
            >
              {renderSectionHeader('Hobbies & Interests', () =>
                navigation.navigate('MatrimonyInterests', {
                  fromEditProfile: true,
                  initialInterests: profile?.interests || {},
                })
              )}
              {interestsList.length > 0 ? (
                <Text style={[styles.paragraphText, { color: colors.text, fontFamily }]}>
                  {interestsList.join(', ')}
                </Text>
              ) : (
                <Text style={[styles.paragraphText, { color: colors.textSecondary, fontFamily }]}>
                  Not Specified
                </Text>
              )}
            </TouchableOpacity>

            {/* Habits */}
            <TouchableOpacity
              style={styles.sectionBlock}
              onPress={() => openEditor('habits')}
              activeOpacity={0.8}
            >
              {renderSectionHeader('Habits', () => openEditor('habits'))}
              {renderKeyValue('Eating Habits', profile?.habits?.eatingHabits)}
              {renderKeyValue('Smoking Habits', profile?.habits?.smokingHabits)}
              {renderKeyValue('Drinking Habits', profile?.habits?.drinkingHabits)}
            </TouchableOpacity>

            {/* Trust Badge */}
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeading, { color: colors.text, fontFamily, fontSize: scaleFont(19) }]}>
                  Trust Badge
                </Text>
                <View style={styles.trustCircle}>
                  <Check size={15} color="#0284C7" strokeWidth={2.5} />
                </View>
              </View>
              <View style={styles.trustRow}>
                <Check size={16} color={GREEN} strokeWidth={2.6} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.trustTitle, { color: colors.text, fontFamily }]}>
                    Contact Verification
                  </Text>
                  <Text style={[styles.trustSub, { color: colors.textSecondary, fontFamily }]}>
                    {contact?.phone ? 'Mobile number verified' : 'Mobile number pending'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.paragraphText, { color: colors.text, fontFamily, marginTop: 8 }]}>
                We have verified the mobile number provided by the member.
              </Text>
            </View>

            {/* Family Details */}
            <TouchableOpacity
              style={styles.sectionBlock}
              onPress={() => openEditor('family')}
              activeOpacity={0.8}
            >
              {renderSectionHeader('Family Details', () => openEditor('family'))}
              {renderKeyValue('Family Type', profile?.familySummary?.familyType)}
              {renderKeyValue('Family Values', profile?.familySummary?.familyValues)}
              {renderKeyValue('Family Status', profile?.familySummary?.familyStatus)}
              {renderKeyValue("Father's Occupation", familyDetails?.fatherOccupation)}
              {renderKeyValue("Mother's Occupation", familyDetails?.motherOccupation)}
              {renderKeyValue('Family Origin', familyDetails?.familyOrigin)}
              {renderKeyValue('No. of Brothers', familyDetails?.brothers || 'None')}
              {renderKeyValue('No. of Sisters', familyDetails?.sisters || 'None')}
              {renderKeyValue(
                familyDetails?.brothers === '1' ? 'Brother Married' : 'Brothers Married',
                familyDetails?.brothers === '1'
                  ? familyDetails?.brothersMarried === '1'
                    ? 'Yes'
                    : 'No'
                  : familyDetails?.brothersMarried || 'None'
              )}
              {renderKeyValue(
                familyDetails?.sisters === '1' ? 'Sister Married' : 'Sisters Married',
                familyDetails?.sisters === '1'
                  ? familyDetails?.sistersMarried === '1'
                    ? 'Yes'
                    : 'No'
                  : familyDetails?.sistersMarried || 'None'
              )}
            </TouchableOpacity>

            {/* About my family */}
            <TouchableOpacity
              style={styles.sectionBlock}
              onPress={() => openEditor('aboutFamily')}
              activeOpacity={0.8}
            >
              {renderSectionHeader('About my family', () => openEditor('aboutFamily'))}
              <Text style={[styles.paragraphText, { color: colors.text, fontFamily }]}>
                {familyDetails?.familyIntro?.trim() || 'Not Specified'}
              </Text>
            </TouchableOpacity>

            {/* Partner Preference Section */}
            <View
              style={styles.partnerSectionWrap}
              onLayout={(e) => {
                partnerPrefYRef.current = bodyContentYRef.current + e.nativeEvent.layout.y;
                scrollToPartnerPreference();
              }}
            >
              <View style={[styles.partnerDivider, { backgroundColor: dividerColor }]} />

              <View style={styles.partnerHeaderRow}>
                <Text style={[styles.superHeading, { fontFamily, fontSize: scaleFont(19) }]}>
                  Partner Preference
                </Text>
                <TouchableOpacity
                  style={styles.compulsoryBtn}
                  onPress={() => openEditor('prefCompulsory')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.compulsoryBtnText, { fontFamily }]}>
                    Compulsory Filters
                  </Text>
                </TouchableOpacity>
              </View>

              {/* A Few Lines About My Partner */}
              <TouchableOpacity
                style={styles.sectionBlock}
                onPress={() => openEditor('prefAbout')}
                activeOpacity={0.8}
              >
                {renderSectionHeader('A Few Lines About My Partner', () => openEditor('prefAbout'))}
                <Text style={[styles.paragraphText, { color: colors.text, fontFamily }]}>
                  {preferences?.partnerExpectations?.trim() || 'Not Specified'}
                </Text>
              </TouchableOpacity>

              {/* Partner Basic Details */}
              <TouchableOpacity
                style={styles.sectionBlock}
                onPress={() => openEditor('prefBasic')}
                activeOpacity={0.8}
              >
                {renderSectionHeader('Basic Details', () => openEditor('prefBasic'))}
                {renderKeyValue(
                  'Age',
                  `${preferences?.age?.min ?? 20} - ${preferences?.age?.max ?? 35} Yrs`
                )}
                {renderKeyValue(
                  'Height',
                  `${formatShortHeight(preferences?.height?.minCm ?? 150)} - ${formatShortHeight(
                    preferences?.height?.maxCm ?? 190
                  )}`
                )}
                {renderKeyValue(
                  'Marital Status',
                  (() => {
                    const norm = normalizePrefMaritalStatuses(preferences?.maritalStatuses);
                    return norm.length ? norm.join(', ') : "Doesn't matter";
                  })()
                )}
                {!isOnlyNeverMarried(preferences?.maritalStatuses)
                  ? renderKeyValue('Have Children', preferences?.haveChildren || "Doesn't matter")
                  : null}
                {renderKeyValue('Physical Status', preferences?.physicalStatus || 'Normal')}
                {renderKeyValue('Mother Tongue', preferences?.motherTongue || 'Any')}
              </TouchableOpacity>

              {/* Religious Preference */}
              <TouchableOpacity
                style={styles.sectionBlock}
                onPress={() => openEditor('prefReligious')}
                activeOpacity={0.8}
              >
                {renderSectionHeader('Religious Preference', () => openEditor('prefReligious'))}
                {renderKeyValue('Denomination', preferences?.denomination || 'Any')}
                {renderKeyValue('Division', preferences?.division || 'Any')}
              </TouchableOpacity>

              {/* Professional Preference */}
              <TouchableOpacity
                style={styles.sectionBlock}
                onPress={() => openEditor('prefProfessional')}
                activeOpacity={0.8}
              >
                {renderSectionHeader('Professional Preference', () => openEditor('prefProfessional'))}
                <View style={styles.kvRow}>
                  <Text style={[styles.kvLabel, { color: colors.textSecondary, fontFamily }]}>
                    Education
                  </Text>
                  <Text style={[styles.kvColon, { color: colors.textSecondary }]}>:</Text>
                  <View style={{ flex: 1 }}>
                    {(() => {
                      const eduList = preferences?.education?.acceptable || [];
                      const eduText = eduList.length ? eduList.join(', ') : 'Any';
                      const isLong = eduText.length > 56;
                      return (
                        <>
                          <Text
                            style={[styles.kvValue, { color: colors.text, fontFamily }]}
                            numberOfLines={!expandPrefEdu && isLong ? 2 : undefined}
                          >
                            {eduText}
                          </Text>
                          {isLong ? (
                            <TouchableOpacity
                              onPress={() => setExpandPrefEdu((prev) => !prev)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Text style={styles.moreLink}>
                                {expandPrefEdu ? 'less' : 'more'}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                </View>
                {renderKeyValue('Employed In', preferences?.employedIn || 'Any')}
                {renderKeyValue('Occupation', preferences?.occupation || 'Any')}
                {renderKeyValue('Annual Income', preferences?.annualIncome || 'Any')}
              </TouchableOpacity>

              {/* Location Preference */}
              <TouchableOpacity
                style={styles.sectionBlock}
                onPress={() => openEditor('prefLocation')}
                activeOpacity={0.8}
              >
                {renderSectionHeader('Location Preference', () => openEditor('prefLocation'))}
                {renderKeyValue(
                  'Country',
                  preferences?.locations?.preferredCountries?.length
                    ? preferences.locations.preferredCountries.join(', ')
                    : 'Any'
                )}
                {preferences?.locations?.preferredStates?.length
                  ? renderKeyValue('State', preferences.locations.preferredStates.join(', '))
                  : null}
                {preferences?.locations?.preferredCities?.length
                  ? renderKeyValue('City', preferences.locations.preferredCities.join(', '))
                  : null}
              </TouchableOpacity>

              {/* Habits Preferences */}
              <TouchableOpacity
                style={styles.sectionBlock}
                onPress={() => openEditor('prefHabits')}
                activeOpacity={0.8}
              >
                {renderSectionHeader('Habits Preferences', () => openEditor('prefHabits'))}
                {renderKeyValue('Eating Habits', preferences?.eatingHabits || "Doesn't matter")}
                {renderKeyValue('Drinking Habits', preferences?.drinkingHabits || "Doesn't matter")}
                {renderKeyValue('Smoking Habits', preferences?.smokingHabits || "Doesn't matter")}
              </TouchableOpacity>
            </View>

            <View style={{ paddingTop: 10 }}>
              <TouchableOpacity
                style={styles.saveBtn}
                activeOpacity={0.9}
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.navigate('MatrimonyStatus');
                  }
                }}
              >
                <Text style={[styles.saveBtnText, { fontFamily }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.ScrollView>
      )}

      {/* Section-Specific Initial-Setup-Style Popup (smooth native keyboard-synced sheet) */}
      {Boolean(activeModal) && (
        <Reanimated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={styles.modalBackdropOverlay}
        >
          <Pressable
            style={styles.modalDismissArea}
            onPress={closeModal}
          />

          <Reanimated.View style={modalKeyboardLiftStyle}>
            <Reanimated.View
              entering={SlideInDown.duration(220)}
              exiting={SlideOutDown.duration(170)}
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.bg,
                  paddingBottom: closedModalPad,
                },
              ]}
            >
            {pickerConfig ? (
              /* Searchable Setup Dropdown Picker inside the same popup */
              <>
                <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.modalTitle, { color: colors.text, fontFamily }]}>
                    {pickerConfig.title}
                  </Text>
                  <TouchableOpacity onPress={() => setActivePicker(null)}>
                    <X size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {pickerConfig.searchable && (
                  <View
                    style={[
                      styles.searchBar,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Search size={17} color={colors.textSecondary} />
                    <TextInput
                      style={[styles.searchInput, { color: colors.text, fontFamily }]}
                      placeholder={pickerConfig.searchPlaceholder}
                      placeholderTextColor={colors.textSecondary}
                      value={pickerSearch}
                      onChangeText={setPickerSearch}
                      autoFocus
                    />
                    {Boolean(pickerSearch) && (
                      <TouchableOpacity onPress={() => setPickerSearch('')}>
                        <X size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                <FlatList
                  data={filteredPickerOptions}
                  keyExtractor={(item, idx) => `${item.label}-${idx}`}
                  style={styles.pickerList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    if (item.isHeader) {
                      return (
                        <Text
                          style={[
                            styles.groupHeaderText,
                            { color: colors.textSecondary, fontFamily },
                          ]}
                        >
                          {item.label}
                        </Text>
                      );
                    }
                    const isSelected = pickerConfig.multiSelect
                      ? item.label === 'Any'
                        ? (pickerConfig.selectedList?.length ?? 0) === 0
                        : Boolean(pickerConfig.selectedList?.includes(item.label))
                      : item.label === pickerConfig.selected;
                    return (
                      <TouchableOpacity
                        style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                        onPress={() => {
                          pickerConfig.onSelect(item.label);
                          if (!pickerConfig.multiSelect) {
                            setActivePicker(null);
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerRowText,
                            {
                              color: isSelected ? ORANGE : colors.text,
                              fontWeight: isSelected ? '800' : '500',
                              fontFamily,
                            },
                          ]}
                        >
                          {item.label}
                        </Text>
                        {pickerConfig.multiSelect ? (
                          <View
                            style={[
                              styles.checkboxBox,
                              {
                                borderColor: isSelected ? ORANGE : setupBorder,
                                backgroundColor: isSelected ? ORANGE : 'transparent',
                              },
                            ]}
                          >
                            {isSelected ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.radioCircle,
                              { borderColor: isSelected ? ORANGE : setupBorder },
                            ]}
                          >
                            {isSelected ? <View style={styles.radioDot} /> : null}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
                {pickerConfig.multiSelect ? (
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={() => setActivePicker(null)}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.saveBtnText, { fontFamily }]}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              /* Only the clicked section's setup fields */
              <>
                <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.modalTitle, { color: colors.text, fontFamily }]}>
                    {activeModal ? modalTitleMap[activeModal] : ''}
                  </Text>
                  <TouchableOpacity onPress={closeModal}>
                    <X size={21} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  ref={modalScrollRef}
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onScroll={(e) => {
                    modalScrollYRef.current = e.nativeEvent.contentOffset.y;
                  }}
                >
                  {activeModal === 'mobile' &&
                    renderSetupInput('Phone Number', 'phone', {
                      keyboardType: 'phone-pad',
                      placeholder: 'Enter your mobile number',
                    })}

                  {activeModal === 'email' &&
                    renderSetupInput('Email Address', 'email', {
                      keyboardType: 'email-address',
                      placeholder: 'Enter your email address',
                    })}

                  {activeModal === 'about' &&
                    renderSetupInput('A few words about myself', 'aboutMe', {
                      multiline: true,
                      maxLength: 1000,
                      placeholder:
                        'Write a few words about your faith, family values, hobbies, and expectations...',
                    })}

                  {activeModal === 'basic' && (
                    <>
                      {renderSetupInput('Full Name *', 'fullName', {
                        placeholder: 'Enter your full name',
                      })}
                      {renderSetupPills('Gender', 'gender', GENDER_OPTIONS)}

                      <View style={styles.setupSection}>
                        <Text
                          style={[
                            styles.setupSectionTitle,
                            { color: colors.text, fontFamily, fontSize: scaleFont(14.5) },
                          ]}
                        >
                          Date of birth
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.setupDropdownBtn,
                            { backgroundColor: colors.surface, borderColor: setupBorder },
                          ]}
                          onPress={() => setDatePickerVisible(true)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.setupDropdownText,
                              {
                                color: form.dob ? colors.text : colors.textSecondary,
                                fontFamily,
                                fontSize: scaleFont(14),
                              },
                            ]}
                          >
                            {form.dob || 'Select date of birth'}
                          </Text>
                          <Calendar size={19} color={ORANGE} />
                        </TouchableOpacity>
                        {editedAge !== null && (
                          <LinearGradient
                            colors={
                              isDark
                                ? ['rgba(234, 88, 12, 0.24)', 'rgba(234, 88, 12, 0.02)']
                                : ['rgba(234, 88, 12, 0.14)', 'rgba(255, 255, 255, 0.0)']
                            }
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={[
                              styles.ageBanner,
                              { borderColor: isDark ? 'rgba(234,88,12,0.35)' : '#FED7AA' },
                            ]}
                          >
                            <Text style={[styles.ageText, { color: colors.text, fontFamily }]}>
                              You are <Text style={{ fontWeight: '800' }}>{editedAge} years</Text> old
                            </Text>
                          </LinearGradient>
                        )}
                      </View>

                      {renderSetupDropdown(
                        'Height',
                        selectedHeightLabel,
                        'Select your height',
                        'height'
                      )}
                      {renderSetupPills(
                        'Your physical status',
                        'physicalStatus',
                        PHYSICAL_STATUS_OPTIONS
                      )}
                      {renderSetupPills('Marital status', 'maritalStatus', MARITAL_STATUS_OPTIONS)}
                      {['Widowed', 'Divorced', 'Awaiting Divorce'].includes(
                        form.maritalStatus || ''
                      ) &&
                        renderSetupPills(
                          'Number of children',
                          'numberOfChildren',
                          CHILDREN_OPTIONS
                        )}
                      {renderSetupDropdown(
                        'Mother Tongue',
                        form.motherTongue || '',
                        'Select mother tongue',
                        'motherTongue'
                      )}
                    </>
                  )}

                  {activeModal === 'religious' && (
                    <>
                      {renderSetupPills('Have you baptized?', 'baptized', ['Yes', 'No'])}
                      {renderSetupDropdown(
                        'Religion',
                        form.religion || '',
                        'Select religion',
                        'religion'
                      )}
                      {renderSetupDropdown(
                        'Denomination',
                        form.denomination || '',
                        'Select denomination',
                        'denomination'
                      )}
                      {renderSetupDropdown(
                        'Division',
                        form.division || '',
                        'Select division',
                        'division'
                      )}
                      <TouchableOpacity
                        style={styles.checkboxRow}
                        onPress={() => setOpenToAnyDivision((prev) => !prev)}
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            styles.checkboxBox,
                            {
                              borderColor: openToAnyDivision ? ORANGE : setupBorder,
                              backgroundColor: openToAnyDivision ? ORANGE : 'transparent',
                            },
                          ]}
                        >
                          {openToAnyDivision && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                        </View>
                        <Text style={[styles.checkboxLabel, { color: colors.text, fontFamily }]}>
                          Open to marry from any division
                        </Text>
                      </TouchableOpacity>
                      {renderSetupDropdown(
                        'Religious Values',
                        form.religiousValues || '',
                        'Select religious values',
                        'religiousValues'
                      )}
                    </>
                  )}

                  {activeModal === 'location' && (
                    <>
                      {renderSetupDropdown(
                        'Country',
                        form.country || '',
                        'Select country',
                        'country'
                      )}
                      {renderSetupDropdown(
                        'Resident state',
                        form.state || '',
                        'Select resident state',
                        'state'
                      )}
                      {renderSetupInput('Village / City', 'city', {
                        placeholder: 'Enter village or city',
                      })}
                      {renderSetupInput('Pin Code', 'pincode', {
                        keyboardType: 'number-pad',
                        maxLength: 10,
                        placeholder: 'Enter pin code',
                      })}
                      {renderSetupDropdown(
                        'Citizenship',
                        form.citizenship || '',
                        'Select citizenship',
                        'citizenship'
                      )}
                    </>
                  )}

                  {activeModal === 'professional' && (
                    <>
                      {renderSetupDropdown(
                        'Your education details',
                        form.qualification || '',
                        'Select your education details',
                        'education'
                      )}
                      {renderSetupDropdown(
                        'Your employment type',
                        form.employmentType || '',
                        'Select your employment type',
                        'employment'
                      )}
                      {renderSetupDropdown(
                        'Your occupation',
                        form.profession || '',
                        'Select your occupation',
                        'occupation'
                      )}
                      {renderSetupInput('Organization where you work (Optional)', 'organization', {
                        placeholder: 'Enter organization name',
                      })}
                      {renderSetupDropdown(
                        'Annual income currency',
                        form.incomeCurrency || '',
                        'Select currency',
                        'currency'
                      )}
                      {renderSetupDropdown(
                        'Annual income',
                        form.incomeRange || '',
                        'Select your annual income',
                        'income'
                      )}
                    </>
                  )}

                  {activeModal === 'habits' && (
                    <>
                      {renderSetupPills('Eating Habits', 'eatingHabits', EATING_HABITS_OPTIONS)}
                      {renderSetupPills('Smoking Habits', 'smokingHabits', SMOKING_DRINKING_OPTIONS)}
                      {renderSetupPills(
                        'Drinking Habits',
                        'drinkingHabits',
                        SMOKING_DRINKING_OPTIONS
                      )}
                    </>
                  )}

                  {activeModal === 'family' && (
                    <>
                      {renderSetupPills('Family Type', 'familyType', FAMILY_TYPE_OPTIONS)}
                      {renderSetupDropdown(
                        'Family Values',
                        form.familyValues || '',
                        'Select family values',
                        'familyValues',
                        false
                      )}
                      {renderSetupPills('Select family status', 'familyStatus', FAMILY_STATUS_OPTIONS)}
                      {renderSetupInput("Father's Occupation", 'fatherOccupation')}
                      {renderSetupInput("Mother's Occupation", 'motherOccupation')}
                      {renderSetupInput('Family Origin', 'familyOrigin')}
                      {renderSiblingGroup(
                        'No. of Brothers',
                        'brothers',
                        'brothersMarried',
                        'Brother Married?',
                        'Brothers Married'
                      )}
                      {renderSiblingGroup(
                        'No. of Sisters',
                        'sisters',
                        'sistersMarried',
                        'Sister Married?',
                        'Sisters Married'
                      )}
                    </>
                  )}

                  {activeModal === 'aboutFamily' &&
                    renderSetupInput('', 'familyIntro', {
                      multiline: true,
                      maxLength: 600,
                      placeholder: 'Write a few words about your family background and values...',
                    })}

                  {activeModal === 'prefCompulsory' && (
                    <>
                      {[
                        { label: 'Age Range Filter', key: 'ageImportance' },
                        { label: 'Height Range Filter', key: 'heightImportance' },
                        { label: 'Education Filter', key: 'educationImportance' },
                      ].map(({ label, key }) => (
                        <View key={key} style={styles.setupSection}>
                          <Text
                            style={[
                              styles.setupSectionTitle,
                              { color: colors.text, fontFamily, fontSize: scaleFont(14.5) },
                            ]}
                          >
                            {label}
                          </Text>
                          <View style={styles.pillRow}>
                            {IMPORTANCE_OPTIONS.map((opt) => {
                              const isSelected = (form[key] || 'flexible') === opt.value;
                              return (
                                <TouchableOpacity
                                  key={opt.value}
                                  style={[
                                    styles.optionPill,
                                    {
                                      backgroundColor: isSelected
                                        ? isDark
                                          ? 'rgba(234, 88, 12, 0.22)'
                                          : 'rgba(234, 88, 12, 0.12)'
                                        : colors.surface,
                                      borderColor: isSelected ? ORANGE : ORANGE_BORDER,
                                    },
                                  ]}
                                  onPress={() => setForm((prev) => ({ ...prev, [key]: opt.value }))}
                                  activeOpacity={0.85}
                                >
                                  <Text
                                    style={[
                                      styles.optionPillText,
                                      {
                                        color: isSelected
                                          ? isDark
                                            ? '#FDBA74'
                                            : '#C2410C'
                                          : colors.text,
                                        fontFamily,
                                        fontSize: scaleFont(13),
                                      },
                                    ]}
                                  >
                                    {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {activeModal === 'prefAbout' &&
                    renderSetupInput('', 'partnerExpectations', {
                      multiline: true,
                      maxLength: 600,
                      placeholder:
                        'Write a few lines about the values, character, and lifestyle you look for in a partner...',
                    })}

                  {activeModal === 'prefBasic' && (
                    <>
                      <View style={styles.setupSection}>
                        <Text
                          style={[
                            styles.setupSectionTitle,
                            { color: colors.text, fontFamily, fontSize: scaleFont(14.5) },
                          ]}
                        >
                          Marital Status
                        </Text>
                        <View style={styles.pillRow}>
                          {PREF_MARITAL_OPTIONS.map((opt) => {
                            const isAny = opt === "Doesn't matter";
                            const isSelected = isAny
                              ? prefMaritalStatuses.length === 0
                              : prefMaritalStatuses.includes(opt);
                            return (
                              <TouchableOpacity
                                key={opt}
                                style={[
                                  styles.optionPill,
                                  {
                                    backgroundColor: isSelected
                                      ? isDark
                                        ? 'rgba(234, 88, 12, 0.22)'
                                        : 'rgba(234, 88, 12, 0.12)'
                                      : colors.surface,
                                    borderColor: isSelected ? ORANGE : ORANGE_BORDER,
                                  },
                                ]}
                                onPress={() => {
                                  if (isAny) {
                                    setPrefMaritalStatuses([]);
                                  } else {
                                    setPrefMaritalStatuses((prev) =>
                                      prev.includes(opt)
                                        ? prev.filter((x) => x !== opt)
                                        : [...prev, opt]
                                    );
                                  }
                                }}
                                activeOpacity={0.85}
                              >
                                <Text
                                  style={[
                                    styles.optionPillText,
                                    {
                                      color: isSelected
                                        ? isDark
                                          ? '#FDBA74'
                                          : '#C2410C'
                                        : colors.text,
                                      fontFamily,
                                      fontSize: scaleFont(13.5),
                                    },
                                  ]}
                                >
                                  {opt}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {!isOnlyNeverMarried(prefMaritalStatuses)
                        ? renderSetupPills('Have Children', 'haveChildren', PREF_CHILDREN_OPTIONS)
                        : null}

                      <View style={styles.prefRangeRow}>
                        <View style={{ flex: 1 }}>
                          {renderSetupDropdown(
                            'Min Age',
                            form.minAge ? `${form.minAge} Yrs` : '',
                            'Min age',
                            'prefMinAge'
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          {renderSetupDropdown(
                            'Max Age',
                            form.maxAge ? `${form.maxAge} Yrs` : '',
                            'Max age',
                            'prefMaxAge'
                          )}
                        </View>
                      </View>

                      <View style={styles.prefRangeRow}>
                        <View style={{ flex: 1 }}>
                          {renderSetupDropdown(
                            'Min Height',
                            form.minHeightCm ? formatShortHeight(Number(form.minHeightCm)) : '',
                            'Min height',
                            'prefMinHeight'
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          {renderSetupDropdown(
                            'Max Height',
                            form.maxHeightCm ? formatShortHeight(Number(form.maxHeightCm)) : '',
                            'Max height',
                            'prefMaxHeight'
                          )}
                        </View>
                      </View>

                      {renderSetupPills('Physical Status', 'physicalStatus', PREF_PHYSICAL_OPTIONS)}
                      {renderSetupDropdown(
                        'Mother Tongue',
                        form.motherTongue || 'Any',
                        'Select mother tongue',
                        'prefMotherTongue'
                      )}
                    </>
                  )}

                  {activeModal === 'prefReligious' && (
                    <>
                      {renderSetupDropdown(
                        'Denomination',
                        form.denomination || 'Any',
                        'Select denomination',
                        'prefDenomination'
                      )}
                      {renderSetupDropdown(
                        'Division',
                        form.division || 'Any',
                        'Select division',
                        'prefDivision'
                      )}
                    </>
                  )}

                  {activeModal === 'prefProfessional' && (
                    <>
                      {renderSetupDropdown(
                        'Education',
                        prefAcceptableEducation.length > 0
                          ? prefAcceptableEducation.join(', ')
                          : 'Any',
                        'Select preferred education',
                        'prefEducation'
                      )}
                      {renderSetupDropdown(
                        'Employed In',
                        form.employedIn || 'Any',
                        'Select employment type',
                        'prefEmployedIn'
                      )}
                      {renderSetupDropdown(
                        'Occupation',
                        form.occupation || 'Any',
                        'Select occupation',
                        'prefOccupation'
                      )}
                      {renderSetupDropdown(
                        'Annual Income',
                        form.annualIncome || 'Any',
                        'Select annual income',
                        'prefAnnualIncome'
                      )}
                    </>
                  )}

                  {activeModal === 'prefLocation' && (
                    <>
                      {renderSetupDropdown(
                        'Country',
                        form.preferredCountry || 'Any',
                        'Select preferred country',
                        'prefCountry'
                      )}
                      {renderSetupDropdown(
                        'State',
                        form.preferredState || 'Any',
                        'Select preferred state',
                        'prefState'
                      )}
                      {renderSetupInput('Preferred City (Optional)', 'preferredCity', {
                        placeholder: 'Any (or enter cities separated by comma)',
                      })}
                      <TouchableOpacity
                        style={styles.checkboxRow}
                        onPress={() => setPrefOpenToRelocation((prev) => !prev)}
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            styles.checkboxBox,
                            {
                              borderColor: prefOpenToRelocation ? ORANGE : setupBorder,
                              backgroundColor: prefOpenToRelocation ? ORANGE : 'transparent',
                            },
                          ]}
                        >
                          {prefOpenToRelocation ? (
                            <Check size={14} color="#FFFFFF" strokeWidth={3} />
                          ) : null}
                        </View>
                        <Text style={[styles.checkboxLabel, { color: colors.text, fontFamily }]}>
                          Open to relocation
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {activeModal === 'prefHabits' && (
                    <>
                      {renderSetupPills('Eating Habits', 'eatingHabits', PREF_EATING_OPTIONS)}
                      {renderSetupPills('Drinking Habits', 'drinkingHabits', PREF_HABIT_OPTIONS)}
                      {renderSetupPills('Smoking Habits', 'smokingHabits', PREF_HABIT_OPTIONS)}
                    </>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveModal}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.saveBtnText, { fontFamily }]}>Save</Text>
                </TouchableOpacity>
              </>
            )}
            </Reanimated.View>
          </Reanimated.View>
        </Reanimated.View>
      )}

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        date={
          form.dob && !Number.isNaN(new Date(form.dob).getTime())
            ? new Date(form.dob)
            : new Date(1998, 0, 1)
        }
        maximumDate={new Date()}
        minimumDate={new Date(1945, 0, 1)}
        onConfirm={(date) => {
          const formatted = date.toISOString().split('T')[0];
          setForm((prev) => ({ ...prev, dob: formatted }));
          setDatePickerVisible(false);
        }}
        onCancel={() => setDatePickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stickyHeader: {
    zIndex: 20,
  },
  stickyHeaderGradient: {
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stickyBackBtn: { padding: 4 },
  stickyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  stickyAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  heroWrap: {
    width: '100%',
    height: 310,
    backgroundColor: '#64748B',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroPlaceholderText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  heroBackBtn: {
    position: 'absolute',
    left: 16,
    padding: 4,
  },
  heroBottomRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierPill: {
    backgroundColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  tierPillText: {
    color: '#4B2E05',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroPhotoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroCountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroPhotoText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  contactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  contactAction: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  contactActionText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  contactDivider: {
    width: 1,
    height: '72%',
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 22,
  },
  superHeading: {
    color: ACCENT_RED,
    fontWeight: '600',
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionHeading: {
    fontWeight: '600',
  },
  pencilBtn: {
    padding: 4,
  },
  paragraphText: {
    fontSize: 14.5,
    lineHeight: 22,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  kvLabel: {
    width: '42%',
    fontSize: 14.5,
    lineHeight: 21,
  },
  kvColon: {
    width: 18,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
  },
  kvValue: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: '500',
  },
  trustCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  trustTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  trustSub: {
    fontSize: 13.5,
  },
  modalBackdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  modalDismissArea: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '100%',
    overflow: 'hidden',
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  pickerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalScroll: {
    flexShrink: 1,
    maxHeight: 460,
  },
  modalScrollContent: {
    gap: 18,
    paddingVertical: 6,
  },
  setupSection: {
    gap: 8,
  },
  setupSectionTitle: {
    fontWeight: '800',
  },
  setupDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  setupDropdownText: {
    flex: 1,
    fontWeight: '600',
  },
  setupInput: {
    borderWidth: 1.2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontWeight: '600',
  },
  setupTextArea: {
    minHeight: 120,
    paddingTop: 12,
    lineHeight: 20,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  optionPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.4,
  },
  optionPillText: {
    fontWeight: '700',
  },
  ageBanner: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 2,
  },
  ageText: {
    fontSize: 14,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  pickerList: {
    flexShrink: 1,
    maxHeight: 420,
  },
  groupHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  pickerRowText: {
    flex: 1,
    fontSize: 14.5,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ORANGE,
  },
  saveBtn: {
    backgroundColor: ORANGE,
    borderRadius: 22,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
  partnerSectionWrap: {
    gap: 22,
    marginTop: 6,
  },
  partnerDivider: {
    height: 1,
    marginBottom: 2,
  },
  partnerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  compulsoryBtn: {
    borderWidth: 1.2,
    borderColor: '#0EA5E9',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  compulsoryBtnText: {
    color: '#0284C7',
    fontSize: 12.5,
    fontWeight: '600',
  },
  moreLink: {
    color: '#0284C7',
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 2,
  },
  prefRangeRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
