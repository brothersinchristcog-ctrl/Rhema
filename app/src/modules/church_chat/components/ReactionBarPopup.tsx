import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckSquare, Copy, CornerUpRight, Reply, Trash2 } from 'lucide-react-native';
import { ChatThemePalette, QUICK_REACTION_EMOJIS } from '../constants/chatTheme';
import { ChatMessage } from '../types/chat';

interface ReactionBarPopupProps {
  message: ChatMessage | null;
  myUid: string;
  canDeleteForEveryone: boolean;
  onClose: () => void;
  onReact: (emoji: string, alreadyReacted: boolean) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onSelectMultiple?: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  palette: ChatThemePalette;
  fontFamily?: string;
}

export default function ReactionBarPopup({
  message,
  myUid,
  canDeleteForEveryone,
  onClose,
  onReact,
  onReply,
  onForward,
  onCopy,
  onSelectMultiple,
  onDeleteForMe,
  onDeleteForEveryone,
  palette,
  fontFamily,
}: ReactionBarPopupProps) {
  if (!message) return null;

  const isDeleted = Boolean(message.deletedForEveryone);

  return (
    <Modal visible={Boolean(message)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.center}>
          {!isDeleted ? (
            <View
              style={[
                styles.emojiBar,
                { backgroundColor: palette.surface, borderColor: palette.glassBorder },
              ]}
            >
              {QUICK_REACTION_EMOJIS.map((emoji) => {
                const reacted = Boolean(message.reactions?.[emoji]?.[myUid]);
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.emojiBtn,
                      reacted && { backgroundColor: `${palette.accent}2A` },
                    ]}
                    onPress={() => {
                      onReact(emoji, reacted);
                      onClose();
                    }}
                  >
                    <Text style={styles.emojiTxt}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <View
            style={[
              styles.menuCard,
              { backgroundColor: palette.surface, borderColor: palette.glassBorder },
            ]}
          >
            {!isDeleted ? (
              <>
                <TouchableOpacity
                  style={styles.menuRow}
                  onPress={() => {
                    onClose();
                    onReply();
                  }}
                >
                  <Reply size={18} color={palette.text} />
                  <Text style={[styles.menuLabel, { color: palette.text, fontFamily }]}>Reply</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuRow}
                  onPress={() => {
                    onClose();
                    onForward();
                  }}
                >
                  <CornerUpRight size={18} color={palette.text} />
                  <Text style={[styles.menuLabel, { color: palette.text, fontFamily }]}>Forward</Text>
                </TouchableOpacity>

                {message.text ? (
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => {
                      onClose();
                      onCopy();
                    }}
                  >
                    <Copy size={18} color={palette.text} />
                    <Text style={[styles.menuLabel, { color: palette.text, fontFamily }]}>
                      Copy Text
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}

            {onSelectMultiple ? (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onSelectMultiple();
                }}
              >
                <CheckSquare size={18} color={palette.text} />
                <Text style={[styles.menuLabel, { color: palette.text, fontFamily }]}>
                  Select Messages
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                onClose();
                onDeleteForMe();
              }}
            >
              <Trash2 size={18} color={palette.danger} />
              <Text style={[styles.menuLabel, { color: palette.danger, fontFamily }]}>
                Delete for Me
              </Text>
            </TouchableOpacity>

            {canDeleteForEveryone && !isDeleted ? (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onDeleteForEveryone();
                }}
              >
                <Trash2 size={18} color={palette.danger} />
                <Text style={[styles.menuLabel, { color: palette.danger, fontFamily }]}>
                  Delete for Everyone
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  center: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: 12,
  },
  emojiBar: {
    flexDirection: 'row',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  emojiBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiTxt: {
    fontSize: 22,
  },
  menuCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 6,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
