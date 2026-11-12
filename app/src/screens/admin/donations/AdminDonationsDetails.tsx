import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Image, StatusBar, Platform } from 'react-native';
import { ArrowLeft, User, Calendar, Tag, Target, FileText, CreditCard, Link, Receipt, Info, Clock, Edit2, Trash2, Download, Share2 } from 'lucide-react-native';
import { COLORS, formatCurrency, formatDate, getInitials, generateDonationReceipt, getDonationReceiptHTML, formatReceiptNo } from './AdminDonationsUtils';
import { db } from '../../../services/firebaseConfig';
import FirestoreService from '../../../services/FirestoreService';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

export default function AdminDonationsDetails({ donation, onNavigate }: any) {
  const { isDark } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const { user, member } = useAuth();
  
  const authorizerName = member?.name || user?.displayName || user?.email || 'Authorized Administrator';

  const confirmDelete = async () => {
    setDeleteModalVisible(false);
    try {
      try {
        await db.collection('ledger_donations').doc(donation.id).delete();
      } catch (fErr) {
        await FirestoreService.deleteDonation(donation.id);
      }
      setDeleteSuccess(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to delete donation.');
    }
  };

  const DetailRow = ({ icon: Icon, label, value, isLast = false, isLink = false, onPress }: any) => (
    <View 
      style={[
        styles.detailRow, 
        !isLast && { 
          borderBottomWidth: 1, 
          borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' 
        }
      ]}
    >
      <View style={styles.kwrap}>
        <View 
          style={[
            styles.iconChip,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }
          ]}
        >
          <Icon size={14} color={isDark ? '#E4E4E7' : '#475569'} />
        </View>
        <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 13.5, fontWeight: '500' }}>{label}</Text>
      </View>
      {isLink ? (
        <TouchableOpacity onPress={onPress} style={{ flex: 1, alignItems: 'flex-end', paddingLeft: 10 }}>
          <Text 
            style={[
              styles.detailValue, 
              { color: isDark ? '#FFFFFF' : '#000000', textDecorationLine: 'underline', fontWeight: '700' }
            ]} 
            numberOfLines={1}
          >
            {value || '—'}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flex: 1, alignItems: 'flex-end', paddingLeft: 10 }}>
          <Text 
            style={[
              styles.detailValue,
              { color: isDark ? '#FFFFFF' : '#0F172A', fontWeight: '600' }
            ]} 
            numberOfLines={2}
          >
            {value || '—'}
          </Text>
        </View>
      )}
    </View>
  );

  const receiptHtml = getDonationReceiptHTML(donation, authorizerName);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />

      {/* ── Modern Centered Header (Pure Black in Dark Mode, Pure White in White Mode) ── */}
      <View
        style={[
          styles.topbar,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomWidth: 1.5,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
            paddingTop: Platform.OS === 'ios' ? 56 : 16,
            paddingBottom: 10,
            paddingHorizontal: 16,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={() => onNavigate('list')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.4} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '800',
                color: isDark ? '#FFFFFF' : '#0F172A',
                textAlign: 'center',
              }}
              numberOfLines={1}
            >
              Donation Details
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: isDark ? '#94A3B8' : '#64748B',
                marginTop: 2,
                textAlign: 'center',
              }}
              numberOfLines={1}
            >
              {formatReceiptNo(donation.id)}
            </Text>
          </View>

          {/* Spacer to keep title centered */}
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + (Platform.OS === 'android' ? 56 : 32) }} 
        showsVerticalScrollIndicator={false}
      >
        {/* Compact Donor Hero Card */}
        <View 
          style={[
            styles.compactCard,
            {
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={styles.compactRow}>
            <View 
              style={[
                styles.donorAvatarSmall,
                { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }
              ]}
            >
              <Text style={[styles.avatarTextSmall, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                {getInitials(donation.name)}
              </Text>
            </View>
            <View style={styles.compactInfo}>
              <Text 
                style={[styles.heroNameSmall, { color: isDark ? '#FFFFFF' : '#0F172A' }]} 
                numberOfLines={1}
              >
                {donation.name === 'Anonymous' ? 'Unknown Donor' : donation.name}
              </Text>
              <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>
                {donation.type || 'Donation'}
              </Text>
            </View>
            <View style={styles.compactRight}>
              <Text style={[styles.heroAmountSmall, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                {formatCurrency(donation.amount)}
              </Text>
            </View>
          </View>
        </View>

        {/* Detailed Info Card */}
        <View 
          style={[
            styles.detailCard,
            {
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={styles.detailSectionTitle}>
            <Text style={[styles.sectionTitleText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>DONATION</Text>
            <View style={[styles.sectionTitleLine, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]} />
          </View>
          <DetailRow icon={User} label="Donor Name" value={donation.name} />
          <DetailRow icon={Calendar} label="Donation Date" value={formatDate(donation.date)} />
          <DetailRow icon={Tag} label="Donation Type" value={donation.type} />
          <DetailRow icon={Target} label="Purpose" value={donation.purpose} />
          <DetailRow icon={FileText} label="Notes" value={donation.notes} isLast />

          <View style={[styles.detailDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]} />
          <View style={styles.detailSectionTitle}>
            <Text style={[styles.sectionTitleText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>PAYMENT</Text>
            <View style={[styles.sectionTitleLine, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]} />
          </View>
          <DetailRow icon={CreditCard} label="Payment Method" value={donation.method} />
          <DetailRow icon={Link} label="Transaction Ref" value={donation.ref} />
          <DetailRow 
            icon={Receipt} 
            label="Attached Receipt" 
            value={donation.attachmentUrl ? "Available (View)" : "None"} 
            isLink={!!donation.attachmentUrl} 
            onPress={() => { if(donation.attachmentUrl) setShowAttachmentModal(true) }}
            isLast 
          />

          <View style={[styles.detailDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]} />
          <View style={styles.detailSectionTitle}>
            <Text style={[styles.sectionTitleText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>RECORD</Text>
            <View style={[styles.sectionTitleLine, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]} />
          </View>
          <DetailRow icon={Info} label="Created By" value={donation.createdBy || 'Admin'} />
          <DetailRow icon={Clock} label="Created Date" value={formatDate(donation.createdDate)} isLast />
        </View>

        {/* Monochrome Action Buttons */}
        <View style={styles.actionGrid}>
          <TouchableOpacity 
            style={[
              styles.actionBtn,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderWidth: 1.5,
              },
            ]} 
            onPress={() => setShowPdfModal(true)} 
            activeOpacity={0.75}
          >
            <Receipt size={18} color={isDark ? '#000000' : '#FFFFFF'} />
            <Text style={[styles.actionBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Generate Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.actionBtn,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderWidth: 1.5,
              },
            ]} 
            onPress={() => onNavigate('create', donation)} 
            activeOpacity={0.75}
          >
            <Edit2 size={18} color={isDark ? '#000000' : '#FFFFFF'} />
            <Text style={[styles.actionBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Edit Donation</Text>
          </TouchableOpacity>
        </View>

        {/* Delete Button */}
        <TouchableOpacity 
          style={[
            styles.dangerBtn,
            {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
              borderWidth: 1.5,
            },
          ]} 
          onPress={() => setDeleteModalVisible(true)} 
          activeOpacity={0.75}
        >
          <Trash2 size={16} color="#EF4444" />
          <Text style={styles.dangerBtnText}>Delete Donation</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ===== DELETE SUCCESS MODAL ===== */}
      <Modal visible={deleteSuccess} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 }}>
          <View 
            style={{
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderRadius: 28,
              padding: 32,
              width: '100%',
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
            }}
          >
            <View 
              style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: '#FEF2F2',
                borderWidth: 2, borderColor: '#FECACA',
                justifyContent: 'center', alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <Trash2 size={36} color="#EF4444" />
            </View>

            <Text style={{ fontSize: 20, fontWeight: '800', color: isDark ? '#FFFFFF' : '#111827', marginBottom: 8, textAlign: 'center' }}>
              Donation Deleted
            </Text>

            <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 8 }}>
              The donation record for
            </Text>
            <View style={{ backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                {donation.name === 'Anonymous' ? 'Unknown Donor' : donation.name}
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 24 }}>
              has been permanently removed.
            </Text>

            <TouchableOpacity
              style={{
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderWidth: 1.5,
                borderRadius: 16,
                paddingVertical: 14,
                paddingHorizontal: 32,
                width: '100%',
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
              onPress={() => onNavigate('list')}
            >
              <ArrowLeft size={18} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Back to Donations</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View 
            style={[
              styles.modalSheet,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderTopColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
                borderTopWidth: 1.5,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Delete this donation?</Text>
            <Text style={[styles.modalDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              This will permanently remove the record. This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[
                  styles.cancelBtn,
                  {
                    backgroundColor: isDark ? '#27272A' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
                    borderWidth: 1.5,
                  },
                ]} 
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmBtn, { backgroundColor: '#EF4444' }]} 
                onPress={confirmDelete}
              >
                <Text style={styles.confirmBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PDF Generation Modal */}
      <Modal visible={showPdfModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#F8FAFC' }}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />
          <View 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: 16, 
              paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44) + 12, 
              backgroundColor: isDark ? '#000000' : '#FFFFFF',
              borderBottomWidth: 1.5,
              borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
            }}
          >
            <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 18, fontWeight: '700' }}>Official Receipt</Text>
            <TouchableOpacity onPress={() => setShowPdfModal(false)} style={{ padding: 4 }}>
              <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 15, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </View>
          
          <View 
            style={{ 
              flex: 1, 
              margin: 16, 
              borderRadius: 12, 
              overflow: 'hidden', 
              borderWidth: 1.5, 
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1', 
              backgroundColor: '#FFFFFF',
            }}
          >
            <WebView originWhitelist={['*']} source={{ html: receiptHtml }} style={{ flex: 1 }} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, padding: 20, paddingBottom: 40 }}>
            <TouchableOpacity 
              style={{ 
                backgroundColor: isDark ? '#FFFFFF' : '#000000', 
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderWidth: 1.5,
                paddingHorizontal: 20, 
                paddingVertical: 12, 
                borderRadius: 24, 
                alignItems: 'center', 
                flexDirection: 'row', 
                gap: 8,
              }} 
              onPress={() => generateDonationReceipt(donation, false, authorizerName)}
            >
              <Download size={16} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Download</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ 
                backgroundColor: isDark ? '#FFFFFF' : '#000000', 
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderWidth: 1.5,
                paddingHorizontal: 20, 
                paddingVertical: 12, 
                borderRadius: 24, 
                alignItems: 'center', 
                flexDirection: 'row', 
                gap: 8,
              }} 
              onPress={() => generateDonationReceipt(donation, true, authorizerName)}
            >
              <Share2 size={16} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Attachment Viewer Modal */}
      <Modal visible={showAttachmentModal} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44) + 12, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Attached Receipt</Text>
            <TouchableOpacity onPress={() => setShowAttachmentModal(false)}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ flex: 1, marginTop: 90, marginBottom: 40, marginHorizontal: 20, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' }}>
            {donation.attachmentType === 'pdf' || donation.attachmentUrl?.includes('.pdf') ? (
              <WebView originWhitelist={['*']} source={{ uri: donation.attachmentUrl }} style={{ flex: 1 }} />
            ) : (
              <Image source={{ uri: donation.attachmentUrl }} style={{ width: '100%', height: '100%', resizeMode: 'contain' }} />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topbar: { width: '100%' },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactCard: {
    borderRadius: 16,
    padding: 16,
    marginTop: 6,
    marginBottom: 14,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  donorAvatarSmall: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextSmall: {
    fontSize: 18,
    fontWeight: '800',
  },
  compactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  heroNameSmall: {
    fontSize: 16,
    fontWeight: '700',
  },
  compactRight: {
    alignItems: 'flex-end',
  },
  heroAmountSmall: {
    fontSize: 18,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  detailCard: {
    borderRadius: 18,
    overflow: 'hidden',
    paddingBottom: 10,
    marginBottom: 16,
  },
  detailSectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitleText: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '800',
    marginRight: 8,
  },
  sectionTitleLine: {
    flex: 1,
    height: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  kwrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailValue: {
    fontSize: 14,
    textAlign: 'right',
  },
  detailDivider: {
    height: 1,
    marginHorizontal: 16,
    marginTop: 6,
  },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
    gap: 8,
  },
  dangerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 13.5,
    marginBottom: 20,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
