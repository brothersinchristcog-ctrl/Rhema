import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Path,
  Circle,
  Defs,
  Rect,
  Mask,
  G,
  RadialGradient as SvgRadialGradient,
  Stop,
} from 'react-native-svg';
import { RHEMA_GLYPHS, RHEMA_MASK_STROKES } from './rhemaStrokes';

export default function SplashScreen({ onFinish }: { onFinish?: () => void }) {
  // Offsets representing how much of each mask stroke is drawn (strokeDashoffset: len -> 0)
  const [offsets, setOffsets] = useState<number[]>(RHEMA_MASK_STROKES.map(s => s.len));
  const [isFinished, setIsFinished] = useState(false);
  const [penNib, setPenNib] = useState<{ x: number; y: number; visible: boolean }>({
    x: RHEMA_MASK_STROKES[0].startPoint.x,
    y: RHEMA_MASK_STROKES[0].startPoint.y,
    visible: true,
  });

  const fadeInAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Subtle overall stage fade in
    Animated.timing(fadeInAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();

    const startTime = Date.now();
    let animFrameId: number;
    let finishTimer: any = null;
    let finishedTriggered = false;

    // Total writing completes at ~2680ms
    const totalWritingTime = 2680;

    const renderFrame = () => {
      const elapsed = Date.now() - startTime;
      const newOffsets: number[] = [];
      let activeX = RHEMA_MASK_STROKES[0].startPoint.x;
      let activeY = RHEMA_MASK_STROKES[0].startPoint.y;
      let isPenVisible = elapsed < totalWritingTime;

      for (let i = 0; i < RHEMA_MASK_STROKES.length; i++) {
        const s = RHEMA_MASK_STROKES[i];
        if (elapsed <= s.start) {
          // Has not started yet
          newOffsets.push(s.len);
        } else if (elapsed >= s.start + s.dur) {
          // Fully drawn
          newOffsets.push(0);
          if (i === RHEMA_MASK_STROKES.length - 1) {
            const last = s.lookup[s.lookup.length - 1];
            activeX = last.x;
            activeY = last.y;
          }
        } else {
          // Currently actively being written
          const linearProgress = (elapsed - s.start) / s.dur;
          // Smooth handwriting easing
          const easeProgress = Math.sin((linearProgress * Math.PI) / 2);
          const currentOffset = s.len * (1 - easeProgress);
          newOffsets.push(currentOffset);

          // Update fountain pen tip position
          const idx = Math.min(
            s.lookup.length - 1,
            Math.max(0, Math.round(easeProgress * (s.lookup.length - 1)))
          );
          activeX = s.lookup[idx].x;
          activeY = s.lookup[idx].y;
        }
      }

      setOffsets(newOffsets);
      setPenNib({
        x: activeX,
        y: activeY,
        visible: isPenVisible,
      });

      if (elapsed < totalWritingTime + 50) {
        animFrameId = requestAnimationFrame(renderFrame);
      } else if (!finishedTriggered) {
        finishedTriggered = true;
        setIsFinished(true);

        // Pause briefly (~400ms) once the bold Ray-Ban styled "Rhema" signature completes
        finishTimer = setTimeout(() => {
          onFinish?.();
        }, 400);
      }
    };

    animFrameId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animFrameId);
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, []);

  const screenWidth = Dimensions.get('window').width;
  const svgWidth = Math.min(screenWidth * 0.90, 480);
  const svgHeight = svgWidth * (200 / 560);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#E5E9DB" />

      {/* Background: Exact mineral sage-ecru gradient sampled from user reference */}
      <LinearGradient
        colors={['#E5E9DB', '#DFE3D6', '#CBD1C4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.centerWrapper, { opacity: fadeInAnim }]}>
        <View style={[styles.canvasBox, { width: svgWidth, height: svgHeight }]}>
          <Svg viewBox="0 0 560 200" width="100%" height="100%">
            <Defs>
              {/* Dynamic mask that progressively reveals the bold Ray-Ban styled letters */}
              <Mask id="raybanWriteMask" maskUnits="userSpaceOnUse" x="0" y="0" width="560" height="200">
                <Rect width="560" height="200" fill="black" />
                {RHEMA_MASK_STROKES.map((stroke, index) => (
                  <Path
                    key={stroke.id}
                    d={stroke.d}
                    fill="none"
                    stroke="white"
                    strokeWidth={28}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={`${stroke.len} ${stroke.len}`}
                    strokeDashoffset={offsets[index]}
                  />
                ))}
              </Mask>

              {/* Golden Pen Nib Glow */}
              <SvgRadialGradient id="nibGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#D4AF37" stopOpacity="0.9" />
                <Stop offset="40%" stopColor="#8E733B" stopOpacity="0.5" />
                <Stop offset="100%" stopColor="#8E733B" stopOpacity="0" />
              </SvgRadialGradient>
            </Defs>

            {/* Rotated group matching iconic upward Ray-Ban logo slant (-9.5 degrees) */}
            <G transform="rotate(-9.5 270 100)">
              {/* Bold Ray-Ban script letters */}
              <G mask={isFinished ? undefined : 'url(#raybanWriteMask)'} fill="#111814">
                {RHEMA_GLYPHS.map((glyph, i) => (
                  <Path key={i} d={glyph.d} />
                ))}
              </G>

              {/* Glowing Fountain Pen Tip / Ink Nib while actively drawing */}
              {penNib.visible && (
                <>
                  <Circle
                    cx={penNib.x}
                    cy={penNib.y}
                    r={9}
                    fill="url(#nibGlow)"
                  />
                  <Circle
                    cx={penNib.x}
                    cy={penNib.y}
                    r={3.8}
                    fill="#8E733B"
                  />
                </>
              )}
            </G>
          </Svg>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E5E9DB',
  },
  centerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  canvasBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
