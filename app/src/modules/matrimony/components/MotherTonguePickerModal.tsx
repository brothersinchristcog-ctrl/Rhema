import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Search, Check, X } from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';

const ORANGE = '#EA580C';
const ORANGE_LIGHT = '#FFF7ED';

export const MOTHER_TONGUES = [
  'Telugu',
  'Tamil',
  'Hindi',
  'English',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Punjabi',
  'Odia',
  'Assamese',
  'Urdu',
  'Konkani',
  'Tulu',
  'Manipuri (Meitei)',
  'Nepali',
  'Sindhi',
  'Kashmiri',
  'Maithili',
  'Santali',
  'Dogri',
  'Bodo',
  'Bhojpuri',
  'Rajasthani',
  'Chhattisgarhi',
  'Haryanvi',
  'Marwari',
  'Mizo',
  'Khasi',
  'Garo',
  'Naga',
  'Sinhala',
  'Arabic',
  'Spanish',
  'French',
  'Portuguese',
  'German',
  'Mandarin Chinese',
  'Korean',
  'Japanese',
  'Tagalog',
  'Swahili',
  'Other',
];

interface MotherTonguePickerModalProps {
  visible: boolean;
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export default function MotherTonguePickerModal({
  visible,
  selectedValue,
  onSelect,
  onClose,
}: MotherTonguePickerModalProps) {
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLanguages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return MOTHER_TONGUES;
    return MOTHER_TONGUES.filter((lang) => lang.toLowerCase().includes(q));
  }, [searchQuery]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text, fontFamily, fontSize: scaleFont(17) }]}>
              Select Mother Tongue
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                borderColor: colors.border,
              },
            ]}
          >
            <Search size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text, fontFamily, fontSize: scaleFont(14) }]}
              placeholder="Search mother tongue..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <FlatList
            data={filteredLanguages}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = selectedValue === item;
              return (
                <TouchableOpacity
                  style={[
                    styles.langRow,
                    { borderBottomColor: colors.border },
                    isSelected && {
                      backgroundColor: isDark ? 'rgba(234, 88, 12, 0.16)' : ORANGE_LIGHT,
                    },
                  ]}
                  onPress={() => {
                    onSelect(item);
                    setSearchQuery('');
                    onClose();
                  }}
                >
                  <Text
                    style={{
                      color: isSelected ? ORANGE : colors.text,
                      fontWeight: isSelected ? '700' : '500',
                      fontFamily,
                      fontSize: scaleFont(15),
                    }}
                  >
                    {item}
                  </Text>
                  {isSelected && <Check size={18} color={ORANGE} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.textSecondary, fontFamily }]}>
                No matching language found.
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '78%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: { fontWeight: '800' },
  modalCloseBtn: { padding: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 14,
  },
});
