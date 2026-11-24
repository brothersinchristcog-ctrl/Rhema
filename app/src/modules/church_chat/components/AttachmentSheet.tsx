import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, FileText, Image as ImageIcon, Mic, Video, X } from 'lucide-react-native';
import { ChatThemePalette } from '../constants/chatTheme';

interface AttachmentSheetProps {
  visible: boolean;
  onClose: () => void;
  onPickPhotos: () => void;
  onPickVideo: () => void;
  onTakePhoto: () => void;
  onPickDocument: () => void;
  onRecordVoice: () => void;
  palette: ChatThemePalette;
  fontFamily?: string;
}

export default function AttachmentSheet({
  visible,
  onClose,
  onPickPhotos,
  onPickVideo,
  onTakePhoto,
  onPickDocument,
  onRecordVoice,
  palette,
  fontFamily,
}: AttachmentSheetProps) {
  const options = [
    { label: 'Photos', Icon: ImageIcon, color: '#3B82F6', onPress: onPickPhotos },
    { label: 'Camera', Icon: Camera, color: '#10B981', onPress: onTakePhoto },
    { label: 'Video', Icon: Video, color: '#EC4899', onPress: onPickVideo },
    { label: 'Document', Icon: FileText, color: '#8B5CF6', onPress: onPickDocument },
    { label: 'Voice Note', Icon: Mic, color: '#F59E0B', onPress: onRecordVoice },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.glassBorder,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text, fontFamily }]}>
              Share in Chat
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={palette.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.grid}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={styles.option}
                onPress={() => {
                  onClose();
                  setTimeout(opt.onPress, 120);
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${opt.color}20` }]}>
                  <opt.Icon size={22} color={opt.color} />
                </View>
                <Text style={[styles.label, { color: palette.text, fontFamily }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 20,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  option: {
    width: '28%',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
