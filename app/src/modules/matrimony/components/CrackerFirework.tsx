import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface CrackerFireworkProps {
  side: 'left' | 'right';
  delayMs?: number;
  top?: number;
}

interface ThinRaySpec {
  angle: number;
  innerLen: number;
  gapLen?: number;
  outerLen?: number;
  dist: number;
  thickness: number;
  color: string;
}

// Delicate, dot-free hairline firework rays inspired by traditional cracker bursts
const FULL_BURST_RAYS: ThinRaySpec[] = [
  { angle: 0, innerLen: 14, dist: 21, thickness: 1.1, color: '#EA580C' },
  { angle: 15, innerLen: 8, gapLen: 3, outerLen: 8, dist: 19, thickness: 0.9, color: '#16A34A' },
  { angle: 30, innerLen: 16, dist: 23, thickness: 1.1, color: '#F59E0B' },
  { angle: 46, innerLen: 11, dist: 17, thickness: 0.9, color: '#0D9488' },
  { angle: 61, innerLen: 9, gapLen: 3, outerLen: 9, dist: 22, thickness: 1.1, color: '#F97316' },
  { angle: 76, innerLen: 13, dist: 18, thickness: 0.9, color: '#10B981' },
  { angle: 92, innerLen: 15, dist: 22, thickness: 1.1, color: '#EA580C' },
  { angle: 107, innerLen: 8, gapLen: 3, outerLen: 7, dist: 17, thickness: 0.9, color: '#D97706' },
  { angle: 122, innerLen: 16, dist: 23, thickness: 1.1, color: '#16A34A' },
  { angle: 138, innerLen: 11, dist: 17, thickness: 0.9, color: '#F97316' },
  { angle: 153, innerLen: 9, gapLen: 3, outerLen: 8, dist: 21, thickness: 1.05, color: '#0D9488' },
  { angle: 168, innerLen: 13, dist: 18, thickness: 0.9, color: '#F59E0B' },
  { angle: 184, innerLen: 15, dist: 22, thickness: 1.1, color: '#16A34A' },
  { angle: 199, innerLen: 8, gapLen: 3, outerLen: 8, dist: 18, thickness: 0.9, color: '#EA580C' },
  { angle: 214, innerLen: 16, dist: 23, thickness: 1.1, color: '#F59E0B' },
  { angle: 230, innerLen: 11, dist: 17, thickness: 0.9, color: '#10B981' },
  { angle: 245, innerLen: 9, gapLen: 3, outerLen: 9, dist: 22, thickness: 1.05, color: '#F97316' },
  { angle: 260, innerLen: 13, dist: 18, thickness: 0.9, color: '#0D9488' },
  { angle: 276, innerLen: 15, dist: 22, thickness: 1.1, color: '#EA580C' },
  { angle: 291, innerLen: 8, gapLen: 3, outerLen: 8, dist: 18, thickness: 0.9, color: '#16A34A' },
  { angle: 306, innerLen: 16, dist: 23, thickness: 1.1, color: '#D97706' },
  { angle: 321, innerLen: 11, dist: 17, thickness: 0.9, color: '#F97316' },
  { angle: 336, innerLen: 9, gapLen: 3, outerLen: 9, dist: 21, thickness: 1.05, color: '#10B981' },
  { angle: 349, innerLen: 13, dist: 18, thickness: 0.9, color: '#F59E0B' },
];

