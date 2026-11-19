import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  Users,
  AlertTriangle,
  Phone,
  UserCheck,
  ChevronRight,
  ArrowRight,
  Shield,
} from 'lucide-react-native';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { ChildRecord, KidsClassRecord, KidsClassTier } from '../../../../types/KidsMinistryTypes';

interface ClassRosterModalProps {
  visible: boolean;
  classData: KidsClassRecord | null;
  childrenInClass: ChildRecord[];
  allClasses: KidsClassRecord[];
  churchId: string;
  onClose: () => void;
  onRosterUpdated?: () => void;
}

export default function ClassRosterModal({
  visible,
  classData,
  childrenInClass,
  allClasses,
  churchId,
  onClose,
  onRosterUpdated,
}: ClassRosterModalProps) {
  if (!classData) return null;

  const [transferringChild, setTransferringChild] = useState<ChildRecord | null>(null);
  const [processingTransfer, setProcessingTransfer] = useState(false);

  const handleCallParent = (phone: string, name: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No contact number available for parent.');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Call Error', `Could not initiate call to ${name}`);
    });
  };

  const handleTransfer = async (targetClass: KidsClassRecord) => {
    if (!transferringChild) return;

    try {
      setProcessingTransfer(true);
      await KidsMinistryService.promoteChild({
        churchId,
        childDocId: transferringChild.id,
        childName: transferringChild.fullName,
        previousTier: transferringChild.assignedTier,
        targetTier: targetClass.tier,
        targetClassId: targetClass.id,
        targetClassName: targetClass.name,
        notes: `Manual classroom transfer from ${classData.name} to ${targetClass.name}`,
      });

      Alert.alert(
        'Child Transferred! 🎉',
        `${transferringChild.fullName} has been moved to ${targetClass.name}.`
      );
      setTransferringChild(null);
      if (onRosterUpdated) onRosterUpdated();
    } catch (e: any) {
      Alert.alert('Transfer Failed', e.message || 'Could not move child');
    } finally {
      setProcessingTransfer(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTag}>CLASSROOM ROSTER</Text>
              <Text style={styles.headerTitleSerif}>{classData.name}</Text>
              <Text style={styles.headerSubtitle}>
                {classData.roomNumber} · Ages {classData.ageRange.min}–{classData.ageRange.max} · {childrenInClass.length} Enrolled
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Transfer Sub-Modal / Picker */}
          {transferringChild ? (
            <View style={styles.transferBox}>
              <View style={styles.transferHeader}>
                <Text style={styles.transferTitle}>
                  Move {transferringChild.fullName} to:
                </Text>
                <TouchableOpacity onPress={() => setTransferringChild(null)}>
                  <X size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 220 }}>
                {allClasses
                  .filter(c => c.tier !== classData.tier)
                  .map(target => (
                    <TouchableOpacity
                      key={target.id}
                      style={styles.targetClassItem}
                      onPress={() => handleTransfer(target)}
                      disabled={processingTransfer}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.targetClassName}>{target.name}</Text>
                        <Text style={styles.targetClassMeta}>
                          Ages {target.ageRange.min}–{target.ageRange.max} · {target.roomNumber}
                        </Text>
                      </View>
                      <ArrowRight size={16} color="#FBBF24" />
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Children List */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
            {childrenInClass.length === 0 ? (
              <View style={styles.emptyCard}>
                <Users size={32} color="#52525B" />
                <Text style={styles.emptyTitle}>No Children Enrolled Yet</Text>
                <Text style={styles.emptySub}>
                  Children matching ages {classData.ageRange.min}–{classData.ageRange.max} will be auto-assigned here upon registration.
                </Text>
              </View>
            ) : (
              childrenInClass.map(child => (
                <View key={child.id} style={styles.childCard}>
                  <View style={styles.childRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{child.firstName.charAt(0)}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.childName}>{child.fullName}</Text>
                        <View style={styles.agePill}>
                          <Text style={styles.agePillText}>Age {child.age}</Text>
                        </View>
                      </View>

                      <Text style={styles.parentText}>
                        Parent: {child.parentName}
                      </Text>

                      {/* Medical Alert */}
                      {child.medical?.hasAllergies && (
                        <View style={styles.allergyBadge}>
                          <AlertTriangle size={10} color="#F87171" />
                          <Text style={styles.allergyText}>
                            {child.medical.allergiesList.join(', ')}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Actions */}
                    <View style={styles.actionsCol}>
                      {child.parentPhone ? (
                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => handleCallParent(child.parentPhone, child.parentName)}
                        >
                          <Phone size={14} color="#34D399" />
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        style={styles.moveBtn}
                        onPress={() => setTransferringChild(child)}
                      >
                        <Text style={styles.moveBtnText}>Move</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Footer Close */}
          <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose}>
            <Text style={styles.closeFooterText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#27272A',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 1.5,
  },
  headerTitleSerif: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferBox: {
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#FBBF24',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  transferHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transferTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FBBF24',
  },
  targetClassItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  targetClassName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  targetClassMeta: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 1,
  },
  listContainer: {
    gap: 8,
    paddingBottom: 16,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 20,
  },
  childCard: {
    backgroundColor: '#09090B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  agePill: {
    backgroundColor: '#18181B',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  agePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FBBF24',
  },
  parentText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  allergyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  allergyText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#F87171',
  },
  actionsCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  actionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  moveBtn: {
    backgroundColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  moveBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  closeFooterBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  closeFooterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
});
