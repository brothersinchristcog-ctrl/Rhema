import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image as ImageIcon, User } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MatchPhotoCarouselProps {
  carouselKey: string;
  photos: string[];
  height: number;
  borderRadius?: number;
  initialIndex?: number;
  onPressPhoto?: (index: number) => void;
  onPressCountBadge?: (index: number) => void;
  emptyBackgroundColor?: string;
  emptyTextColor?: string;
  emptyLabel?: string;
  customEmptyContent?: React.ReactNode;
  children?: React.ReactNode;
}

export default function MatchPhotoCarousel({
  carouselKey,
  photos,
  height,
  borderRadius = 0,
  initialIndex = 0,
  onPressPhoto,
  onPressCountBadge,
  emptyBackgroundColor = '#EEF2F6',
  emptyTextColor = '#64748B',
  emptyLabel = 'No Photo Uploaded',
  customEmptyContent,
  children,
}: MatchPhotoCarouselProps) {
  const [containerWidth, setContainerWidth] = useState<number>(SCREEN_WIDTH);
  const [activeIdx, setActiveIdx] = useState<number>(initialIndex);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    const safeIdx = Math.max(0, Math.min(initialIndex, Math.max(0, photos.length - 1)));
    setActiveIdx(safeIdx);
    if (scrollViewRef.current && photos.length > 0 && containerWidth > 0) {
      try {
        scrollViewRef.current.scrollTo({ x: safeIdx * containerWidth, animated: false });
      } catch {
        // Ignore if scroll view not yet mounted
      }
    }
  }, [carouselKey, initialIndex, photos.length, containerWidth]);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerWidth <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    setActiveIdx(Math.max(0, Math.min(idx, Math.max(0, photos.length - 1))));
  };

  return (
    <View
      style={[styles.wrap, { height, borderRadius }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - containerWidth) > 1) {
          setContainerWidth(w);
        }
      }}
    >
      {photos.length > 0 ? (
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={handleMomentumEnd}
        >
          {photos.map((item, index) => (
            <TouchableOpacity
              key={`${carouselKey}-${index}-${item}`}
              activeOpacity={0.95}
              onPress={() => onPressPhoto?.(index)}
              style={{ width: containerWidth, height }}
            >
              <Image
                source={{ uri: item }}
                style={{ width: containerWidth, height }}
                resizeMode="cover"
                fadeDuration={0}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : customEmptyContent ? (
        <View style={{ width: '100%', height }}>{customEmptyContent}</View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => onPressPhoto?.(0)}
          style={[styles.placeholder, { backgroundColor: emptyBackgroundColor, height }]}
        >
          <User size={72} color="#94A3B8" />
          <Text style={[styles.emptyText, { color: emptyTextColor }]}>{emptyLabel}</Text>
        </TouchableOpacity>
      )}

      {/* Subtle pagination dots when member has multiple photos */}
      {photos.length > 1 && (
        <View style={styles.dotsRow} pointerEvents="none">
          {photos.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx === activeIdx ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      )}

      {/* Photo count pill */}
      {photos.length > 0 && (
        <TouchableOpacity
          style={styles.countBadge}
          activeOpacity={0.85}
          onPress={() => (onPressCountBadge || onPressPhoto)?.(activeIdx)}
        >
          <Text style={styles.countText}>
            {photos.length > 1 ? `${activeIdx + 1}/${photos.length}` : '1'}
          </Text>
          <ImageIcon size={13} color="#0F172A" />
        </TouchableOpacity>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  placeholder: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },
  dotActive: {
    width: 18,
    backgroundColor: '#FFFFFF',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  countBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countText: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
