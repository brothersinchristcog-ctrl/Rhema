import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { X, ShieldCheck, UserPlus, Phone, User } from 'lucide-react-native';
import KidsMinistryService from '../../../services/KidsMinistryService';
import { AuthorizedGuardian } from '../../../types/KidsMinistryTypes';

interface Props {
  visible: boolean;
  childDocId: string;
  childName: string;
  churchId: string;
  onClose: () => void;
  onGuardianAdded?: () => void;
}

const RELATIONS = [
  'Mother',
  'Grandmother',
  'Grandfather',
  'Aunt',
  'Uncle',
  'Guardian',
  'Family Friend',
];

export default function AddGuardianModal({
  visible,
  childDocId,
  childName,
  churchId,
  onClose,
  onGuardianAdded,
}: Props) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('Grandmother');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter guardian full name.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Missing Phone', 'Please enter guardian phone number for checkout verification.');
      return;
    }

    try {
      setSaving(true);
      const newGuardian: AuthorizedGuardian = {
        id: `g_${Date.now()}`,
        name: name.trim(),
        relationship: relationship as any,
        phone: phone.trim(),
        isPrimaryContact: false,
        canPickup: true,
        notes: notes.trim() || undefined,
      };

      await KidsMinistryService.addAuthorizedGuardian(churchId, childDocId, newGuardian);

      Alert.alert(
        'Guardian Authorized! 🛡️',
        `${name.trim()} (${relationship}) is now registered to securely pick up ${childName}.`
      );

      setName('');
      setPhone('');
      setNotes('');
      if (onGuardianAdded) onGuardianAdded();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not add guardian');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <ShieldCheck size={14} color="#10B981" />
                <Text style={styles.badgeText}>SAFEGUARDING REGISTRATION</Text>
              </View>
              <Text style={styles.titleSerif}>Add Authorized Pickup</Text>
              <Text style={styles.sub}>For {childName} · Verified at Dismissal</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Form Fields */}
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>FULL NAME</Text>
              <View style={styles.inputBox}>
                <User size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Mary Johnson"
                  placeholderTextColor="#6B7280"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>RELATIONSHIP TO CHILD</Text>
              <View style={styles.relationPillRow}>
                {RELATIONS.map(r => {
                  const active = relationship === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.relPill, active && styles.relPillActive]}
                      onPress={() => setRelationship(r)}
                    >
                      <Text style={[styles.relPillText, active && styles.relPillTextActive]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PHONE NUMBER (FOR SMS / VERIFICATION)</Text>
              <View style={styles.inputBox}>
                <Phone size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#6B7280"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Authorized for Sunday pickups, Grandma..."
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={2}
                value={notes}
                onChangeText={setNotes}
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.88}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <>
                  <UserPlus size={18} color="#000000" />
                  <Text style={styles.submitBtnText}>Authorize for Custody Pickup</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  titleSerif: {
    fontFamily: 'Georgia',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  sub: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    gap: 14,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090B',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    paddingVertical: 10,
  },
  textArea: {
    backgroundColor: '#09090B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#27272A',
    minHeight: 50,
  },
  relationPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  relPill: {
    backgroundColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  relPillActive: {
    backgroundColor: '#FBBF24',
  },
  relPillText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  relPillTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FBBF24',
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 6,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
});
