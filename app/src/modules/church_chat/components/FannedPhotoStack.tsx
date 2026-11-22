import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChatMediaAttachment } from '../types/chat';

interface FannedPhotoStackProps {
  media: ChatMediaAttachment[];
  onPressPhoto: (index: number) => void;
  borderColor?: string;
}

export default function FannedPhotoStack({
  media,
  onPressPhoto,
  borderColor = 'rgba(255,255,255,0.2)',
}: FannedPhotoStackProps) {
  if (!media || media.length === 0) return null;

  if (media.length === 1) {
    return (
      <TouchableOpacity onPress={() => onPressPhoto(0)} activeOpacity={0.9}>
        <Image
          source={{ uri: media[0].url }}
          style={[styles.singleImage, { borderColor }]}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  }

  const leftPhoto = media[1];
  const centerPhoto = media[0];
  const rightPhoto = media[2] || media[1];
  const extraCount = media.length > 3 ? media.length - 3 : 0;

  return (
    <View style={styles.stackWrap}>
      {/* Left tilted photo */}
      <TouchableOpacity
        style={[styles.sideCard, styles.leftCard, { borderColor }]}
        onPress={() => onPressPhoto(1)}
        activeOpacity={0.9}
      >
        <Image source={{ uri: leftPhoto.url }} style={styles.cardImg} resizeMode="cover" />
      </TouchableOpacity>

      {/* Right tilted photo */}
      {media.length >= 3 ? (
        <TouchableOpacity
          style={[styles.sideCard, styles.rightCard, { borderColor }]}
          onPress={() => onPressPhoto(2)}
          activeOpacity={0.9}
        >
          <Image source={{ uri: rightPhoto.url }} style={styles.cardImg} resizeMode="cover" />
          {extraCount > 0 ? (
            <View style={styles.extraOverlay}>
              <Text style={styles.extraText}>+{extraCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {/* Center upright foreground photo */}
      <TouchableOpacity
        style={[styles.centerCard, { borderColor }]}
        onPress={() => onPressPhoto(0)}
        activeOpacity={0.92}
      >
        <Image source={{ uri: centerPhoto.url }} style={styles.cardImg} resizeMode="cover" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  singleImage: {
    width: 224,
    height: 184,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#1E293B',
  },
  stackWrap: {
    width: 244,
    height: 152,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 4,
  },
  sideCard: {
    position: 'absolute',
    width: 108,
    height: 120,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: '#1E293B',
  },
  leftCard: {
    left: 6,
    transform: [{ rotate: '-8deg' }],
    zIndex: 1,
  },
  rightCard: {
    right: 6,
    transform: [{ rotate: '8deg' }],
    zIndex: 1,
  },
  centerCard: {
    width: 128,
    height: 138,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    zIndex: 3,
    backgroundColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  cardImg: {
    width: '100%',
    height: '100%',
  },
  extraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});
