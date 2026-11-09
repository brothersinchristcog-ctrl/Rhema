import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform } from 'react-native';
import { ChevronLeft, ChevronRight, Eye, Image as ImageIcon, Book , ArrowLeft } from 'lucide-react-native';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';

export default function AdminCelebrationsPersonalize({ 
  member, 
  category, 
  selectedThemeId,
  selectedVerse,
  greetingMessage,
  onMessageChange,
  titleOverlay,
  onTitleOverlayChange,
  nameOverlay,
  onNameOverlayChange,
  layout,
  onLayoutChange,
  photoUri,
  onBack, 
  onChooseTheme,
  onChoosePhoto,
  onChooseVerse,
  onPreview
}: { 
  member: any, 
  category: string, 
  selectedThemeId?: string | null,
  selectedVerse?: {ref: string, text: string} | null,
  greetingMessage: string,
  onMessageChange: (msg: string) => void,
  titleOverlay: string,
  onTitleOverlayChange: (title: string) => void,
  nameOverlay: string,
  onNameOverlayChange: (name: string) => void,
  layout: 'theme' | 'photo',
  onLayoutChange: (layout: 'theme' | 'photo') => void,
  photoUri?: string | null,
  onBack: () => void, 
  onChooseTheme?: () => void,
  onChoosePhoto?: () => void,
  onChooseVerse?: () => void,
  onPreview?: () => void
}) {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  // Overlays are now hoisted to parent state

  const getOrdinal = (n: number) => {
    if (!n || n <= 0) return '';
    const s = ["th", "st", "nd", "rd"],
          v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // Initialize default message if empty
  React.useEffect(() => {
    if (!greetingMessage && member?.name && category) {
      const name = member.name.split(' ')[0];
      
      if (category === 'Wedding Anniversary') {
        onMessageChange(`Dear ${name}, wishing you a joyful Wedding Anniversary! May God continue to bless your marriage with love, peace, and happiness.`);
      } else if (category === 'Baptism Anniversary') {
        onMessageChange(`Dear ${name}, happy Baptism Anniversary! May you continue to grow in faith and walk in God's grace.`);
      } else {
        onMessageChange(`Dear ${name}, wishing you a joy-filled birthday surrounded by God's love and grace. May this new year of life be your best yet!`);
      }
    }
  }, [member, category]);

  return (
    <View style={styles.container}>
            {/* ── Fixed Header ── */}
      <View style={[
        styles.header,
        {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? '#27272A' : '#CBD5E1',
          paddingBottom: 14,
          paddingTop: 12,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }
      ]}>
        <TouchableOpacity 
          style={[
            styles.circularBackBtn,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : '#CBD5E1',
              borderWidth: 1.5,
            }
          ]} 
          onPress={onBack} 
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: 'center' }]}>Personalize</Text>
          <Text style={[styles.headerSub, { color: isDark ? '#A1A1AA' : '#64748B', textAlign: 'center' }]}>PREPARE WISH</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Intro */}
        <Text style={[styles.sectionTitle, { color: isDark ? '#B9C8BD' : '#315C50' }]}>PERSONALIZE THE GREETING</Text>
        <Text style={[styles.forText, { color: isDark ? '#B9C8BD' : '#315C50' }]}>
          for <Text style={[styles.forName, { color: isDark ? '#B9C8BD' : '#315C50' }]}>{member?.name}</Text>
        </Text>

        {/* Layout Toggle */}
        <Text style={[styles.sectionTitle, { marginTop: 32, marginBottom: 12, color: isDark ? '#C6A66B' : '#98713D' }]}>CARD LAYOUT</Text>
        <View style={[
          styles.toggleContainer,
          {
            backgroundColor: isDark ? '#18181B' : '#F1F5F9',
            borderColor: isDark ? '#27272A' : '#CBD5E1',
            borderWidth: 1.5,
          }
        ]}>
          <TouchableOpacity 
            style={[
              styles.toggleBtn, 
              layout === 'theme' ? {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
              } : {
                backgroundColor: 'transparent',
              }
            ]}
            onPress={() => onLayoutChange('theme')}
            activeOpacity={0.75}
          >
            <Text 
              style={[
                styles.toggleTxt, 
                layout === 'theme' ? {
                  color: isDark ? '#000000' : '#FFFFFF',
                  fontWeight: '700',
                } : {
                  color: isDark ? '#A1A1AA' : '#64748B',
                  fontWeight: '600',
                }
              ]}
            >
              Theme & Circle Photo
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.toggleBtn, 
              layout === 'photo' ? {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
              } : {
                backgroundColor: 'transparent',
              }
            ]}
            onPress={() => onLayoutChange('photo')}
            activeOpacity={0.75}
          >
            <Text 
              style={[
                styles.toggleTxt, 
                layout === 'photo' ? {
                  color: isDark ? '#000000' : '#FFFFFF',
                  fontWeight: '700',
                } : {
                  color: isDark ? '#A1A1AA' : '#64748B',
                  fontWeight: '600',
                }
              ]}
            >
              Only Photo
            </Text>
          </TouchableOpacity>
        </View>

        {/* Options */}
        {layout === 'theme' && (
          <TouchableOpacity style={styles.optionCard} onPress={onChooseTheme}>
            <View style={styles.optionIconBox}>
              <Eye size={20} color="#B88A2E" />
            </View>
            <View style={styles.optionTextCol}>
              <Text style={styles.optionTitle}>Choose Theme</Text>
              <Text style={styles.optionDesc}>{selectedThemeId ? (selectedThemeId.startsWith('custom_') ? 'Custom Theme' : selectedThemeId) : 'Select a greeting style'}</Text>
            </View>
            <ChevronRight size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.optionCard} onPress={onChoosePhoto}>
          <View style={styles.optionIconBox}>
            <ImageIcon size={20} color="#B88A2E" />
          </View>
          <View style={styles.optionTextCol}>
            <Text style={styles.optionTitle}>Photo</Text>
            <Text style={styles.optionDesc}>{photoUri ? 'Custom photo selected' : "Use member's profile picture"}</Text>
          </View>
          <ChevronRight size={20} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionCard} onPress={onChooseVerse}>
          <View style={styles.optionIconBox}>
            <Book size={20} color="#B88A2E" />
          </View>
          <View style={styles.optionTextCol}>
            <Text style={styles.optionTitle}>Bible Verse</Text>
            <Text style={styles.optionDesc}>{selectedVerse ? selectedVerse.ref : 'Select a verse'}</Text>
          </View>
          <ChevronRight size={20} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Overlays */}
        <Text style={[styles.sectionTitle, { marginTop: 32, color: isDark ? '#F2F0E8' : '#202923' }]}>CARD OVERLAYS (Optional)</Text>

        <Text style={styles.label}>Title Overlay</Text>
        <TextInput 
          style={styles.input}
          value={titleOverlay}
          onChangeText={onTitleOverlayChange}
          placeholder="e.g. Birthday"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Name Overlay</Text>
        <TextInput 
          style={styles.input}
          value={nameOverlay}
          onChangeText={onNameOverlayChange}
          placeholder="e.g. John Doe"
          placeholderTextColor="#9CA3AF"
        />

        {/* Greeting Message */}
        <Text style={[styles.sectionTitle, { marginTop: 32, color: isDark ? '#D99A8C' : '#9F4A3E' }]}>GREETING MESSAGE</Text>
        <TextInput 
          style={[styles.input, styles.textArea]}
          value={greetingMessage}
          onChangeText={onMessageChange}
          placeholder="Write your personalized greeting here..."
          placeholderTextColor="#9CA3AF"
          multiline
          textAlignVertical="top"
        />

        {/* Action Button */}
        <TouchableOpacity 
          style={[
            styles.primaryBtn,
            {
              backgroundColor: isDark ? '#FFFFFF' : '#000000',
              borderColor: isDark ? '#FFFFFF' : '#000000',
              borderWidth: 1,
              shadowColor: isDark ? '#FFFFFF' : '#000000',
              marginBottom: 40,
            }
          ]} 
          onPress={onPreview}
          activeOpacity={0.8}
        >
          <Eye size={20} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 8 }} />
          <Text style={[styles.primaryBtnTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>Preview Greeting</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FAF8F0',
  },
    header: { 
    backgroundColor: 'transparent', 
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
    
    
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
    zIndex: 10,
  },
  backBtn: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 2 },
  backBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  heroTitles: { flex: 1, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)', paddingLeft: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1a2d5a' },
  headerSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  
  content: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 60,
  },
  sectionTitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  forText: {
    color: '#64748B',
    fontSize: 14,
  },
  forName: {
    color: '#111827',
    fontWeight: '700',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#162057',
  },
  toggleTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  toggleTxtActive: {
    color: '#FFFFFF',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  optionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3E4B6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionTextCol: {
    flex: 1,
  },
  optionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  optionDesc: {
    color: '#64748B',
    fontSize: 13,
  },
  label: {
    color: '#162057',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
    marginBottom: 24,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAC259',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#EAC259',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnTxt: {
    color: '#162057',
    fontSize: 16,
    fontWeight: '700',
  }
}));
