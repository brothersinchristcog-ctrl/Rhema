import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
  Circle,
  Ellipse,
  Path,
  G,
} from 'react-native-svg';

interface GoldCoin3DProps {
  size?: number;
  style?: any;
}

export default function GoldCoin3D({ size = 34, style }: GoldCoin3DProps) {
  // viewBox is 40x40. We preserve aspect ratio and scale via width/height.
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Defs>
          {/* Soft ambient drop shadow underneath coin */}
          <RadialGradient id="coinDropShadow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#000000" stopOpacity="0.65" />
            <Stop offset="60%" stopColor="#000000" stopOpacity="0.30" />
            <Stop offset="100%" stopColor="#000000" stopOpacity="0.0" />
          </RadialGradient>

          {/* 3D coin edge / cylinder rim */}
          <SvgLinearGradient id="coinCylinderGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#5A3705" />
            <Stop offset="25%" stopColor="#8A5A12" />
            <Stop offset="50%" stopColor="#D4A028" />
            <Stop offset="75%" stopColor="#8A5A12" />
            <Stop offset="100%" stopColor="#4A2D04" />
          </SvgLinearGradient>

          {/* Outer rim reflective gradient */}
          <SvgLinearGradient id="coinRimGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#FFF9D2" />
            <Stop offset="25%" stopColor="#F5D061" />
            <Stop offset="55%" stopColor="#D49A24" />
            <Stop offset="85%" stopColor="#8A580F" />
            <Stop offset="100%" stopColor="#5A3505" />
          </SvgLinearGradient>

          {/* Reverse beveled groove for 3D depth */}
          <SvgLinearGradient id="coinBevelGrad" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0%" stopColor="#FFEBA3" />
            <Stop offset="30%" stopColor="#C98B1C" />
            <Stop offset="70%" stopColor="#784908" />
            <Stop offset="100%" stopColor="#422502" />
          </SvgLinearGradient>

          {/* Sunken inner coin face */}
          <SvgLinearGradient id="coinFaceGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#E5B238" />
            <Stop offset="40%" stopColor="#FCE082" />
            <Stop offset="75%" stopColor="#C98B1C" />
            <Stop offset="100%" stopColor="#8A550C" />
          </SvgLinearGradient>

          {/* Embossed cross insignia gradient */}
          <SvgLinearGradient id="coinCrossGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#FFFFFF" />
            <Stop offset="40%" stopColor="#FFF2B2" />
            <Stop offset="80%" stopColor="#E5B238" />
            <Stop offset="100%" stopColor="#99600E" />
          </SvgLinearGradient>
        </Defs>

        {/* 1. Realistic Drop Shadow */}
        <Ellipse cx="20" cy="35.5" rx="15" ry="3.8" fill="url(#coinDropShadow)" />
        <Ellipse cx="20" cy="35" rx="11" ry="2.5" fill="rgba(0, 0, 0, 0.45)" />

        {/* 2. 3D Coin Extrusion / Thickness (Lower Rim) */}
        <Path
          d="M 5,17.5 A 15,15 0 0,0 35,17.5 L 35,20.5 A 15,15 0 0,1 5,20.5 Z"
          fill="url(#coinCylinderGrad)"
        />
        <Circle cx="20" cy="20.5" r="14.8" fill="#5A3705" opacity="0.3" />

        {/* 3. Coin Main Face (Top Surface) */}
        <Circle cx="20" cy="17" r="15" fill="url(#coinRimGrad)" />

        {/* 4. Beveled Inner Ridge */}
        <Circle cx="20" cy="17" r="13" fill="url(#coinBevelGrad)" />

        {/* 5. Recessed Inner Face */}
        <Circle cx="20" cy="17" r="11.6" fill="url(#coinFaceGrad)" />

        {/* 6. Stippled / Beaded Security Ring */}
        <Circle
          cx="20"
          cy="17"
          r="9.6"
          stroke="#FFEFA8"
          strokeWidth="0.85"
          strokeDasharray="1.4, 1.4"
          fill="none"
          opacity="0.75"
        />

        {/* 7. Embossed Church Cross Insignia */}
        {/* Debossed Shadow */}
        <Path
          d="M 19,10.5 L 21,10.5 L 21,14.5 L 24.5,14.5 L 24.5,16.5 L 21,16.5 L 21,24 L 19,24 L 19,16.5 L 15.5,16.5 L 15.5,14.5 L 19,14.5 Z"
          fill="#4A2D04"
          opacity="0.55"
        />
        {/* Raised Embossed Face */}
        <Path
          d="M 18.5,9.8 L 20.5,9.8 L 20.5,13.8 L 24,13.8 L 24,15.8 L 20.5,15.8 L 20.5,23.3 L 18.5,23.3 L 18.5,15.8 L 15,15.8 L 15,13.8 L 18.5,13.8 Z"
          fill="url(#coinCrossGrad)"
        />

        {/* 8. Specular Rim Highlight (3D curved gloss reflection) */}
        <Path
          d="M 8.5,13.5 C 10.5,8.5 14.5,5.2 20.5,5.2 C 24.5,5.2 28,6.8 30.5,9 C 27.5,7.2 24,6.4 20,6.4 C 14.5,6.4 10.5,8.8 8.5,13.5 Z"
          fill="#FFFFFF"
          opacity="0.60"
        />

        {/* 9. Brilliant Glint Sparkle */}
        <Circle cx="11" cy="9" r="1.2" fill="#FFFFFF" opacity="0.95" />
        <Circle cx="11" cy="9" r="2.2" fill="#FFFBE6" opacity="0.4" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

