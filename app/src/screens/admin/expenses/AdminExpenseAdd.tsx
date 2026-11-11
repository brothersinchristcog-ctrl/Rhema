import React, { useState, useMemo, useEffect } from 'react';
import { 
  StyleSheet, View, Text, ScrollView, TouchableOpacity, 
  TextInput, Modal, Platform, KeyboardAvoidingView, Alert, Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { 
  CalendarDays, Receipt, PlusCircle, Trash2, Check, 
  ChevronLeft, Plus
} from 'lucide-react-native';
import { 
  fmt, todayISO, uid, CATEGORY_CONFIG, 
  DEFAULT_CATEGORY_CFG, CATEGORY_NAMES, PAYMENT_METHODS,
  getCategoryIconComponent, formatDateToDDMMYYYY, parseDDMMYYYYToISO
} from './AdminExpenseUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
    <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.sheetContent, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor }]}>
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
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

export default function AdminExpenseAdd({ onSave, suggestedEvents, suggestedCategories, initialExpense, onCancelEdit }: any) {
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor
  } = useAdminTheme();

  const [date, setDate] = useState(formatDateToDDMMYYYY(todayISO()));
  const [vendor, setVendor] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<string | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleAttachReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setReceiptUri(uri);
      const filename = uri.split('/').pop() || "receipt_scan.jpg";
      setReceiptName(filename);
    }
  };

  const confirmDeleteCategory = () => {
    if (!deleteCategoryTarget) return;
    setLocalCategories(prev => {
      const next = prev.filter(c => c !== deleteCategoryTarget);
      AsyncStorage.setItem('custom_categories', JSON.stringify(next)).catch(console.error);
      return next;
    });
    if (selectedCategories.includes(deleteCategoryTarget)) {
      toggleCategory(deleteCategoryTarget);
    }
    showToast('Category deleted');
    setDeleteCategoryTarget(null);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [draftValues, setDraftValues] = useState<any>({});
  
  const [expenseType, setExpenseType] = useState("normal");
  const [eventName, setEventName] = useState("");
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [newEventInput, setNewEventInput] = useState("");
  const [localEvents, setLocalEvents] = useState<string[]>([]);

  useEffect(() => {
    if (initialExpense) {
      setDate(initialExpense.date ? formatDateToDDMMYYYY(initialExpense.date) : formatDateToDDMMYYYY(todayISO()));
      setVendor(initialExpense.vendor || "");
      setPaidBy(initialExpense.paidBy || "");
      setPaymentMethod(initialExpense.paymentMethod || "Cash");
      setNotes(initialExpense.notes || "");
      setReceiptName(initialExpense.receiptName || "");
      setReceiptUri(initialExpense.receiptUri || null);
      
      const cats = Array.from(new Set(initialExpense.items.map((i: any) => i.category))) as string[];
      setSelectedCategories(cats);
      
      const drafts: any = {};
      initialExpense.items.forEach((i: any) => {
        if (!drafts[i.category]) drafts[i.category] = [];
        
        let qty = i.qty ? String(i.qty) : "";
        let rate = i.rate ? String(i.rate) : "";
        let flatAmt = i.flatAmt ? String(i.flatAmt) : (i.amount ? String(i.amount) : "");
        let empName = i.empName || "";
        
        const cfg = getCfg(i.category);
        
        if (cfg.type === "qty" && !qty && !rate && i.amount) {
          qty = "1";
          rate = String(i.amount);
        }
        
        if (!empName && i.detail) {
          const match = i.detail.match(/^(.*?)\s*\(.*?\)$/);
          if (match) {
            empName = match[1];
          } else if (i.detail.includes(" \u00d7 ") || i.detail.includes(" x ")) {
            empName = "";
          } else {
            empName = i.detail;
          }
        }
        
        let rowVendor = i.vendor || "";
        drafts[i.category].push({ qty, rate, flatAmt, empName, vendor: rowVendor });
      });
      setDraftValues(drafts);
      
      if (initialExpense.eventName) {
        setExpenseType("event");
        setEventName(initialExpense.eventName);
      } else {
        setExpenseType("normal");
        setEventName("");
      }
    }
    
    AsyncStorage.getItem('custom_categories').then(val => {
      if (val) setLocalCategories(JSON.parse(val));
    }).catch(console.error);

    AsyncStorage.getItem('custom_events').then(val => {
      if (val) setLocalEvents(JSON.parse(val));
    }).catch(console.error);
  }, [initialExpense]);

  const categoryOptions = useMemo(() => {
    const merged = [...CATEGORY_NAMES, ...suggestedCategories, ...localCategories];
    return Array.from(new Set(merged));
  }, [suggestedCategories, localCategories]);

  const getCfg = (name: string) => CATEGORY_CONFIG[name] || DEFAULT_CATEGORY_CFG;
  const getDrafts = (name: string) => draftValues[name] || [{ qty: "", rate: "", flatAmt: "", empName: "", vendor: "" }];
  const setDraftField = (name: string, index: number, field: string, value: string) => {
    setDraftValues((prev: any) => {
      const arr = [...getDrafts(name)];
      arr[index] = { ...arr[index], [field]: value };
      return { ...prev, [name]: arr };
    });
  };
  const addDraftRow = (name: string) => {
    setDraftValues((prev: any) => ({
      ...prev,
      [name]: [...getDrafts(name), { qty: "", rate: "", flatAmt: "", empName: "", vendor: "" }]
    }));
  };
  const getComputedAmount = (name: string) => {
    const cfg = getCfg(name);
    return getDrafts(name).reduce((sum: number, d: any) => sum + (cfg.type === "qty" ? (Number(d.qty) || 0) * (Number(d.rate) || 0) : Number(d.flatAmt) || 0), 0);
  };

  const toggleCategory = (name: string) => {
    setSelectedCategories(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  };
  const removeSelected = (name: string) => {
    setSelectedCategories(prev => prev.filter(c => c !== name));
    setDraftValues((prev: any) => { const next = { ...prev }; delete next[name]; return next; });
  };
  const createCategory = () => {
    const name = newCategoryInput.trim();
    if (!name) return;
    setLocalCategories(prev => {
      const next = Array.from(new Set([...prev, name]));
      AsyncStorage.setItem('custom_categories', JSON.stringify(next)).catch(console.error);
      return next;
    });
    setNewCategoryInput("");
    if (!selectedCategories.includes(name)) setSelectedCategories(prev => [...prev, name]);
  };

  const eventOptions = useMemo(() => {
    const merged = [...suggestedEvents, ...localEvents];
    return Array.from(new Set(merged));
  }, [suggestedEvents, localEvents]);

  const chooseEvent = (name: string) => { setEventName(name); };
  const createEvent = () => {
    const name = newEventInput.trim();
    if (!name) return;
    setLocalEvents(prev => {
      const next = Array.from(new Set([...prev, name]));
      AsyncStorage.setItem('custom_events', JSON.stringify(next)).catch(console.error);
      return next;
    });
    setEventName(name);
    setNewEventInput("");
  };

  const batchTotal = selectedCategories.reduce((s, name) => s + getComputedAmount(name), 0);

  const getDraftItems = () => {
    return selectedCategories.flatMap(name => {
      const cfg = getCfg(name);
      return getDrafts(name).map((d: any) => {
        const amount = cfg.type === "qty" ? (Number(d.qty) || 0) * (Number(d.rate) || 0) : Number(d.flatAmt) || 0;
        if (amount <= 0) return null;
        let detail;
        if (cfg.type === "qty") detail = d.empName ? `${d.empName} (${d.qty} ${cfg.qtyLabel} \u00d7 ${fmt(d.rate)})` : `${d.qty} ${cfg.qtyLabel} \u00d7 ${fmt(d.rate)}`;
        else if (cfg.type === "named") detail = d.empName || cfg.amountLabel;
        else detail = cfg.amountLabel;
        return { id: uid(), category: name, detail, amount, qty: d.qty, rate: d.rate, flatAmt: d.flatAmt, empName: d.empName || "", vendor: d.vendor || "" };
      }).filter(Boolean);
    });
  };

  const total = items.reduce((s, i) => s + Number(i.amount), 0) + getDraftItems().reduce((s, i: any) => s + Number(i.amount), 0);

  const handleSave = async () => {
    const finalItems = [...items, ...getDraftItems()];
    if (finalItems.length === 0) return;
    
    setIsSaving(true);
    await onSave({
      id: initialExpense?.id || uid(),
      date: parseDDMMYYYYToISO(date),
      vendor,
      paidBy,
      paymentMethod,
      reference,
      notes,
      createdBy: initialExpense?.createdBy || "Church Admin",
      createdAt: initialExpense?.createdAt || todayISO(),
      receiptName,
      receiptUri,
      items: finalItems,
      eventName: expenseType === "event" && eventName ? eventName : null,
    });
    setIsSaving(false);
  };
  const displayItems = [...items, ...getDraftItems()];

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: screenBg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {toastMsg && (
        <View style={{ position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center', zIndex: 999, elevation: 10 }}>
          <View style={styles.successToast}>
            <View style={styles.successIconCircle}>
              <Check size={16} color="#fff" strokeWidth={3} />
            </View>
            <Text style={styles.successText}>{toastMsg}</Text>
          </View>
        </View>
      )}

      {deleteCategoryTarget && (
        <Modal transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.stylishModalCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor }]}>
              <View style={[styles.modalIconCircle, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FFF0F0' }]}>
                <Trash2 size={24} color="#EF4444" />
              </View>
              <Text style={[styles.modalTitle, { color: primaryText }]}>Delete Category</Text>
              <Text style={[styles.modalSub, { color: secondaryText }]}>
                Are you sure you want to delete '{deleteCategoryTarget}'? This action cannot be undone.
              </Text>
              
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtnCancel, { backgroundColor: secondarySurface }]}
                  onPress={() => setDeleteCategoryTarget(null)}
                >
                  <Text style={[styles.modalBtnCancelText, { color: primaryText }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnDanger} onPress={confirmDeleteCategory}>
                  <Text style={styles.modalBtnDangerText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {initialExpense && (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerText}>Editing Expense</Text>
          <TouchableOpacity onPress={onCancelEdit}>
            <Text style={styles.editBannerCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Top Details Card */}
        <View style={[styles.ledgerCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor }]}>
          <Text style={[styles.fieldLabelStandalone, { color: secondaryText }]}>Expense Date</Text>
          <TextInput
            style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
            value={date}
            onChangeText={setDate}
            placeholder="DD-MM-YYYY"
            placeholderTextColor={secondaryText}
          />

          <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 14 }]}>Expense Type</Text>
          <View style={[styles.chipRow, { marginBottom: expenseType === "event" ? 12 : 0 }]}>
            <TouchableOpacity 
              style={[
                styles.chip,
                { backgroundColor: secondarySurface, borderColor },
                expenseType === "normal" && { backgroundColor: '#10B981', borderColor: '#10B981' }
              ]} 
              onPress={() => setExpenseType("normal")}
            >
              <Receipt size={14} color={expenseType === "normal" ? "#fff" : primaryText} />
              <Text style={[styles.chipText, { color: expenseType === "normal" ? '#fff' : primaryText }]}>Normal Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.chip,
                { backgroundColor: secondarySurface, borderColor },
                expenseType === "event" && { backgroundColor: '#10B981', borderColor: '#10B981' }
              ]} 
              onPress={() => setExpenseType("event")}
            >
              <CalendarDays size={14} color={expenseType === "event" ? "#fff" : primaryText} />
              <Text style={[styles.chipText, { color: expenseType === "event" ? '#fff' : primaryText }]}>Event Expense</Text>
            </TouchableOpacity>
          </View>

          {expenseType === "event" && (
            <TouchableOpacity
              style={[styles.categoryPickerBtn, { borderColor: '#10B981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#F0FDF4' }]}
              onPress={() => setEventPickerOpen(true)}
            >
              <CalendarDays size={16} color="#10B981" />
              <Text style={[styles.categoryPickerBtnText, { color: isDark ? '#34D399' : '#059669' }]}>
                {eventName || "Choose or Create Event"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {expenseType === "normal" && selectedCategories.length === 0 && (
          <View style={[styles.ledgerCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor }]}>
            <TouchableOpacity
              style={[styles.categoryPickerBtn, { borderColor: '#10B981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#F0FDF4' }]}
              onPress={() => setPickerOpen(true)}
            >
              <PlusCircle size={18} color="#10B981" />
              <Text style={[styles.categoryPickerBtnText, { color: isDark ? '#34D399' : '#059669' }]}>
                Choose Categories to Add
              </Text>
            </TouchableOpacity>
            <Text style={[styles.newEventHint, { color: secondaryText }]}>
              Tap to select as many categories as you spent on today, all at once.
            </Text>
          </View>
        )}

        {selectedCategories.length > 0 && (
          <>
            {selectedCategories.map((name) => {
              const cfg = getCfg(name);
              const CatIcon = getCategoryIconComponent(name);

              return (
                <View key={name} style={[styles.ledgerCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor }]}>
                  <View style={styles.dynamicFormHeadRow}>
                    <View style={styles.dynamicFormHead}>
                      <CatIcon size={18} color="#10B981" />
                      <Text style={[styles.dynamicFormHeadText, { color: primaryText }]}>{name}</Text>
                    </View>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => removeSelected(name)}>
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  {getDrafts(name).map((d: any, index: number) => {
                    const rowAmt = cfg.type === "qty" ? (Number(d.qty) || 0) * (Number(d.rate) || 0) : Number(d.flatAmt) || 0;
                    return (
                      <View key={index} style={{ marginBottom: index < getDrafts(name).length - 1 ? 20 : 0 }}>
                        {index > 0 && <View style={[styles.rowDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : borderColor }]} />}
                        
                        {cfg.type === "qty" && (
                          <View style={styles.calcStack}>
                            {(name === 'Vegetables' || name === 'Groceries' || name === 'Snacks') && (
                              <>
                                <Text style={[styles.fieldLabelStandalone, { color: secondaryText }]}>Item Name (Optional)</Text>
                                <TextInput
                                  style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                                  value={d.empName}
                                  onChangeText={t => setDraftField(name, index, "empName", t)}
                                  placeholder="e.g. Tomato"
                                  placeholderTextColor={secondaryText}
                                />
                              </>
                            )}

                            <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 10 }]}>{cfg.qtyLabel}</Text>
                            <TextInput
                              style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                              keyboardType="numeric"
                              value={d.qty}
                              onChangeText={t => setDraftField(name, index, "qty", t)}
                              placeholder="0"
                              placeholderTextColor={secondaryText}
                            />
                            
                            <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 10 }]}>{cfg.rateLabel}</Text>
                            <TextInput
                              style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                              keyboardType="numeric"
                              value={d.rate}
                              onChangeText={t => setDraftField(name, index, "rate", t)}
                              placeholder="0"
                              placeholderTextColor={secondaryText}
                            />
                            
                            <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 10 }]}>Vendor / Shop (Optional)</Text>
                            <TextInput
                              style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                              value={d.vendor}
                              onChangeText={t => setDraftField(name, index, "vendor", t)}
                              placeholder="e.g. Local Shop"
                              placeholderTextColor={secondaryText}
                            />
                            
                            <View style={[styles.calcResultRow, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC', borderColor }]}>
                              <Text style={[styles.calcResultLabel, { color: secondaryText }]}>AMOUNT</Text>
                              <Text style={[styles.calcResultAmt, { color: '#10B981' }]}>{fmt(rowAmt)}</Text>
                            </View>
                          </View>
                        )}
                        
                        {cfg.type === "named" && (
                          <View style={styles.calcStack}>
                            <Text style={[styles.fieldLabelStandalone, { color: secondaryText }]}>{cfg.nameLabel}</Text>
                            <TextInput
                              style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                              value={d.empName}
                              onChangeText={t => setDraftField(name, index, "empName", t)}
                              placeholder="Name"
                              placeholderTextColor={secondaryText}
                            />
                            
                            <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 10 }]}>{cfg.amountLabel}</Text>
                            <TextInput
                              style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                              keyboardType="numeric"
                              value={d.flatAmt}
                              onChangeText={t => setDraftField(name, index, "flatAmt", t)}
                              placeholder="0"
                              placeholderTextColor={secondaryText}
                            />
                            
                            <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 10 }]}>Vendor / Shop (Optional)</Text>
                            <TextInput
                              style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                              value={d.vendor}
                              onChangeText={t => setDraftField(name, index, "vendor", t)}
                              placeholder="e.g. Local Shop"
                              placeholderTextColor={secondaryText}
                            />
                            
                            <View style={[styles.calcResultRow, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC', borderColor }]}>
                              <Text style={[styles.calcResultLabel, { color: secondaryText }]}>AMOUNT</Text>
                              <Text style={[styles.calcResultAmt, { color: '#10B981' }]}>{fmt(rowAmt)}</Text>
                            </View>
                          </View>
                        )}
                        
                        {cfg.type === "flat" && (
                          <View style={styles.calcStack}>
                            <Text style={[styles.fieldLabelStandalone, { color: secondaryText }]}>{cfg.amountLabel}</Text>
                            <TextInput
                              style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                              keyboardType="numeric"
                              value={d.flatAmt}
                              onChangeText={t => setDraftField(name, index, "flatAmt", t)}
                              placeholder="0"
                              placeholderTextColor={secondaryText}
                            />
                            
                            <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 10 }]}>Vendor / Shop (Optional)</Text>
                            <TextInput
                              style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                              value={d.vendor}
                              onChangeText={t => setDraftField(name, index, "vendor", t)}
                              placeholder="e.g. Local Shop"
                              placeholderTextColor={secondaryText}
                            />
                            <View style={[styles.calcResultRow, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC', borderColor }]}>
                              <Text style={[styles.calcResultLabel, { color: secondaryText }]}>AMOUNT</Text>
                              <Text style={[styles.calcResultAmt, { color: '#10B981' }]}>{fmt(rowAmt)}</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {(name === 'Vegetables' || name === 'Groceries' || name === 'Snacks') && (
                    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }} onPress={() => addDraftRow(name)}>
                      <Plus size={15} color="#10B981" style={{ marginRight: 4 }} />
                      <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13 }}>Add another {name}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            <View style={[styles.ledgerCard, styles.batchAddCard, { backgroundColor: cardSurface, borderColor: '#10B981' }]}>
              <View style={[styles.calcResultRow, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC', borderColor }]}>
                <Text style={[styles.calcResultLabel, { color: secondaryText }]}>BATCH TOTAL</Text>
                <Text style={[styles.calcResultAmt, { color: '#10B981' }]}>{fmt(batchTotal)}</Text>
              </View>

              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }} onPress={() => expenseType === 'event' ? setEventPickerOpen(true) : setPickerOpen(true)}>
                <Plus size={15} color="#10B981" style={{ marginRight: 4 }} />
                <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13 }}>Add another category</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {displayItems.length > 0 && (
          <View style={[styles.ledgerCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : borderColor }]}>
            <Text style={[styles.ledgerCardHead, { color: primaryText }]}>Expense Details</Text>

            <View style={[styles.detailFormStack, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : borderColor }]}>
              <Text style={[styles.fieldLabelStandalone, { color: secondaryText }]}>Vendor / Supplier (Global/Default)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                value={vendor}
                onChangeText={setVendor}
                placeholder="e.g. Sri Ganga Water Suppliers"
                placeholderTextColor={secondaryText}
              />

              <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 12 }]}>Paid By</Text>
              <TextInput
                style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                value={paidBy}
                onChangeText={setPaidBy}
                placeholder="e.g. Bro. Samuel"
                placeholderTextColor={secondaryText}
              />

              <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 12 }]}>Payment Method</Text>
              <View style={styles.chipRow}>
                {PAYMENT_METHODS.map(p => {
                  const active = paymentMethod === p.id;
                  return (
                    <TouchableOpacity 
                      key={p.id} 
                      style={[
                        styles.chip,
                        { backgroundColor: secondarySurface, borderColor },
                        active && { backgroundColor: '#10B981', borderColor: '#10B981' }
                      ]} 
                      onPress={() => setPaymentMethod(p.id)}
                    >
                      <p.icon size={14} color={active ? "#fff" : primaryText} strokeWidth={2} />
                      <Text style={[styles.chipText, { color: active ? '#fff' : primaryText }]}>{p.id}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 12 }]}>Reference No.</Text>
              <TextInput
                style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                value={reference}
                onChangeText={setReference}
                placeholder="Optional"
                placeholderTextColor={secondaryText}
              />

              <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 12 }]}>Notes</Text>
              <TextInput
                style={[styles.input, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes"
                placeholderTextColor={secondaryText}
              />

              <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginTop: 12 }]}>Attach Receipt</Text>
              <TouchableOpacity
                style={[styles.uploadBox, { backgroundColor: secondarySurface, borderColor }]}
                onPress={() => receiptUri ? setPreviewOpen(true) : handleAttachReceipt()}
              >
                <Receipt size={16} color={secondaryText} />
                <Text style={[styles.uploadBoxText, { color: secondaryText }]} numberOfLines={1}>
                  {receiptName || "Tap to attach invoice / bill / photo"}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: '#10B981', marginTop: 18, opacity: isSaving ? 0.7 : 1 }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Check size={18} color="#fff" />
              <Text style={styles.btnPrimaryText}>
                {isSaving ? "Saving..." : initialExpense ? "Update Expense" : "Save Expense"} · {fmt(total)}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Categories Sheet */}
        <Sheet
          title="Choose Categories"
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          isDark={isDark}
          cardSurface={cardSurface}
          primaryText={primaryText}
          borderColor={borderColor}
        >
          <View style={styles.categoryGrid}>
            {categoryOptions.map(name => {
              const active = selectedCategories.includes(name);
              const CatIcon = getCategoryIconComponent(name);
              return (
                <TouchableOpacity 
                  key={name} 
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: active ? '#10B981' : secondarySurface,
                      borderColor: active ? '#10B981' : borderColor
                    }
                  ]} 
                  onPress={() => toggleCategory(name)}
                  onLongPress={() => {
                    if (localCategories.includes(name)) {
                      setDeleteCategoryTarget(name);
                    }
                  }}
                >
                  <CatIcon size={16} color={active ? "#fff" : primaryText} />
                  <Text style={[styles.categoryChipText, { color: active ? '#fff' : primaryText }]}>{name}</Text>
                  {active && <Check size={14} color="#fff" style={styles.categoryChipCheck} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.newEventRow, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : borderColor }]}>
            <Text style={[styles.fieldLabelStandalone, { color: secondaryText }]}>New Category</Text>
            <View style={styles.newEventInputRow}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                value={newCategoryInput}
                onChangeText={setNewCategoryInput}
                placeholder="e.g. Choir Robes"
                placeholderTextColor={secondaryText}
              />
              <TouchableOpacity
                style={[styles.btnBrass, { backgroundColor: '#10B981' }, !newCategoryInput.trim() && { opacity: 0.5 }]}
                disabled={!newCategoryInput.trim()}
                onPress={createCategory}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.newEventHint, { color: secondaryText }]}>
              Spent on something not listed? Type a category and add it on the spot.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: '#10B981', marginTop: 14 }]}
            onPress={() => setPickerOpen(false)}
          >
            <Text style={styles.btnPrimaryText}>
              Done{selectedCategories.length > 0 ? ` — ${selectedCategories.length} selected` : ""}
            </Text>
          </TouchableOpacity>
        </Sheet>

        {/* Event Picker Sheet */}
        <Sheet
          title="Choose Event & Categories"
          visible={eventPickerOpen}
          onClose={() => setEventPickerOpen(false)}
          isDark={isDark}
          cardSurface={cardSurface}
          primaryText={primaryText}
          borderColor={borderColor}
        >
          <View style={styles.eventOptionList}>
            {eventOptions.map(name => {
              const active = eventName === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[
                    styles.eventOption,
                    {
                      backgroundColor: active ? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#D1FAE5') : secondarySurface,
                      borderColor: active ? '#10B981' : borderColor
                    }
                  ]}
                  onPress={() => chooseEvent(name)}
                >
                  <CalendarDays size={16} color={active ? '#10B981' : secondaryText} />
                  <Text style={[styles.eventOptionText, { color: primaryText, fontWeight: active ? '700' : '500' }]}>{name}</Text>
                  {active && <Check size={16} color="#10B981" />}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.newEventRow, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : borderColor }]}>
            <Text style={[styles.fieldLabelStandalone, { color: secondaryText }]}>New Event</Text>
            <View style={styles.newEventInputRow}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                value={newEventInput}
                onChangeText={setNewEventInput}
                placeholder="e.g. Baptism Service"
                placeholderTextColor={secondaryText}
              />
              <TouchableOpacity
                style={[styles.btnBrass, { backgroundColor: '#10B981' }, !newEventInput.trim() && { opacity: 0.5 }]}
                disabled={!newEventInput.trim()}
                onPress={createEvent}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={[styles.rowDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : borderColor, marginVertical: 20 }]} />
          <Text style={[styles.fieldLabelStandalone, { color: secondaryText, marginBottom: 10 }]}>Categories</Text>
          <View style={styles.categoryGrid}>
            {categoryOptions.map(name => {
              const active = selectedCategories.includes(name);
              const CatIcon = getCategoryIconComponent(name);
              return (
                <TouchableOpacity 
                  key={name} 
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: active ? '#10B981' : secondarySurface,
                      borderColor: active ? '#10B981' : borderColor
                    }
                  ]} 
                  onPress={() => toggleCategory(name)}
                  onLongPress={() => {
                    if (localCategories.includes(name)) {
                      setDeleteCategoryTarget(name);
                    }
                  }}
                >
                  <CatIcon size={16} color={active ? "#fff" : primaryText} />
                  <Text style={[styles.categoryChipText, { color: active ? '#fff' : primaryText }]}>{name}</Text>
                  {active && <Check size={14} color="#fff" style={styles.categoryChipCheck} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: '#10B981', marginTop: 16 }]}
            onPress={() => setEventPickerOpen(false)}
          >
            <Text style={styles.btnPrimaryText}>Done{selectedCategories.length > 0 ? ` — ${selectedCategories.length} selected` : ""}</Text>
          </TouchableOpacity>
        </Sheet>

      </ScrollView>

      {/* Preview Attached Receipt */}
      {previewOpen && receiptUri && (
        <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, padding: 10, zIndex: 10 }} onPress={() => setPreviewOpen(false)}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
            <Image source={{ uri: receiptUri }} style={{ width: '100%', height: '70%', resizeMode: 'contain' }} />
            <View style={{ flexDirection: 'row', marginTop: 24, gap: 14 }}>
              <TouchableOpacity onPress={() => { setPreviewOpen(false); handleAttachReceipt(); }} style={[styles.btnPrimary, { backgroundColor: '#334155' }]}>
                <Text style={styles.btnPrimaryText}>Change Receipt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setReceiptUri(null); setReceiptName(""); setPreviewOpen(false); }} style={[styles.btnPrimary, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.btnPrimaryText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  editBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: '#10B981',
  },
  editBannerText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  editBannerCancel: {
    color: '#fff',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
    gap: 14,
  },
  ledgerCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldLabelStandalone: {
    fontSize: 10.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    padding: 12,
    fontSize: 14,
    borderRadius: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  categoryPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  categoryPickerBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  newEventHint: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  dynamicFormHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dynamicFormHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dynamicFormHeadText: {
    fontWeight: '700',
    fontSize: 16,
  },
  iconBtn: {
    padding: 4,
  },
  rowDivider: {
    height: 1,
    marginVertical: 14,
  },
  calcStack: {
    flexDirection: 'column',
  },
  calcResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
    borderRadius: 8,
  },
  calcResultLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  calcResultAmt: {
    fontSize: 17,
    fontWeight: '800',
  },
  batchAddCard: {
    borderStyle: 'dashed',
    borderWidth: 1.5,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  ledgerCardHead: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  detailFormStack: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  uploadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  uploadBoxText: {
    fontSize: 13,
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
    paddingBottom: Platform.OS === 'ios' ? 40 : 48,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryChip: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  categoryChipCheck: {
    marginLeft: 4,
  },
  successToast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  successIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  successText: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  stylishModalCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  modalIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontWeight: '700',
    fontSize: 14,
  },
  modalBtnDanger: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
  },
  modalBtnDangerText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  newEventRow: {
    marginTop: 16,
    borderTopWidth: 1,
    paddingTop: 16,
    marginBottom: 16,
  },
  newEventInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnBrass: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  eventOptionList: {
    flexDirection: 'column',
    gap: 8,
  },
  eventOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  eventOptionText: {
    flex: 1,
    fontSize: 13.5,
  },
});
