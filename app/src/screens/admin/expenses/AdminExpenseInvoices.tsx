import React, { useState, useMemo, useEffect } from 'react';
import { 
  StyleSheet, View, Text, ScrollView, TouchableOpacity, 
  Modal, Platform, TextInput, KeyboardAvoidingView, Image, Alert
} from 'react-native';
import { 
  FileText, Check, ChevronRight, CalendarDays, Receipt, ChevronLeft, Share2, Download, Trash2
} from 'lucide-react-native';
import {
  fmt, todayISO, getCategoryIconComponent, formatDateToDDMMYYYY, formatDateTime
} from './AdminExpenseUtils';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../context/AuthContext';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

export default function AdminExpenseInvoices({
  expenses,
  pendingInvoiceEntries,
  clearPendingInvoice,
  onSendForApproval,
  onDeleteInvoice
}: any) {
  const { member } = useAuth();
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor
  } = useAdminTheme();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [combinedPreview, setCombinedPreview] = useState<{entries: any[], label: string, invNo?: string} | null>(null);
  const [preparedBy, setPreparedBy] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showAdminSelector, setShowAdminSelector] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [fetchingAdmins, setFetchingAdmins] = useState(false);
  const invoiceRef = React.useRef<View>(null);

  const openAdminSelector = async () => {
    setShowAdminSelector(true);
    if (admins.length === 0) {
      setFetchingAdmins(true);
      try {
        let loaded: any[] = [];
        try {
          const SalesforceService = require('../../../services/SalesforceService').default;
          if (SalesforceService && typeof SalesforceService.getApprovers === 'function') {
            loaded = await SalesforceService.getApprovers();
          }
        } catch (e) {}
        if (!loaded || loaded.length === 0) {
          const FirestoreService = require('../../../services/FirestoreService').default;
          if (FirestoreService && typeof FirestoreService.getAdminMembers === 'function') {
            loaded = await FirestoreService.getAdminMembers();
          }
        }
        setAdmins(loaded || []);
      } catch (err) {
        console.log('Failed to fetch admins', err);
      }
      setFetchingAdmins(false);
    }
  };

  const shareInvoice = async () => {
    try {
      if (invoiceRef.current) {
        const uri = await captureRef(invoiceRef.current, { format: 'png', quality: 1 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { UTI: 'public.png', mimeType: 'image/png', dialogTitle: 'Share Invoice' });
        } else {
          alert("Sharing is not available on this device");
        }
      }
    } catch (err) {
      alert("Failed to share invoice");
      console.error(err);
    }
  };

  const downloadInvoice = async () => {
    try {
      if (invoiceRef.current) {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          const uri = await captureRef(invoiceRef.current, { format: 'png', quality: 1 });
          await MediaLibrary.saveToLibraryAsync(uri);
          setToastMsg("Invoice saved to your gallery!");
          setTimeout(() => setToastMsg(null), 3500);
        } else {
          alert("Permission to save photos is required.");
        }
      }
    } catch (err) {
      alert("Failed to download invoice");
      console.error(err);
    }
  };

  const pdfInvoice = async () => {
    try {
      if (invoiceRef.current) {
        let pdfName = "Invoice-ChurchOfGod";
        if (combinedPreview) {
          if (combinedPreview.entries.length === 1) {
            const e = combinedPreview.entries[0];
            if (e.eventName) {
              pdfName = `${e.eventName}_invoice-churchofgod`;
            } else {
              const baseName = e.vendor ? e.vendor : (e.items[0]?.category || "Expense");
              pdfName = `${baseName}_invoice-churchofgod`;
            }
          } else {
            pdfName = `${combinedPreview.label.replace(/[^a-zA-Z0-9]/g, '')}_invoice-churchofgod`;
          }
        }
        
        const safeName = pdfName.replace(/[^a-zA-Z0-9-]/g, '_');

        const dataUri = await captureRef(invoiceRef.current, { format: 'png', quality: 1, result: 'data-uri' });
        const html = `
          <html>
            <body style="margin:0;padding:0;display:flex;justify-content:center;align-items:center;background-color:#F8FAFC;">
              <img src="${dataUri}" style="max-width:100%;max-height:100vh;object-fit:contain;" />
            </body>
          </html>
        `;
        const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
        
        const sourceFile = new File(uri);
        const targetFile = new File(Paths.cache, `${safeName}.pdf`);
        
        if (targetFile.exists) {
          targetFile.delete();
        }
        
        await sourceFile.copy(targetFile);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(targetFile.uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Share PDF Invoice' });
        } else {
          alert("Sharing is not available on this device");
        }
      }
    } catch (err) {
      alert("Failed to generate PDF");
      console.error(err);
    }
  };

  const invoicedGroups = useMemo(() => {
    const map: any = {};
    expenses.forEach((e: any) => {
      const invs = new Set<string>();
      if (e.invoiceNumber) invs.add(e.invoiceNumber);
      if (e.invoiceNumbers && Array.isArray(e.invoiceNumbers)) {
        e.invoiceNumbers.forEach((i: string) => invs.add(i));
      }
      
      invs.forEach(inv => {
        if (!map[inv]) map[inv] = [];
        map[inv].push(e);
      });
    });
    return Object.entries(map).map(([invNo, list]: any) => ({ invNo, list })).sort((a: any, b: any) => {
      const dateA = a.list[0].invoiceDate || a.list[0].date || "";
      const dateB = b.list[0].invoiceDate || b.list[0].date || "";
      return dateB.localeCompare(dateA);
    });
  }, [expenses]);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  useEffect(() => {
    if (pendingInvoiceEntries && pendingInvoiceEntries.length > 0) {
      const invNo = pendingInvoiceEntries[0].invoiceNumber;
      let label = pendingInvoiceEntries.length === 1 
        ? (pendingInvoiceEntries[0].eventName ? `Event — ${pendingInvoiceEntries[0].eventName}` : "Normal Expense") 
        : "Multiple Expenses";
      
      setCombinedPreview({ entries: pendingInvoiceEntries, label, invNo });
      if (clearPendingInvoice) clearPendingInvoice();
    }
  }, [pendingInvoiceEntries]);

  useEffect(() => {
    if (combinedPreview) {
      const preparedBys = [...new Set(combinedPreview.entries.map((e: any) => e.submittedBy).filter(Boolean))];
      setPreparedBy(preparedBys.length > 0 ? preparedBys.join(', ') : member?.name || '');
    }
  }, [combinedPreview, member]);

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {invoicedGroups.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
            <FileText size={40} color={secondaryText} />
          </View>
          <Text style={[styles.emptyTitle, { color: primaryText }]}>
            No Invoices Generated Yet
          </Text>
          <Text style={[styles.emptySub, { color: secondaryText }]}>
            Go to the Expenses tab, tap any expense row, and select "Generate Invoice" or check multiple expenses to bundle an invoice.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {invoicedGroups.map(({ invNo, list }: any) => {
            const e = list[0];
            const sum = list.reduce((s: number, exp: any) => s + exp.items.reduce((s2: number, i: any) => s2 + Number(i.amount), 0), 0);
            const label = list.length === 1 
              ? (e.eventName || 'Normal Expense') 
              : (list.every((ex: any) => ex.eventName === e.eventName) ? (e.eventName || 'Normal Expenses') : 'Multiple Expenses');
            
            const approvedBys = [...new Set(list.map((exp: any) => exp.approvedBy).filter(Boolean))];
            const approvedByStr = approvedBys.length > 0 ? approvedBys.join(', ') : null;
            
            return (
              <TouchableOpacity
                key={invNo}
                style={[
                  styles.invoiceCard,
                  {
                    backgroundColor: cardSurface,
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
                    shadowColor: isDark ? '#000000' : '#0F172A',
                  }
                ]}
                onPress={() => setCombinedPreview({ entries: list, label, invNo })}
                activeOpacity={0.75}
              >
                <View style={styles.invoiceCardContent}>
                  <View style={styles.invoiceCardLeft}>
                    <Text style={[styles.invoiceCardAmt, { color: primaryText }]}>{fmt(sum)}</Text>
                    <Text style={[styles.invoiceCardLabel, { color: primaryText }]} numberOfLines={1}>{label}</Text>
                    <Text style={[styles.invoiceCardCount, { color: secondaryText }]}>
                      {list.length} {list.length !== 1 ? 'expenses' : 'expense'}
                    </Text>
                    {(() => {
                      const isRejected = list.some((exp: any) => exp.status === 'Rejected');
                      if (isRejected && approvedByStr) {
                        return (
                          <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2' }]}>
                            <Text style={[styles.statusBadgeText, { color: '#EF4444' }]}>REJECTED BY {approvedByStr.toUpperCase()}</Text>
                          </View>
                        );
                      }
                      if (approvedByStr) {
                        return (
                          <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5' }]}>
                            <Check size={11} color="#10B981" strokeWidth={3} />
                            <Text style={[styles.statusBadgeText, { color: '#10B981' }]}>APPROVED BY {approvedByStr.toUpperCase()}</Text>
                          </View>
                        );
                      }
                      return (
                        <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' }]}>
                          <Text style={[styles.statusBadgeText, { color: '#F59E0B' }]}>PENDING APPROVAL</Text>
                        </View>
                      );
                    })()}
                  </View>

                  <View style={styles.invoiceCardRight}>
                    <View style={styles.invoiceCardRightTop}>
                      <View style={[styles.invoiceCardBadge, { backgroundColor: '#10B981' }]}>
                        <Text style={styles.invoiceCardBadgeText}>{invNo}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.invoiceCardDeleteIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2' }]}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        onPress={() => {
                          Alert.alert(
                            "Delete Invoice?",
                            "This will un-group these expenses and remove the invoice number.",
                            [
                              { text: "Cancel", style: "cancel" },
                              { text: "Delete", style: "destructive", onPress: () => {
                                if (onDeleteInvoice) onDeleteInvoice(invNo);
                              }}
                            ]
                          );
                        }}
                      >
                        <Trash2 size={13} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                    
                    <View style={styles.invoiceCardRightBottom}>
                      <CalendarDays size={12} color={secondaryText} />
                      <Text style={[styles.invoiceCardDate, { color: secondaryText }]}>
                        {formatDateTime(e.invoiceDate || e.date)}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Invoice Preview Modal ── */}
      <Modal visible={!!combinedPreview} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.sheetOverlay}>
            <View
              style={[
                styles.sheetContent,
                {
                  backgroundColor: cardSurface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor
                }
              ]}
            >
              <View style={[styles.sheetHandle, { backgroundColor: isDark ? '#3F3F46' : '#CBD5E1' }]} />
              <View style={[styles.sheetHead, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : borderColor }]}>
                <Text style={[styles.sheetTitle, { color: primaryText }]}>Invoice Preview</Text>
                <TouchableOpacity
                  style={[styles.iconBtnRound, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#F1F5F9' }]}
                  onPress={() => { setCombinedPreview(null); exitSelectMode(); }}
                >
                  <ChevronLeft size={20} color={primaryText} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
                {combinedPreview && (() => {
                  const isSingle = combinedPreview.entries.length === 1;
                  const invNo = combinedPreview.invNo || `INV-COG0001`;
                  const invDate = isSingle ? formatDateToDDMMYYYY(combinedPreview.entries[0].date || todayISO()) : new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
                  
                  const eventNames = [...new Set(combinedPreview.entries.map((e: any) => e.eventName).filter(Boolean))];
                  const normalCount = combinedPreview.entries.filter((e: any) => !e.eventName).length;
                  const types = [...eventNames];
                  if (normalCount > 0) types.push(normalCount > 1 ? "Normal Expenses" : "Normal Expense");
                  const invType = types.length > 0 ? types.join(', ') : 'Normal Expense';

                  const paidBys = [...new Set(combinedPreview.entries.map((e: any) => e.paidBy).filter(Boolean))];
                  const paidBy = paidBys.length > 0 ? paidBys.join(', ') : '—';

                  const payMethods = [...new Set(combinedPreview.entries.map((e: any) => e.paymentMethod).filter(Boolean))];
                  const payMethod = payMethods.length > 0 ? payMethods.join(', ') : '—';

                  const refNo = isSingle ? combinedPreview.entries[0].reference : '';
                  
                  const approvedBys = [...new Set(combinedPreview.entries.map((e: any) => e.approvedBy).filter(Boolean))];
                  const derivedApprovedBy = approvedBys.length > 0 ? approvedBys.join(', ') : '';
                  const isRejected = combinedPreview.entries.some((e: any) => e.status === 'Rejected');

                  return (
                    <View style={{ marginBottom: 40, width: '100%' }}>
                      {toastMsg && (
                        <View style={{ position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center', zIndex: 999, elevation: 10 }}>
                          <View style={styles.successToast}>
                            <View style={styles.successIconCircle}>
                              <Check size={16} color="#fff" strokeWidth={3} />
                            </View>
                            <Text style={styles.successText}>{toastMsg}</Text>
                          </View>
                        </View>
                      )}
                      
                      {/* Printable Invoice Document */}
                      <View style={styles.invoiceDoc} ref={invoiceRef} collapsable={false}>
                        <View style={styles.watermarkContainer} pointerEvents="none">
                          <Image source={require('../../../../assets/logo.png')} style={styles.watermarkImage} resizeMode="contain" />
                        </View>
                        <Text style={styles.invoiceDocTitle}>CHURCH OF GOD</Text>
                        <Text style={styles.invoiceDocSub}>Official Invoice</Text>
                        
                        <View style={styles.detailGrid}>
                          <View style={styles.detailRow}>
                            <View style={styles.detailCell}>
                              <Text style={styles.detailLabel}>Invoice No</Text>
                              <Text style={styles.detailValue}>{invNo}</Text>
                            </View>
                            <View style={styles.detailCell}>
                              <Text style={styles.detailLabel}>Date</Text>
                              <Text style={styles.detailValue}>{invDate}</Text>
                            </View>
                          </View>
                          <View style={styles.detailRow}>
                            <View style={styles.detailCell}>
                              <Text style={styles.detailLabel}>Event Type</Text>
                              <Text style={styles.detailValue}>{invType}</Text>
                            </View>
                            <View style={styles.detailCell}>
                              <Text style={styles.detailLabel}>Paid By</Text>
                              <Text style={styles.detailValue}>{paidBy}</Text>
                            </View>
                          </View>
                          <View style={styles.detailRow}>
                            <View style={styles.detailCell}>
                              <Text style={styles.detailLabel}>Payment Method</Text>
                              <Text style={styles.detailValue}>{payMethod}</Text>
                            </View>
                            <View style={styles.detailCell}>
                              {!!refNo && (
                                <>
                                  <Text style={styles.detailLabel}>Ref No</Text>
                                  <Text style={styles.detailValue}>{refNo}</Text>
                                </>
                              )}
                            </View>
                          </View>
                        </View>
                        
                        {/* Summary List */}
                        <View style={{ marginTop: 16 }}>
                          <View style={styles.invoiceTableHeader}>
                            <Text style={[styles.invoiceTableHeadText, { flex: 2 }]}>Category</Text>
                            <Text style={[styles.invoiceTableHeadText, { flex: 3 }]}>Details / Vendor</Text>
                            <Text style={[styles.invoiceTableHeadText, { flex: 1.5, textAlign: 'right' }]}>Amount</Text>
                          </View>
                          {combinedPreview.entries.map((entry: any) => {
                            return entry.items.map((i: any) => {
                              const ItemIcon = getCategoryIconComponent(i.category);
                              return (
                                <View key={`${entry.id}-${i.id}`} style={styles.invoiceTableRow}>
                                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <ItemIcon size={13} color="#059669" />
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#0F172A' }} numberOfLines={1}>{i.category}</Text>
                                  </View>
                                  <View style={{ flex: 3, justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 11.5, color: '#0F172A', fontWeight: '500' }} numberOfLines={1}>{i.vendor || entry.vendor || 'No Vendor'}</Text>
                                    {i.detail && <Text style={{ fontSize: 10.5, color: '#64748B' }} numberOfLines={1}>{i.detail}</Text>}
                                  </View>
                                  <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 12, color: '#0F172A', fontWeight: '600' }}>{fmt(i.amount)}</Text>
                                </View>
                              );
                            });
                          })}
                        </View>
                        
                        <View style={styles.ledgerTotalRow}>
                          <Text style={styles.ledgerTotalLabel}>Grand Total</Text>
                          <Text style={styles.ledgerTotalAmt}>
                            {fmt(combinedPreview.entries.reduce((s: number, entry: any) => s + entry.items.reduce((s2: number, i: any) => s2 + Number(i.amount), 0), 0))}
                          </Text>
                        </View>

                        <View style={styles.signatureRow}>
                          <View style={styles.signatureCol}>
                            <TextInput style={styles.signatureInput} value={preparedBy} onChangeText={setPreparedBy} placeholder="Name" placeholderTextColor="#94A3B8" />
                            <View style={styles.signatureLine} />
                            <Text style={styles.signatureLabel}>PREPARED BY</Text>
                          </View>
                          <View style={styles.signatureCol}>
                            <TextInput style={[styles.signatureInput, isRejected ? { color: '#B91C1C' } : {}]} value={derivedApprovedBy} editable={false} placeholder="Pending" placeholderTextColor="#94A3B8" />
                            <View style={[styles.signatureLine, isRejected ? { backgroundColor: '#FCA5A5' } : {}]} />
                            <Text style={[styles.signatureLabel, isRejected ? { color: '#B91C1C' } : {}]}>{isRejected ? 'REJECTED BY' : 'APPROVED BY'}{"\n"}(PASTOR / TREASURER)</Text>
                          </View>
                        </View>

                        <Text style={styles.invoiceFooter}>CHURCH OF GOD</Text>
                      </View>

                      {/* Download / Share / PDF Actions */}
                      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16 }}>
                        <TouchableOpacity style={[styles.badgeBtn, { backgroundColor: '#10B981' }]} onPress={downloadInvoice}>
                          <Download size={14} color="#fff" />
                          <Text style={styles.badgeBtnText}>Download</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.badgeBtn, { backgroundColor: '#0EA5E9' }]} onPress={shareInvoice}>
                          <Share2 size={14} color="#fff" />
                          <Text style={styles.badgeBtnText}>Share</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.badgeBtn, { backgroundColor: '#6366F1' }]} onPress={pdfInvoice}>
                          <FileText size={14} color="#fff" />
                          <Text style={styles.badgeBtnText}>PDF</Text>
                        </TouchableOpacity>
                      </View>

                      {combinedPreview.entries.some((entry: any) => entry.status === 'Draft' || !entry.status || entry.status === 'Rejected') && (
                        <TouchableOpacity
                          style={[styles.badgeBtn, { backgroundColor: '#10B981', marginTop: 14, width: '100%', justifyContent: 'center', paddingVertical: 14, borderRadius: 14 }]}
                          onPress={openAdminSelector}
                        >
                          <Text style={[styles.badgeBtnText, { fontSize: 15, fontWeight: '700' }]}>Send for Approval</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })()}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Admin Selector Modal ── */}
      <Modal visible={showAdminSelector} transparent animationType="fade">
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheetContent, { backgroundColor: cardSurface, maxHeight: '60%' }]}>
            <View style={[styles.sheetHandle, { backgroundColor: isDark ? '#3F3F46' : '#CBD5E1' }]} />
            <View style={[styles.sheetHead, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : borderColor }]}>
              <Text style={[styles.sheetTitle, { color: primaryText }]}>Select Approver</Text>
              <TouchableOpacity
                style={[styles.iconBtnRound, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#F1F5F9' }]}
                onPress={() => setShowAdminSelector(false)}
              >
                <ChevronLeft size={20} color={primaryText} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetBody}>
              {fetchingAdmins ? (
                <Text style={{ textAlign: 'center', padding: 20, color: secondaryText }}>Loading admins...</Text>
              ) : admins.length === 0 ? (
                <Text style={{ textAlign: 'center', padding: 20, color: secondaryText }}>No admins found.</Text>
              ) : (
                admins.map(admin => (
                  <TouchableOpacity
                    key={admin.id}
                    style={{
                      padding: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : borderColor,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onPress={() => {
                      setShowAdminSelector(false);
                      if (onSendForApproval && combinedPreview) {
                        combinedPreview.entries.forEach((entry: any) => {
                          if (entry.status === 'Draft' || !entry.status || entry.status === 'Rejected') {
                            onSendForApproval(entry, admin);
                          }
                        });
                        setCombinedPreview(null);
                        exitSelectMode();
                      }
                    }}
                  >
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: primaryText }}>{admin.name}</Text>
                      <Text style={{ fontSize: 12, color: secondaryText, marginTop: 2 }}>{admin.userType || 'Admin'}</Text>
                    </View>
                    <ChevronRight size={18} color="#10B981" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  invoiceCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  invoiceCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceCardLeft: {
    flex: 1,
    paddingRight: 12,
  },
  invoiceCardAmt: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  invoiceCardLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  invoiceCardCount: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  invoiceCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  invoiceCardRightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  invoiceCardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  invoiceCardBadgeText: {
    fontSize: 10.5,
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  invoiceCardDeleteIcon: {
    padding: 6,
    borderRadius: 6,
  },
  invoiceCardRightBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  invoiceCardDate: {
    fontSize: 11,
    fontWeight: '500',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  iconBtnRound: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: {
    padding: 18,
  },
  invoiceDoc: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    borderRadius: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  watermarkContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  watermarkImage: {
    width: 260,
    height: 260,
    opacity: 0.12,
  },
  invoiceDocTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  invoiceDocSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 16,
  },
  detailGrid: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    paddingBottom: 2,
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailCell: {
    flex: 1,
    paddingRight: 8,
  },
  detailLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#64748B',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  invoiceTableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
    paddingBottom: 6,
    marginBottom: 4,
  },
  invoiceTableHeadText: {
    fontWeight: '700',
    color: '#475569',
    fontSize: 12,
  },
  invoiceTableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  ledgerTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#0F172A',
  },
  ledgerTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  ledgerTotalAmt: {
    fontSize: 17,
    fontWeight: '800',
    color: '#059669',
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    gap: 16,
  },
  signatureCol: {
    flex: 1,
    alignItems: 'center',
  },
  signatureLine: {
    height: 1,
    backgroundColor: '#CBD5E1',
    width: '100%',
    marginBottom: 4,
  },
  signatureInput: {
    fontSize: 12,
    color: '#0F172A',
    textAlign: 'center',
    padding: 0,
    minHeight: 18,
    width: '100%',
    fontWeight: '600',
  },
  signatureLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  invoiceFooter: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 24,
    letterSpacing: 1,
    fontWeight: '700',
  },
  badgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  badgeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  successToast: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  successIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successText: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
