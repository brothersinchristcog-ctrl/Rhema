import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  ImagePlus,
  User,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import { matrimonyApi } from '../services/matrimonyApi';

const ORANGE = '#E25B12';
const GREEN_BADGE = '#15803D';
const MAX_GALLERY_PHOTOS = 2;
const MAX_TOTAL_PHOTOS = 1 + MAX_GALLERY_PHOTOS;

export default function MatrimonyMyPhotosScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [primaryPhotoUri, setPrimaryPhotoUri] = useState<string | null>(null);
  const [primaryStoragePath, setPrimaryStoragePath] = useState<string | null>(null);
  const [galleryUris, setGalleryUris] = useState<string[]>([]);
  const [galleryPaths, setGalleryPaths] = useState<string[]>([]);
  const [pickerSheetTarget, setPickerSheetTarget] = useState<'primary' | 'secondary' | null>(null);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await matrimonyApi.startRegistration({ force: true });
      setPrimaryPhotoUri(res.profile?.signedProfilePhoto || null);
      setPrimaryStoragePath(res.profile?.profilePhoto || null);
      setGalleryUris((res.profile?.signedGallery || []).slice(0, MAX_GALLERY_PHOTOS));
      setGalleryPaths((res.profile?.gallery || []).slice(0, MAX_GALLERY_PHOTOS));
    } catch (err) {
      console.warn('MatrimonyMyPhotos load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const totalPhotos = (primaryPhotoUri ? 1 : 0) + galleryUris.length;
  const remainingSlots = Math.max(0, MAX_TOTAL_PHOTOS - totalPhotos);

  const openAddPicker = () => {
    if (remainingSlots === 0 && primaryPhotoUri) {
      Alert.alert('Limit Reached', `You can upload up to ${MAX_TOTAL_PHOTOS} photos.`);
      return;
    }
    setPickerSheetTarget(primaryPhotoUri ? 'secondary' : 'primary');
  };

  const handleSourceSelect = async (source: 'camera' | 'gallery') => {
    const target = pickerSheetTarget;
    setPickerSheetTarget(null);
    if (!user?.uid || !target) return;

    const isPrimary = target === 'primary';
    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const camPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (!camPerm.granted) {
        Alert.alert('Permission Needed', 'Please allow camera access to take a photo.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.55,
        base64: true,
      });
    } else {
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libPerm.granted) {
        Alert.alert('Permission Needed', 'Please allow photo library access to choose a photo.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.55,
        base64: true,
      });
    }

    const asset = result.assets?.[0];
    if (result.canceled || (!asset?.base64 && !asset?.uri)) return;
    const localUri = asset.uri;

    setUploading(true);
    try {
      const { storagePath, signedUrl } = await matrimonyApi.uploadMatrimonyPhoto(
        asset.base64 || '',
        asset.mimeType || 'image/jpeg',
        isPrimary,
        localUri
      );
      if (isPrimary) {
        const nextPrimaryUri = signedUrl || localUri;
        setPrimaryPhotoUri(nextPrimaryUri);
        setPrimaryStoragePath(storagePath);
        await matrimonyApi.saveDraft('photos', {
          profilePhoto: storagePath,
          gallery: galleryPaths,
        });
        matrimonyApi.patchCachedRegistration((prev) => ({
          ...prev,
          profile: prev.profile
            ? {
                ...prev.profile,
                profilePhoto: storagePath,
                signedProfilePhoto: nextPrimaryUri,
                gallery: galleryPaths,
                signedGallery: galleryUris,
              }
            : prev.profile,
        }));
      } else {
        const nextUris = [...galleryUris, signedUrl || localUri].slice(0, MAX_GALLERY_PHOTOS);
        const nextPaths = [...galleryPaths, storagePath].slice(0, MAX_GALLERY_PHOTOS);
        setGalleryUris(nextUris);
        setGalleryPaths(nextPaths);
        await matrimonyApi.saveDraft('photos', {
          profilePhoto: primaryStoragePath || undefined,
          gallery: nextPaths,
        });
        matrimonyApi.patchCachedRegistration((prev) => ({
          ...prev,
          profile: prev.profile
            ? {
                ...prev.profile,
                gallery: nextPaths,
                signedGallery: nextUris,
              }
            : prev.profile,
        }));
      }
    } catch (err: any) {
      Alert.alert('Photo Not Accepted', err?.message || 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveSecondary = (index: number) => {
    Alert.alert('Remove Photo', 'Remove this photo from your Matrimony gallery?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const prevUris = galleryUris;
          const prevPaths = galleryPaths;
          const nextUris = galleryUris.filter((_, i) => i !== index);
          const nextPaths = galleryPaths.filter((_, i) => i !== index);
          setGalleryUris(nextUris);
          setGalleryPaths(nextPaths);
          try {
            await matrimonyApi.saveDraft('photos', {
              profilePhoto: primaryStoragePath || undefined,
              gallery: nextPaths,
            });
            matrimonyApi.patchCachedRegistration((prev) => ({
              ...prev,
              profile: prev.profile
                ? {
                    ...prev.profile,
                    gallery: nextPaths,
                    signedGallery: nextUris,
                  }
                : prev.profile,
            }));
          } catch (err: any) {
            setGalleryUris(prevUris);
            setGalleryPaths(prevPaths);
            Alert.alert('Update Failed', err?.message || 'Could not remove photo.');
          }
        },
      },
    ]);
  };

  const handleSecondaryTap = (index: number) => {
    Alert.alert('Manage Photo', 'Choose an action for this photo', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Set as Profile Picture',
        onPress: async () => {
          const selectedUri = galleryUris[index];
          const selectedPath = galleryPaths[index];
          if (!selectedPath) return;

          const prevPrimaryUri = primaryPhotoUri;
          const prevPrimaryPath = primaryStoragePath;
          const prevGalleryUris = galleryUris;
          const prevGalleryPaths = galleryPaths;

          const nextGalleryUris = galleryUris.filter((_, i) => i !== index);
          const nextGalleryPaths = galleryPaths.filter((_, i) => i !== index);
          if (prevPrimaryUri && prevPrimaryPath) {
            nextGalleryUris.splice(index, 0, prevPrimaryUri);
            nextGalleryPaths.splice(index, 0, prevPrimaryPath);
          }

          setPrimaryPhotoUri(selectedUri);
          setPrimaryStoragePath(selectedPath);
          setGalleryUris(nextGalleryUris);
          setGalleryPaths(nextGalleryPaths);

          try {
            await matrimonyApi.saveDraft('photos', {
              profilePhoto: selectedPath,
              gallery: nextGalleryPaths,
            });
            matrimonyApi.patchCachedRegistration((prev) => ({
              ...prev,
              profile: prev.profile
                ? {
                    ...prev.profile,
                    profilePhoto: selectedPath,
                    signedProfilePhoto: selectedUri,
                    gallery: nextGalleryPaths,
                    signedGallery: nextGalleryUris,
                  }
                : prev.profile,
            }));
          } catch (err: any) {
            setPrimaryPhotoUri(prevPrimaryUri);
            setPrimaryStoragePath(prevPrimaryPath);
            setGalleryUris(prevGalleryUris);
            setGalleryPaths(prevGalleryPaths);
            Alert.alert('Update Failed', err?.message || 'Could not update profile picture.');
          }
        },
      },
      {
        text: 'Remove Photo',
        style: 'destructive',
        onPress: () => handleRemoveSecondary(index),
      },
    ]);
  };

  const renderAddCard = (compact = false) => (
    <TouchableOpacity
      style={[
        compact ? styles.addTileCompact : styles.addTileSide,
        {
          borderColor: isDark ? '#475569' : '#CBD5E1',
          backgroundColor: colors.surface,
        },
      ]}
      onPress={openAddPicker}
      disabled={uploading}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.addSilhouetteBox,
          { backgroundColor: isDark ? '#1E293B' : '#EAECEF' },
        ]}
      >
        <User size={compact ? 30 : 42} color={isDark ? '#64748B' : '#CBD5E1'} />
      </View>
      <View style={styles.addLabelRow}>
        <ImagePlus size={14} color={colors.text} />
        <Text style={[styles.addLabelText, { color: colors.text, fontFamily }]}>Add</Text>
      </View>
    </TouchableOpacity>
  );

  const topSecondary = galleryUris.slice(0, 2);
  const extraSecondary = galleryUris.slice(2);
  const showAddInTopColumn = topSecondary.length < 2 && remainingSlots > 0;
  const showAddInExtraGrid = topSecondary.length >= 2 && remainingSlots > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(19) }]}>
          My Photo ({totalPhotos})
        </Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Row: Large Profile Picture + Side Add / Secondary Thumbnails */}
          <View style={styles.topGridRow}>
            {primaryPhotoUri ? (
              <TouchableOpacity
                style={styles.primaryPhotoCard}
                onPress={() => setPickerSheetTarget('primary')}
                disabled={uploading}
                activeOpacity={0.9}
              >
                <Image source={{ uri: primaryPhotoUri }} style={styles.primaryPhotoImg} />
                <View style={styles.primaryBadge}>
                  <Text style={[styles.primaryBadgeText, { fontFamily }]}>Profile Picture</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.emptyPrimaryCard,
                  {
                    borderColor: isDark ? '#475569' : '#CBD5E1',
                    backgroundColor: colors.surface,
                  },
                ]}
                onPress={() => setPickerSheetTarget('primary')}
                disabled={uploading}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.emptyPrimaryAvatar,
                    { backgroundColor: isDark ? '#1E293B' : '#EAECEF' },
                  ]}
                >
                  <User size={56} color={isDark ? '#64748B' : '#CBD5E1'} />
                </View>
                <View style={styles.addLabelRow}>
                  <ImagePlus size={16} color={colors.text} />
                  <Text style={[styles.emptyPrimaryLabel, { color: colors.text, fontFamily }]}>
                    Add Profile Picture
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.sideCol}>
              {topSecondary.map((uri, idx) => (
                <TouchableOpacity
                  key={`${uri}-${idx}`}
                  style={styles.sideThumbCard}
                  onPress={() => handleSecondaryTap(idx)}
                  activeOpacity={0.88}
                >
                  <Image source={{ uri }} style={styles.thumbImg} />
                  <TouchableOpacity
                    style={styles.removeChip}
                    onPress={() => handleRemoveSecondary(idx)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <X size={12} color="#FFFFFF" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
              {showAddInTopColumn ? renderAddCard(false) : null}
            </View>
          </View>

          {/* Additional Gallery Photos Row */}
          {(extraSecondary.length > 0 || showAddInExtraGrid) && (
            <View style={styles.extraGrid}>
              {extraSecondary.map((uri, idx) => {
                const actualIdx = idx + 2;
                return (
                  <TouchableOpacity
                    key={`${uri}-${actualIdx}`}
                    style={styles.extraThumbCard}
                    onPress={() => handleSecondaryTap(actualIdx)}
                    activeOpacity={0.88}
                  >
                    <Image source={{ uri }} style={styles.thumbImg} />
                    <TouchableOpacity
                      style={styles.removeChip}
                      onPress={() => handleRemoveSecondary(actualIdx)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <X size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
              {showAddInExtraGrid ? renderAddCard(true) : null}
            </View>
          )}
        </ScrollView>
      )}

      {/* Bottom Orange Action Button */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.bg,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.bottomBtn,
            (uploading || (Boolean(primaryPhotoUri) && remainingSlots === 0)) && { opacity: 0.6 },
          ]}
          onPress={openAddPicker}
          disabled={uploading || (Boolean(primaryPhotoUri) && remainingSlots === 0)}
          activeOpacity={0.9}
        >
          {uploading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <ImagePlus size={18} color="#FFFFFF" />
              <Text style={[styles.bottomBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
                {!primaryPhotoUri
                  ? 'Upload profile photo'
                  : remainingSlots > 0
                  ? `Add ${remainingSlots} more photo${remainingSlots === 1 ? '' : 's'}`
                  : `All ${MAX_TOTAL_PHOTOS} photos added`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Photo Source Picker Sheet (Camera / Gallery) */}
      <Modal
        visible={Boolean(pickerSheetTarget)}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerSheetTarget(null)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setPickerSheetTarget(null)}
          />
          <View
            style={[
              styles.sheetCard,
              {
                backgroundColor: colors.surface,
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: colors.text, fontFamily, fontSize: scaleFont(17) }]}>
              {pickerSheetTarget === 'primary' ? 'Update Profile Picture' : 'Add Photo'}
            </Text>

            <TouchableOpacity
              style={[styles.sheetOption, { borderColor: colors.border }]}
              onPress={() => handleSourceSelect('camera')}
            >
              <Camera size={20} color={ORANGE} />
              <Text style={[styles.sheetOptionText, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
                Take Photo with Camera
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetOption, { borderColor: colors.border }]}
              onPress={() => handleSourceSelect('gallery')}
            >
              <ImageIcon size={20} color={ORANGE} />
              <Text style={[styles.sheetOptionText, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
                Choose from Photo Gallery
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setPickerSheetTarget(null)}
            >
              <Text style={[styles.sheetCancelText, { color: colors.textSecondary, fontFamily }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontWeight: '700',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 24,
    gap: 14,
  },
  topGridRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  primaryPhotoCard: {
    flex: 1.85,
    height: 222,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  primaryPhotoImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  primaryBadge: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    backgroundColor: GREEN_BADGE,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopRightRadius: 10,
  },
  primaryBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  emptyPrimaryCard: {
    flex: 1.85,
    height: 222,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: 8,
  },
  emptyPrimaryAvatar: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPrimaryLabel: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  sideCol: {
    flex: 1,
    gap: 10,
  },
  sideThumbCard: {
    width: '100%',
    height: 106,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeChip: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTileSide: {
    width: '100%',
    height: 106,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 4,
    justifyContent: 'space-between',
  },
  addTileCompact: {
    width: '31%',
    height: 106,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 4,
    justifyContent: 'space-between',
  },
  addSilhouetteBox: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  addLabelText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  extraGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  extraThumbCard: {
    width: '31%',
    height: 106,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  bottomBtn: {
    backgroundColor: ORANGE,
    borderRadius: 26,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bottomBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 12,
  },
  sheetTitle: {
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  sheetOptionText: { fontWeight: '700' },
  sheetCancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  sheetCancelText: { fontSize: 14, fontWeight: '700' },
});
