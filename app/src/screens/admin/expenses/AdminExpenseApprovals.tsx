import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Platform } from 'react-native';
import { fmt, formatDateToDDMMYYYY } from './AdminExpenseUtils';
import { FileText, Check, X, User, Trash2 } from 'lucide-react-native';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../context/AuthContext';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

export default function AdminExpenseApprovals({ expenses, onGenerateInvoice, onDelete }: any) {
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

  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  
  const pending = expenses.filter((e: any) => 
    e.status === 'Pending Approval'
  ).sort((a: any, b: any) => (a.submittedAt < b.submittedAt ? 1 : -1));

  const approved = expenses.filter((e: any) => 
    e.status === 'Approved'
  ).sort((a: any, b: any) => (a.approvedAt < b.approvedAt ? 1 : -1));

  const rejected = expenses.filter((e: any) => 
    e.status === 'Rejected'
  ).sort((a: any, b: any) => (a.approvedAt < b.approvedAt ? 1 : -1));

  const currentList = activeTab === 'pending' ? pending : activeTab === 'approved' ? approved : rejected;

  const handleApprove = async (expense: any) => {
    try {
      await db.collection('ledger_expenses').doc(expense.id).update({
        status: 'Approved',
        approvedBy: member?.name || 'Admin',
        approvedAt: new Date().toISOString(),
        approvalRemarks: ''
      });
      Alert.alert("Approved", "The expense has been approved.");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not approve the expense.");
    }
  };

  const handleReject = async (expense: any) => {
    if (!remarks.trim()) {
      Alert.alert("Validation", "Please enter rejection remarks.");
      return;
    }
    try {
      await db.collection('ledger_expenses').doc(expense.id).update({
        status: 'Rejected',
        approvedBy: member?.name || 'Admin',
        approvedAt: new Date().toISOString(),
        approvalRemarks: remarks
      });
      setRejectId(null);
      setRemarks("");
      Alert.alert("Rejected", "The expense has been rejected.");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not reject the expense.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* ── Filter Tabs ── */}
      <View
        style={[
          styles.tabContainer,
          {
            backgroundColor: cardSurface,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor
          }
        ]}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
          onPress={() => setActiveTab('pending')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'pending' ? '#10B981' : secondaryText }
            ]}
          >
            Pending ({pending.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'approved' && styles.activeTab]}
          onPress={() => setActiveTab('approved')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'approved' ? '#10B981' : secondaryText }
            ]}
          >
            Approved ({approved.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rejected' && styles.activeTab]}
          onPress={() => setActiveTab('rejected')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'rejected' ? '#10B981' : secondaryText }
            ]}
          >
            Rejected ({rejected.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {currentList.length === 0 ? (
          <View style={styles.empty}>
            {activeTab === 'pending' ? (
              <>
                <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#D1FAE5' }]}>
                  <Check size={32} color="#10B981" strokeWidth={2.6} />
                </View>
                <Text style={[styles.emptyText, { color: primaryText }]}>All Caught Up!</Text>
                <Text style={[styles.emptySub, { color: secondaryText }]}>There are no pending expenses requiring approval.</Text>
              </>
            ) : (
              <>
                <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}>
                  <FileText size={32} color={secondaryText} />
                </View>
                <Text style={[styles.emptyText, { color: primaryText }]}>No {activeTab} expenses</Text>
                <Text style={[styles.emptySub, { color: secondaryText }]}>No expenses currently in {activeTab} status.</Text>
              </>
            )}
          </View>
        ) : (
          currentList.map((e: any) => {
            const sum = e.items.reduce((s: number, i: any) => s + Number(i.amount), 0);
            return (
              <View
                key={e.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: cardSurface,
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
                    shadowColor: isDark ? '#000000' : '#0F172A',
                  }
                ]}
              >
                <View style={styles.cardHead}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.title, { color: primaryText }]} numberOfLines={1}>
                      {e.eventName || e.items[0]?.category || 'Expense'}
                    </Text>
                    <Text style={[styles.subtitle, { color: secondaryText }]}>
                      {formatDateToDDMMYYYY(e.date)}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: '#10B981' }]}>{fmt(sum)}</Text>
                </View>

                <View
                  style={[
                    styles.detailsRow,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : borderColor,
                    },
                    activeTab !== 'pending' && { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <User size={14} color={secondaryText} />
                    <Text style={[styles.detailsText, { color: primaryText }]}>
                      Submitted by <Text style={{ fontWeight: '700' }}>{e.submittedBy || 'Admin'}</Text>
                    </Text>
                  </View>
                  {activeTab !== 'pending' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {activeTab === 'approved' ? (
                        <Check size={14} color="#10B981" />
                      ) : (
                        <X size={14} color="#EF4444" />
                      )}
                      <Text style={[styles.detailsText, { color: primaryText }]}>
                        {activeTab === 'approved' ? 'Approved' : 'Rejected'} by <Text style={{ fontWeight: '700' }}>{e.approvedBy || 'Admin'}</Text>
                      </Text>
                    </View>
                  )}
                </View>

                {activeTab === 'pending' ? (
                  rejectId === e.id ? (
                    <View style={[styles.rejectBox, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}>
                      <Text style={[styles.rejectLabel, { color: '#EF4444' }]}>Rejection Remarks (Required):</Text>
                      <TextInput
                        style={[
                          styles.rejectInput,
                          {
                            backgroundColor: cardSurface,
                            borderColor: '#FCA5A5',
                            color: primaryText
                          }
                        ]}
                        placeholder="Why is this expense being rejected?"
                        placeholderTextColor={secondaryText}
                        value={remarks}
                        onChangeText={setRemarks}
                        multiline
                      />
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[styles.btn, styles.btnCancel, { backgroundColor: secondarySurface, borderColor }]}
                          onPress={() => { setRejectId(null); setRemarks(""); }}
                        >
                          <Text style={[styles.btnCancelText, { color: primaryText }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.btn, styles.btnReject, { backgroundColor: '#EF4444' }]}
                          onPress={() => handleReject(e)}
                        >
                          <Text style={styles.btnRejectText}>Confirm Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'column', gap: 10 }}>
                      {(!e.approverId || e.approverId === member?.id) ? (
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity
                            style={[
                              styles.badgeBtn,
                              { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2', borderColor: '#EF4444' }
                            ]}
                            onPress={() => setRejectId(e.id)}
                          >
                            <X size={16} color="#EF4444" />
                            <Text style={[styles.btnRejectOutlinedText, { color: '#EF4444' }]}>Reject</Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity
                            style={[styles.badgeBtn, { backgroundColor: '#10B981', borderColor: '#10B981' }]}
                            onPress={() => {
                              Alert.alert("Approve Expense", "Are you sure you want to approve this expense?", [
                                { text: "Cancel", style: "cancel" },
                                { text: "Approve", onPress: () => handleApprove(e) }
                              ]);
                            }}
                          >
                            <Check size={16} color="#fff" />
                            <Text style={styles.btnApproveText}>Approve</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13, color: secondaryText, fontStyle: 'italic' }}>
                            Waiting on {e.approverName || 'another admin'}
                          </Text>
                        </View>
                      )}

                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                          style={[
                            styles.btn,
                            { flex: 1, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }
                          ]}
                          onPress={() => onGenerateInvoice([e])}
                        >
                          <FileText size={15} color={primaryText} />
                          <Text style={[styles.btnGhostText, { color: primaryText }]}>Preview</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.btn,
                            { paddingHorizontal: 16, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2' }
                          ]}
                          onPress={() => {
                            Alert.alert("Delete Expense", "Are you sure you want to delete this expense?", [
                              { text: "Cancel", style: "cancel" },
                              { text: "Delete", style: "destructive", onPress: () => onDelete(e.id) }
                            ]);
                          }}
                        >
                          <Trash2 size={15} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                ) : (
                  <View style={styles.actionRow}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.btn,
                          { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }
                        ]}
                        onPress={() => onGenerateInvoice([e])}
                      >
                        <FileText size={15} color={primaryText} />
                        <Text style={[styles.btnGhostText, { color: primaryText }]}>Preview</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.btn,
                          { paddingHorizontal: 12, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2' }
                        ]}
                        onPress={() => {
                          Alert.alert("Delete Expense", "Are you sure you want to delete this expense?", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => onDelete(e.id) }
                          ]);
                        }}
                      >
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                    {e.approvalRemarks ? (
                      <Text style={{ flex: 1, fontSize: 12, color: secondaryText, marginLeft: 12 }} numberOfLines={2}>
                        <Text style={{ fontWeight: '700', color: primaryText }}>Note: </Text>{e.approvalRemarks}
                      </Text>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#10B981',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 100,
    gap: 12,
  },
  empty: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  amount: {
    fontSize: 18,
    fontWeight: '800',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  detailsText: {
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
  },
  badgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    justifyContent: 'center',
    flex: 1,
    borderWidth: 1.5,
  },
  btnGhostText: {
    fontSize: 13,
    fontWeight: '700',
  },
  btnApproveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  btnRejectOutlinedText: {
    fontSize: 13,
    fontWeight: '700',
  },
  rejectBox: {
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  rejectLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  rejectInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    minHeight: 64,
    fontSize: 13,
    marginBottom: 12,
  },
  btnCancel: {
    flex: 1,
    borderWidth: 1,
  },
  btnCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  btnReject: {
    flex: 1,
  },
  btnRejectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
