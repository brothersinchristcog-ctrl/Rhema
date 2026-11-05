import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Globe, Calendar, Image as ImageIcon, ArrowLeft } from 'lucide-react-native';
import { MemberGalleryStackParamList } from './MemberGalleryNavigator';
import GalleryService, { GalleryAlbum } from '../../services/GalleryService';
import { useTheme } from '../../context/ThemeContext';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../context/LanguageContext';

const { width } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<MemberGalleryStackParamList, 'MemberGalleryDashboard'>;

export default function MemberGalleryDashboard() {
  const navigation = useNavigation<NavigationProp>();
  const { isDark, colors } = useTheme();
  const {
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor: adminBorderColor,
  } = useAdminTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPhotos, setTotalPhotos] = useState(0);

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
      data.forEach((a) => (photoCount += a.photoCount || 0));
      setTotalPhotos(photoCount);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getLatestTime = () => {
    if (albums.length === 0) return '--';
    return t('gallery.recently');
  };

  const renderHeader = () => (
    <View style={styles.headerWrapper}>
      {/* Clean Header: Back Arrow Button + Title Text */}
      <View
        style={[
          styles.headerRow,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8 },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[
            styles.circularBackBtn,
            { backgroundColor: cardSurface, borderColor: adminBorderColor },
          ]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft color={primaryText} size={20} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: primaryText }]} numberOfLines={1}>
          {t('gallery.title') || 'Gallery'}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      {/* Three Stat Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: cardSurface,
                borderColor: adminBorderColor,
              },
            ]}
          >
            <Text style={[styles.statValue, { color: primaryText }]}>{albums.length}</Text>
            <Text style={[styles.statLabel, { color: secondaryText }]}>
              {t('gallery.stats.albums')}
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: cardSurface,
                borderColor: adminBorderColor,
              },
            ]}
          >
            <Text style={[styles.statValue, { color: primaryText }]}>{totalPhotos}</Text>
            <Text style={[styles.statLabel, { color: secondaryText }]}>
              {t('gallery.stats.photos')}
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: cardSurface,
                borderColor: adminBorderColor,
              },
            ]}
          >
            <Text style={[styles.statValue, { color: primaryText }]}>{getLatestTime()}</Text>
            <Text style={[styles.statLabel, { color: secondaryText }]}>
              {t('gallery.stats.latest')}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: primaryText }]}>
            {t('gallery.churchAlbums')}
          </Text>
          <Text style={[styles.sectionDesc, { color: secondaryText }]}>
            {t('gallery.churchAlbumsSub')}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderAlbum = ({ item }: { item: GalleryAlbum }) => (
    <TouchableOpacity
      style={[
        styles.albumCard,
        {
          backgroundColor: cardSurface,
          borderColor: adminBorderColor,
        },
      ]}
      activeOpacity={0.9}
      onPress={() =>
        navigation.navigate('MemberGalleryAlbumDetail', {
          albumId: item.id,
          albumName: item.name,
          albumDescription: item.description,
        })
      }
    >
      <View style={styles.albumImageContainer}>
        {item.coverPhotoUrl ? (
          <Image source={{ uri: item.coverPhotoUrl }} style={styles.albumCover} />
        ) : (
          <View
            style={[
              styles.albumCover,
              {
                backgroundColor: secondarySurface,
                justifyContent: 'center',
                alignItems: 'center',
              },
            ]}
          >
            <ImageIcon color={secondaryText} size={40} />
          </View>
        )}

        {/* Visibility Badge */}
        <View style={styles.visibilityBadge}>
          <Globe size={12} color="#fff" style={{ marginRight: 4 }} />
          <Text style={styles.visibilityText}>
            {item.visibility === 'Public' || !item.visibility
              ? t('gallery.public')
              : item.visibility}
          </Text>
        </View>

        <View style={styles.albumTitleOverlay}>
          <Text style={styles.albumTitle}>{item.name}</Text>
        </View>
      </View>

      <View style={styles.albumDetails}>
        <View style={{ flex: 1 }}>
          <View style={styles.detailRow}>
            <Calendar size={14} color={secondaryText} />
            <Text style={[styles.detailText, { color: secondaryText }]}>
              {item.createdAt?.toDate
                ? item.createdAt
                    .toDate()
                    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : item.date || t('gallery.noDate')}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <ImageIcon size={14} color={secondaryText} />
            <Text style={[styles.detailText, { color: secondaryText }]}>
              {item.photoCount || 0} {t('gallery.photosCount')}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={screenBg}
      />
      {loading && albums.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={primaryText} />
        </View>
      ) : (
        <FlatList
          data={albums}
          keyExtractor={(item) => item.id}
          renderItem={renderAlbum}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !loading ? (
              <View style={{ alignItems: 'center', marginTop: 40 }}>
                <ImageIcon size={48} color={secondaryText} style={{ marginBottom: 12 }} />
                <Text style={{ color: primaryText, fontSize: 16, fontWeight: '600' }}>
                  {t('gallery.empty.noAlbums')}
                </Text>
                <Text
                  style={{
                    color: secondaryText,
                    fontSize: 14,
                    textAlign: 'center',
                    marginTop: 8,
                    paddingHorizontal: 40,
                  }}
                >
                  {t('gallery.empty.noAlbumsSub')}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = createAdminThemedStyles({
  container: {
    flex: 1,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  circularBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitleText: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    paddingHorizontal: 12,
  },
  headerRightSpacer: {
    width: 42,
    height: 42,
  },
  statsContainer: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  statCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flex: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  sectionDesc: {
    fontSize: 14,
    marginTop: 4,
    marginRight: 10,
  },
  albumCard: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    marginHorizontal: 15,
  },
  albumImageContainer: {
    width: '100%',
    height: 220,
    position: 'relative',
  },
  albumCover: {
    width: '100%',
    height: '100%',
  },
  visibilityBadge: {
    position: 'absolute',
    top: 15,
    left: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  visibilityText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  albumTitleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  albumTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  albumDetails: {
    flexDirection: 'row',
    padding: 15,
    alignItems: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    marginLeft: 8,
  },
});
