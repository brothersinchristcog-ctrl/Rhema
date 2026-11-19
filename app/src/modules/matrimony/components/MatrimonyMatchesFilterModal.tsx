import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Pencil, Search, X } from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import {
  COUNTRY_OPTIONS,
  DENOMINATION_OPTIONS,
  DIVISION_OPTIONS,
  EATING_HABITS_OPTIONS,
  FAMILY_STATUS_OPTIONS,
  FAMILY_TYPE_OPTIONS,
  FAMILY_VALUES_OPTIONS,
  GLOBAL_STATES,
  HEIGHT_OPTIONS,
  INDIA_STATES,
  MARITAL_STATUS_OPTIONS,
  MOTHER_TONGUE_OPTIONS,
  PHYSICAL_STATUS_OPTIONS,
  SMOKING_DRINKING_OPTIONS,
} from '../constants/profileOptions';
import {
  EDUCATION_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  INCOME_OPTIONS_GLOBAL,
  INCOME_OPTIONS_INR,
  OCCUPATION_OPTIONS,
} from '../constants/professionalOptions';
import { matrimonyApi } from '../services/matrimonyApi';
import { MatrimonyMatchesFilter, MatrimonyMatchTab } from '../types/matrimony';

const CORAL_RED = '#E0535F';

type PickerFieldKey =
  | 'age'
  | 'height'
  | 'profileCreatedBy'
  | 'maritalStatus'
  | 'motherTongue'
  | 'physicalStatus'
  | 'baptized'
  | 'denomination'
  | 'division'
  | 'occupation'
  | 'annualIncome'
  | 'employmentType'
  | 'education'
  | 'country'
  | 'state'
  | 'city'
  | 'eatingHabits'
  | 'drinkingHabits'
  | 'smokingHabits'
  | 'familyStatus'
  | 'familyType'
  | 'familyValues';

interface Props {
  visible: boolean;
  initialFilters: MatrimonyMatchesFilter;
  partnerPreferencesFilter?: MatrimonyMatchesFilter;
  initialMatchCount: number;
  tab: MatrimonyMatchTab;
  matchBasis?: 'partner_preferences' | 'all_filters';
  sortBy:
    | 'best_match'
    | 'last_active'
    | 'date_created'
    | 'distance'
    | 'latest_photos'
    | 'newest'
    | 'age_asc'
    | 'age_desc'
    | 'most_shared_interests';
  onClose: () => void;
  onApply: (nextFilters: MatrimonyMatchesFilter) => void;
  onReset?: (revertedFilters: MatrimonyMatchesFilter) => void;
}

