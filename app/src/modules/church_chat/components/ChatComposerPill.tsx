import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Camera, Mic, Plus, Send, Square, Trash2, X } from 'lucide-react-native';
import { ChatThemePalette } from '../constants/chatTheme';
import { ChatMessageReply } from '../types/chat';

interface ChatComposerPillProps {
  text: string;
  onChangeText: (val: string) => void;
  onSendText: () => void;
  onPressCamera: () => void;
  onPressPlus: () => void;
  onStartRecording: () => void;
  onStopAndSendRecording: () => void;
  onCancelRecording: () => void;
  isRecording: boolean;
  recordingSeconds: number;
  uploading: boolean;
  replyTo: ChatMessageReply | null;
  onCancelReply: () => void;
  disabled?: boolean;
  disabledMessage?: string;
  bottomInset: number;
  palette: ChatThemePalette;
  fontFamily?: string;
  scaleFont: (s: number) => number;
}

export default function ChatComposerPill({
  text,
  onChangeText,
  onSendText,
  onPressCamera,
  onPressPlus,
  onStartRecording,
  onStopAndSendRecording,
  onCancelRecording,
  isRecording,
  recordingSeconds,
  uploading,
  replyTo,
  onCancelReply,
  disabled = false,
  disabledMessage,
  bottomInset,
  palette,
  fontFamily,
  scaleFont,
}: ChatComposerPillProps) {
  const hasText = text.trim().length > 0;
  const bottomPad = Math.max(bottomInset + 8, Platform.OS === 'ios' ? 20 : 12);

  if (disabled) {
    return (
      <View style={[styles.container, { paddingBottom: bottomPad }]}>
        <View
          style={[
            styles.disabledBar,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
        >
          <Text style={[styles.disabledText, { color: palette.textSecondary, fontFamily }]}>
            {disabledMessage || 'Only Group Admins can send messages'}
          </Text>
        </View>
      </View>
    );
  }

  const mm = String(Math.floor(recordingSeconds / 60)).padStart(1, '0');
  const ss = String(recordingSeconds % 60).padStart(2, '0');

  return (
    <View style={[styles.container, { paddingBottom: bottomPad }]}>
      {replyTo ? (
        <View
          style={[
            styles.replyBanner,
            {
              backgroundColor: palette.glassStrong,
              borderColor: palette.glassBorder,
              borderLeftColor: palette.accent,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.replyBannerName, { color: palette.accent }]} numberOfLines={1}>
              Replying to {replyTo.senderName}
            </Text>
            <Text
              style={[styles.replyBannerSnippet, { color: palette.textSecondary }]}
              numberOfLines={1}
            >
              {replyTo.snippet}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} style={styles.replyCloseBtn}>
            <X size={16} color={palette.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.row}>
        {/* Left Floating Pill */}
        <View
          style={[
            styles.inputPill,
            {
              backgroundColor: palette.glassBg,
              borderColor: palette.glassBorder,
            },
          ]}
        >
          <BlurView intensity={40} tint={palette.blurTint} style={styles.pillBlur}>
            {isRecording ? (
              <View style={styles.recordingRow}>
                <TouchableOpacity onPress={onCancelRecording} style={styles.iconBtn}>
                  <Trash2 size={18} color={palette.danger} />
                </TouchableOpacity>
                <View style={styles.recPulseDot} />
                <Text style={[styles.recTimer, { color: palette.text, fontFamily }]}>
                  Recording {mm}:{ss}
                </Text>
                <TouchableOpacity
                  onPress={onStopAndSendRecording}
                  style={[styles.sendCircle, { backgroundColor: palette.accent }]}
                >
                  <Send size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: palette.text,
                      fontFamily,
                      fontSize: scaleFont(15),
                    },
                  ]}
                  placeholder="Type here"
                  placeholderTextColor={palette.inputPlaceholder}
                  value={text}
                  onChangeText={onChangeText}
                  multiline
                  maxLength={4000}
                />

                <TouchableOpacity
                  onPress={onPressCamera}
                  style={styles.iconBtn}
                  activeOpacity={0.75}
                >
                  <Camera size={20} color={palette.textSecondary} />
                </TouchableOpacity>

                {uploading ? (
                  <View style={styles.iconBtn}>
                    <ActivityIndicator size="small" color={palette.accent} />
                  </View>
                ) : hasText ? (
                  <TouchableOpacity
                    onPress={onSendText}
                    style={[styles.sendCircle, { backgroundColor: palette.accent }]}
                    activeOpacity={0.85}
                  >
                    <Send size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={onStartRecording}
                    style={styles.iconBtn}
                    activeOpacity={0.75}
                  >
                    <Mic size={20} color={palette.textSecondary} />
                  </TouchableOpacity>
                )}
              </>
            )}
          </BlurView>
        </View>

        {/* Right Detached Circular '+' Button */}
        <TouchableOpacity
          style={[
            styles.plusCircle,
            {
              backgroundColor: palette.glassStrong,
              borderColor: palette.glassBorder,
            },
          ]}
          onPress={isRecording ? onStopAndSendRecording : onPressPlus}
          activeOpacity={0.85}
        >
          <BlurView intensity={45} tint={palette.blurTint} style={styles.plusBlur}>
            {isRecording ? (
              <Square size={18} color={palette.danger} fill={palette.danger} />
            ) : (
              <Plus size={24} color={palette.text} strokeWidth={2.2} />
            )}
          </BlurView>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  replyBannerName: {
    fontSize: 12,
    fontWeight: '700',
  },
  replyBannerSnippet: {
    fontSize: 12.5,
    marginTop: 1,
  },
  replyCloseBtn: {
    padding: 4,
    marginLeft: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  inputPill: {
    flex: 1,
    minHeight: 50,
    maxHeight: 120,
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pillBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 5,
    minHeight: 50,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  plusCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
  },
  plusBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginHorizontal: 8,
  },
  recTimer: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  disabledBar: {
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  disabledText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
