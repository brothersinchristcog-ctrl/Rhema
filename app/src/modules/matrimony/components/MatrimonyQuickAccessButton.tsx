import React from 'react';
import { TouchableOpacity, Text, Image, View, StyleSheet } from 'react-native';

interface MatrimonyQuickAccessButtonProps {
  onPress: () => void;
}

export default function MatrimonyQuickAccessButton({ onPress }: MatrimonyQuickAccessButtonProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.iconWrap}>
        <Image
          source={require('../../../../assets/gallery_3d_wedding_rings.png')}
          style={styles.icon}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        Rhema Matrimony
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1E6DF',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FDF6F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  icon: {
    width: 32,
    height: 32,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0B1938',
    textAlign: 'center',
  },
});
