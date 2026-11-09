import React from 'react';
import { View, Text } from 'react-native';
import { colors, radius, typography } from '../theme/Theme';
import { useTheme } from '../context/ThemeContext';
import { TransportMode } from '../types/event';

export type RouteStop = {
  label: string;
  sublabel: string;
  isHome?: boolean;
};

export type RouteLeg = {
  distKm: number;
  minutes: number;
  mode: TransportMode;
};

const DOT_SIZE = 12;
const LINE_WIDTH = 2;

export const RouteChain = ({ stops, legs }: { stops: RouteStop[]; legs: RouteLeg[] }) => {
  const { isDark } = useTheme();

  return (
    <View>
      {stops.map((stop, i) => (
        <View key={i}>
          {/* Stop row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            {/* Dot + vertical line column */}
            <View style={{ alignItems: 'center', width: DOT_SIZE }}>
              <View style={{
                width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2,
                backgroundColor: stop.isHome 
                  ? (isDark ? '#B9C8BD' : '#315C50') 
                  : (isDark ? '#4ADE80' : '#16A34A'),
                marginTop: 4,
              }} />
              {/* Draw line below except last stop */}
              {i < stops.length - 1 && (
                <View style={{ width: LINE_WIDTH, flex: 1, minHeight: 36,
                               backgroundColor: isDark ? '#3F3F46' : '#E2E8F0', marginTop: 3 }} />
              )}
            </View>
            {/* Stop text */}
            <View style={{ flex: 1, paddingBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A' }}>{stop.label}</Text>
              <Text style={{ fontSize: 12, color: isDark ? '#A1A1AA' : '#64748B', marginTop: 2 }}>{stop.sublabel}</Text>
              {/* Leg badge — shown below each stop except the last */}
              {legs[i] && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                               backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderRadius: radius.sm,
                               borderWidth: 1, borderColor: isDark ? '#3F3F46' : '#E2E8F0',
                               alignSelf: 'flex-start', paddingHorizontal: 8,
                               paddingVertical: 3, marginTop: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A' }}>
                    {legs[i].distKm.toFixed(1)} km
                  </Text>
                  <Text style={{ fontSize: 11, color: isDark ? '#A1A1AA' : '#64748B' }}>
                    · {legs[i].minutes >= 60 ? `${Math.round(legs[i].minutes / 60 * 10) / 10} hours` : `${legs[i].minutes} mins`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
};

export default RouteChain;
