import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyRound, Lock, ShieldCheck, X } from 'lucide-react-native';
import { e2eeService, E2EEStateSnapshot } from '../services/e2eeService';

export type ChatEncryptionModalMode = 'setup_backup' | 'unlock_backup' | 'manage';

interface ChatEncryptionModalProps {
  visible: boolean;
  uid: string;
  mode: ChatEncryptionModalMode;
  isDark?: boolean;
  accentColor?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ChatEncryptionModal({
  visible,
  uid,
  mode,
  isDark = true,
  accentColor = '#10B981',
  onClose,
  onSuccess,
}: ChatEncryptionModalProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [e2eeState, setE2eeState] = useState<E2EEStateSnapshot>(() => e2eeService.getState());

  useEffect(() => {
    const unsub = e2eeService.subscribeState(setE2eeState);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (visible) {
      setPin('');
      setConfirmPin('');
      setErrorMsg('');
    }
  }, [visible, mode]);

  const cardBg = isDark ? '#14171C' : '#FFFFFF';
  const inputBg = isDark ? '#1F242D' : '#F1F5F9';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const mutedColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(255,255,255,0.12)' : '#E2E8F0';

  const isUnlock = mode === 'unlock_backup';
  const isManage = mode === 'manage';

  const handleSetBackupPin = async () => {
    setErrorMsg('');
    const clean = pin.trim();
    if (clean.length < 6) {
      setErrorMsg('Please enter at least 6 digits or characters.');
      return;
    }
    if (clean !== confirmPin.trim()) {
      setErrorMsg('PIN / Passphrase confirmation does not match.');
      return;
    }

    setBusy(true);
    try {
      const res = await e2eeService.setBackupPin(uid, clean);
      if (!res.ok) {
        setErrorMsg(res.error || 'Could not save key backup.');
        return;
      }
      Alert.alert(
        'Encryption Backup Saved',
        'Your private chat key is now encrypted with your PIN. Remember this PIN when signing in on a new device.'
      );
      onSuccess?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockBackup = async () => {
    setErrorMsg('');
    const clean = pin.trim();
    if (!clean) {
      setErrorMsg('Please enter your Encryption Backup PIN.');
      return;
    }

    setBusy(true);
    try {
      const res = await e2eeService.unlockWithBackupPin(uid, clean);
      if (!res.ok) {
        setErrorMsg(res.error || 'Incorrect Backup PIN.');
        return;
      }
      onSuccess?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleResetKey = () => {
    Alert.alert(
      'Reset Encryption Keys?',
      'If you reset your encryption key without your PIN, past encrypted messages cannot be decrypted, though new messages will work normally.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Keys',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await e2eeService.resetKeyForNewDevice(uid);
              onSuccess?.();
              onClose();
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.topRow}>
            <View style={[styles.iconWrap, { backgroundColor: `${accentColor}22` }]}>
              {isUnlock ? (
                <KeyRound size={22} color={accentColor} />
              ) : (
                <ShieldCheck size={22} color={accentColor} />
              )}
            </View>
            {!isUnlock ? (
              <TouchableOpacity
                onPress={() => {
                  if (mode === 'setup_backup') {
                    e2eeService.dismissBackupPromptTemporarily();
                  }
                  onClose();
                }}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X size={20} color={mutedColor} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X size={20} color={mutedColor} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.title, { color: textColor }]}>
            {isUnlock
              ? 'Unlock Encrypted Chats'
              : isManage
              ? 'End-to-End Encryption'
              : 'Back Up Your Chat Key'}
          </Text>

          <Text style={[styles.subtitle, { color: mutedColor }]}>
            {isUnlock
              ? 'Enter your Backup PIN or passphrase to decrypt your previous conversations on this device.'
              : isManage
              ? 'Messages are encrypted on your device using AES-256-GCM and RSA-OAEP keys. Only conversation participants can read them.'
              : 'All 1-to-1 and group chats are end-to-end encrypted. Set a 6+ character Backup PIN so you can recover chat history if you reinstall or switch phones.'}
          </Text>

          {isManage && e2eeState.fingerprint ? (
            <View style={[styles.fingerprintBox, { backgroundColor: inputBg, borderColor }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Lock size={13} color={accentColor} />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: textColor }}>
                  Key Fingerprint · {e2eeState.hasBackup ? 'PIN Backup Active' : 'Not Backed Up'}
                </Text>
              </View>
              <Text style={{ fontSize: 11.5, color: mutedColor, letterSpacing: 0.6 }}>
                {e2eeState.fingerprint}
              </Text>
            </View>
          ) : null}

          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
            placeholder={
              isUnlock
                ? 'Enter Backup PIN / Passphrase'
                : isManage && e2eeState.hasBackup
                ? 'Enter new Backup PIN (min 6 chars)'
                : 'Create Backup PIN (min 6 chars)'
            }
            placeholderTextColor={mutedColor}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={pin}
            onChangeText={setPin}
          />

          {!isUnlock ? (
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
              placeholder="Confirm Backup PIN / Passphrase"
              placeholderTextColor={mutedColor}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={confirmPin}
              onChangeText={setConfirmPin}
            />
          ) : null}

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: busy ? 0.65 : 1 }]}
            disabled={busy}
            onPress={isUnlock ? handleUnlockBackup : handleSetBackupPin}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {isUnlock
                  ? 'Unlock Conversations'
                  : isManage && e2eeState.hasBackup
                  ? 'Update Backup PIN'
                  : 'Save Encrypted Backup'}
              </Text>
            )}
          </TouchableOpacity>

          {isUnlock ? (
            <TouchableOpacity style={styles.secondaryBtn} disabled={busy} onPress={handleResetKey}>
              <Text style={[styles.secondaryBtnText, { color: '#EF4444' }]}>
                Forgot PIN? Start Fresh Key
              </Text>
            </TouchableOpacity>
          ) : mode === 'setup_backup' ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              disabled={busy}
              onPress={() => {
                e2eeService.dismissBackupPromptTemporarily();
                onClose();
              }}
            >
              <Text style={[styles.secondaryBtnText, { color: mutedColor }]}>Remind Me Later</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  fingerprintBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14.5,
    marginBottom: 10,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 10,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
