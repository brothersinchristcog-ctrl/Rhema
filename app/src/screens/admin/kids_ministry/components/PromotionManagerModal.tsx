import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  Sparkles,
  ArrowRight,
  CheckCircle,
  GraduationCap,
  Users,
  Award,
} from 'lucide-react-native';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { ChildRecord, KidsClassRecord, KidsClassTier } from '../../../../types/KidsMinistryTypes';

interface PromotionManagerModalProps {
  visible: boolean;
  children: ChildRecord[];
  classes: KidsClassRecord[];
  churchId: string;
  onClose: () => void;
  onPromoted?: () => void;
}

export default function PromotionManagerModal({
  visible,
  children,
  classes,
  churchId,
  onClose,
  onPromoted,
}: PromotionManagerModalProps) {
  const [promoting, setPromoting] = useState(false);
  const [promotedChildIds, setPromotedChildIds] = useState<string[]>([]);

  // Calculate promotion candidates
  const candidates = useMemo(() => {
    return KidsMinistryService.checkPromotionEligibility(children).filter(
      c => !promotedChildIds.includes(c.child.id)
    );
  }, [children, promotedChildIds]);

  const handlePromoteSingle = async (candidate: any) => {
    try {
      setPromoting(true);
      await KidsMinistryService.promoteChild({
        churchId,
        childDocId: candidate.child.id,
        childName: candidate.child.fullName,
        previousTier: candidate.currentTier,
        targetTier: candidate.recommendedTier,
        targetClassName: candidate.recommendedClassName,
        notes: `Age-based graduation: child reached age ${candidate.currentAge}`,
      });

      setPromotedChildIds(prev => [...prev, candidate.child.id]);
      Alert.alert(
        'Promotion Completed! 🎉',
        `${candidate.child.fullName} is now enrolled in ${candidate.recommendedClassName}!`
      );
      if (onPromoted) onPromoted();
    } catch (e: any) {
      Alert.alert('Promotion Failed', e.message || 'Could not promote child');
    } finally {
      setPromoting(false);
    }
  };

  const handlePromoteAll = async () => {
    if (candidates.length === 0) return;

    Alert.alert(
      'Confirm Annual Promotion',
      `Are you sure you want to promote all ${candidates.length} eligible children to their next Sunday School classes?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Graduate & Promote All',
          style: 'default',
          onPress: async () => {
            try {
              setPromoting(true);
              const res = await KidsMinistryService.bulkPromoteChildren(
                churchId,
                candidates,
                'admin_graduation_service'
              );
              setPromotedChildIds(prev => [...prev, ...candidates.map(c => c.child.id)]);
              Alert.alert(
                'Graduation Completed! 🎓',
                `Successfully promoted ${res.promotedCount} children to their new Sunday School classes!`
              );
              if (onPromoted) onPromoted();
            } catch (e: any) {
              Alert.alert('Bulk Promotion Failed', e.message || 'Could not complete graduation');
            } finally {
              setPromoting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <View style={styles.headerTagRow}>
                <Sparkles size={12} color="#FBBF24" />
                <Text style={styles.headerTag}>ANNUAL GRADUATION</Text>
              </View>
              <Text style={styles.headerTitleSerif}>Age Promotion Center</Text>
              <Text style={styles.headerSubtitle}>
                Promote children who have reached the next age bracket
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Promotion Candidate List */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
            {candidates.length === 0 ? (
              <View style={styles.allCaughtUpCard}>
                <CheckCircle size={36} color="#34D399" />
                <Text style={styles.allCaughtUpTitle}>All Children Are Up To Date!</Text>
                <Text style={styles.allCaughtUpSub}>
                  Every enrolled child is currently placed in their age-appropriate Sunday School tier.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.summaryBar}>
                  <Text style={styles.summaryText}>
                    <Text style={{ fontWeight: '800', color: '#FBBF24' }}>{candidates.length}</Text> children eligible for graduation
                  </Text>
                </View>

                {candidates.map(item => (
                  <View key={item.child.id} style={styles.candidateCard}>
                    <View style={styles.candidateTopRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{item.child.firstName.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.childName}>{item.child.fullName}</Text>
                        <Text style={styles.childAgeText}>
                          Now Age {item.currentAge} · DOB: {item.child.dob}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.singlePromoteBtn, promoting && { opacity: 0.6 }]}
                        onPress={() => handlePromoteSingle(item)}
                        disabled={promoting}
                      >
                        <Text style={styles.singlePromoteText}>Promote</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Transition Route */}
                    <View style={styles.transitionBox}>
                      <View style={styles.tierPill}>
                        <Text style={styles.tierPillText}>{item.currentClassName}</Text>
                      </View>
                      <ArrowRight size={14} color="#FBBF24" />
                      <View style={[styles.tierPill, styles.targetTierPill]}>
                        <Text style={[styles.tierPillText, styles.targetTierPillText]}>
                          {item.recommendedClassName}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footerRow}>
            {candidates.length > 0 && (
              <TouchableOpacity
                style={[styles.bulkPromoteBtn, promoting && { opacity: 0.7 }]}
                onPress={handlePromoteAll}
                disabled={promoting}
                activeOpacity={0.88}
              >
                {promoting ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <GraduationCap size={18} color="#000000" />
                    <Text style={styles.bulkPromoteBtnText}>
                      Graduate & Promote All ({candidates.length})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose}>
              <Text style={styles.closeFooterText}>Close</Text>
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
  headerTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  summaryBar: {
    backgroundColor: '#09090B',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272A',
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 11,
    color: '#E4E4E7',
  },
  listContainer: {
    gap: 10,
    paddingBottom: 16,
  },
  allCaughtUpCard: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  allCaughtUpTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  allCaughtUpSub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  candidateCard: {
    backgroundColor: '#09090B',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 10,
  },
  candidateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  childName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  childAgeText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 1,
  },
  singlePromoteBtn: {
    backgroundColor: '#27272A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  singlePromoteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
  transitionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181B',
    borderRadius: 8,
    padding: 8,
  },
  tierPill: {
    flex: 1,
    alignItems: 'center',
  },
  tierPillText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  targetTierPill: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  targetTierPillText: {
    color: '#34D399',
    fontWeight: '700',
  },
  footerRow: {
    gap: 8,
    marginTop: 8,
  },
  bulkPromoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  bulkPromoteBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  closeFooterBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeFooterText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
});
