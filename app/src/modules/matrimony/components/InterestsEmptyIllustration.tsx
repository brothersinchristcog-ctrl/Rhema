import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const EMPTY_ILLUSTRATION = require('../../../../assets/matrimony_interests_empty.png');

export default function InterestsEmptyIllustration() {
  return (
    <View style={styles.wrap}>
      <Image source={EMPTY_ILLUSTRATION} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 245,
    height: 175,
  },
});