function formatCompactHeight(cm?: number): string {
  if (!cm) return '';
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

const AGE_VALUES = Array.from({ length: 48 }, (_, i) => 18 + i);

function buildDraftFromBaseline(
  baseline: MatrimonyMatchesFilter,
  overrides: MatrimonyMatchesFilter
): MatrimonyMatchesFilter {
  const out: MatrimonyMatchesFilter = { ...(baseline || {}) };
  const ov = overrides || {};

  if (ov.minAge !== undefined || ov.maxAge !== undefined) {
    if (
      ov.minAge === 18 &&
      ov.maxAge === 80 &&
      (baseline.minAge !== 18 || baseline.maxAge !== 80)
    ) {
      delete out.minAge;
      delete out.maxAge;
    } else {
      out.minAge = ov.minAge;
      out.maxAge = ov.maxAge;
    }
  }
  if (ov.minHeightCm !== undefined || ov.maxHeightCm !== undefined) {
    if (
      ov.minHeightCm === 120 &&
      ov.maxHeightCm === 240 &&
      (baseline.minHeightCm !== 120 || baseline.maxHeightCm !== 240)
    ) {
      delete out.minHeightCm;
      delete out.maxHeightCm;
    } else {
      out.minHeightCm = ov.minHeightCm;
      out.maxHeightCm = ov.maxHeightCm;
    }
  }

  const anyLike = new Set(['any', "doesn't matter", 'any division', 'all']);
  const stringKeys: (keyof MatrimonyMatchesFilter)[] = [
    'profileCreatedBy',
    'maritalStatus',
    'motherTongue',
    'physicalStatus',
    'baptized',
    'denomination',
    'division',
    'occupation',
    'annualIncome',
    'employmentType',
    'country',
    'state',
    'city',
    'eatingHabits',
    'drinkingHabits',
    'smokingHabits',
    'familyStatus',
    'familyType',
    'familyValues',
    'createdWithin',
  ];
  for (const key of stringKeys) {
    if (ov[key] !== undefined) {
      const val = String(ov[key] || '').trim();
      if (!val || anyLike.has(val.toLowerCase())) {
        delete (out as any)[key];
        if (key === 'baptized') out.baptizedOnly = undefined;
      } else {
        (out as any)[key] = val;
        if (key === 'baptized') out.baptizedOnly = val.toLowerCase() === 'yes';
      }
    }
  }

  if (ov.baptizedOnly !== undefined && ov.baptized === undefined) {
    out.baptizedOnly = ov.baptizedOnly;
    if (ov.baptizedOnly) out.baptized = 'Yes';
    else delete out.baptized;
  }

  if (ov.education !== undefined) {
    if (ov.education.length === 0) {
      delete out.education;
    } else {
      out.education = [...ov.education];
    }
  }

  if (ov.mutualMatchesOnly !== undefined) out.mutualMatchesOnly = ov.mutualMatchesOnly;
  if (ov.withPhotoOnly !== undefined) out.withPhotoOnly = ov.withPhotoOnly;
  if (ov.sharedInterestsOnly !== undefined) out.sharedInterestsOnly = ov.sharedInterestsOnly;
  if (ov.sameCity !== undefined) out.sameCity = ov.sameCity;
  if (ov.sameState !== undefined) out.sameState = ov.sameState;

  return out;
}

function extractModifiedOverrides(
  draft: MatrimonyMatchesFilter,
  baseline: MatrimonyMatchesFilter
): MatrimonyMatchesFilter {
  const out: MatrimonyMatchesFilter = {};
  const b = baseline || {};

  if (
    (draft.minAge ?? null) !== (b.minAge ?? null) ||
    (draft.maxAge ?? null) !== (b.maxAge ?? null)
  ) {
    if (draft.minAge === undefined && draft.maxAge === undefined) {
      out.minAge = 18;
      out.maxAge = 80;
    } else {
      if (draft.minAge !== undefined) out.minAge = draft.minAge;
      if (draft.maxAge !== undefined) out.maxAge = draft.maxAge;
    }
  }

  if (
    (draft.minHeightCm ?? null) !== (b.minHeightCm ?? null) ||
    (draft.maxHeightCm ?? null) !== (b.maxHeightCm ?? null)
  ) {
    if (draft.minHeightCm === undefined && draft.maxHeightCm === undefined) {
      out.minHeightCm = 120;
      out.maxHeightCm = 240;
    } else {
      if (draft.minHeightCm !== undefined) out.minHeightCm = draft.minHeightCm;
      if (draft.maxHeightCm !== undefined) out.maxHeightCm = draft.maxHeightCm;
    }
  }

  const eqStr = (x?: string, y?: string) => (x || '').trim() === (y || '').trim();
  const strFields: { key: keyof MatrimonyMatchesFilter; clearLabel: string }[] = [
    { key: 'profileCreatedBy', clearLabel: 'Any' },
    { key: 'maritalStatus', clearLabel: 'Any' },
    { key: 'motherTongue', clearLabel: 'Any' },
    { key: 'physicalStatus', clearLabel: "Doesn't Matter" },
    { key: 'denomination', clearLabel: 'Any' },
    { key: 'division', clearLabel: 'Any Division' },
    { key: 'occupation', clearLabel: 'Any' },
    { key: 'annualIncome', clearLabel: 'Any' },
    { key: 'employmentType', clearLabel: 'Any' },
    { key: 'country', clearLabel: 'Any' },
    { key: 'state', clearLabel: 'Any' },
    { key: 'city', clearLabel: 'Any' },
    { key: 'eatingHabits', clearLabel: 'Any' },
    { key: 'drinkingHabits', clearLabel: "Doesn't Matter" },
    { key: 'smokingHabits', clearLabel: "Doesn't Matter" },
    { key: 'familyStatus', clearLabel: 'Any' },
    { key: 'familyType', clearLabel: 'Any' },
    { key: 'familyValues', clearLabel: 'Any' },
  ];
  for (const { key, clearLabel } of strFields) {
    const dv = (draft[key] as string | undefined) || '';
    const bv = (b[key] as string | undefined) || '';
    if (!eqStr(dv, bv)) {
      (out as any)[key] = dv.trim() ? dv.trim() : clearLabel;
    }
  }

  const dBapt = draft.baptized || (draft.baptizedOnly ? 'Yes' : '');
  const bBapt = b.baptized || (b.baptizedOnly ? 'Yes' : '');
  if (dBapt !== bBapt) {
    out.baptized = dBapt || 'Any';
  }

  const dCreated = draft.createdWithin && draft.createdWithin !== 'all' ? draft.createdWithin : '';
  const bCreated = b.createdWithin && b.createdWithin !== 'all' ? b.createdWithin : '';
  if (dCreated !== bCreated) {
    out.createdWithin = (dCreated || 'all') as MatrimonyMatchesFilter['createdWithin'];
  }

  const dEdu = [...(draft.education || [])].sort().join('|');
  const bEdu = [...(b.education || [])].sort().join('|');
  if (dEdu !== bEdu) {
    out.education = draft.education ? [...draft.education] : [];
  }

  if (Boolean(draft.mutualMatchesOnly) !== Boolean(b.mutualMatchesOnly)) {
    out.mutualMatchesOnly = Boolean(draft.mutualMatchesOnly);
  }
  if (Boolean(draft.withPhotoOnly) !== Boolean(b.withPhotoOnly)) {
    out.withPhotoOnly = Boolean(draft.withPhotoOnly);
  }
  if (Boolean(draft.sharedInterestsOnly) !== Boolean(b.sharedInterestsOnly)) {
    out.sharedInterestsOnly = Boolean(draft.sharedInterestsOnly);
  }
  if (Boolean(draft.sameCity) !== Boolean(b.sameCity)) {
    out.sameCity = Boolean(draft.sameCity);
  }
  if (Boolean(draft.sameState) !== Boolean(b.sameState)) {
    out.sameState = Boolean(draft.sameState);
  }

  return out;
}

export function countActiveMatrimonyFilters(f: MatrimonyMatchesFilter): number {
  let c = 0;
  if (f.minAge !== undefined || f.maxAge !== undefined) c++;
  if (f.minHeightCm !== undefined || f.maxHeightCm !== undefined) c++;
  if (f.profileCreatedBy) c++;
  if (f.maritalStatus) c++;
  if (f.motherTongue) c++;
  if (f.physicalStatus) c++;
  if (f.baptized || f.baptizedOnly) c++;
  if (f.denomination) c++;
  if (f.division) c++;
  if (f.occupation) c++;
  if (f.annualIncome) c++;
  if (f.employmentType) c++;
  if (f.education && f.education.length > 0) c++;
  if (f.sameCity) c++;
  if (f.sameState) c++;
  if (f.country) c++;
  if (f.state) c++;
  if (f.city) c++;
  if (f.eatingHabits) c++;
  if (f.drinkingHabits) c++;
  if (f.smokingHabits) c++;
  if (f.familyStatus) c++;
  if (f.familyType) c++;
  if (f.familyValues) c++;
  if (f.createdWithin && f.createdWithin !== 'all') c++;
  if (f.mutualMatchesOnly) c++;
  if (f.withPhotoOnly) c++;
  if (f.sharedInterestsOnly) c++;
  return c;
}

export default function MatrimonyMatchesFilterModal({
  visible,
  initialFilters,
  partnerPreferencesFilter,
  initialMatchCount,
  tab,
  matchBasis = 'all_filters',
  sortBy,
  onClose,
  onApply,
  onReset,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [draft, setDraft] = useState<MatrimonyMatchesFilter>(initialFilters);
  const [previewCount, setPreviewCount] = useState<number>(initialMatchCount);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [activePicker, setActivePicker] = useState<PickerFieldKey | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [eduExpanded, setEduExpanded] = useState(false);

  // Temp state for Age & Height dual pickers
  const [tempMinAge, setTempMinAge] = useState<number>(initialFilters.minAge ?? 21);
  const [tempMaxAge, setTempMaxAge] = useState<number>(initialFilters.maxAge ?? 35);
  const [tempMinHeight, setTempMinHeight] = useState<number>(initialFilters.minHeightCm ?? 150);
  const [tempMaxHeight, setTempMaxHeight] = useState<number>(initialFilters.maxHeightCm ?? 190);
  const [tempEduList, setTempEduList] = useState<string[]>(initialFilters.education ?? []);
  const [tempCity, setTempCity] = useState<string>(initialFilters.city ?? '');

  const wasVisibleRef = useRef(false);
  const hasUserEditedRef = useRef(false);

  const baselineFilters = useMemo<MatrimonyMatchesFilter>(
    () => partnerPreferencesFilter || {},
    [partnerPreferencesFilter]
  );

  const isFieldModified = useMemo(() => {
    const eqStr = (a?: string, b?: string) => (a || '').trim() === (b || '').trim();
    const eqArr = (a?: string[], b?: string[]) =>
      [...(a || [])].sort().join('|') === [...(b || [])].sort().join('|');
    const normBaptized = (f: MatrimonyMatchesFilter) =>
      f.baptized || (f.baptizedOnly ? 'Yes' : '');
    const normCreated = (f: MatrimonyMatchesFilter) =>
      f.createdWithin && f.createdWithin !== 'all' ? f.createdWithin : '';

    return (key: PickerFieldKey | 'createdWithin' | 'mutualMatchesOnly' | 'withPhotoOnly' | 'sharedInterestsOnly' | 'sameCity' | 'sameState'): boolean => {
      switch (key) {
        case 'age':
          return (
            (draft.minAge ?? null) !== (baselineFilters.minAge ?? null) ||
            (draft.maxAge ?? null) !== (baselineFilters.maxAge ?? null)
          );
        case 'height':
          return (
            (draft.minHeightCm ?? null) !== (baselineFilters.minHeightCm ?? null) ||
            (draft.maxHeightCm ?? null) !== (baselineFilters.maxHeightCm ?? null)
          );
        case 'profileCreatedBy':
          return !eqStr(draft.profileCreatedBy, baselineFilters.profileCreatedBy);
        case 'maritalStatus':
          return !eqStr(draft.maritalStatus, baselineFilters.maritalStatus);
        case 'motherTongue':
          return !eqStr(draft.motherTongue, baselineFilters.motherTongue);
        case 'physicalStatus':
          return !eqStr(draft.physicalStatus, baselineFilters.physicalStatus);
        case 'baptized':
          return normBaptized(draft) !== normBaptized(baselineFilters);
        case 'denomination':
          return !eqStr(draft.denomination, baselineFilters.denomination);
        case 'division':
          return !eqStr(draft.division, baselineFilters.division);
        case 'occupation':
          return !eqStr(draft.occupation, baselineFilters.occupation);
        case 'annualIncome':
          return !eqStr(draft.annualIncome, baselineFilters.annualIncome);
        case 'employmentType':
          return !eqStr(draft.employmentType, baselineFilters.employmentType);
        case 'education':
          return !eqArr(draft.education, baselineFilters.education);
        case 'country':
          return !eqStr(draft.country, baselineFilters.country);
        case 'state':
          return !eqStr(draft.state, baselineFilters.state);
        case 'city':
          return !eqStr(draft.city, baselineFilters.city);
        case 'eatingHabits':
          return !eqStr(draft.eatingHabits, baselineFilters.eatingHabits);
        case 'drinkingHabits':
          return !eqStr(draft.drinkingHabits, baselineFilters.drinkingHabits);
        case 'smokingHabits':
          return !eqStr(draft.smokingHabits, baselineFilters.smokingHabits);
        case 'familyStatus':
          return !eqStr(draft.familyStatus, baselineFilters.familyStatus);
        case 'familyType':
          return !eqStr(draft.familyType, baselineFilters.familyType);
        case 'familyValues':
          return !eqStr(draft.familyValues, baselineFilters.familyValues);
        case 'createdWithin':
          return normCreated(draft) !== normCreated(baselineFilters);
        case 'mutualMatchesOnly':
          return Boolean(draft.mutualMatchesOnly) !== Boolean(baselineFilters.mutualMatchesOnly);
        case 'withPhotoOnly':
          return Boolean(draft.withPhotoOnly) !== Boolean(baselineFilters.withPhotoOnly);
        case 'sharedInterestsOnly':
          return Boolean(draft.sharedInterestsOnly) !== Boolean(baselineFilters.sharedInterestsOnly);
        case 'sameCity':
          return Boolean(draft.sameCity) !== Boolean(baselineFilters.sameCity);
        case 'sameState':
          return Boolean(draft.sameState) !== Boolean(baselineFilters.sameState);
      }
    };
  }, [draft, baselineFilters]);

  const hasModifiedFromPrefs = useMemo(() => {
    const keys: (
      | PickerFieldKey
      | 'createdWithin'
      | 'mutualMatchesOnly'
      | 'withPhotoOnly'
      | 'sharedInterestsOnly'
      | 'sameCity'
      | 'sameState'
    )[] = [
      'age',
      'height',
      'profileCreatedBy',
      'maritalStatus',
      'motherTongue',
      'physicalStatus',
      'baptized',
      'denomination',
      'division',
      'occupation',
      'annualIncome',
      'employmentType',
      'education',
      'country',
      'state',
      'city',
      'eatingHabits',
      'drinkingHabits',
      'smokingHabits',
      'familyStatus',
      'familyType',
      'familyValues',
      'createdWithin',
      'mutualMatchesOnly',
      'withPhotoOnly',
      'sharedInterestsOnly',
      'sameCity',
      'sameState',
    ];
    return keys.some((k) => isFieldModified(k));
  }, [isFieldModified]);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      hasUserEditedRef.current = false;
      const seed = buildDraftFromBaseline(
        partnerPreferencesFilter || {},
        initialFilters || {}
      );
      setDraft(seed);
      setPreviewCount(initialMatchCount);
      setEduExpanded(false);
    } else if (visible && !hasUserEditedRef.current) {
      const latest = buildDraftFromBaseline(
        partnerPreferencesFilter || {},
        initialFilters || {}
      );
      setDraft((prev) =>
        JSON.stringify(latest) !== JSON.stringify(prev) ? latest : prev
      );
    }
    wasVisibleRef.current = visible;
  }, [visible, initialFilters, initialMatchCount, partnerPreferencesFilter]);

  const updateDraft = (
    updater:
      | MatrimonyMatchesFilter
      | ((prev: MatrimonyMatchesFilter) => MatrimonyMatchesFilter)
  ) => {
    hasUserEditedRef.current = true;
    setDraft(updater);
  };

  // Live preview count whenever draft filters change inside modal
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const overrides = extractModifiedOverrides(draft, baselineFilters);
        const hasOverrides = Object.keys(overrides).length > 0;
        const previewBasis: 'partner_preferences' | 'all_filters' = hasOverrides
          ? 'all_filters'
          : 'partner_preferences';
        const res = await matrimonyApi.getMatches({
          tab,
          matchBasis: previewBasis,
          sortBy,
          filters: overrides,
        });
        if (!cancelled) {
          setPreviewCount(res.matches?.length ?? res.totalCount ?? 0);
        }
      } catch {
        // Retain last known count on transient network issues
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, draft, tab, baselineFilters, sortBy]);

  const cardSurface = isDark ? colors.surface : '#FFFFFF';
  const sectionBg = isDark ? '#1E293B' : '#F1F4F7';
  const dividerColor = isDark ? colors.border : '#E5E7EB';

  const openFieldPicker = (field: PickerFieldKey) => {
    setPickerSearch('');
    if (field === 'age') {
      setTempMinAge(draft.minAge ?? 21);
      setTempMaxAge(draft.maxAge ?? 35);
    } else if (field === 'height') {
      setTempMinHeight(draft.minHeightCm ?? 152);
      setTempMaxHeight(draft.maxHeightCm ?? 191);
    } else if (field === 'education') {
      setTempEduList(draft.education ?? []);
    } else if (field === 'city') {
      setTempCity(draft.city ?? '');
    }
    setActivePicker(field);
  };

  const resetSingleField = (field: PickerFieldKey) => {
    updateDraft((prev) => {
      const next = { ...prev };
      if (field === 'age') {
        next.minAge = baselineFilters.minAge;
        next.maxAge = baselineFilters.maxAge;
      } else if (field === 'height') {
        next.minHeightCm = baselineFilters.minHeightCm;
        next.maxHeightCm = baselineFilters.maxHeightCm;
      } else if (field === 'baptized') {
        next.baptized = baselineFilters.baptized;
        next.baptizedOnly = baselineFilters.baptizedOnly;
      } else if (field === 'education') {
        next.education = baselineFilters.education
          ? [...baselineFilters.education]
          : undefined;
      } else {
        (next as any)[field] = (baselineFilters as any)[field];
      }
      return next;
    });
    setActivePicker(null);
  };

  const renderPickerHeader = (title: string, field: PickerFieldKey) => (
    <View style={[styles.pickerHeader, { borderBottomColor: dividerColor }]}>
      <Text style={[styles.pickerTitle, { color: colors.text, fontFamily }]}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {isFieldModified(field) ? (
          <TouchableOpacity onPress={() => resetSingleField(field)}>
            <Text style={{ color: CORAL_RED, fontSize: 13.5, fontWeight: '700', fontFamily }}>
              Reset
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => setActivePicker(null)}>
          <X size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const singleOptionsMap = useMemo<Record<string, { title: string; options: { label: string; isHeader?: boolean }[]; field: keyof MatrimonyMatchesFilter }>>(() => {
    const mapStr = (arr: string[]) => arr.map((label) => ({ label }));
    const statesList = Array.from(new Set([...INDIA_STATES, ...GLOBAL_STATES]));
    return {
      profileCreatedBy: {
        title: 'Profile Created By',
        field: 'profileCreatedBy',
        options: mapStr(['Any', 'Self', 'Parents / Guardian']),
      },
      maritalStatus: {
        title: 'Marital Status',
        field: 'maritalStatus',
        options: mapStr(['Any', ...MARITAL_STATUS_OPTIONS]),
      },
      motherTongue: {
        title: 'Mother Tongue',
        field: 'motherTongue',
        options: mapStr(['Any', ...MOTHER_TONGUE_OPTIONS]),
      },
      physicalStatus: {
        title: 'Physical Status',
        field: 'physicalStatus',
        options: mapStr(["Doesn't Matter", ...PHYSICAL_STATUS_OPTIONS]),
      },
      baptized: {
        title: 'Baptized',
        field: 'baptized',
        options: mapStr(['Any', 'Yes', 'No']),
      },
      denomination: {
        title: 'Denomination',
        field: 'denomination',
        options: mapStr(['Any', ...DENOMINATION_OPTIONS]),
      },
      division: {
        title: 'Division',
        field: 'division',
        options: mapStr(['Any Division', ...DIVISION_OPTIONS]),
      },
      occupation: {
        title: 'Occupation',
        field: 'occupation',
        options: [{ label: 'Any' }, ...OCCUPATION_OPTIONS],
      },
      annualIncome: {
        title: 'Annual Income',
        field: 'annualIncome',
        options: [{ label: 'Any' }, ...INCOME_OPTIONS_INR, ...INCOME_OPTIONS_GLOBAL],
      },
      employmentType: {
        title: 'Employment Type',
        field: 'employmentType',
        options: [{ label: 'Any' }, ...EMPLOYMENT_TYPE_OPTIONS],
      },
      country: {
        title: 'Country',
        field: 'country',
        options: mapStr(['Any', ...COUNTRY_OPTIONS]),
      },
      state: {
        title: 'State',
        field: 'state',
        options: mapStr(['Any', ...statesList]),
      },
      eatingHabits: {
        title: 'Eating Habits',
        field: 'eatingHabits',
        options: mapStr(['Any', ...EATING_HABITS_OPTIONS.filter((o) => o !== 'Not Specified')]),
      },
      drinkingHabits: {
        title: 'Drinking Habits',
        field: 'drinkingHabits',
        options: mapStr(["Doesn't Matter", ...SMOKING_DRINKING_OPTIONS.filter((o) => o !== 'Not Specified')]),
      },
      smokingHabits: {
        title: 'Smoking Habits',
        field: 'smokingHabits',
        options: mapStr(["Doesn't Matter", ...SMOKING_DRINKING_OPTIONS.filter((o) => o !== 'Not Specified')]),
      },
      familyStatus: {
        title: 'Family Status',
        field: 'familyStatus',
        options: mapStr(['Any', ...FAMILY_STATUS_OPTIONS]),
      },
      familyType: {
        title: 'Family Type',
        field: 'familyType',
        options: mapStr(['Any', ...FAMILY_TYPE_OPTIONS]),
      },
      familyValues: {
        title: 'Family Value',
        field: 'familyValues',
        options: mapStr(['Any', ...FAMILY_VALUES_OPTIONS]),
      },
    };
  }, []);

  const renderSectionBanner = (title: string) => (
    <View style={[styles.sectionBanner, { backgroundColor: sectionBg }]}>
      <Text style={[styles.sectionBannerText, { color: colors.text, fontFamily }]}>{title}</Text>
    </View>
  );

  const modifiedRowBg = isDark ? 'rgba(224,83,95,0.16)' : '#FDF2F4';

  const renderFilterRow = (
    label: string,
    valueText: string,
    field: PickerFieldKey,
    options?: { isLast?: boolean; customValueNode?: React.ReactNode }
  ) => {
    const modified = isFieldModified(field);
    return (
      <TouchableOpacity
        style={[
          styles.filterRow,
          {
            backgroundColor: modified ? modifiedRowBg : cardSurface,
            borderBottomColor: options?.isLast ? 'transparent' : dividerColor,
          },
        ]}
        activeOpacity={0.7}
        onPress={() => openFieldPicker(field)}
      >
        <Text style={[styles.rowLabel, { color: colors.text, fontFamily }]}>{label}</Text>
        <View style={styles.rowRight}>
          {options?.customValueNode || (
            <Text
              style={[
                styles.rowValue,
                {
                  color: modified
                    ? CORAL_RED
                    : valueText === 'Any' || valueText === "Doesn't Matter" || valueText === 'Any Division'
                    ? colors.textSecondary
                    : colors.text,
                  fontWeight: modified ? '700' : '600',
                  fontFamily,
                },
              ]}
              numberOfLines={2}
            >
              {valueText}
            </Text>
          )}
          <Pencil size={16} color={colors.text} strokeWidth={1.8} />
        </View>
      </TouchableOpacity>
    );
  };

  const ageDisplay =
    draft.minAge !== undefined || draft.maxAge !== undefined
      ? `${draft.minAge ?? 18} Yrs - ${draft.maxAge ?? 65} Yrs`
      : 'Any';

  const heightDisplay =
    draft.minHeightCm !== undefined || draft.maxHeightCm !== undefined
      ? `${formatCompactHeight(draft.minHeightCm ?? 132)} - ${formatCompactHeight(draft.maxHeightCm ?? 213)}`
      : 'Any';

  const selectedEdu = draft.education || [];
  const eduJoined = selectedEdu.join(', ');
  const eduNeedsTruncate = selectedEdu.length > 0 && eduJoined.length > 26 && !eduExpanded;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: cardSurface }]} edges={['top']}>
        {/* Top Bar */}
        <View style={[styles.topBar, { backgroundColor: cardSurface, borderBottomColor: dividerColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.text, fontFamily }]}>Filter</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Basic Details */}
          {renderSectionBanner('Basic Details')}
          {renderFilterRow('Age', ageDisplay, 'age')}
          {renderFilterRow('Height', heightDisplay, 'height')}
          {renderFilterRow('Profile created by', draft.profileCreatedBy || 'Any', 'profileCreatedBy')}
          {renderFilterRow('Marital Status', draft.maritalStatus || 'Any', 'maritalStatus')}
          {renderFilterRow('Mother Tongue', draft.motherTongue || 'Any', 'motherTongue')}
          {renderFilterRow('Physical Status', draft.physicalStatus || "Doesn't Matter", 'physicalStatus', {
            isLast: true,
          })}

          {/* Religious Details */}
          {renderSectionBanner('Religious Details')}
          {renderFilterRow('Baptized', draft.baptized || (draft.baptizedOnly ? 'Yes' : 'Any'), 'baptized')}
          {renderFilterRow('Denomination', draft.denomination || 'Any', 'denomination')}
          {renderFilterRow('Division', draft.division || 'Any Division', 'division', { isLast: true })}

          {/* Professional Details */}
          {renderSectionBanner('Professional Details')}
          {renderFilterRow('Occupation', draft.occupation || 'Any', 'occupation')}
          {renderFilterRow('Annual Income', draft.annualIncome || 'Any', 'annualIncome')}
          {renderFilterRow('Employment Type', draft.employmentType || 'Any', 'employmentType')}
          {renderFilterRow('Education', selectedEdu.length > 0 ? eduJoined : 'Any', 'education', {
            isLast: true,
            customValueNode:
              selectedEdu.length > 0 ? (
                <View style={styles.eduValueCol}>
                  <Text
                    style={[
                      styles.rowValue,
                      {
                        color: isFieldModified('education') ? CORAL_RED : colors.text,
                        fontWeight: isFieldModified('education') ? '700' : '600',
                        fontFamily,
                      },
                    ]}
                    numberOfLines={eduExpanded ? undefined : 2}
                  >
                    {eduNeedsTruncate ? `${eduJoined.slice(0, 26)}... ` : eduJoined}
                    {eduNeedsTruncate && (
                      <Text
                        style={{ color: CORAL_RED, fontWeight: '700' }}
                        onPress={(e) => {
                          e.stopPropagation();
                          setEduExpanded(true);
                        }}
                      >
                        Read more
                      </Text>
                    )}
                  </Text>
                </View>
              ) : undefined,
          })}

          {/* Location Details */}
          {renderSectionBanner('Location Details')}
          {renderFilterRow('Country', draft.country || 'Any', 'country')}
          {renderFilterRow('State', draft.state || 'Any', 'state')}
          {renderFilterRow('City', draft.city || 'Any', 'city', { isLast: true })}

          {/* Lifestyle */}
          {renderSectionBanner('Lifestyle')}
          {renderFilterRow('Eating Habits', draft.eatingHabits || 'Any', 'eatingHabits')}
          {renderFilterRow('Drinking Habits', draft.drinkingHabits || "Doesn't Matter", 'drinkingHabits')}
          {renderFilterRow('Smoking Habits', draft.smokingHabits || "Doesn't Matter", 'smokingHabits', {
            isLast: true,
          })}

          {/* Family Details */}
          {renderSectionBanner('Family Details')}
          {renderFilterRow('Family Status', draft.familyStatus || 'Any', 'familyStatus')}
          {renderFilterRow('Family Type', draft.familyType || 'Any', 'familyType')}
          {renderFilterRow('Family Value', draft.familyValues || 'Any', 'familyValues', { isLast: true })}

          {/* Recently created profiles */}
          {renderSectionBanner('Recently created profiles')}
          <View
            style={[
              styles.recentWrap,
              { backgroundColor: isFieldModified('createdWithin') ? modifiedRowBg : cardSurface },
            ]}
          >
            <Text style={[styles.rowLabel, { color: colors.text, fontFamily }]}>Profile Created</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary, fontFamily, marginBottom: 12 }]}>
              Profiles based on created date
            </Text>
            <View style={styles.recentPillsWrap}>
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'today', label: 'Today' },
                  { key: '3d', label: 'Last 3 days' },
                  { key: '1w', label: 'One week' },
                  { key: '1m', label: 'One month' },
                ] as const
              ).map((item) => {
                const selected = (draft.createdWithin || 'all') === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.recentPill,
                      {
                        borderColor: selected ? '#E58E95' : dividerColor,
                        backgroundColor: selected ? 'rgba(224,83,95,0.08)' : cardSurface,
                      },
                    ]}
                    onPress={() =>
                      updateDraft((p) => ({
                        ...p,
                        createdWithin: item.key === 'all' ? undefined : item.key,
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.recentPillText,
                        { color: selected ? colors.text : colors.text, fontWeight: selected ? '700' : '600', fontFamily },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Profile Type */}
          {renderSectionBanner('Profile Type')}
          <TouchableOpacity
            style={[
              styles.checkRow,
              {
                backgroundColor: isFieldModified('mutualMatchesOnly') ? modifiedRowBg : cardSurface,
                borderBottomColor: dividerColor,
              },
            ]}
            activeOpacity={0.75}
            onPress={() => updateDraft((p) => ({ ...p, mutualMatchesOnly: !p.mutualMatchesOnly }))}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: colors.text, fontFamily }]}>Mutual Matches</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary, fontFamily }]}>
                Profiles matching your preferences & vice versa
              </Text>
            </View>
            <View
              style={[
                styles.squareCheck,
                {
                  borderColor: draft.mutualMatchesOnly ? CORAL_RED : '#64748B',
                  backgroundColor: draft.mutualMatchesOnly ? CORAL_RED : 'transparent',
                },
              ]}
            >
              {draft.mutualMatchesOnly ? <Check size={14} color="#FFFFFF" strokeWidth={2.8} /> : null}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.checkRow,
              {
                backgroundColor: isFieldModified('withPhotoOnly') ? modifiedRowBg : cardSurface,
                borderBottomColor: 'transparent',
              },
            ]}
            activeOpacity={0.75}
            onPress={() => updateDraft((p) => ({ ...p, withPhotoOnly: !p.withPhotoOnly }))}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: colors.text, fontFamily }]}>Profiles with Photo</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary, fontFamily }]}>
                Show members who uploaded at least one photo
              </Text>
            </View>
            <View
              style={[
                styles.squareCheck,
                {
                  borderColor: draft.withPhotoOnly ? CORAL_RED : '#64748B',
                  backgroundColor: draft.withPhotoOnly ? CORAL_RED : 'transparent',
                },
              ]}
            >
              {draft.withPhotoOnly ? <Check size={14} color="#FFFFFF" strokeWidth={2.8} /> : null}
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Sticky Bottom CTA */}
        <View
          style={[
            styles.footerBar,
            {
              backgroundColor: cardSurface,
              borderTopColor: dividerColor,
              paddingBottom: Math.max(insets.bottom + 10, 16),
            },
          ]}
        >
          <View style={styles.footerCountRow}>
            {previewLoading ? (
              <ActivityIndicator size="small" color={CORAL_RED} style={{ marginRight: 6 }} />
            ) : null}
            <Text style={[styles.footerCountText, { color: colors.text, fontFamily }]}>
              <Text style={{ fontWeight: '800' }}>{previewCount.toLocaleString()}</Text>{' '}
              {previewCount === 1 ? 'match' : 'matches'} based on your filters
            </Text>
          </View>
          {hasModifiedFromPrefs ? (
            <View style={styles.footerBtnsRow}>
              <TouchableOpacity
                style={[
                  styles.resetFooterBtn,
                  {
                    borderColor: isDark ? colors.border : '#CBD5E1',
                    backgroundColor: cardSurface,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  const reverted = { ...(partnerPreferencesFilter || {}) };
                  hasUserEditedRef.current = true;
                  setDraft(reverted);
                  onReset?.({});
                }}
              >
                <Text
                  style={[
                    styles.resetFooterText,
                    { color: isDark ? colors.text : '#475569', fontFamily },
                  ]}
                >
                  Reset
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.showMatchesBtn, { flex: 1.85 }]}
                activeOpacity={0.85}
                onPress={() => onApply(extractModifiedOverrides(draft, baselineFilters))}
              >
                <Text style={[styles.showMatchesText, { fontFamily }]}>Show Matches</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.showMatchesBtn}
              activeOpacity={0.85}
              onPress={() => onApply(extractModifiedOverrides(draft, baselineFilters))}
            >
              <Text style={[styles.showMatchesText, { fontFamily }]}>Show Matches</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Nested Picker Modal for Single Select / Range / Multi Select */}
        <Modal
          visible={activePicker !== null}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setActivePicker(null)}
        >
          <View style={styles.pickerBackdrop}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setActivePicker(null)} />
            <View
              style={[
                styles.pickerSheet,
                { backgroundColor: cardSurface, paddingBottom: Math.max(insets.bottom + 14, 22) },
              ]}
            >
              {activePicker === 'age' && (
                <>
                  {renderPickerHeader('Select Age Range', 'age')}
                  <View style={styles.dualGridRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dualColTitle, { color: colors.textSecondary, fontFamily }]}>Min Age</Text>
                      <ScrollView style={{ maxHeight: 240 }}>
                        {AGE_VALUES.map((age) => {
                          const active = tempMinAge === age;
                          return (
                            <TouchableOpacity
                              key={age}
                              style={[styles.dualCell, active && { backgroundColor: 'rgba(224,83,95,0.1)' }]}
                              onPress={() => {
                                setTempMinAge(age);
                                if (tempMaxAge < age) setTempMaxAge(age);
                              }}
                            >
                              <Text style={[styles.dualCellText, { color: active ? CORAL_RED : colors.text, fontWeight: active ? '800' : '500', fontFamily }]}>
                                {age} Yrs
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dualColTitle, { color: colors.textSecondary, fontFamily }]}>Max Age</Text>
                      <ScrollView style={{ maxHeight: 240 }}>
                        {AGE_VALUES.filter((a) => a >= tempMinAge).map((age) => {
                          const active = tempMaxAge === age;
                          return (
                            <TouchableOpacity
                              key={age}
                              style={[styles.dualCell, active && { backgroundColor: 'rgba(224,83,95,0.1)' }]}
                              onPress={() => setTempMaxAge(age)}
                            >
                              <Text style={[styles.dualCellText, { color: active ? CORAL_RED : colors.text, fontWeight: active ? '800' : '500', fontFamily }]}>
                                {age} Yrs
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                  <View style={styles.pickerFooterBtns}>
                    <TouchableOpacity
                      style={[styles.pickerGhostBtn, { borderColor: dividerColor }]}
                      onPress={() => {
                        updateDraft((p) => ({ ...p, minAge: undefined, maxAge: undefined }));
                        setActivePicker(null);
                      }}
                    >
                      <Text style={[styles.pickerGhostText, { color: colors.text, fontFamily }]}>Any Age</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pickerPrimaryBtn}
                      onPress={() => {
                        updateDraft((p) => ({ ...p, minAge: tempMinAge, maxAge: tempMaxAge }));
                        setActivePicker(null);
                      }}
                    >
                      <Text style={[styles.pickerPrimaryText, { fontFamily }]}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {activePicker === 'height' && (
                <>
                  {renderPickerHeader('Select Height Range', 'height')}
                  <View style={styles.dualGridRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dualColTitle, { color: colors.textSecondary, fontFamily }]}>Min Height</Text>
                      <ScrollView style={{ maxHeight: 240 }}>
                        {HEIGHT_OPTIONS.map((h) => {
                          const active = tempMinHeight === h.cm;
                          return (
                            <TouchableOpacity
                              key={h.cm}
                              style={[styles.dualCell, active && { backgroundColor: 'rgba(224,83,95,0.1)' }]}
                              onPress={() => {
                                setTempMinHeight(h.cm);
                                if (tempMaxHeight < h.cm) setTempMaxHeight(h.cm);
                              }}
                            >
                              <Text style={[styles.dualCellText, { color: active ? CORAL_RED : colors.text, fontWeight: active ? '800' : '500', fontFamily }]}>
                                {h.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dualColTitle, { color: colors.textSecondary, fontFamily }]}>Max Height</Text>
                      <ScrollView style={{ maxHeight: 240 }}>
                        {HEIGHT_OPTIONS.filter((h) => h.cm >= tempMinHeight).map((h) => {
                          const active = tempMaxHeight === h.cm;
                          return (
                            <TouchableOpacity
                              key={h.cm}
                              style={[styles.dualCell, active && { backgroundColor: 'rgba(224,83,95,0.1)' }]}
                              onPress={() => setTempMaxHeight(h.cm)}
                            >
                              <Text style={[styles.dualCellText, { color: active ? CORAL_RED : colors.text, fontWeight: active ? '800' : '500', fontFamily }]}>
                                {h.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                  <View style={styles.pickerFooterBtns}>
                    <TouchableOpacity
                      style={[styles.pickerGhostBtn, { borderColor: dividerColor }]}
                      onPress={() => {
                        updateDraft((p) => ({ ...p, minHeightCm: undefined, maxHeightCm: undefined }));
                        setActivePicker(null);
                      }}
                    >
                      <Text style={[styles.pickerGhostText, { color: colors.text, fontFamily }]}>Any Height</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pickerPrimaryBtn}
                      onPress={() => {
                        updateDraft((p) => ({ ...p, minHeightCm: tempMinHeight, maxHeightCm: tempMaxHeight }));
                        setActivePicker(null);
                      }}
                    >
                      <Text style={[styles.pickerPrimaryText, { fontFamily }]}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {activePicker === 'education' && (
                <>
                  {renderPickerHeader('Select Education', 'education')}
                  <View style={[styles.searchBox, { backgroundColor: sectionBg }]}>
                    <Search size={16} color={colors.textSecondary} />
                    <TextInput
                      value={pickerSearch}
                      onChangeText={setPickerSearch}
                      placeholder="Search degree or field..."
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.searchInput, { color: colors.text, fontFamily }]}
                    />
                  </View>
                  <ScrollView style={{ maxHeight: 310 }}>
                    {EDUCATION_OPTIONS.filter(
                      (item) =>
                        !item.isHeader &&
                        item.label.toLowerCase().includes(pickerSearch.trim().toLowerCase())
                    ).map((opt) => {
                      const checked = tempEduList.includes(opt.label);
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          style={[styles.optionRow, { borderBottomColor: dividerColor }]}
                          onPress={() =>
                            setTempEduList((prev) =>
                              prev.includes(opt.label)
                                ? prev.filter((x) => x !== opt.label)
                                : [...prev, opt.label]
                            )
                          }
                        >
                          <Text style={[styles.optionRowText, { color: colors.text, fontFamily }]}>
                            {opt.label}
                          </Text>
                          <View
                            style={[
                              styles.squareCheck,
                              {
                                borderColor: checked ? CORAL_RED : '#64748B',
                                backgroundColor: checked ? CORAL_RED : 'transparent',
                              },
                            ]}
                          >
                            {checked ? <Check size={14} color="#FFFFFF" strokeWidth={2.8} /> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.pickerFooterBtns}>
                    <TouchableOpacity
                      style={[styles.pickerGhostBtn, { borderColor: dividerColor }]}
                      onPress={() => {
                        setTempEduList([]);
                        updateDraft((p) => ({ ...p, education: undefined }));
                        setActivePicker(null);
                      }}
                    >
                      <Text style={[styles.pickerGhostText, { color: colors.text, fontFamily }]}>Any Education</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pickerPrimaryBtn}
                      onPress={() => {
                        updateDraft((p) => ({
                          ...p,
                          education: tempEduList.length > 0 ? tempEduList : undefined,
                        }));
                        setActivePicker(null);
                      }}
                    >
                      <Text style={[styles.pickerPrimaryText, { fontFamily }]}>
                        Apply ({tempEduList.length || 'Any'})
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {activePicker === 'city' && (
                <>
                  {renderPickerHeader('Preferred City', 'city')}
                  <View style={{ padding: 16 }}>
                    <TextInput
                      value={tempCity}
                      onChangeText={setTempCity}
                      placeholder="Enter city (e.g. Koilakuntla, Hyderabad)"
                      placeholderTextColor={colors.textSecondary}
                      autoFocus
                      style={[
                        styles.searchBox,
                        {
                          marginHorizontal: 0,
                          marginVertical: 0,
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          color: colors.text,
                          backgroundColor: sectionBg,
                          fontFamily,
                          fontSize: 15,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.pickerFooterBtns}>
                    <TouchableOpacity
                      style={[styles.pickerGhostBtn, { borderColor: dividerColor }]}
                      onPress={() => {
                        setTempCity('');
                        updateDraft((p) => ({ ...p, city: undefined }));
                        setActivePicker(null);
                      }}
                    >
                      <Text style={[styles.pickerGhostText, { color: colors.text, fontFamily }]}>Any City</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pickerPrimaryBtn}
                      onPress={() => {
                        const clean = tempCity.trim();
                        updateDraft((p) => ({
                          ...p,
                          city: clean && clean.toLowerCase() !== 'any' ? clean : undefined,
                        }));
                        setActivePicker(null);
                      }}
                    >
                      <Text style={[styles.pickerPrimaryText, { fontFamily }]}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {activePicker &&
                activePicker !== 'age' &&
                activePicker !== 'height' &&
                activePicker !== 'education' &&
                activePicker !== 'city' && (() => {
                  const cfg = singleOptionsMap[activePicker];
                  if (!cfg) return null;
                  const currentVal = (draft[cfg.field] as string | undefined) || cfg.options[0]?.label;
                  const showSearch = cfg.options.length > 10;
                  const filtered = cfg.options.filter(
                    (o) =>
                      !o.isHeader &&
                      (!pickerSearch.trim() ||
                        o.label.toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                  );

                  return (
                    <>
                      {renderPickerHeader(cfg.title, activePicker)}
                      {showSearch && (
                        <View style={[styles.searchBox, { backgroundColor: sectionBg }]}>
                          <Search size={16} color={colors.textSecondary} />
                          <TextInput
                            value={pickerSearch}
                            onChangeText={setPickerSearch}
                            placeholder={`Search ${cfg.title.toLowerCase()}...`}
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.searchInput, { color: colors.text, fontFamily }]}
                          />
                        </View>
                      )}
                      <ScrollView style={{ maxHeight: 340 }}>
                        {filtered.map((opt) => {
                          const isDefaultAny =
                            opt.label === 'Any' ||
                            opt.label === "Doesn't Matter" ||
                            opt.label === 'Any Division';
                          const selected =
                            isDefaultAny
                              ? !draft[cfg.field]
                              : currentVal === opt.label;
                          return (
                            <TouchableOpacity
                              key={opt.label}
                              style={[styles.optionRow, { borderBottomColor: dividerColor }]}
                              onPress={() => {
                                updateDraft((p) => {
                                  const next: MatrimonyMatchesFilter = {
                                    ...p,
                                    [cfg.field]: isDefaultAny ? undefined : opt.label,
                                  };
                                  if (cfg.field === 'baptized') {
                                    next.baptizedOnly = opt.label === 'Yes';
                                  }
                                  return next;
                                });
                                setActivePicker(null);
                              }}
                            >
                              <Text
                                style={[
                                  styles.optionRowText,
                                  {
                                    color: selected ? CORAL_RED : colors.text,
                                    fontWeight: selected ? '800' : '500',
                                    fontFamily,
                                  },
                                ]}
                              >
                                {opt.label}
                              </Text>
                              {selected ? <Check size={18} color={CORAL_RED} /> : null}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </>
                  );
                })()}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  topTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    marginLeft: 10,
  },
  resetText: {
    color: CORAL_RED,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionBanner: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  sectionBannerText: {
    fontSize: 15.5,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
    gap: 12,
  },
  rowLabel: {
    fontSize: 14.5,
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 12.5,
    marginTop: 2,
  },
  rowRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rowValue: {
    fontSize: 14.5,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
  },
  eduValueCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  squareCheck: {
    width: 21,
    height: 21,
    borderRadius: 4,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentWrap: {
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  recentPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  recentPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  recentPillText: {
    fontSize: 13.5,
  },
  footerBar: {
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  footerCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  footerCountText: {
    fontSize: 14,
    textAlign: 'center',
  },
  showMatchesBtn: {
    height: 46,
    borderRadius: 24,
    backgroundColor: CORAL_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resetFooterBtn: {
    flex: 0.9,
    height: 46,
    borderRadius: 24,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetFooterText: {
    fontSize: 15,
    fontWeight: '700',
  },
  showMatchesText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 14,
    maxHeight: '80%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  optionRowText: {
    fontSize: 14.5,
    flex: 1,
    paddingRight: 10,
  },
  dualGridRow: {
    flexDirection: 'row',
    marginVertical: 8,
  },
  dualColTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  dualCell: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  dualCellText: {
    fontSize: 14,
  },
  pickerFooterBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  pickerGhostBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerGhostText: {
    fontSize: 14,
    fontWeight: '700',
  },
  pickerPrimaryBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: 22,
    backgroundColor: CORAL_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
});
