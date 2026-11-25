import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Audio } from 'expo-av';
import { Pause, Play } from 'lucide-react-native';

interface VoiceMessagePlayerProps {
  uri: string;
  durationMs?: number;
  textColor: string;
  accentColor: string;
  mutedColor: string;
}

const WAVE_BARS = [0.35, 0.7, 0.45, 0.9, 0.6, 0.85, 0.4, 0.75, 0.95, 0.5, 0.65, 0.8, 0.4, 0.6, 0.35];

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export default function VoiceMessagePlayer({
  uri,
  durationMs = 0,
  textColor,
  accentColor,
  mutedColor,
}: VoiceMessagePlayerProps) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [totalMs, setTotalMs] = useState(durationMs);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [uri]);

  const togglePlay = async () => {
    if (!uri) return;
    try {
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await soundRef.current.pauseAsync();
            setPlaying(false);
          } else {
            if (status.positionMillis >= (status.durationMillis || totalMs || 1) - 150) {
              await soundRef.current.setPositionAsync(0);
            }
            await soundRef.current.playAsync();
            setPlaying(true);
          }
          return;
        }
      }

      setLoading(true);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (st) => {
          if (!st.isLoaded) return;
          setPositionMs(st.positionMillis || 0);
          if (st.durationMillis) setTotalMs(st.durationMillis);
          if (st.didJustFinish) {
            setPlaying(false);
            setPositionMs(0);
          }
        }
      );
      soundRef.current = sound;
      setPlaying(true);
    } catch {
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const progressRatio = totalMs > 0 ? Math.min(1, positionMs / totalMs) : 0;
  const activeBars = Math.round(progressRatio * WAVE_BARS.length);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.playBtn, { backgroundColor: accentColor }]}
        onPress={togglePlay}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : playing ? (
          <Pause size={15} color="#FFFFFF" fill="#FFFFFF" />
        ) : (
          <Play size={15} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 2 }} />
        )}
      </TouchableOpacity>

      <View style={styles.waveWrap}>
        <View style={styles.barsRow}>
          {WAVE_BARS.map((h, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: Math.round(6 + h * 16),
                  backgroundColor: i <= activeBars && playing ? accentColor : mutedColor,
                  opacity: i <= activeBars ? 1 : 0.48,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.duration, { color: textColor }]}>
          {formatDuration(playing ? positionMs : totalMs)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 196,
    paddingVertical: 2,
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  waveWrap: {
    flex: 1,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 24,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
  duration: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 2,
    opacity: 0.78,
  },
});