const EDGE_SPREAD_RAYS: ThinRaySpec[] = [
  { angle: 4, innerLen: 18, dist: 29, thickness: 1.15, color: '#16A34A' },
  { angle: 18, innerLen: 11, gapLen: 4, outerLen: 10, dist: 25, thickness: 0.95, color: '#F97316' },
  { angle: 33, innerLen: 20, dist: 31, thickness: 1.15, color: '#F59E0B' },
  { angle: 48, innerLen: 14, dist: 24, thickness: 0.95, color: '#0D9488' },
  { angle: 63, innerLen: 11, gapLen: 4, outerLen: 11, dist: 30, thickness: 1.1, color: '#EA580C' },
  { angle: 78, innerLen: 16, dist: 25, thickness: 0.95, color: '#10B981' },
  { angle: 94, innerLen: 19, dist: 30, thickness: 1.15, color: '#F97316' },
  { angle: 110, innerLen: 11, gapLen: 4, outerLen: 9, dist: 24, thickness: 0.95, color: '#D97706' },
  { angle: 126, innerLen: 18, dist: 29, thickness: 1.1, color: '#16A34A' },
  { angle: 144, innerLen: 14, dist: 23, thickness: 0.95, color: '#EA580C' },
  { angle: 162, innerLen: 17, dist: 27, thickness: 1.05, color: '#0D9488' },
  { angle: 180, innerLen: 19, dist: 29, thickness: 1.1, color: '#F59E0B' },
  { angle: 198, innerLen: 12, gapLen: 4, outerLen: 10, dist: 25, thickness: 0.95, color: '#16A34A' },
  { angle: 215, innerLen: 18, dist: 29, thickness: 1.1, color: '#F97316' },
  { angle: 232, innerLen: 14, dist: 23, thickness: 0.95, color: '#10B981' },
  { angle: 249, innerLen: 11, gapLen: 4, outerLen: 10, dist: 28, thickness: 1.05, color: '#EA580C' },
  { angle: 266, innerLen: 16, dist: 25, thickness: 0.95, color: '#D97706' },
  { angle: 282, innerLen: 19, dist: 30, thickness: 1.15, color: '#16A34A' },
  { angle: 298, innerLen: 11, gapLen: 4, outerLen: 10, dist: 25, thickness: 0.95, color: '#F97316' },
  { angle: 314, innerLen: 20, dist: 31, thickness: 1.15, color: '#0D9488' },
  { angle: 330, innerLen: 14, dist: 24, thickness: 0.95, color: '#F59E0B' },
  { angle: 346, innerLen: 11, gapLen: 4, outerLen: 11, dist: 29, thickness: 1.1, color: '#EA580C' },
];

const CONTAINER_W = 120;
const CONTAINER_H = 160;
const MAIN_CY = 82;
const EDGE_CY = 62;

