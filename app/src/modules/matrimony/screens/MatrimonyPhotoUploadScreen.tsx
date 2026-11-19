import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Lock,
  Trash2,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import { matrimonyApi } from '../services/matrimonyApi';
import { StartRegistrationResponse } from '../types/matrimony';

const ORANGE = '#EA580C';

const AVOID_PHOTO_CARDS = [
  {
    key: 'unclear',
    label: 'Unclear or blur\nphotos',
    source: require('../../../../assets/matrimony_avoid_unclear.jpg'),
  },
  {
    key: 'group',
    label: 'Group photos',
    source: require('../../../../assets/matrimony_avoid_group.jpg'),
  },
  {
    key: 'side',
    label: 'Side-facing\nphotos',
    source: require('../../../../assets/matrimony_avoid_side.jpg'),
  },
];

export default function MatrimonyPhotoUploadScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;

  const [primaryPhotoUri, setPrimaryPhotoUri] = useState<string | null>(
    initialData?.profile?.signedProfilePhoto || null
  );
  const [primaryStoragePath, setPrimaryStoragePath] = useState<string | null>(
    initialData?.profile?.profilePhoto || null
  );
  const [galleryUris, setGalleryUris] = useState<string[]>(
    initialData?.profile?.signedGallery || []
  );
  const [galleryPaths, setGalleryPaths] = useState<string[]>(
    initialData?.profile?.gallery || []
  );
  const [uploading, setUploading] = useState(false);
  const [pickerSheetTarget, setPickerSheetTarget] = useState<'primary' | 'secondary' | null>(null);
  const [avoidHighlight, setAvoidHighlight] = useState<'unclear' | 'group' | 'side' | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const classifyAvoidCategory = (err: any): 'unclear' | 'group' | 'side' | null => {
    const cat = String(err?.details?.reasonCategory || '').toLowerCase();
    if (cat === 'unclear' || cat === 'group' || cat === 'side') return cat;
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('group photo')) return 'group';
    if (msg.includes('blur') || msg.includes('unclear') || msg.includes('dark')) return 'unclear';
    if (
      msg.includes('side') ||
      msg.includes('front-facing') ||
      msg.includes('face clearly') ||
      msg.includes('face is clearly visible')
    ) {
      return 'side';
    }
    return null;
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
        setAvoidHighlight(null);
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
        const nextUris = [...galleryUris, signedUrl || localUri].slice(0, 2);
        const nextPaths = [...galleryPaths, storagePath].slice(0, 2);
        setGalleryUris(nextUris);
        setGalleryPaths(nextPaths);
        setAvoidHighlight(null);
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
      const msg = err?.message || 'Could not upload photo.';
      const cat = classifyAvoidCategory(err);
      setAvoidHighlight(cat);
      if (cat) {
        setTimeout(() => scrollRef.current?.scrollTo({ y: 120, animated: true }), 120);
      } else {
        Alert.alert('Photo Not Accepted', msg);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePrimaryPhoto = async () => {
    setPrimaryPhotoUri(null);
    setPrimaryStoragePath(null);
    try {
      await matrimonyApi.saveDraft('photos', {
        profilePhoto: null,
        gallery: galleryPaths,
      });
      matrimonyApi.patchCachedRegistration((prev) => ({
        ...prev,
        profile: prev.profile
          ? {
              ...prev.profile,
              profilePhoto: null,
              signedProfilePhoto: null,
              gallery: galleryPaths,
              signedGallery: galleryUris,
            }
          : prev.profile,
      }));
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not remove photo.');
    }
  };

  const handleRemoveGalleryPhoto = async (index: number) => {
    const nextUris = galleryUris.filter((_, idx) => idx !== index);
    const nextPaths = galleryPaths.filter((_, idx) => idx !== index);
    setGalleryUris(nextUris);
    setGalleryPaths(nextPaths);
    try {
      await matrimonyApi.saveDraft('photos', {
        profilePhoto: primaryStoragePath || null,
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
      Alert.alert('Update Failed', err?.message || 'Could not remove photo.');
    }
  };

  const goToInterests = () => {
    navigation.navigate('MatrimonyInterests', { initialData });
  };

  const renderAvoidGuidelinesCard = () => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: avoidHighlight ? '#FCA5A5' : colors.border,
        },
      ]}
    >
      <Text style={[styles.avoidHeader, { fontFamily, fontSize: scaleFont(15) }]}>
        Photos to avoid in profile photo
      </Text>
      <View style={styles.avoidRow}>
        {AVOID_PHOTO_CARDS.map((card) => {
          const isHighlighted = avoidHighlight === card.key;
          return (
            <View
              key={card.key}
              style={[
                styles.avoidItem,
                isHighlighted && [
                  styles.avoidItemHighlighted,
                  { backgroundColor: isDark ? 'rgba(220, 38, 38, 0.18)' : '#FEF2F2' },
                ],
              ]}
            >
              <View
                style={[
                  styles.avoidThumb,
                  { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
                  isHighlighted && styles.avoidThumbHighlighted,
                ]}
              >
                <Image source={card.source} style={styles.avoidThumbImage} resizeMode="cover" />
              </View>
              <Text
                style={[
                  styles.avoidLabel,
                  {
                    color: isHighlighted ? '#DC2626' : colors.textSecondary,
                    fontWeight: isHighlighted ? '800' : '600',
                    fontFamily,
                  },
                ]}
              >
                {card.label}
              </Text>
              {isHighlighted ? (
                <View style={styles.detectedPill}>
                  <Text style={styles.detectedPillText}>Detected</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!primaryPhotoUri ? (
          /* STATE A: No primary photo uploaded yet */
          <>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.text, fontFamily, fontSize: scaleFont(22) }]}>
                Upload your profile photo
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13.5) }]}>
                Profiles with photos get up to <Text style={{ fontWeight: '800', color: colors.text }}>10 times</Text> more responses
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.goodHeader, { fontFamily, fontSize: scaleFont(15) }]}>
                Photos you can upload
              </Text>
              <TouchableOpacity
                style={[styles.goodPreviewBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                onPress={() => setPickerSheetTarget('primary')}
                activeOpacity={0.8}
              >
                <Camera size={40} color="#15803D" />
                <View style={styles.checkBadge}>
                  <Check size={14} color="#FFFFFF" strokeWidth={3} />
                </View>
              </TouchableOpacity>
              <Text style={[styles.captionBold, { color: colors.text, fontFamily, fontSize: scaleFont(14) }]}>
                Clear front-facing solo photo
              </Text>
            </View>

            {renderAvoidGuidelinesCard()}

            <View style={styles.privacyRow}>
              <Lock size={14} color={colors.textSecondary} />
              <Text style={[styles.privacyText, { color: colors.textSecondary, fontFamily }]}>
                <Text style={{ fontWeight: '800', color: colors.text }}>100%</Text> Privacy and you control who can view your photo
              </Text>
            </View>
          </>
        ) : (
          /* STATE B: Primary photo uploaded -> add more photos */
          <>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.text, fontFamily, fontSize: scaleFont(22) }]}>
                Add up to 3 photos to get more responses
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13.5) }]}>
                More photos help matches know you better
              </Text>
            </View>

            {avoidHighlight ? renderAvoidGuidelinesCard() : null}

            <View style={styles.photoGridRow}>
              <TouchableOpacity
                style={styles.mainPhotoWrap}
                activeOpacity={0.85}
                disabled={uploading}
                onPress={() => setPickerSheetTarget('primary')}
              >
                <Image source={{ uri: primaryPhotoUri }} style={styles.mainPhoto} resizeMode="cover" />
                {uploading ? (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.uploadingOverlayText}>Verifying...</Text>
                  </View>
                ) : null}
                <View style={styles.primaryTag}>
                  <Text style={styles.primaryTagText}>Profile Picture</Text>
                </View>
                <TouchableOpacity
                  style={styles.removePrimaryBadge}
                  onPress={handleRemovePrimaryPhoto}
                  disabled={uploading}
                  activeOpacity={0.85}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Trash2 size={14} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.changePhotoBadge}>
                  <Camera size={12} color="#FFFFFF" />
                  <Text style={styles.changePhotoText}>Change</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.sideSlotsCol}>
                {galleryUris.slice(0, 2).map((uri, i) => (
                  <View key={`${uri}_${i}`} style={styles.smallThumbWrap}>
                    <Image source={{ uri }} style={styles.smallThumb} />
                    <TouchableOpacity
                      style={styles.removeSmallBadge}
                      onPress={() => handleRemoveGalleryPhoto(i)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <X size={12} color="#FFFFFF" strokeWidth={2.8} />
                    </TouchableOpacity>
                  </View>
                ))}
                {galleryUris.length < 2 && (
                  <TouchableOpacity
                    style={[
                      styles.addSlotBox,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isDark ? '#475569' : '#CBD5E1',
                      },
                    ]}
                    onPress={() => setPickerSheetTarget('secondary')}
                    disabled={uploading}
                  >
                    <Camera size={22} color={colors.textSecondary} />
                    <Text style={[styles.addSlotText, { color: colors.text, fontFamily }]}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {galleryUris.length > 2 && (
              <View style={styles.extraGalleryRow}>
                {galleryUris.slice(2).map((uri, idx) => {
                  const actualIdx = idx + 2;
                  return (
                    <View key={`${uri}_${actualIdx}`} style={styles.extraThumbWrap}>
                      <Image source={{ uri }} style={styles.smallThumb} />
                      <TouchableOpacity
                        style={styles.removeSmallBadge}
                        onPress={() => handleRemoveGalleryPhoto(actualIdx)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <X size={12} color="#FFFFFF" strokeWidth={2.8} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.goodHeader, { fontFamily, fontSize: scaleFont(14) }]}>
                Photos that can be added as secondary photo
              </Text>
              <View style={styles.avoidRow}>
                {[
                  { title: 'Clear full size photos', sub: 'Helps matches see your face clearly' },
                  { title: 'Family photos', sub: 'Helps matches know your family better' },
                  { title: 'Lifestyle photos', sub: 'Shows your interests & lifestyle' },
                ].map((item) => (
                  <View key={item.title} style={styles.avoidItem}>
                    <View style={[styles.secondaryIconBox, { backgroundColor: isDark ? '#1E293B' : '#ECFDF5' }]}>
                      <Check size={16} color="#15803D" strokeWidth={3} />
                    </View>
                    <Text style={[styles.secondaryTitle, { color: colors.text, fontFamily }]}>
                      {item.title}
                    </Text>
                    <Text style={[styles.secondarySub, { color: colors.textSecondary, fontFamily }]}>
                      {item.sub}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <View
        style={[
          styles.bottomFooter,
          {
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          },
        ]}
      >
        {primaryPhotoUri ? (
          <>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={goToInterests}
              disabled={uploading}
              activeOpacity={0.9}
            >
              <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
                Continue to Hobbies & Interests
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.laterBtn}
              onPress={() => setPickerSheetTarget('secondary')}
              disabled={uploading}
              activeOpacity={0.7}
            >
              <Text style={[styles.laterText, { fontFamily, fontSize: scaleFont(14) }]}>
                Add more photos
              </Text>
              <ChevronRight size={16} color={ORANGE} />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setPickerSheetTarget('primary')}
            disabled={uploading}
            activeOpacity={0.9}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
                Upload profile photo
              </Text>
            )}
          </TouchableOpacity>
        )}
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
              Upload Photo
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
  content: { padding: 18, paddingTop: 22, paddingBottom: 28, gap: 16 },
  titleBlock: { alignItems: 'center', gap: 6, marginBottom: 4 },
  title: { fontWeight: '800', textAlign: 'center' },
  subtitle: { textAlign: 'center', lineHeight: 20 },
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  goodHeader: { fontWeight: '800', color: '#15803D', textAlign: 'center' },
  avoidHeader: { fontWeight: '800', color: '#B91C1C', textAlign: 'center' },
  goodPreviewBox: {
    width: 112,
    height: 112,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionBold: { fontWeight: '700', textAlign: 'center' },
  avoidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  avoidItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  avoidThumb: {
    width: '100%',
    height: 66,
    borderRadius: 10,
    overflow: 'hidden',
  },
  avoidThumbImage: {
    width: '100%',
    height: '100%',
  },
  avoidLabel: { fontSize: 11.5, textAlign: 'center', lineHeight: 15, fontWeight: '600' },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  privacyText: { fontSize: 12.5, textAlign: 'center' },
  photoGridRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  mainPhotoWrap: {
    flex: 2,
    aspectRatio: 0.85,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  mainPhoto: { width: '100%', height: '100%' },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  uploadingOverlayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  changePhotoBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  changePhotoText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  removePrimaryBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(220, 38, 38, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#15803D',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  primaryTagText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  sideSlotsCol: { flex: 1, gap: 10 },
  smallThumbWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  smallThumb: { width: '100%', height: '100%', borderRadius: 12 },
  removeSmallBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraGalleryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  extraThumbWrap: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  avoidItemHighlighted: {
    borderWidth: 2,
    borderColor: '#DC2626',
    borderRadius: 12,
    padding: 4,
  },
  avoidThumbHighlighted: {
    borderWidth: 1.5,
    borderColor: '#DC2626',
  },
  detectedPill: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  detectedPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  addSlotBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addSlotText: { fontSize: 12, fontWeight: '700' },
  secondaryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryTitle: { fontSize: 11.5, fontWeight: '800', textAlign: 'center' },
  secondarySub: { fontSize: 10.5, textAlign: 'center', lineHeight: 14 },
  bottomFooter: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: ORANGE,
    borderRadius: 22,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800' },
  laterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 4,
  },
  laterText: { color: ORANGE, fontWeight: '700' },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  sheetTitle: { fontWeight: '800', marginBottom: 4 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetOptionText: { fontWeight: '700' },
  sheetCancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sheetCancelText: { fontSize: 14, fontWeight: '700' },
});
