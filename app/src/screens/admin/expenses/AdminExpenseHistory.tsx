import React, { useState, useMemo, useEffect } from 'react';
import { 
  StyleSheet, View, Text, ScrollView, TouchableOpacity, 
  TextInput, Modal, Platform, Alert, Image 
} from 'react-native';
import { 
  Search, SlidersHorizontal, CalendarDays, Receipt, 
  ChevronRight, ChevronDown, ChevronLeft, Check, FileText
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { 
  fmt, todayISO, CATEGORY_NAMES, PAYMENT_METHODS,
  getCategoryIconComponent, PaymentStamp, formatDateToDDMMYYYY, ApprovalBadge
} from './AdminExpenseUtils';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

const Sheet = ({
  title,
  visible,
  onClose,
  isDark,
  cardSurface,
  primaryText,
  borderColor,
  children
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  cardSurface: string;
  primaryText: string;
  borderColor: string;
  children: React.ReactNode;
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.sheetOverlay}>
      <View
        style={[
          styles.sheetContent,
          {
            backgroundColor: cardSurface,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
          }
        ]}
      >
        <View style={[styles.sheetHandle, { backgroundColor: isDark ? '#3F3F46' : '#CBD5E1' }]} />
        <View style={[styles.sheetHead, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : borderColor }]}>
          <Text style={[styles.sheetTitle, { color: primaryText }]}>{title}</Text>
          <TouchableOpacity
            style={[styles.iconBtnRound, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#F1F5F9' }]}
            onPress={onClose}
          >
            <ChevronLeft size={20} color={primaryText} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </View>
  </Modal>
);

export default function AdminExpenseHistory({
  expenses,
  usedEvents,
  customCategories,
  onEdit,
  onDelete,
  initialRange,
  onGenerateInvoice,
  onSendForApproval
}: any) {
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor
  } = useAdminTheme();

  const [range, setRange] = useState(initialRange || "all");
  const [category, setCategory] = useState("all");
  const [method, setMethod] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState<'start' | 'end' | null>(null);
  
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const getLocalYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const formatDisplayDate = (ymd: string) => {
    if (!ymd) return "";
    const [y, m, d] = ymd.split('-');
    return `${d}-${m}-${y}`;
  };

  useEffect(() => {
    if (initialRange) {
      if (initialRange === "pending") {
        setMethod("Pending");
        setRange("all");
      } else {
        setRange(initialRange);
        setMethod("all");
      }
      setCategory("all");
      setEventFilter("all");
      setQ("");
    }
  }, [initialRange]);

  const filtered = useMemo(() => {
    const today = todayISO();
    const now = new Date();
    return expenses.filter((e: any) => {
      if (range === "today" && e.date !== today) return false;
      if (range === "week") {
        const d = new Date(e.date);
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (d < weekAgo) return false;
      }
      if (range === "month") {
        const d = new Date(e.date);
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        if (d < monthAgo) return false;
      }
      if (range === "custom") {
        if (customStart && e.date < customStart) return false;
        if (customEnd && e.date > customEnd) return false;
      }
      if (category !== "all" && !e.items.some((i: any) => i.category === category)) return false;
      if (method !== "all" && e.paymentMethod !== method) return false;
      if (eventFilter === "normal" && e.eventName) return false;
      if (eventFilter !== "all" && eventFilter !== "normal" && e.eventName !== eventFilter) return false;
      if (q) {
        const hay = (e.vendor + " " + e.notes + " " + (e.eventName || "") + " " + e.items.map((i: any) => i.category).join(" ")).toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    }).sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
  }, [expenses, range, category, method, eventFilter, q]);

  const filteredTotal = filtered.reduce((s: number, e: any) => s + e.items.reduce((s2: number, i: any) => s2 + Number(i.amount), 0), 0);
  const activeFilterCount = (range !== "all" ? 1 : 0) + (category !== "all" ? 1 : 0) + (method !== "all" ? 1 : 0) + (eventFilter !== "all" ? 1 : 0);

  const eventGroups = useMemo(() => {
    const map: any = {};
    filtered.forEach((e: any) => { 
      if (e.eventName) { 
        if (!map[e.eventName]) map[e.eventName] = [];
        map[e.eventName].push(e); 
      } 
    });
    return Object.entries(map).map(([name, list]: any) => ({
      name, 
      list, 
      total: list.reduce((s: number, e: any) => s + e.items.reduce((s2: number, i: any) => s2 + Number(i.amount), 0), 0),
    })).sort((a: any, b: any) => (a.list[0].date < b.list[0].date ? 1 : -1));
  }, [filtered]);

  const normalEntries = useMemo(() => filtered.filter((e: any) => !e.eventName), [filtered]);
  const showEventSection = eventFilter !== "normal" && eventGroups.length > 0;
  const showNormalSection = eventFilter === "all" || eventFilter === "normal";

  const renderEntryRow = (e: any, isNormal: boolean = false) => {
    const sum = e.items.reduce((s: number, i: any) => s + Number(i.amount), 0);
    const cat = e.items[0]?.category || "Miscellaneous";
    const CatIcon = getCategoryIconComponent(cat);
    const open = openId === e.id;
    const checked = selectedIds.has(e.id);
    
    return (
      <View
        key={e.id}
        style={[
          styles.historyBlock,
          { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : borderColor }
        ]}
      >
        <TouchableOpacity 
          style={styles.ledgerLine} 
          onPress={() => {
            if (selectMode) {
              const next = new Set(selectedIds);
              if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
              setSelectedIds(next);
            } else {
              setOpenId(open ? null : e.id);
            }
          }}
          onLongPress={() => {
            if (!selectMode) {
              setSelectMode(true);
              setSelectedIds(new Set([e.id]));
            }
          }}
          activeOpacity={0.7}
        >
          {selectMode ? (
            <View
              style={[
                styles.checkbox,
                { borderColor: isDark ? '#71717A' : '#CBD5E1', backgroundColor: cardSurface },
                checked && { backgroundColor: '#10B981', borderColor: '#10B981' }
              ]}
            >
              {checked && <Check size={12} color="#fff" strokeWidth={3} />}
            </View>
          ) : (
            <View
              style={[
                styles.ledgerLineIcon,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }
              ]}
            >
              <CatIcon size={16} color={isDark ? '#10B981' : '#059669'} />
            </View>
          )}
          <View style={styles.ledgerLineMid}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text style={[styles.ledgerLineCat, { color: primaryText }]}>
                {e.items.length > 1 ? `${cat} +${e.items.length - 1} more` : cat}
              </Text>
              {isNormal && <ApprovalBadge status={e.status} isDark={isDark} />}
            </View>
            <Text style={[styles.ledgerLineDetail, { color: secondaryText }]} numberOfLines={1}>
              {e.invoiceNumber ? <Text style={{ color: '#10B981', fontWeight: '700' }}>{e.invoiceNumber} · </Text> : null}
              {e.vendor || (e.items.some((i: any) => i.vendor) ? "Multiple Vendors" : "—")} · {formatDateToDDMMYYYY(e.date)}
            </Text>
          </View>
          <Text style={[styles.ledgerLineAmt, { color: primaryText }]}>{fmt(sum)}</Text>
          {!selectMode && (
            open 
              ? <ChevronDown size={16} color={secondaryText} style={{ marginLeft: 6 }} /> 
              : <ChevronRight size={16} color={secondaryText} style={{ marginLeft: 6 }} />
          )}
        </TouchableOpacity>
        
        {open && !selectMode && (
          <View
            style={[
              styles.detailDrop,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC' }
            ]}
          >
            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: secondaryText }]}>Paid By</Text>
                <Text style={[styles.detailValue, { color: primaryText }]}>{e.paidBy || "—"}</Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: secondaryText }]}>Payment</Text>
                <Text style={[styles.detailValue, { color: primaryText }]}>{e.paymentMethod}</Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: secondaryText }]}>Reference</Text>
                <Text style={[styles.detailValue, { color: primaryText }]}>{e.reference || "—"}</Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: secondaryText }]}>Created By</Text>
                <Text style={[styles.detailValue, { color: primaryText }]}>{e.createdBy}</Text>
              </View>
              
              {!!e.submittedBy && (
                <View style={styles.detailCell}>
                  <Text style={[styles.detailLabel, { color: secondaryText }]}>Submitted</Text>
                  <Text style={[styles.detailValue, { color: primaryText }]}>{e.submittedBy}</Text>
                </View>
              )}
              {!!e.approvedBy && (
                <View style={styles.detailCell}>
                  <Text style={[styles.detailLabel, { color: secondaryText }]}>
                    {e.status === 'Rejected' ? 'Rejected By' : 'Approved By'}
                  </Text>
                  <Text style={[styles.detailValue, { color: primaryText }]}>{e.approvedBy}</Text>
                </View>
              )}
              {!!e.invoiceNumber && (
                <View style={styles.detailCell}>
                  <Text style={[styles.detailLabel, { color: secondaryText }]}>Invoice No</Text>
                  <Text style={[styles.detailValue, { color: primaryText }]}>{e.invoiceNumber}</Text>
                </View>
              )}
              {!!e.approvalRemarks && (
                <View style={[styles.detailCell, { width: '100%' }]}>
                  <Text style={[styles.detailLabel, { color: '#EF4444' }]}>Remarks</Text>
                  <Text style={[styles.detailValue, { color: primaryText }]}>{e.approvalRemarks}</Text>
                </View>
              )}

              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: secondaryText }]}>Receipt</Text>
                {e.receiptUri ? (
                  <TouchableOpacity onPress={() => setPreviewUri(e.receiptUri)}>
                    <Text style={[styles.detailValue, { color: '#0EA5E9', textDecorationLine: 'underline', fontWeight: '600' }]}>View Attached</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.detailValue, { color: primaryText }]}>{e.receiptName || "Not attached"}</Text>
                )}
              </View>
              <View style={[styles.detailCell, { width: '100%' }]}>
                <Text style={[styles.detailLabel, { color: secondaryText }]}>Notes</Text>
                <Text style={[styles.detailValue, { color: primaryText }]}>{e.notes || "—"}</Text>
              </View>
            </View>

            <View style={[styles.detailItems, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : borderColor }]}>
              <View style={[styles.detailItemRow, { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : borderColor, paddingBottom: 6 }]}>
                <Text style={[styles.detailItemText, { flex: 2, fontWeight: '700', color: secondaryText }]}>Category</Text>
                <Text style={[styles.detailItemText, { flex: 3, fontWeight: '700', color: secondaryText }]}>Details</Text>
                <Text style={[styles.detailItemAmt, { flex: 1.5, textAlign: 'right', fontWeight: '700', color: secondaryText }]}>Amount</Text>
              </View>
              {e.items.map((i: any, idx: number) => {
                const ItemIcon = getCategoryIconComponent(i.category);
                const isLast = idx === e.items.length - 1;
                return (
                  <View
                    key={i.id}
                    style={[
                      styles.detailItemRow,
                      {
                        paddingVertical: 6,
                        borderBottomWidth: isLast ? 0 : 1,
                        borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : borderColor
                      }
                    ]}
                  >
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ItemIcon size={13} color={isDark ? '#10B981' : '#059669'} />
                      <Text style={[styles.detailItemText, { fontSize: 12, fontWeight: '500', color: primaryText }]} numberOfLines={1}>{i.category}</Text>
                    </View>
                    <View style={{ flex: 3 }}>
                      {!!i.vendor && <Text style={[styles.detailItemText, { fontSize: 11.5, color: primaryText, fontWeight: '600' }]} numberOfLines={1}>{i.vendor}</Text>}
                      <Text style={[styles.detailItemText, { fontSize: 11.5, color: secondaryText }]} numberOfLines={2}>{i.detail}</Text>
                    </View>
                    <Text style={[styles.detailItemAmt, { flex: 1.5, textAlign: 'right', fontSize: 12, color: primaryText }]}>{fmt(i.amount)}</Text>
                  </View>
                );
              })}
              <View style={[styles.detailItemRow, { marginTop: 8, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : borderColor, paddingTop: 8 }]}>
                <Text style={[styles.detailItemText, { flex: 5, textAlign: 'right', fontWeight: '700', color: primaryText }]}>Total</Text>
                <Text style={[styles.detailItemAmt, { flex: 1.5, textAlign: 'right', fontWeight: '800', fontSize: 13, color: '#10B981' }]}>{fmt(sum)}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'column', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[
                  styles.actionButtonPill,
                  { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#D1FAE5', borderColor: '#10B981' }
                ]}
                onPress={() => onGenerateInvoice([e])}
              >
                <Text style={[styles.actionButtonPillText, { color: isDark ? '#34D399' : '#059669' }]}>
                  Generate Invoice
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.actionButtonPill,
                    { flex: 1, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9', borderColor: borderColor }
                  ]}
                  onPress={() => onEdit(e)}
                >
                  <Text style={[styles.actionButtonPillText, { color: primaryText }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.actionButtonPill,
                    { flex: 1, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2', borderColor: '#EF4444' }
                  ]} 
                  onPress={() => {
                    Alert.alert(
                      "Delete Expense",
                      "Are you sure you want to delete this expense? This action cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => onDelete(e.id) }
                      ]
                    );
                  }}
                >
                  <Text style={[styles.actionButtonPillText, { color: '#EF4444' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  const allCategories = Array.from(new Set([...CATEGORY_NAMES, ...customCategories]));

  const renderSelect = (label: string, value: string, setter: (val: string) => void, options: {val: string, label: string}[]) => (
    <View style={styles.field}>
      <Text style={[styles.fieldLabelStandalone, { color: secondaryText }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {options.map(o => {
          const active = value === o.val;
          return (
            <TouchableOpacity 
              key={o.val} 
              style={[
                styles.chip,
                {
                  backgroundColor: active ? '#10B981' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF'),
                  borderColor: active ? '#10B981' : (isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor),
                }
              ]}
              onPress={() => setter(o.val)}
            >
              <Text style={[styles.chipText, { color: active ? '#FFFFFF' : primaryText }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const selectedEntries = useMemo(() => filtered.filter((e: any) => selectedIds.has(e.id)), [filtered, selectedIds]);
  const selectedTotal = selectedEntries.reduce((s: number, e: any) => s + e.items.reduce((s2: number, i: any) => s2 + Number(i.amount), 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* ── Top Bar with Search & Filter ── */}
      {selectMode ? (
        <View
          style={[
            styles.invoiceHeaderRow,
            { backgroundColor: cardSurface, borderBottomColor: borderColor }
          ]}
        >
          <Text style={[styles.invoiceIntro, { color: primaryText }]}>
            Select expenses to generate an invoice.
          </Text>
          <TouchableOpacity
            style={[styles.btnGhostSm, { backgroundColor: secondarySurface, borderColor }]}
            onPress={() => { setSelectMode(false); setSelectedIds(new Set()); }}
          >
            <Text style={[styles.btnGhostSmText, { color: primaryText }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.topControlsRow}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: cardSurface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
              }
            ]}
          >
            <Search size={16} color={secondaryText} />
            <TextInput 
              style={[styles.searchInput, { color: primaryText }]} 
              placeholder="Search vendor, notes, category..." 
              value={q} 
              onChangeText={setQ} 
              placeholderTextColor={secondaryText}
            />
          </View>
          <TouchableOpacity 
            style={[
              styles.filterBtn,
              {
                backgroundColor: selectMode ? '#10B981' : cardSurface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
              }
            ]} 
            onPress={() => {
              setSelectMode(!selectMode);
              if (selectMode) setSelectedIds(new Set());
            }}
          >
            <Check size={16} color={selectMode ? '#fff' : (isDark ? '#34D399' : '#059669')} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.filterBtn,
              {
                backgroundColor: cardSurface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor,
              }
            ]} 
            onPress={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal size={16} color={isDark ? '#34D399' : '#059669'} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {!selectMode && (
        <View style={styles.summaryBar}>
          <Text style={[styles.historySummary, { color: secondaryText }]}>
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} · <Text style={{ color: primaryText, fontWeight: '700' }}>{fmt(filteredTotal)}</Text>
          </Text>
        </View>
      )}

      {/* ── Scrollable Expense Cards ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, selectMode && { paddingBottom: 110 }]}
      >
        {filtered.length === 0 && (
          <View
            style={[
              styles.ledgerCard,
              { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor }
            ]}
          >
            <Text style={[styles.emptyState, { color: secondaryText }]}>
              No entries match these filters.
            </Text>
          </View>
        )}

        {showEventSection && (
          <View style={styles.sectionBlock}>
            <View style={[styles.sectionTitleRow, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor }]}>
              <CalendarDays size={15} color={isDark ? '#34D399' : '#059669'} />
              <Text style={[styles.sectionTitle, { color: primaryText }]}>Event-wise Expenses</Text>
            </View>
            
            {eventGroups.map((g: any) => {
              let groupApprovalStatus = 'Draft';
              if (g.list.some((e: any) => e.status === 'Rejected')) groupApprovalStatus = 'Rejected';
              else if (g.list.some((e: any) => e.status === 'Pending Approval')) groupApprovalStatus = 'Pending Approval';
              else if (g.list.every((e: any) => e.status === 'Approved')) groupApprovalStatus = 'Approved';

              return (
                <View
                  key={g.name}
                  style={[
                    styles.ledgerCard,
                    styles.eventGroupCard,
                    {
                      backgroundColor: cardSurface,
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor
                    }
                  ]}
                >
                  <View
                    style={[
                      styles.ledgerCardHeadTextPlain,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC',
                        borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : borderColor
                      }
                    ]}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: primaryText }}>
                      {g.name}
                    </Text>
                    <ApprovalBadge status={groupApprovalStatus} isDark={isDark} />
                  </View>
                  <View style={styles.ledgerTable}>
                    {g.list.map((item: any) => renderEntryRow(item, false))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {showNormalSection && normalEntries.length > 0 && (
          <View style={styles.sectionBlock}>
            <View style={[styles.sectionTitleRow, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor }]}>
              <Receipt size={15} color={isDark ? '#34D399' : '#059669'} />
              <Text style={[styles.sectionTitle, { color: primaryText }]}>Normal Expenses</Text>
            </View>
            <View
              style={[
                styles.ledgerCard,
                {
                  backgroundColor: cardSurface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor
                }
              ]}
            >
              <View style={styles.ledgerTable}>
                {normalEntries.map((item: any) => renderEntryRow(item, true))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Selection Floating Bar ── */}
      {selectMode && selectedEntries.length > 0 && (
        <View
          style={[
            styles.selectionBar,
            {
              backgroundColor: isDark ? '#18181B' : '#0F172A',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#1E293B'
            }
          ]}
        >
          <View style={styles.selectionBarInfo}>
            <Text style={[styles.selectionBarCount, { color: isDark ? '#A1A1AA' : '#94A3B8' }]}>
              {selectedEntries.length} selected
            </Text>
            <Text style={styles.selectionBarTotal}>{fmt(selectedTotal)}</Text>
          </View>
          <TouchableOpacity 
            style={styles.selectionBarGenerateBtn} 
            onPress={() => {
              if (onGenerateInvoice) {
                onGenerateInvoice(selectedEntries);
                setSelectMode(false);
                setSelectedIds(new Set());
              }
            }}
          >
            <FileText size={15} color="#fff" />
            <Text style={styles.selectionBarGenerateBtnText}>Generate Invoice</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Filters Bottom Sheet ── */}
      <Sheet
        title="Filter Expenses"
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        isDark={isDark}
        cardSurface={cardSurface}
        primaryText={primaryText}
        borderColor={borderColor}
      >
        <View style={styles.filterSheetStack}>
          {renderSelect("Date Range", range, setRange, [
            {val: "all", label: "All Time"}, {val: "today", label: "Today"},
            {val: "week", label: "This Week"}, {val: "month", label: "This Month"},
            {val: "custom", label: "Custom Range"}
          ])}
          
          {range === 'custom' && (
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <TouchableOpacity
                style={[styles.datePickBox, { backgroundColor: secondarySurface, borderColor }]}
                onPress={() => setShowPicker('start')}
              >
                <Text style={[{ fontSize: 13 }, customStart ? { color: primaryText } : { color: secondaryText }]}>
                  {customStart ? formatDisplayDate(customStart) : "Start (DD-MM-YYYY)"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.datePickBox, { backgroundColor: secondarySurface, borderColor }]}
                onPress={() => setShowPicker('end')}
              >
                <Text style={[{ fontSize: 13 }, customEnd ? { color: primaryText } : { color: secondaryText }]}>
                  {customEnd ? formatDisplayDate(customEnd) : "End (DD-MM-YYYY)"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {showPicker && (
            <DateTimePicker
              value={
                showPicker === 'start' 
                  ? (customStart ? new Date(customStart + "T00:00:00") : new Date())
                  : (customEnd ? new Date(customEnd + "T00:00:00") : new Date())
              }
              mode="date"
              display="default"
              onChange={(e: any, d?: Date) => {
                const currentPicker = showPicker;
                if (Platform.OS !== 'ios') setShowPicker(null);
                if (d) {
                  const formatted = getLocalYMD(d);
                  if (currentPicker === 'start') setCustomStart(formatted);
                  if (currentPicker === 'end') setCustomEnd(formatted);
                }
              }}
            />
          )}

          {renderSelect("Category", category, setCategory, [
            {val: "all", label: "All Categories"},
            ...allCategories.map(c => ({val: c, label: c}))
          ])}

          {renderSelect("Payment Method", method, setMethod, [
            {val: "all", label: "All Methods"},
            ...PAYMENT_METHODS.map(p => ({val: p.id, label: p.id}))
          ])}

          {renderSelect("Event / Type", eventFilter, setEventFilter, [
            {val: "all", label: "All (Event + Normal)"},
            {val: "normal", label: "Normal Only"},
            ...usedEvents.map((ev: string) => ({val: ev, label: ev}))
          ])}

          <TouchableOpacity
            style={[styles.btnApply, { backgroundColor: '#10B981' }]}
            onPress={() => setFiltersOpen(false)}
          >
            <Text style={styles.btnApplyText}>Apply Filters</Text>
          </TouchableOpacity>

          {activeFilterCount > 0 && (
            <TouchableOpacity 
              style={styles.btnClear} 
              onPress={() => { setRange("all"); setCategory("all"); setMethod("all"); setEventFilter("all"); }}
            >
              <Text style={[styles.btnClearText, { color: secondaryText }]}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>
      </Sheet>

      {/* ── Receipt Image Full Preview Modal ── */}
      {!!previewUri && (
        <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableOpacity
              style={{ position: 'absolute', top: 50, right: 20, padding: 10, zIndex: 10 }}
              onPress={() => setPreviewUri(null)}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
            <Image source={{ uri: previewUri }} style={{ width: '100%', height: '80%', resizeMode: 'contain' }} />
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    padding: 0,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#10B981',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '800',
  },
  summaryBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  historySummary: {
    fontSize: 12,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 40,
    gap: 14,
  },
  ledgerCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyState: {
    paddingVertical: 32,
    textAlign: 'center',
    fontSize: 13,
  },
  sectionBlock: {
    marginBottom: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 10,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  eventGroupCard: {
    marginBottom: 12,
  },
  ledgerCardHeadTextPlain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  ledgerTable: {
    paddingHorizontal: 14,
  },
  historyBlock: {
    borderBottomWidth: 1,
  },
  ledgerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  ledgerLineIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ledgerLineMid: {
    flex: 1,
  },
  ledgerLineCat: {
    fontSize: 14,
    fontWeight: '600',
  },
  ledgerLineDetail: {
    fontSize: 11.5,
    marginTop: 2,
  },
  ledgerLineAmt: {
    fontSize: 14,
    fontWeight: '700',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  invoiceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  invoiceIntro: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  btnGhostSm: {
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 8,
  },
  btnGhostSmText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
  },
  selectionBarInfo: {
    flexDirection: 'column',
  },
  selectionBarCount: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  selectionBarTotal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginTop: 1,
  },
  selectionBarGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
  },
  selectionBarGenerateBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  detailDrop: {
    paddingLeft: 38,
    paddingRight: 10,
    paddingBottom: 16,
    paddingTop: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  detailCell: {
    width: '45%',
    flexDirection: 'column',
    gap: 2,
  },
  detailLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  detailValue: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  detailItems: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 6,
  },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailItemText: {
    flex: 1,
    fontSize: 12,
  },
  detailItemAmt: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionButtonPillText: {
    fontSize: 13,
    fontWeight: '700',
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
    maxHeight: '85%',
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
  filterSheetStack: {
    paddingBottom: 28,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabelStandalone: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 6,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  datePickBox: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  btnApply: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  btnApplyText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  btnClear: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  btnClearText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