export default function CrackerFirework({ side, delayMs = 0, top = 0 }: CrackerFireworkProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loopAnim: Animated.CompositeAnimation | null = null;
    progress.setValue(0);

    const startTimer = setTimeout(() => {
      loopAnim = Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loopAnim.start();
    }, delayMs);

    return () => {
      clearTimeout(startTimer);
      if (loopAnim) {
        loopAnim.stop();
      }
    };
  }, [delayMs, progress]);

  const anims = useMemo(() => {
    // Thin incoming rocket line (no dot) traveling to the main blast point
    const rocketTranslateY = progress.interpolate({
      inputRange: [0, 0.06, 0.14, 0.22, 0.26, 1],
      outputRange: [72, 48, 24, 6, 0, 0],
    });
    const rocketScaleY = progress.interpolate({
      inputRange: [0, 0.05, 0.18, 0.26, 1],
      outputRange: [0.35, 1.1, 0.9, 0.15, 0.15],
    });
    const rocketOpacity = progress.interpolate({
      inputRange: [0, 0.03, 0.22, 0.265, 1],
      outputRange: [0, 0.95, 0.95, 0, 0],
    });

    // Primary fully visible burst at rocket arrival point
    const mainGravityY = progress.interpolate({
      inputRange: [0, 0.26, 0.56, 0.82, 1],
      outputRange: [0, 0, 2, 7, 7],
    });
    const mainScaleX = progress.interpolate({
      inputRange: [0, 0.25, 0.32, 0.56, 0.8, 1],
      outputRange: [0.12, 0.12, 1.08, 0.9, 0.45, 0.45],
    });
    const mainOpacity = progress.interpolate({
      inputRange: [0, 0.25, 0.28, 0.58, 0.8, 1],
      outputRange: [0, 0, 0.95, 0.85, 0, 0],
    });

    // Companion half-visible spread blast at the screen edge right next to it
    const edgeGravityY = progress.interpolate({
      inputRange: [0, 0.31, 0.6, 0.86, 1],
      outputRange: [0, 0, 2, 7, 7],
    });
    const edgeScaleX = progress.interpolate({
      inputRange: [0, 0.3, 0.38, 0.62, 0.86, 1],
      outputRange: [0.12, 0.12, 1.08, 0.92, 0.48, 0.48],
    });
    const edgeOpacity = progress.interpolate({
      inputRange: [0, 0.3, 0.34, 0.64, 0.86, 1],
      outputRange: [0, 0, 0.92, 0.82, 0, 0],
    });

    return {
      rocketTranslateY,
      rocketScaleY,
      rocketOpacity,
      mainGravityY,
      mainScaleX,
      mainOpacity,
      edgeGravityY,
      edgeScaleX,
      edgeOpacity,
    };
  }, [progress]);

  const isLeft = side === 'left';
  const mainCx = isLeft ? 48 : CONTAINER_W - 48;
  const edgeCx = isLeft ? 6 : CONTAINER_W - 6;
  const launchAngle = isLeft ? '13deg' : '-13deg';

  const renderRayBurst = (
    rays: ThinRaySpec[],
    cx: number,
    cy: number,
    gravityY: Animated.AnimatedInterpolation<number>,
    scaleX: Animated.AnimatedInterpolation<number>,
    opacity: Animated.AnimatedInterpolation<number>,
    phaseShift: number,
    prefix: string
  ) => (
    <Animated.View
      style={[
        styles.anchor,
        {
          left: cx,
          top: cy,
          transform: [{ translateY: gravityY }],
        },
      ]}
    >
      {rays.map((ray, idx) => {
        const totalW =
          ray.innerLen + (ray.gapLen && ray.outerLen ? ray.gapLen + ray.outerLen : 0);
        const startT = 0.25 + phaseShift;
        const mid1 = startT + 0.07;
        const mid2 = startT + 0.22;
        const mid3 = startT + 0.42;
        const endT = startT + 0.55;

        const translateX = progress.interpolate({
          inputRange: [0, startT, mid1, mid2, mid3, endT, 1],
          outputRange: [0, 0, ray.dist * 0.45, ray.dist * 0.8, ray.dist * 0.97, ray.dist, ray.dist],
        });

        return (
          <View
            key={`${prefix}-${idx}`}
            style={[styles.rayAxis, { transform: [{ rotate: `${ray.angle}deg` }] }]}
          >
            <Animated.View
              style={[
                styles.rayItem,
                {
                  width: totalW,
                  left: -totalW / 2,
                  opacity,
                  transform: [{ translateX }, { scaleX }],
                },
              ]}
            >
              <View
                style={{
                  width: ray.innerLen,
                  height: ray.thickness,
                  borderRadius: ray.thickness / 2,
                  backgroundColor: ray.color,
                }}
              />
              {ray.gapLen && ray.outerLen ? (
                <View
                  style={{
                    width: ray.outerLen,
                    height: ray.thickness,
                    borderRadius: ray.thickness / 2,
                    backgroundColor: ray.color,
                    marginLeft: ray.gapLen,
                  }}
                />
              ) : null}
            </Animated.View>
          </View>
        );
      })}
    </Animated.View>
  );

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        isLeft ? { left: 0, top } : { right: 0, top },
      ]}
    >
      {/* Thin, dot-free incoming cracker line */}
      <View
        style={[
          styles.anchor,
          {
            left: mainCx,
            top: MAIN_CY,
            transform: [{ rotate: launchAngle }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.rocketLineWrap,
            {
              opacity: anims.rocketOpacity,
              transform: [
                { translateY: anims.rocketTranslateY },
                { scaleY: anims.rocketScaleY },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['#F59E0B', '#EA580C', 'rgba(234, 88, 12, 0)']}
            locations={[0, 0.45, 1]}
            style={styles.rocketLine}
          />
        </Animated.View>
      </View>

      {/* Fully visible primary blast right where the rocket line arrives */}
      {renderRayBurst(
        FULL_BURST_RAYS,
        mainCx,
        MAIN_CY,
        anims.mainGravityY,
        anims.mainScaleX,
        anims.mainOpacity,
        0,
        'main'
      )}

      {/* Companion half-visible spread blast at the screen edge next to it */}
      {renderRayBurst(
        EDGE_SPREAD_RAYS,
        edgeCx,
        EDGE_CY,
        anims.edgeGravityY,
        anims.edgeScaleX,
        anims.edgeOpacity,
        0.05,
        'edge'
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: CONTAINER_W,
    height: CONTAINER_H,
  },
  anchor: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  rocketLineWrap: {
    position: 'absolute',
    left: -0.6,
    top: 0,
    width: 1.2,
    height: 24,
  },
  rocketLine: {
    width: 1.2,
    height: 24,
    borderRadius: 1,
  },
  rayAxis: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  },
  rayItem: {
    position: 'absolute',
    top: -1,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
