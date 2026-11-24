import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  StatusBar,
  Image,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { matrimonyApi, resolveMatrimonyEntryRoute } from '../services/matrimonyApi';
import { matrimonyPerf } from '../services/matrimonyPerf';
import { StartRegistrationResponse } from '../types/matrimony';

const SPLASH_IMAGE = require('../../../../assets/matrimony_splash.jpg');
const IMAGE_ASPECT_RATIO = 576 / 1024;
const MIN_SPLASH_MS = 450;

export default function MatrimonySplashScreen({ navigation }: any) {
  const { width: winW, height: winH } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    let active = true;
    const startupTrace = matrimonyPerf.startTrace('matrimony_entry_startup');

    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, MIN_SPLASH_MS));
    const cacheHydration = matrimonyApi.hydrateCacheFromStorage().catch(() => undefined);
    const registrationReq: Promise<StartRegistrationResponse | null> = matrimonyApi
      .startRegistration({ force: true })
      .catch(() => null);

    // Kick off workspace prefetch early if cache already shows an approved profile
    Promise.all([minDelay, cacheHydration]).then(async () => {
      if (!active) return;

      const cached = matrimonyApi.getCachedRegistration();
      const canEnterImmediatelyFromCache = Boolean(
        cached &&
          cached.eligible &&
          cached.profile?.profileStatus === 'approved'
      );

      if (canEnterImmediatelyFromCache && cached) {
        matrimonyApi.prefetchMatrimonyWorkspace().catch(() => undefined);
        const cachedRoute = resolveMatrimonyEntryRoute(cached);
        if (cachedRoute.screen === 'MatrimonyHome') {
          startupTrace.stop(true, { source: 'cache', screen: cachedRoute.screen });
          navigation.replace('MatrimonyMainTabs');
          registrationReq.then((liveRes) => {
            if (!liveRes) return;
            const liveRoute = resolveMatrimonyEntryRoute(liveRes);
            if (liveRoute.screen !== 'MatrimonyHome') {
              matrimonyApi.clearAllCaches();
              navigation.reset({
                index: 0,
                routes: [{ name: liveRoute.screen, params: liveRoute.params }],
              });
            }
          });
          return;
        }
      }

      const res = await registrationReq;
      if (!active) return;
      if (!res) {
        if (cached) {
          const fallbackRoute = resolveMatrimonyEntryRoute(cached);
          const targetScreen =
            fallbackRoute.screen === 'MatrimonyHome' ? 'MatrimonyMainTabs' : fallbackRoute.screen;
          startupTrace.stop(true, { source: 'cache_fallback', screen: fallbackRoute.screen });
          navigation.replace(targetScreen, fallbackRoute.params);
        } else {
          startupTrace.stop(false, { source: 'welcome_fallback' });
          navigation.replace('MatrimonyWelcome');
        }
        return;
      }
      const nextRoute = resolveMatrimonyEntryRoute(res);
      if (nextRoute.screen === 'MatrimonyHome') {
        matrimonyApi.prefetchMatrimonyWorkspace().catch(() => undefined);
      }
      const targetScreen =
        nextRoute.screen === 'MatrimonyHome' ? 'MatrimonyMainTabs' : nextRoute.screen;
      startupTrace.stop(true, { source: 'network', screen: nextRoute.screen });
      navigation.replace(targetScreen, nextRoute.params);
    });

    return () => {
      active = false;
    };
  }, [navigation]);

  const isTallerScreen = winW / winH < IMAGE_ASPECT_RATIO;
  const imgW = isTallerScreen ? winW : winH * IMAGE_ASPECT_RATIO;
  const imgH = isTallerScreen ? winW / IMAGE_ASPECT_RATIO : winH;
  const needsBottomFeather = winH > imgH + 2;

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <Animated.View
        style={[
          styles.imageWrap,
          {
            width: imgW,
            height: imgH,
            opacity: fadeAnim,
          },
        ]}
      >
        <Image
          source={SPLASH_IMAGE}
          style={{ width: imgW, height: imgH }}
          resizeMode="contain"
        />
        {needsBottomFeather ? (
          <LinearGradient
            colors={['rgba(252, 233, 235, 0)', '#FCE9EB']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.bottomFeather}
            pointerEvents="none"
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FCE9EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    position: 'relative',
  },
  bottomFeather: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
  },
});
