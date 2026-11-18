import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
} from 'react-native';
import {
  X,
  Sparkles,
  Award,
  Plus,
  Share2,
  Calendar,
  Users,
  Trophy,
  Flame,
  Check,
} from 'lucide-react-native';
import { KidsVBSEventRecord, KidsVBSHouse } from '../../../../types/KidsMinistryTypes';
import KidsMinistryService from '../../../../services/KidsMinistryService';

interface Props {
  visible: boolean;
  event: KidsVBSEventRecord | null;
  churchId: string;
  onClose: () => void;
  onOpenCertificateGenerator?: () => void;
}

const POINT_ACTIONS = [
  { label: '+50 Scripture Sword Drill', points: 50 },
  { label: '+30 House Cheer & Spirit', points: 30 },
  { label: '+40 Game Relay Victory', points: 40 },
  { label: '+25 Cleanliness & Tidiness', points: 25 },
  { label: '+100 Drama & Song Skit', points: 100 },
];

export default function AdminVBSManagerModal({
  visible,
  event,
  churchId,
  onClose,
  onOpenCertificateGenerator,
}: Props) {
  const [selectedHouse, setSelectedHouse] = useState<KidsVBSHouse | null>(null);
  const [awarding, setAwarding] = useState(false);

  if (!event) return null;

  const sortedHouses = [...(event.houses || [])].sort((a, b) => b.score - a.score);

  const handleAwardPoints = async (house: KidsVBSHouse, points: number, label: string) => {
    try {
      setAwarding(true);
      await KidsMinistryService.updateVBSHouseScore(churchId, event.id, house.id, points);
      Alert.alert(
        'Points Awarded! 🎉',
        `${points > 0 ? `+${points}` : points} points awarded to ${house.name} for ${label}!`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not update points');
    } finally {
      setAwarding(false);
    }
  };

  const handleShareLeaderboard = async () => {
    try {
      const standings = sortedHouses
        .map((h, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖️'} *${h.name}*: ${h.score} pts (${h.memberCount} campers)`)
        .join('\n');

      const msg = `🏆 *RHEMA VBS 2026 HOUSE LEADERBOARD*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*Theme*: ${event.title}\n` +
        `*తెలుగు*: ${event.titleTelugu}\n` +
        `*Dates*: ${event.startDate} to ${event.endDate}\n\n` +
        `📊 *CURRENT STANDINGS*:\n${standings}\n\n` +
        `📖 "${event.themeVerse}"\n\n` +
        `_Rhema Kids Ministry VBS Hub_`;

      await Share.share({ message: msg });
    } catch (e) {
      // User cancelled share
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <View style={styles.vbsBadgeRow}>
              <Flame size={14} color="#EF4444" />
              <Text style={styles.vbsBadgeText}>VBS 2026 HEADQUARTERS</Text>
            </View>
            <Text style={styles.titleSerif}>Vacation Bible School</Text>
          </View>
          <TouchableOpacity onPress={handleShareLeaderboard} style={styles.shareBtn}>
            <Share2 size={16} color="#000000" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* VBS Hero Card */}
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.liveStatusPill}>
                <View style={styles.livePulseDot} />
                <Text style={styles.liveStatusText}>VBS ACTIVE</Text>
              </View>
              <Text style={styles.dateMeta}>{event.startDate} – {event.endDate}</Text>
            </View>

            <Text style={styles.vbsTitleEn}>{event.title}</Text>
            <Text style={styles.vbsTitleTe}>{event.titleTelugu}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Users size={16} color="#FBBF24" />
                <Text style={styles.statNum}>{event.totalRegistered || 76}</Text>
                <Text style={styles.statLabel}>Campers Registered</Text>
              </View>
              <View style={styles.statBox}>
                <Trophy size={16} color="#10B981" />
                <Text style={styles.statNum}>{sortedHouses[0]?.name.split(' ')[0]}</Text>
                <Text style={styles.statLabel}>Current Leader</Text>
              </View>
            </View>

            <Text style={styles.verseMeta}>"{event.themeVerse}"</Text>
          </View>

          {/* House Leaderboard */}
          <View style={styles.sectionHeadingRow}>
            <Trophy size={16} color="#FBBF24" />
            <Text style={styles.sectionHeading}>4 HOUSES STANDINGS & SPIRIT SCORES</Text>
          </View>

          <View style={{ gap: 12 }}>
            {sortedHouses.map((house, idx) => {
              const isSelected = selectedHouse?.id === house.id;

              return (
                <View
                  key={house.id}
                  style={[
                    styles.houseCard,
                    { borderColor: house.color },
                    isSelected && { backgroundColor: '#1C1917' },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.houseTopRow}
                    onPress={() => setSelectedHouse(isSelected ? null : house)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankNum}>#{idx + 1}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.houseName, { color: house.color }]}>
                        {house.name}
                      </Text>
                      <Text style={styles.houseNameTe}>{house.nameTelugu}</Text>
                      <Text style={styles.houseCampers}>
                        {house.memberCount} Campers in Team
                      </Text>
                    </View>

                    <View style={styles.scoreBox}>
                      <Text style={[styles.scoreNum, { color: house.color }]}>
                        {house.score}
                      </Text>
                      <Text style={styles.scoreLabel}>POINTS</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Point Awarder Controls for Selected House */}
                  {isSelected && (
                    <View style={styles.awardPanel}>
                      <Text style={styles.awardPanelHeading}>
                        AWARD POINTS TO {house.name.toUpperCase()}:
                      </Text>
                      <View style={styles.actionPillsWrap}>
                        {POINT_ACTIONS.map((act, actIdx) => (
                          <TouchableOpacity
                            key={actIdx}
                            style={styles.actionPill}
                            onPress={() => handleAwardPoints(house, act.points, act.label)}
                            disabled={awarding}
                          >
                            <Plus size={12} color="#000000" />
                            <Text style={styles.actionPillText}>{act.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Certificate Generator Quick Link */}
          {onOpenCertificateGenerator && (
            <TouchableOpacity
              style={styles.certBanner}
              onPress={onOpenCertificateGenerator}
              activeOpacity={0.88}
            >
              <Award size={22} color="#000000" />
              <View style={{ flex: 1 }}>
                <Text style={styles.certBannerTitle}>Official VBS Certificate Generator</Text>
                <Text style={styles.certBannerSub}>
                  Preview & print bilingual certificates for all graduation campers
                </Text>
              </View>
              <View style={styles.certArrow}>
                <Text style={styles.certArrowText}>View &rsaquo;</Text>
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitles: {
    alignItems: 'center',
  },
  vbsBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  vbsBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  titleSerif: {
    fontFamily: 'Georgia',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FBBF24',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  liveStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  dateMeta: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  vbsTitleEn: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  vbsTitleTe: {
    fontSize: 14,
    color: '#FBBF24',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#09090B',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
  },
  statNum: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  statLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  verseMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  houseCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
  },
  houseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#09090B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  rankNum: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  houseName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  houseNameTe: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  houseCampers: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  scoreBox: {
    alignItems: 'center',
    backgroundColor: '#09090B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  scoreNum: {
    fontSize: 20,
    fontWeight: '900',
  },
  scoreLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  awardPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    gap: 8,
  },
  awardPanelHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  actionPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000000',
  },
  certBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FBBF24',
    padding: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  certBannerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  certBannerSub: {
    fontSize: 11,
    color: '#3F3F46',
    marginTop: 1,
  },
  certArrow: {
    paddingHorizontal: 6,
  },
  certArrowText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
});
