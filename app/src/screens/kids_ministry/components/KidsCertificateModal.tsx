import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Platform,
} from 'react-native';
import { X, Award, Share2, Sparkles, ShieldCheck } from 'lucide-react-native';
import { KidsCertificateData } from '../../../types/KidsMinistryTypes';

interface Props {
  visible: boolean;
  data: KidsCertificateData;
  onClose: () => void;
}

export default function KidsCertificateModal({ visible, data, onClose }: Props) {
  const handleShareCertificate = async () => {
    try {
      const msg = `🎓 *RHEMA KIDS MINISTRY · OFFICIAL CERTIFICATE OF COMPLETION*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `This is to certify that\n` +
        `⭐ *${data.childName}* (ID: ${data.childId})\n` +
        `has successfully completed:\n` +
        `🏆 *${data.eventName}* (${data.eventNameTelugu})\n` +
        `Tier / House: ${data.tierOrHouse}\n` +
        `Academic Year: ${data.academicYear}\n\n` +
        `📖 *SCRIPTURE BENEDICTION*:\n` +
        `"${data.verse}"\n` +
        `"${data.verseTelugu}"\n\n` +
        `Signed:\n` +
        `✍️ ${data.directorName} (Sunday School Director)\n` +
        `✍️ ${data.pastorName} (Senior Pastor)\n` +
        `🏛️ ${data.churchName} · Mark 10:14`;

      await Share.share({ message: msg });
    } catch (e) {
      // User cancelled share
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Close & Share Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShareCertificate} style={styles.shareBtn}>
              <Share2 size={16} color="#000000" />
              <Text style={styles.shareBtnText}>Share Certificate</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* The Certificate Frame */}
            <View style={styles.certFrameOuter}>
              <View style={styles.certFrameInner}>
                {/* Gold Seal Header */}
                <View style={styles.sealRow}>
                  <View style={styles.goldLine} />
                  <View style={styles.sealCircle}>
                    <Award size={28} color="#000000" />
                  </View>
                  <View style={styles.goldLine} />
                </View>

                {/* Church Name & Scripture Header */}
                <Text style={styles.churchTitle}>{data.churchName.toUpperCase()}</Text>
                <Text style={styles.ministrySubtitle}>SUNDAY SCHOOL & KIDS MINISTRY</Text>
                <Text style={styles.mark10Verse}>"Let the little children come to Me" — Mark 10:14</Text>

                <View style={styles.certHeadingBlock}>
                  <Text style={styles.certMainTitle}>CERTIFICATE OF COMPLETION</Text>
                  <Text style={styles.certMainTitleTelugu}>విశిష్ట ప్రశంసా పత్రము</Text>
                </View>

                {/* Recipient */}
                <Text style={styles.presentedText}>THIS IS PROUDLY PRESENTED TO</Text>
                <Text style={styles.childNameSerif}>{data.childName}</Text>
                <Text style={styles.childIdTag}>BADGE ID: {data.childId}</Text>

                <View style={styles.dividerDots} />

                {/* Achievement Description */}
                <Text style={styles.reasonText}>
                  For faithful participation, spiritual growth, Scripture memorization, and joyful discipleship in:
                </Text>
                <Text style={styles.eventName}>{data.eventName}</Text>
                <Text style={styles.eventNameTelugu}>{data.eventNameTelugu}</Text>
                <Text style={styles.tierTag}>{data.tierOrHouse} · Academic Year {data.academicYear}</Text>

                {/* Scripture Benediction */}
                <View style={styles.scriptureBox}>
                  <Sparkles size={14} color="#FBBF24" />
                  <Text style={styles.verseEn}>"{data.verse}"</Text>
                  <Text style={styles.verseTe}>"{data.verseTelugu}"</Text>
                </View>

                {/* Signatures */}
                <View style={styles.signaturesRow}>
                  <View style={styles.sigBlock}>
                    <Text style={styles.sigHandwritten}>{data.directorName}</Text>
                    <View style={styles.sigLine} />
                    <Text style={styles.sigTitle}>Sunday School Director</Text>
                  </View>

                  <View style={styles.waxSeal}>
                    <ShieldCheck size={20} color="#FBBF24" />
                    <Text style={styles.waxSealText}>SEAL</Text>
                  </View>

                  <View style={styles.sigBlock}>
                    <Text style={styles.sigHandwritten}>{data.pastorName}</Text>
                    <View style={styles.sigLine} />
                    <Text style={styles.sigTitle}>Senior Pastor</Text>
                  </View>
                </View>

                <Text style={styles.dateIssued}>Issued on {data.dateIssued}</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    padding: 12,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: 10,
    marginTop: 20,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  scroll: {
    paddingBottom: 24,
  },
  certFrameOuter: {
    backgroundColor: '#09090B',
    borderRadius: 18,
    padding: 8,
    borderWidth: 3,
    borderColor: '#FBBF24',
    shadowColor: '#FBBF24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  certFrameInner: {
    backgroundColor: '#121214',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  sealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
    gap: 8,
  },
  goldLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(251, 191, 36, 0.4)',
  },
  sealCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  churchTitle: {
    fontFamily: 'Georgia',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FBBF24',
    letterSpacing: 2,
    textAlign: 'center',
  },
  ministrySubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D1D5DB',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  mark10Verse: {
    fontSize: 10,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 3,
  },
  certHeadingBlock: {
    alignItems: 'center',
    marginVertical: 14,
  },
  certMainTitle: {
    fontFamily: 'Georgia',
    fontSize: 19,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  certMainTitleTelugu: {
    fontSize: 14,
    color: '#FBBF24',
    marginTop: 3,
  },
  presentedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 1,
  },
  childNameSerif: {
    fontFamily: 'Georgia',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FBBF24',
    marginVertical: 4,
    textAlign: 'center',
  },
  childIdTag: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#9CA3AF',
    marginBottom: 8,
  },
  dividerDots: {
    width: 60,
    height: 2,
    backgroundColor: '#FBBF24',
    marginVertical: 6,
  },
  reasonText: {
    fontSize: 11,
    color: '#D1D5DB',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  eventName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 6,
    textAlign: 'center',
  },
  eventNameTelugu: {
    fontSize: 13,
    color: '#FBBF24',
    marginTop: 2,
    textAlign: 'center',
  },
  tierTag: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
    marginTop: 4,
  },
  scriptureBox: {
    backgroundColor: '#09090B',
    borderRadius: 8,
    padding: 10,
    marginVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
    width: '100%',
    gap: 3,
  },
  verseEn: {
    fontSize: 11,
    color: '#E5E7EB',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  verseTe: {
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  signaturesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  sigBlock: {
    alignItems: 'center',
    width: 100,
  },
  sigHandwritten: {
    fontFamily: 'Georgia',
    fontSize: 13,
    fontStyle: 'italic',
    color: '#FBBF24',
    marginBottom: 4,
  },
  sigLine: {
    width: '100%',
    height: 1,
    backgroundColor: '#3F3F46',
    marginBottom: 4,
  },
  sigTitle: {
    fontSize: 9,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  waxSeal: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  waxSealText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FBBF24',
  },
  dateIssued: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 14,
  },
});
