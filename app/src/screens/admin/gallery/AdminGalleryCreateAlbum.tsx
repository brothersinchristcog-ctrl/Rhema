import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, DeviceEventEmitter, Platform, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { X, UploadCloud, ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGalleryStackParamList } from './AdminGalleryNavigator';
import GalleryService from '../../../services/GalleryService';
import { useAdminTheme, createAdminThemedStyles } from '../../../utils/adminThemeHelper';

type NavigationProp = NativeStackNavigationProp<AdminGalleryStackParamList, 'AdminGalleryCreateAlbum'>;

export default function AdminGalleryCreateAlbum() {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUri, setCoverUri] = useState('');
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      alert('Please enter an album name.');
      return;
    }

    try {
      setLoading(true);
      await GalleryService.createAlbum({
        name,
        description,
        visibility: 'Public', // Could add a toggle later if needed
      }, coverUri);
      
      DeviceEventEmitter.emit('GALLERY_ALBUM_CREATED');
      navigation.goBack();
    } catch (error) {
      console.error(error);
      alert('Failed to create album.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={barStyle} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />
      <View style={[
        styles.header,
        {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
          paddingTop: Platform.OS === 'ios' ? Math.max(insets.top, 20) : 10,
          paddingBottom: 12,
          paddingHorizontal: 16,
        }
      ]}>
        <TouchableOpacity 
          style={styles.closeBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={22} color={primaryText} strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>Create Album</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: secondaryText }]}>ALBUM NAME</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
              color: primaryText,
            }]}
            placeholder="e.g. Christmas Eve Service"
            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: secondaryText }]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.textArea, {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
              color: primaryText,
            }]}
            placeholder="A short note about this album..."
            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: secondaryText }]}>COVER PHOTO</Text>
          <TouchableOpacity 
            style={[styles.uploadArea, {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
            }]} 
            onPress={pickImage}
          >
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverPreview} />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <View style={[styles.uploadIconContainer, { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }]}>
                  <UploadCloud size={24} color={isDark ? '#000000' : '#FFFFFF'} />
                </View>
                <Text style={[styles.uploadMainText, { color: primaryText }]}>Tap to select image</Text>
                <Text style={[styles.uploadSubText, { color: secondaryText }]}>JPG, PNG up to 20MB</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.footer, {
        backgroundColor: isDark ? '#000000' : '#FFFFFF',
        borderTopColor: isDark ? 'rgba(255, 255, 255, 0.10)' : '#E2E8F0',
        paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 20) + 24,
      }]}>
        <TouchableOpacity 
          style={[styles.submitBtn, { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }, (!name.trim() || loading) && { opacity: 0.5 }]} 
          disabled={!name.trim() || loading}
          onPress={handleCreate}
        >
          {loading ? (
            <ActivityIndicator color={isDark ? '#000000' : '#FFFFFF'} />
          ) : (
            <Text style={[styles.submitBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Create Album</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 22,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '500',
  },
  textArea: {
    height: 110,
    paddingTop: 14,
  },
  uploadArea: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 18,
    height: 180,
    overflow: 'hidden',
  },
  uploadPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  uploadIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadMainText: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  uploadSubText: {
    fontSize: 13,
  },
  coverPreview: {
    width: '100%',
    height: '100%',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 44 : 20,
    borderTopWidth: 1.5,
  },
  submitBtn: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
}));
