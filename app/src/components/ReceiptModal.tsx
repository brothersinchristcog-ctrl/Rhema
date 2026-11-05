import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert
} from 'react-native';
import { X, Download } from 'lucide-react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useTheme, FONT_STYLE_OPTIONS } from '../context/ThemeContext';

export interface DonationRecord {
  id: string;
  amount: number;
  category: string;
  date: string;
  userName: string;
  paymentId?: string;
  status?: string;
}

interface ReceiptModalProps {
  visible: boolean;
  onClose: () => void;
  donation: DonationRecord | null;
}

export default function ReceiptModal({ visible, onClose, donation }: ReceiptModalProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const { isDark, colors, fontStyle, scaleFont } = useTheme();

  if (!donation) return null;

  const activeFontOption = FONT_STYLE_OPTIONS.find(o => o.id === fontStyle) || FONT_STYLE_OPTIONS[0];
  const appFontFamily = activeFontOption.family;
  const fStyle = { fontFamily: appFontFamily };

  const screenBg = isDark ? '#000000' : (colors.background || '#f5efe6');
  const primaryText = isDark ? '#FFFFFF' : (colors.text || '#1a1a1a');
  const buttonBg = isDark ? '#27272A' : '#1e1e2e';

  const dateObj = new Date(donation.date);
  const dateStr = dateObj.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const yyyymmdd = `${yyyy}${mm}${dd}`;

  const receiptNo = `COG-${donation.category.substring(0, 3).toUpperCase()}-${yyyymmdd}`;

  const handleDownload = async () => {
    try {
      if (viewShotRef.current && viewShotRef.current.capture) {
        const uri = await viewShotRef.current.capture();
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/jpeg',
            dialogTitle: 'Share Receipt',
          });
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      }
    } catch (error) {
      console.error('Failed to capture receipt:', error);
      Alert.alert('Error', 'Failed to save receipt image.');
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: screenBg }]}>
        
        {/* Top Header */}
        <View style={[styles.topHeader, { backgroundColor: screenBg }]}>
          <Text style={[styles.topHeaderTitle, fStyle, { color: primaryText, fontSize: scaleFont(22) }]}>Official Receipt</Text>
        </View>

        <View style={[styles.content, { backgroundColor: screenBg }]}>
          
          <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.9 }} style={styles.receiptContainerWrapper}>
            <View style={styles.receiptCard}>
              
              {/* Header */}
              <View style={styles.receiptHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.churchName, fStyle]} numberOfLines={1} adjustsFontSizeToFit>Church of God</Text>
                  <Text style={[styles.churchEmail, fStyle]} numberOfLines={1} adjustsFontSizeToFit>brothersinchrist@gmail.com</Text>
                </View>
                <View style={styles.receiptBadgeWrapper}>
                   <View style={styles.receiptBadge}>
                     <Text style={[styles.receiptBadgeText, fStyle]}>RECEIPT</Text>
                   </View>
                   <Text style={[styles.receiptMetaText, fStyle]}>Receipt No: <Text style={[styles.boldText, fStyle]}>{receiptNo}</Text></Text>
                   <Text style={[styles.receiptMetaText, fStyle]}>Date: <Text style={[styles.boldText, fStyle]}>{dateStr}</Text></Text>
                </View>
              </View>

              {/* Acknowledgment */}
              <View style={styles.ackBox}>
                <Text style={[styles.ackText, fStyle]} numberOfLines={2} adjustsFontSizeToFit>
                  We gratefully acknowledge the receipt of <Text style={[styles.ackAmount, fStyle]}>₹{donation.amount.toLocaleString('en-IN')}</Text> from <Text style={[styles.ackName, fStyle]}>{donation.userName || 'Anonymous'}</Text>{'\n'}as a generous contribution towards <Text style={[styles.ackCategory, fStyle]}>{donation.category}</Text>.
                </Text>
              </View>

              {/* Table */}
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, fStyle, { flex: 2 }]} numberOfLines={1}>DONATION TYPE</Text>
                  <Text style={[styles.tableHeaderText, fStyle, { flex: 2 }]} numberOfLines={1}>PAYMENT METHOD</Text>
                  <Text style={[styles.tableHeaderText, fStyle, { flex: 1.5, textAlign: 'right' }]} numberOfLines={1}>AMOUNT</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={[styles.tableCellText, fStyle, { flex: 2, fontWeight: '700' }]} numberOfLines={1}>{donation.category}</Text>
                  <Text style={[styles.tableCellText, fStyle, { flex: 2, color: '#64748b' }]} numberOfLines={1}>Online</Text>
                  <Text style={[styles.tableCellText, fStyle, { flex: 1.5, textAlign: 'right', fontWeight: '700' }]} numberOfLines={1}>₹{donation.amount.toLocaleString('en-IN')}</Text>
                </View>
              </View>

              {/* Signature */}
              <View style={styles.signatureSection}>
                 <Text style={styles.signatureName} numberOfLines={1}>{donation.userName || 'Member'}</Text>
                 <View style={styles.signatureLine} />
                 <Text style={[styles.signatureRole, fStyle]}>Signature</Text>
              </View>

              {/* Thank you note */}
              <View style={styles.thankYouBox}>
                 <Text style={[styles.thankYouText, fStyle]}>
                   {donation.category === 'Building' 
                     ? 'Thank you for your generous donation to the Church of God.' 
                     : 'Thank you for your faithful giving to the Church of God.'}
                 </Text>
                 <Text style={[styles.thankYouText, fStyle]}>Your support helps us continue our mission and serve the community. ♥</Text>
              </View>

            </View>
          </ViewShot>

        </View>

        {/* Action Button */}
        <View style={[styles.actionFooter, { backgroundColor: screenBg }]}>
           <TouchableOpacity style={[styles.closeBtnFooter, { backgroundColor: buttonBg }]} onPress={onClose}>
              <Text style={[styles.closeBtnFooterText, fStyle, { fontSize: scaleFont(16) }]}>Close</Text>
           </TouchableOpacity>
           
           <TouchableOpacity style={[styles.downloadBtn, { backgroundColor: buttonBg }]} onPress={handleDownload}>
              <Download size={20} color="#fff" />
              <Text style={[styles.downloadBtnText, fStyle, { fontSize: scaleFont(16) }]}>Download</Text>
           </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#f5efe6',
  },
  topHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingBottom: 10,
    backgroundColor: '#f5efe6',
  },
  topHeaderTitle: {
    color: '#1a1a1a',
    fontSize: 22,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f5efe6',
    paddingBottom: 80,
  },
  receiptContainerWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  receiptCard: {
    padding: 24,
    paddingTop: 32,
    backgroundColor: '#ffffff',
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    borderBottomWidth: 1.5,
    borderBottomColor: '#d4af37', 
    paddingBottom: 16,
  },
  churchName: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'serif',
    color: '#1a1a1a',
  },
  churchEmail: {
    fontSize: 9,
    color: '#334155', // Changed from #94a3b8 for better visibility
    marginTop: 4,
  },
  receiptBadgeWrapper: {
    alignItems: 'flex-end',
  },
  receiptBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  receiptBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  receiptMetaText: {
    fontSize: 9,
    color: '#334155', // Changed from #64748b for better visibility
    marginTop: 2,
  },
  boldText: {
    fontWeight: '700',
    color: '#1e293b',
  },
  ackBox: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    alignItems: 'center',
  },
  ackText: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
  },
  ackAmount: {
    color: '#d4af37',
    fontWeight: '700',
    fontStyle: 'italic',
    fontSize: 12,
  },
  ackName: {
    fontWeight: '700',
    color: '#1e293b',
  },
  ackCategory: {
    fontWeight: '700',
    color: '#1e293b',
  },
  table: {
    marginBottom: 32,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tableCellText: {
    fontSize: 11,
    color: '#334155',
  },
  signatureSection: {
    alignItems: 'flex-end',
    marginBottom: 32,
  },
  signatureName: {
    fontFamily: 'DancingScript_700Bold', 
    fontSize: 14, 
    color: '#1a1a1a',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  signatureLine: {
    height: 1,
    backgroundColor: '#cbd5e1',
    width: 140,
    marginBottom: 4,
  },
  signatureRole: {
    fontSize: 9,
    color: '#334155', // Changed from #64748b for better visibility
  },
  thankYouBox: {
    backgroundColor: '#fef3c7',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  thankYouText: {
    fontSize: 9,
    color: '#1e293b',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 14,
  },
  actionFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#f5efe6',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  closeBtnFooter: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    backgroundColor: '#1e1e2e', // Matched download button color
    justifyContent: 'center',
  },
  closeBtnFooterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e2e',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    gap: 8,
  },
  downloadBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  }
});
