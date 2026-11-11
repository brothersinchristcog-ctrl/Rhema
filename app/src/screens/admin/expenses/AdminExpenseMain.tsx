import React, { useState, useMemo, useContext, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Alert, DeviceEventEmitter, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LayoutDashboard, History, PlusCircle, Receipt, Menu, Check, ChevronLeft, ArrowLeft } from 'lucide-react-native';

// Import sub-screens
import AdminExpenseDashboard from './AdminExpenseDashboard';
import AdminExpenseHistory from './AdminExpenseHistory';
import AdminExpenseAdd from './AdminExpenseAdd';
import AdminExpenseInvoices from './AdminExpenseInvoices';
import AdminExpenseApprovals from './AdminExpenseApprovals';
import { AdminTabContext } from '../../../context/AdminTabContext';
import { db, functions, FieldValue } from '../../../services/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../context/AuthContext';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

const TAB_TITLES: any = {
  dashboard: 'Expense Overview',
  add: 'New Expense',
  history: 'Expense Ledger',
  invoice: 'Expense Invoices',
  approvals: 'Expense Approvals'
};

const BASE_TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "history",   label: "Expenses",  icon: History },
  { id: "invoice",   label: "Invoices",  icon: Receipt },
];

export default function AdminExpenseMain({ onBack }: any) {
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor,
    barStyle
  } = useAdminTheme();

  const adminTabCtx = useContext(AdminTabContext) as any;
  const openDrawer = adminTabCtx?.openDrawer;
  const setActiveAdminTab = adminTabCtx?.setActiveTab;

  const { member } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [historyRange, setHistoryRange] = useState("all");
  const [pendingInvoiceEntries, setPendingInvoiceEntries] = useState<any[] | null>(null);

  const TABS = useMemo(() => {
    const ut = member?.userType?.toLowerCase() || '';
    const isAdmin = ut === 'admin' || ut === 'pastor' || ut === 'system administrator' || ut.includes('admin') || ut.includes('pastor');
    
    if (isAdmin) {
      return [...BASE_TABS, { id: "approvals", label: "Approvals", icon: Check }];
    }
    return BASE_TABS;
  }, [member?.userType]);

  useEffect(() => {
    const unsubscribe = db.collection('ledger_expenses')
      .orderBy('date', 'desc')
      .onSnapshot(
        (snapshot: any) => {
          if (snapshot && snapshot.docs) {
            const fetched = snapshot.docs.map((doc: any) => ({
              id: doc.id,
              ...doc.data()
            }));
            setExpenses(fetched);
          } else {
            setExpenses([]);
          }
          setLoading(false);
        },
        (error: any) => {
          console.error("Error fetching ledger expenses:", error);
          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('NAVIGATE_ADMIN_INNER', (innerTab) => {
      setActiveTab(innerTab);
    });
    return () => sub.remove();
  }, []);

  const handleBackOrMenu = () => {
    if (activeTab !== 'dashboard') {
      setActiveTab('dashboard');
      return;
    }
    if (openDrawer) {
      openDrawer();
    } else if (onBack) {
      onBack();
    } else if (setActiveAdminTab) {
      setActiveAdminTab(0);
      DeviceEventEmitter.emit('NAVIGATE_ADMIN', 0);
    }
  };

  const goToHistoryWithRange = (range: string) => {
    setHistoryRange(range);
    setActiveTab("history");
  };
  
  const handleGenerateInvoiceFromHistory = async (entries: any[]) => {
    if (entries.length === 0) return;
    
    if (entries.length === 1 && entries[0].invoiceNumber) {
      setPendingInvoiceEntries(entries);
      setActiveTab("invoice");
      return;
    }
    
    let maxSeq = 0;
    expenses.forEach((ex: any) => {
      const checkMax = (inv: string) => {
        if (inv && inv.startsWith('INV-COG')) {
          const numStr = inv.replace('INV-COG', '');
          const num = parseInt(numStr, 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      };
      
      if (ex.invoiceNumber) checkMax(ex.invoiceNumber);
      if (ex.invoiceNumbers && Array.isArray(ex.invoiceNumbers)) {
        ex.invoiceNumbers.forEach(checkMax);
      }
    });

    let asyncSeq = parseInt(await AsyncStorage.getItem('inv_seq') || '0', 10);
    let nextSeq = Math.max(maxSeq, asyncSeq) + 1;
    await AsyncStorage.setItem('inv_seq', nextSeq.toString());

    const invNo = `INV-COG${nextSeq.toString().padStart(4, '0')}`;
    const invoiceDate = new Date().toISOString();
    const batch = db.batch();
    
    let updatedCount = 0;
    entries.forEach(e => {
      if (e.invoiceNumber !== invNo && !(e.invoiceNumbers || []).includes(invNo)) {
        const ref = db.collection('ledger_expenses').doc(e.id);
        batch.update(ref, { 
          invoiceNumber: e.invoiceNumber || invNo,
          invoiceNumbers: FieldValue.arrayUnion(invNo), 
          invoiceDate 
        });
        updatedCount++;
      }
    });
    
    if (updatedCount > 0) {
      try {
        await batch.commit();
      } catch (err) {
        console.error("Failed to save invoice number:", err);
        Alert.alert("Error", "Could not generate invoice.");
        return;
      }
    }
    
    const updatedEntries = entries.map(e => ({ 
      ...e, 
      invoiceNumber: e.invoiceNumber || invNo, 
      invoiceNumbers: [...(e.invoiceNumbers || []), invNo],
      invoiceDate: e.invoiceDate || invoiceDate 
    }));
    
    setPendingInvoiceEntries(updatedEntries);
    setActiveTab("invoice");
  };

  const handleDeleteInvoice = async (invNo: string) => {
    try {
      const batch = db.batch();
      let updatedCount = 0;
      expenses.forEach(e => {
        const hasInv = e.invoiceNumber === invNo || (e.invoiceNumbers && e.invoiceNumbers.includes(invNo));
        if (hasInv) {
          const ref = db.collection('ledger_expenses').doc(e.id);
          const updateData: any = {
            invoiceNumbers: FieldValue.arrayRemove(invNo)
          };
          if (e.invoiceNumber === invNo) {
             const remaining = (e.invoiceNumbers || []).filter((i: string) => i !== invNo);
             updateData.invoiceNumber = remaining.length > 0 ? remaining[0] : null;
             if (remaining.length === 0) updateData.invoiceDate = null;
          }
          batch.update(ref, updateData);
          updatedCount++;
        }
      });
      if (updatedCount > 0) {
        await batch.commit();
        Alert.alert("Deleted", "Invoice has been deleted.");
      }
    } catch (err) {
      console.error("Error deleting invoice:", err);
      Alert.alert("Error", "Could not delete the invoice.");
    }
  };
  
  const suggestedEvents = useMemo(() => {
    const events = expenses.map((e: any) => e.eventName).filter(Boolean);
    return Array.from(new Set(events));
  }, [expenses]);
  
  const usedCategories = useMemo(() => {
    const cats: string[] = [];
    expenses.forEach((e: any) => {
      e.items.forEach((i: any) => cats.push(i.category));
    });
    return Array.from(new Set(cats));
  }, [expenses]);

  const handleSaveExpense = async (newExpense: any) => {
    try {
      const updatePayload = {
        ...newExpense,
        status: 'Draft',
        approvedBy: FieldValue.delete(),
        approvedAt: FieldValue.delete(),
        approvalRemarks: FieldValue.delete(),
        approverId: FieldValue.delete(),
        approverName: FieldValue.delete(),
      };
      await db.collection('ledger_expenses').doc(newExpense.id).set(updatePayload, { merge: true });
      setEditingExpense(null);
      setActiveTab('history');
    } catch (error) {
      console.error("Error saving expense:", error);
      Alert.alert("Error", "Could not save the expense.");
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await db.collection('ledger_expenses').doc(id).delete();
    } catch (error) {
      console.error("Error deleting expense:", error);
      Alert.alert("Error", "Could not delete the expense.");
    }
  };

  const handleEdit = (expense: any) => {
    setEditingExpense(expense);
    setActiveTab('add');
  };

  const handleSendForApproval = async (expense: any, assignedAdmin?: any) => {
    try {
      let updateData: any = {
        status: 'Pending Approval',
        submittedAt: new Date().toISOString(),
        submittedBy: member?.name || 'Admin',
        approvedBy: FieldValue.delete(),
        rejectedReason: FieldValue.delete()
      };

      if (assignedAdmin) {
        updateData.approverId = assignedAdmin.id;
        updateData.approverName = assignedAdmin.name;
      }

      if (!expense.invoiceNumber) {
        let seq = parseInt(await AsyncStorage.getItem('inv_seq') || '0', 10);
        seq += 1;
        await AsyncStorage.setItem('inv_seq', seq.toString());
        const invNo = `INV-COG${seq.toString().padStart(4, '0')}`;
        updateData.invoiceNumber = invNo;
      }

      await db.collection('ledger_expenses').doc(expense.id).update(updateData);
      Alert.alert("Success", "Expense has been sent for approval.");

      try {
        const notifyMembers = functions().app.functions('asia-south1').httpsCallable('notifyMembers');
        const cleanPhone = assignedAdmin?.phone ? assignedAdmin.phone.replace(/[^0-9]/g, '') : '';
        
        if (assignedAdmin && cleanPhone.length >= 10) {
          await notifyMembers({
            title: "New Expense Approval",
            body: `${updateData.submittedBy} has sent an expense to ${assignedAdmin.name} for approval.`,
            targetPhone: assignedAdmin.phone,
            target: "admin",
            type: "expense_approval"
          });
        } else if (!assignedAdmin) {
          await notifyMembers({
            title: "New Expense Approval",
            body: `${updateData.submittedBy} has submitted an expense for approval.`,
            target: "admin",
            type: "expense_approval"
          });
        }
      } catch (err) {
        console.error("Failed to notify admins:", err);
      }
    } catch (err) {
      console.error("Error sending for approval:", err);
      Alert.alert("Error", "Could not send for approval.");
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={{ marginTop: 12, color: secondaryText, fontWeight: '600' }}>Syncing Ledger...</Text>
        </View>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <AdminExpenseDashboard expenses={expenses} goTo={setActiveTab} goToRange={goToHistoryWithRange} />;
      case 'history':
        return <AdminExpenseHistory expenses={expenses} usedEvents={suggestedEvents} customCategories={usedCategories} onEdit={handleEdit} onDelete={handleDeleteExpense} initialRange={historyRange} onGenerateInvoice={handleGenerateInvoiceFromHistory} onSendForApproval={handleSendForApproval} />;
      case 'add':
        return <AdminExpenseAdd onSave={handleSaveExpense} suggestedEvents={suggestedEvents} suggestedCategories={usedCategories} initialExpense={editingExpense} onCancelEdit={() => { setEditingExpense(null); setActiveTab('history'); }} />;
      case 'invoice':
        return <AdminExpenseInvoices expenses={expenses} pendingInvoiceEntries={pendingInvoiceEntries} clearPendingInvoice={() => setPendingInvoiceEntries(null)} onSendForApproval={handleSendForApproval} onDeleteInvoice={handleDeleteInvoice} />;
      case 'approvals':
        return <AdminExpenseApprovals expenses={expenses} onGenerateInvoice={handleGenerateInvoiceFromHistory} onDelete={handleDeleteExpense} />;
      default:
        return <AdminExpenseDashboard expenses={expenses} goTo={setActiveTab} goToRange={goToHistoryWithRange} />;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]} edges={['bottom']}>
      <StatusBar barStyle={barStyle} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />
      
      {/* ── Top App Bar (Expense Overview / Ledger / Invoices / Approvals) ── */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
          }
        ]}
      >
        <TouchableOpacity style={styles.iconBtn} onPress={handleBackOrMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {activeTab !== 'dashboard' ? (
            <ChevronLeft size={22} color={primaryText} strokeWidth={2.4} />
          ) : openDrawer ? (
            <Menu size={22} color={primaryText} strokeWidth={2.4} />
          ) : (
            <ArrowLeft size={22} color={primaryText} strokeWidth={2.4} />
          )}
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
            {TAB_TITLES[activeTab]}
          </Text>
        </View>

        <View style={styles.iconBtn}>
          {activeTab === 'history' && (
            <TouchableOpacity onPress={() => { setEditingExpense(null); setActiveTab('add'); }}>
              <PlusCircle size={22} color="#10B981" strokeWidth={2.4} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Screen Body Content ── */}
      <View style={[styles.contentContainer, { backgroundColor: screenBg }]}>
        {renderContent()}
      </View>

      {/* ── Modern Bottom Navigation Bar ── */}
      <View
        style={[
          styles.tabbar,
          {
            backgroundColor: '#174A33', // Kept original signature greenDeep color
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.18)',
          }
        ]}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id;
          const Icon = t.icon as any;

          return (
            <TouchableOpacity 
              key={t.id} 
              style={styles.tabBtn} 
              onPress={() => {
                if (t.id === 'history') setHistoryRange('all');
                setActiveTab(t.id);
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.tabCircle, active && styles.tabCircleActive]}>
                <Icon
                  size={20}
                  color={active ? '#FFFFFF' : '#A7D7C5'}
                  strokeWidth={active ? 2.5 : 2}
                />
              </View>
              <Text
                style={[
                  styles.tabText,
                  {
                    color: active ? '#FFFFFF' : '#A7D7C5',
                    fontWeight: active ? '700' : '500'
                  }
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderBottomWidth: 1.5,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  tabbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#174A33',
    paddingVertical: 6,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    borderRadius: 22,
  },
  tabCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabCircleActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabText: {
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.2,
  },
});
