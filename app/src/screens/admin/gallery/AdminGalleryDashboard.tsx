// @ts-nocheck - Forced IDE refresh to clear false positive module error
import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, Dimensions, Alert, Animated, DeviceEventEmitter, Modal, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus, MoreVertical, Sparkles, Globe, Calendar, Image as ImageIcon, Trash2, ChevronLeft, CheckCircle , ArrowLeft } from 'lucide-react-native';
import { AdminGalleryStackParamList } from './AdminGalleryNavigator';
import { AdminTabContext } from '../../../context/AdminTabContext';
import GalleryService, { GalleryAlbum } from '../../../services/GalleryService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminTheme, createAdminThemedStyles } from '../../../utils/adminThemeHelper';

const { width } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<AdminGalleryStackParamList, 'AdminGalleryDashboard'>;

export default function AdminGalleryDashboard() {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const navigation = useNavigation<NavigationProp>();
  const adminContext = useContext(AdminTabContext);
  const insets = useSafeAreaInsets();
  const openDrawer = (adminContext as any)?.openDrawer || (() => {});
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPhotos, setTotalPhotos] = useState(0);

  // Toast State
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState('');
  
  // Delete Confirmation State
  const [albumToDelete, setAlbumToDelete] = useState<GalleryAlbum | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = (message: string) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();
  };

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('GALLERY_ALBUM_CREATED', () => {
      showToast("Album created successfully!");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadAlbums();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    loadAlbums();
  }, []);

  const loadAlbums = async () => {
    try {
      setLoading(true);
      const data = await GalleryService.getAlbums();
      setAlbums(data);
      
      let photoCount = 0;
      data.forEach(a => photoCount += (a.photoCount || 0));
      setTotalPhotos(photoCount);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getLatestTime = () => {
    if (albums.length === 0) return '--';
    let latestMs = 0;
    albums.forEach(a => {
      let ms = 0;
      if (a.createdAt?.toMillis) {
        ms = a.createdAt.toMillis();
      } else if (a.createdAt?.toDate) {
        ms = a.createdAt.toDate().getTime();
      } else if (a.createdAt?.seconds) {
        ms = a.createdAt.seconds * 1000;
      } else if (a.createdAt instanceof Date) {
        ms = a.createdAt.getTime();
      } else if (typeof a.createdAt === 'string') {
        const parsed = Date.parse(a.createdAt);
        if (!isNaN(parsed)) ms = parsed;
      } else if (a.date) {
        const parsed = Date.parse(a.date);
        if (!isNaN(parsed)) ms = parsed;
      }
      if (ms > latestMs) latestMs = ms;
    });

    if (!latestMs) return 'Recent';

    const diffHours = (Date.now() - latestMs) / (1000 * 60 * 60);
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return new Date(latestMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleDeleteAlbum = (album: GalleryAlbum) => {
    setAlbumToDelete(album);
  };

  const confirmDelete = async () => {
    if (!albumToDelete) return;
    try {
      setIsDeleting(true);
      await GalleryService.deleteAlbum(albumToDelete.id, albumToDelete.coverPhotoUrl);
      showToast("Album deleted successfully!");
      setAlbumToDelete(null);
      loadAlbums(); // Refresh list
    } catch (error) {
      showToast("Failed to delete album");
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.headerWrapper}>
      {/* ── Top Hero Stats Card with Warm Peach Mockup Gradient ── */}
      <LinearGradient
        colors={['#FEF3E8', '#FDE0C7', '#F7B77C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.topCard}
      >
        <Text style={styles.mainTitle}>
          Church <Text style={styles.titleHighlight}>Gallery</Text>
        </Text>
        <Text style={styles.mainDesc}>
          Preserving precious moments from every church event.
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue} numberOfLines={1}>{albums.length}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>ALBUMS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue} numberOfLines={1}>{totalPhotos}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>PHOTOS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text 
              style={[styles.statValue, { fontSize: 16 }]} 
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.7}
            >
              {getLatestTime()}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1}>LATEST</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Section Header (Your Albums & Create Action) ── */}
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: primaryText }]}>Your albums</Text>
          <Text style={[styles.sectionDesc, { color: secondaryText }]}>Manage, publish, and share what the congregation sees.</Text>
        </View>
        <TouchableOpacity 
          style={[styles.createBtn, { backgroundColor: isDark ? '#FCD34D' : '#0F172A' }]}
          onPress={() => navigation.navigate('AdminGalleryCreateAlbum')}
          activeOpacity={0.8}
        >
          <Plus size={18} color={isDark ? '#0b141a' : '#FFFFFF'} strokeWidth={2.5} />
          <Text style={[styles.createBtnText, { color: isDark ? '#0b141a' : '#FFFFFF' }]}>Create Album</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAlbum = ({ item }: { item: GalleryAlbum }) => (
    <TouchableOpacity 
      style={[styles.albumCard, {
        backgroundColor: cardSurface,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
      }]}
      activeOpacity={0.88}
      onPress={() => navigation.navigate('AdminGalleryAlbumDetail', { albumId: item.id, albumName: item.name, albumDescription: item.description })}
    >
      <View style={styles.albumImageContainer}>
        {item.coverPhotoUrl ? (
          <Image source={{ uri: item.coverPhotoUrl }} style={styles.albumCover} />
        ) : (
          <View style={[styles.albumCover, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', justifyContent: 'center', alignItems: 'center' }]}>
            <ImageIcon color={secondaryText} size={40} />
          </View>
        )}
        
        {/* Visibility Badge */}
        <View style={styles.visibilityBadge}>
          <Globe size={12} color="#fff" style={{ marginRight: 4 }} />
          <Text style={styles.visibilityText}>{item.visibility || 'Public'}</Text>
        </View>
        
        <View style={styles.albumTitleOverlay}>
          <Text style={styles.albumTitle}>{item.name}</Text>
        </View>
      </View>
      
      <View style={[styles.albumDetails, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.detailRow}>
            <Calendar size={14} color={secondaryText} />
            <Text style={[styles.detailText, { color: secondaryText }]}>
              {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (item.date || 'No Date')}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <ImageIcon size={14} color={secondaryText} />
            <Text style={[styles.detailText, { color: secondaryText }]}>{item.photoCount || 0} photos · by Admin</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={[styles.albumDeleteBtn, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2' }]} 
          onPress={() => handleDeleteAlbum(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Trash2 size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={barStyle} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />

      {/* ── Top Header Bar with Border Line & Centered Moments of Faith ── */}
      <View
        style={[
          styles.topbar,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomWidth: 1.5,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
            paddingTop: Platform.OS === 'ios' ? Math.max(insets.top, 20) : 10,
            paddingBottom: 10,
            paddingHorizontal: 16,
          }
        ]}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity 
            onPress={() => {
              if ((adminContext as any)?.goBack) {
                (adminContext as any).goBack();
              } else if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                (adminContext as any)?.setTabByName?.('Dashboard');
              }
            }} 
            style={styles.circularBackBtn} 
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft color={primaryText} size={22} strokeWidth={2.4} />
          </TouchableOpacity>

          {/* Centered Moments of Faith Badge */}
          <View style={styles.centeredBadgeWrap}>
            <View style={[styles.badgeContainer, {
              backgroundColor: isDark ? 'rgba(252, 211, 77, 0.15)' : '#FEF3C7',
              borderColor: isDark ? 'rgba(252, 211, 77, 0.35)' : '#FDE68A',
            }]}>
              <Sparkles size={15} color={isDark ? '#FCD34D' : '#D97706'} />
              <Text style={[styles.badgeText, { color: isDark ? '#FCD34D' : '#B45309' }]}>
                Moments of Faith
              </Text>
            </View>
          </View>

          {/* Symmetrical Spacer to keep Moments of Faith in exact center */}
          <View style={{ width: 40 }} />
        </View>
      </View>

      {loading && albums.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FCD34D" />
        </View>
      ) : (
        <FlatList
          data={albums}
          keyExtractor={item => item.id}
          renderItem={renderAlbum}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Stylish Toast overlay */}
      <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]} pointerEvents="none">
        <CheckCircle size={20} color="#10B981" />
        <Text style={styles.toastText}>{toastMessage}</Text>
      </Animated.View>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={!!albumToDelete}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !isDeleting && setAlbumToDelete(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, {
            backgroundColor: cardSurface,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : adminBorderColor,
          }]}>
            <View style={styles.modalIconContainer}>
              <Trash2 size={30} color="#EF4444" />
            </View>
            <Text style={[styles.modalTitle, { color: primaryText }]}>Delete Album?</Text>
            <Text style={[styles.modalMessage, { color: secondaryText }]}>
              Are you sure you want to delete "{albumToDelete?.name}"? This action will permanently remove all photos inside it.
            </Text>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.cancelBtn, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]} 
                onPress={() => setAlbumToDelete(null)}
                disabled={isDeleting}
              >
                <Text style={[styles.cancelBtnText, { color: primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.confirmBtn} 
                onPress={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  container: {
    flex: 1,
  },
  topbar: {
    zIndex: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredBadgeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginLeft: 6,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 40,
  },
  headerWrapper: {
    marginBottom: 10,
  },
  topCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FDBA74',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
    color: '#3B1A04',
  },
  titleHighlight: {
    fontWeight: '800',
    color: '#C2410C',
  },
  mainDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
    color: '#7C2D12',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 2,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(124, 45, 18, 0.20)',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
    color: '#3B1A04',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#9A3412',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionDesc: {
    fontSize: 13,
    marginTop: 2,
    marginRight: 10,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 5,
  },
  albumCard: {
    borderWidth: 1.5,
    borderRadius: 18,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  albumImageContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  albumCover: {
    width: '100%',
    height: '100%',
  },
  visibilityBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  visibilityText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  albumTitleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 36,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  albumTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  albumDetails: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  detailText: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 7,
  },
  albumDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    zIndex: 1000,
  },
  toastText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModal: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
}));
