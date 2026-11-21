import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Share,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  X,
  Award,
  Share2,
  Sparkles,
  ShieldCheck,
  Edit3,
  Check,
  Eye,
} from 'lucide-react-native';
import {
  ChildRecord,
  KidsCertificateData,
  KidsCertificateSettings,
} from '../../../types/KidsMinistryTypes';
import { useTheme } from '../../../context/ThemeContext';

interface Props {
  visible: boolean;
  data: KidsCertificateData;
  editable?: boolean;
  childrenList?: ChildRecord[];
  onSaveDefaults?: (settings: KidsCertificateSettings) => Promise<void>;
  onUpdateData?: (updated: KidsCertificateData) => void;
  onClose: () => void;
}

export default function KidsCertificateModal({
  visible,
  data,
  editable = false,
  childrenList = [],
  onSaveDefaults,
  onUpdateData,
  onClose,
}: Props) {
  const { isDark } = useTheme();
  const [editing, setEditing] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [draft, setDraft] = useState<KidsCertificateData>(data);

  useEffect(() => {
    setDraft(data);
    setEditing(false);
  }, [data, visible]);

  const directorTitle = draft.directorTitle?.trim() || 'Sunday School Director';
  const pastorTitle = draft.pastorTitle?.trim() || 'Senior Pastor';

  const handleApplyChanges = async () => {
    const cleaned: KidsCertificateData = {
      ...draft,
      childName: draft.childName.trim() || data.childName,
      childId: draft.childId.trim() || data.childId,
      eventName: draft.eventName.trim() || data.eventName,
      eventNameTelugu: draft.eventNameTelugu.trim() || data.eventNameTelugu,
      tierOrHouse: draft.tierOrHouse.trim() || data.tierOrHouse,
      dateIssued: draft.dateIssued.trim() || data.dateIssued,
      academicYear: draft.academicYear.trim() || data.academicYear,
      directorName: draft.directorName.trim() || 'Sunday School Director',
      directorTitle: draft.directorTitle?.trim() || 'Sunday School Director',
      pastorName: draft.pastorName.trim() || 'Senior Pastor',
      pastorTitle: draft.pastorTitle?.trim() || 'Senior Pastor',
      churchName: draft.churchName.trim() || data.churchName,
      verse: draft.verse.trim() || data.verse,
      verseTelugu: draft.verseTelugu.trim() || data.verseTelugu,
    };

    setDraft(cleaned);
    onUpdateData?.(cleaned);

    if (onSaveDefaults) {
      try {
        setSavingDefaults(true);
        await onSaveDefaults({
          directorName: cleaned.directorName,
          directorTitle: cleaned.directorTitle,
          pastorName: cleaned.pastorName,
          pastorTitle: cleaned.pastorTitle,
          churchName: cleaned.churchName,
        });
      } catch (e: any) {
        Alert.alert('Save Warning', e?.message || 'Could not save leadership defaults.');
      } finally {
        setSavingDefaults(false);
      }
    }

    setEditing(false);
  };

  const handleShareCertificate = async () => {
    try {
      const msg =
        `🎓 *${draft.churchName.toUpperCase()} · OFFICIAL CERTIFICATE*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `This is proudly presented to\n` +
        `⭐ *${draft.childName}* (ID: ${draft.childId})\n` +
        `in recognition of faithful completion of:\n` +
        `🏆 *${draft.eventName}*\n` +
        `${draft.eventNameTelugu ? `(${draft.eventNameTelugu})\n` : ''}` +
        `${draft.tierOrHouse} · ${draft.academicYear}\n\n` +
        `📖 "${draft.verse}"\n` +
        `${draft.verseTelugu ? `"${draft.verseTelugu}"\n\n` : '\n'}` +
        `Signed:\n` +
        `✍️ ${draft.directorName} (${directorTitle})\n` +
        `✍️ ${draft.pastorName} (${pastorTitle})\n` +
        `📅 Issued on ${draft.dateIssued}`;

      await Share.share({ message: msg });
    } catch {
      // User dismissed share
    }
  };

  const screenBg = isDark ? '#0B0F19' : '#F3EFE6';
  const cardBg = isDark ? '#151B2B' : '#FFFFFF';
  const inputBg = isDark ? '#1E2538' : '#FAF8F3';
  const border = isDark ? '#283149' : '#DFD7C8';
  const primaryText = isDark ? '#F8FAFC' : '#111827';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const placeholderColor = isDark ? '#64748B' : '#94A3B8';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.safeRoot, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={screenBg} />

          {/* Clean Top Toolbar */}
          <View style={[styles.topBar, { borderBottomColor: border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.iconCircleBtn, { backgroundColor: cardBg, borderColor: border }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={19} color={primaryText} />
            </TouchableOpacity>

            <View style={{ flex: 1, paddingHorizontal: 10 }}>
              <Text style={[styles.toolbarTitle, { color: primaryText }]} numberOfLines={1}>
                {editing ? 'Edit Certificate Details' : 'Official VBS Certificate'}
              </Text>
              <Text style={[styles.toolbarSub, { color: secondaryText }]} numberOfLines={1}>
                {editing
                  ? 'Customize recipient, Director & Senior Pastor'
                  : 'Bilingual Presentation Diploma'}
              </Text>
            </View>

            <View style={styles.toolbarActions}>
              {editable && (
                <TouchableOpacity
                  onPress={() => setEditing(e => !e)}
                  style={[
                    styles.toolbarPillBtn,
                    {
                      backgroundColor: editing ? '#1E3A8A' : cardBg,
                      borderColor: editing ? '#1E3A8A' : border,
                    },
                  ]}
                >
                  {editing ? (
                    <Eye size={14} color="#FFFFFF" />
                  ) : (
                    <Edit3 size={14} color={primaryText} />
                  )}
                  <Text
                    style={[
                      styles.toolbarPillText,
                      { color: editing ? '#FFFFFF' : primaryText },
                    ]}
                  >
                    {editing ? 'Preview' : 'Edit'}
                  </Text>
                </TouchableOpacity>
              )}

              {!editing && (
                <TouchableOpacity onPress={handleShareCertificate} style={styles.shareBtn}>
                  <Share2 size={14} color="#FFFFFF" />
                  <Text style={styles.shareBtnText}>Share</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.scroll}
            >
              {editing ? (
                /* ══════════════════════════════════════════════════════ */
                /* EDIT CERTIFICATE & LEADERSHIP SIGNATURES PANEL        */
                /* ══════════════════════════════════════════════════════ */
                <View style={{ gap: 14 }}>
                  {/* Quick Recipient Selector */}
                  {childrenList.length > 0 && (
                    <View style={[styles.editorCard, { backgroundColor: cardBg, borderColor: border }]}>
                      <Text style={styles.editorEyebrow}>SELECT ENROLLED STUDENT</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8, paddingTop: 4 }}
                      >
                        {childrenList.map(child => {
                          const selected = draft.childId === child.childId;
                          return (
                            <TouchableOpacity
                              key={child.id}
                              style={[
                                styles.childChip,
                                {
                                  backgroundColor: selected ? '#1E3A8A' : inputBg,
                                  borderColor: selected ? '#1E3A8A' : border,
                                },
                              ]}
                              onPress={() =>
                                setDraft(prev => ({
                                  ...prev,
                                  childName: child.fullName,
                                  childId: child.childId,
                                  tierOrHouse: child.assignedClassName || prev.tierOrHouse,
                                }))
                              }
                            >
                              <Text
                                style={[
                                  styles.childChipText,
                                  { color: selected ? '#FFFFFF' : primaryText },
                                ]}
                              >
                                {child.fullName}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {/* Leadership Signatures (Sunday School Director & Senior Pastor) */}
                  <View style={[styles.editorCard, { backgroundColor: cardBg, borderColor: border }]}>
                    <Text style={styles.editorEyebrow}>CHURCH & LEADERSHIP SIGNATURES</Text>

                    <View>
                      <Text style={[styles.fieldLabel, { color: primaryText }]}>Church Name</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                        value={draft.churchName}
                        onChangeText={txt => setDraft(p => ({ ...p, churchName: txt }))}
                        placeholder="Rhema Global Ministries"
                        placeholderTextColor={placeholderColor}
                      />
                    </View>

                    <View style={styles.rowPair}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { color: primaryText }]}>
                          Sunday School Director Name
                        </Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                          value={draft.directorName}
                          onChangeText={txt => setDraft(p => ({ ...p, directorName: txt }))}
                          placeholder="Director Name"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                      <View style={{ flex: 0.9 }}>
                        <Text style={[styles.fieldLabel, { color: primaryText }]}>
                          Director Title Label
                        </Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                          value={draft.directorTitle ?? 'Sunday School Director'}
                          onChangeText={txt => setDraft(p => ({ ...p, directorTitle: txt }))}
                          placeholder="Sunday School Director"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                    </View>

                    <View style={styles.rowPair}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { color: primaryText }]}>
                          Senior Pastor Name
                        </Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                          value={draft.pastorName}
                          onChangeText={txt => setDraft(p => ({ ...p, pastorName: txt }))}
                          placeholder="Senior Pastor Name"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                      <View style={{ flex: 0.9 }}>
                        <Text style={[styles.fieldLabel, { color: primaryText }]}>
                          Pastor Title Label
                        </Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                          value={draft.pastorTitle ?? 'Senior Pastor'}
                          onChangeText={txt => setDraft(p => ({ ...p, pastorTitle: txt }))}
                          placeholder="Senior Pastor"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Recipient & Event Details */}
                  <View style={[styles.editorCard, { backgroundColor: cardBg, borderColor: border }]}>
                    <Text style={styles.editorEyebrow}>RECIPIENT & EVENT DETAILS</Text>

                    <View style={styles.rowPair}>
                      <View style={{ flex: 1.2 }}>
                        <Text style={[styles.fieldLabel, { color: primaryText }]}>Student Name</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                          value={draft.childName}
                          onChangeText={txt => setDraft(p => ({ ...p, childName: txt }))}
                          placeholder="Student Full Name"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                      <View style={{ flex: 0.8 }}>
                        <Text style={[styles.fieldLabel, { color: primaryText }]}>Badge ID</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                          value={draft.childId}
                          onChangeText={txt => setDraft(p => ({ ...p, childId: txt }))}
                          placeholder="KID-2026-0001"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                    </View>

                    <View>
                      <Text style={[styles.fieldLabel, { color: primaryText }]}>
                        Program / VBS Title (English)
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                        value={draft.eventName}
                        onChangeText={txt => setDraft(p => ({ ...p, eventName: txt }))}
                        placeholder="Kingdom Champions VBS 2026"
                        placeholderTextColor={placeholderColor}
                      />
                    </View>

                    <View>
                      <Text style={[styles.fieldLabel, { color: primaryText }]}>
                        Program Title (Telugu)
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                        value={draft.eventNameTelugu}
                        onChangeText={txt => setDraft(p => ({ ...p, eventNameTelugu: txt }))}
                        placeholder="తెలుగు కార్యక్రమం పేరు"
                        placeholderTextColor={placeholderColor}
                      />
                    </View>

                    <View style={styles.rowPair}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { color: primaryText }]}>
                          Class / House
                        </Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                          value={draft.tierOrHouse}
                          onChangeText={txt => setDraft(p => ({ ...p, tierOrHouse: txt }))}
                          placeholder="Gold Lions"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                      <View style={{ flex: 0.8 }}>
                        <Text style={[styles.fieldLabel, { color: primaryText }]}>
                          Issued Date
                        </Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: primaryText }]}
                          value={draft.dateIssued}
                          onChangeText={txt => setDraft(p => ({ ...p, dateIssued: txt }))}
                          placeholder="May 2026"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={handleApplyChanges}
                    disabled={savingDefaults}
                    activeOpacity={0.88}
                  >
                    {savingDefaults ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Check size={17} color="#FFFFFF" strokeWidth={2.6} />
                        <Text style={styles.applyBtnText}>
                          Save & View Certificate
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                /* ══════════════════════════════════════════════════════ */
                /* ROYAL IVORY & GOLD CERTIFICATE PRESENTATION VIEW      */
                /* ══════════════════════════════════════════════════════ */
                <View style={styles.certShadowWrap}>
                  <View style={styles.certParchmentOuter}>
                    <View style={styles.certNavyInner}>
                      {/* Decorative Corner Flourishes */}
                      <View style={[styles.cornerDot, styles.cornerTL]} />
                      <View style={[styles.cornerDot, styles.cornerTR]} />
                      <View style={[styles.cornerDot, styles.cornerBL]} />
                      <View style={[styles.cornerDot, styles.cornerBR]} />

                      {/* Crest Header */}
                      <View style={styles.sealHeaderRow}>
                        <View style={styles.goldRule} />
                        <View style={styles.crestCircle}>
                          <Award size={26} color="#FFFFFF" />
                        </View>
                        <View style={styles.goldRule} />
                      </View>

                      <Text style={styles.churchHeading}>
                        {draft.churchName.toUpperCase()}
                      </Text>
                      <Text style={styles.ministryHeading}>
                        SUNDAY SCHOOL & KIDS MINISTRY
                      </Text>
                      <Text style={styles.mark10Quote}>
                        “Let the little children come to Me” — Mark 10:14
                      </Text>

                      {/* Main Diploma Heading */}
                      <View style={styles.diplomaHeadingBox}>
                        <Text style={styles.diplomaTitle}>CERTIFICATE OF COMPLETION</Text>
                        <Text style={styles.diplomaTitleTe}>విశిష్ట ప్రశంసా పత్రము</Text>
                      </View>

                      <Text style={styles.presentedEyebrow}>THIS IS PROUDLY PRESENTED TO</Text>

                      {/* Recipient Name Plate */}
                      <View style={styles.recipientPlate}>
                        <Text style={styles.recipientName}>{draft.childName}</Text>
                        <View style={styles.recipientUnderline} />
                        <Text style={styles.recipientId}>ID · {draft.childId}</Text>
                      </View>

                      {/* Achievement Summary */}
                      <Text style={styles.recognitionBody}>
                        For faithful attendance, Scripture memorization, and joyful growth in Christ during:
                      </Text>

                      <View style={styles.eventBanner}>
                        <Text style={styles.eventTitleEn}>{draft.eventName}</Text>
                        {draft.eventNameTelugu ? (
                          <Text style={styles.eventTitleTe}>{draft.eventNameTelugu}</Text>
                        ) : null}
                        <Text style={styles.tierMeta}>
                          {draft.tierOrHouse} · {draft.academicYear}
                        </Text>
                      </View>

                      {/* Scripture Benediction */}
                      <View style={styles.scriptureParchmentBox}>
                        <Sparkles size={14} color="#B45309" />
                        <Text style={styles.verseTextEn}>“{draft.verse}”</Text>
                        {draft.verseTelugu ? (
                          <Text style={styles.verseTextTe}>“{draft.verseTelugu}”</Text>
                        ) : null}
                      </View>

                      {/* Signatures & Official Seal */}
                      <View style={styles.signaturesRow}>
                        <View style={styles.sigColumn}>
                          <Text style={styles.sigScript} numberOfLines={2}>
                            {draft.directorName}
                          </Text>
                          <View style={styles.sigHairline} />
                          <Text style={styles.sigRoleLabel} numberOfLines={2}>
                            {directorTitle}
                          </Text>
                        </View>

                        <View style={styles.goldSealBadge}>
                          <ShieldCheck size={20} color="#B45309" />
                          <Text style={styles.goldSealText}>OFFICIAL</Text>
                        </View>

                        <View style={styles.sigColumn}>
                          <Text style={styles.sigScript} numberOfLines={2}>
                            {draft.pastorName}
                          </Text>
                          <View style={styles.sigHairline} />
                          <Text style={styles.sigRoleLabel} numberOfLines={2}>
                            {pastorTitle}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.dateFooter}>Issued on {draft.dateIssued}</Text>
                    </View>
                  </View>

                  {editable && (
                    <TouchableOpacity
                      style={[styles.editPromptStrip, { backgroundColor: cardBg, borderColor: border }]}
                      onPress={() => setEditing(true)}
                      activeOpacity={0.85}
                    >
                      <Edit3 size={14} color="#1E3A8A" />
                      <Text style={[styles.editPromptText, { color: primaryText }]}>
                        Tap to Edit Director, Senior Pastor, Student or Event Name
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarTitle: {
    fontSize: 15.5,
    fontWeight: '800',
  },
  toolbarSub: {
    fontSize: 11,
    marginTop: 1,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  toolbarPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  // Royal Ivory Diploma Certificate
  certShadowWrap: {
    gap: 14,
  },
  certParchmentOuter: {
    backgroundColor: '#FFFDF5',
    borderRadius: 20,
    padding: 9,
    borderWidth: 3,
    borderColor: '#D97706',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
  },
  certNavyInner: {
    backgroundColor: '#FFFDF7',
    borderRadius: 13,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1E3A8A',
    position: 'relative',
  },
  cornerDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D97706',
  },
  cornerTL: { top: 8, left: 8 },
  cornerTR: { top: 8, right: 8 },
  cornerBL: { bottom: 8, left: 8 },
  cornerBR: { bottom: 8, right: 8 },
  sealHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
    marginBottom: 10,
  },
  goldRule: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#E5C158',
  },
  crestCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E3A8A',
    borderWidth: 2.5,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  churchHeading: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E3A8A',
    letterSpacing: 1.8,
    textAlign: 'center',
  },
  ministryHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 1.5,
    marginTop: 3,
    textAlign: 'center',
  },
  mark10Quote: {
    fontSize: 10.5,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
  diplomaHeadingBox: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 12,
  },
  diplomaTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  diplomaTitleTe: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 3,
  },
  presentedEyebrow: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.2,
  },
  recipientPlate: {
    alignItems: 'center',
    marginVertical: 8,
    width: '100%',
  },
  recipientName: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 25,
    fontWeight: '800',
    color: '#1E3A8A',
    textAlign: 'center',
  },
  recipientUnderline: {
    width: '65%',
    height: 1.5,
    backgroundColor: '#D97706',
    marginTop: 4,
    marginBottom: 4,
  },
  recipientId: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  recognitionBody: {
    fontSize: 11.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  eventBanner: {
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FEF7E6',
    borderWidth: 1,
    borderColor: '#FDE68A',
    width: '100%',
    gap: 2,
  },
  eventTitleEn: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  eventTitleTe: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
    textAlign: 'center',
  },
  tierMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
    marginTop: 2,
  },
  scriptureParchmentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
    gap: 4,
  },
  verseTextEn: {
    fontSize: 11.5,
    color: '#1E293B',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 16,
  },
  verseTextTe: {
    fontSize: 10.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 16,
  },
  signaturesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    gap: 8,
  },
  sigColumn: {
    flex: 1,
    alignItems: 'center',
  },
  sigScript: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '700',
    color: '#1E3A8A',
    textAlign: 'center',
    marginBottom: 4,
  },
  sigHairline: {
    width: '100%',
    height: 1,
    backgroundColor: '#94A3B8',
    marginBottom: 4,
  },
  sigRoleLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  goldSealBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  goldSealText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#B45309',
    marginTop: 1,
    letterSpacing: 0.4,
  },
  dateFooter: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 14,
  },
  editPromptStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  editPromptText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  // Editor Card Styles
  editorCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 15,
    gap: 11,
  },
  editorEyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.9,
  },
  childChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  childChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 11,
    fontSize: 13.5,
  },
  rowPair: {
    flexDirection: 'row',
    gap: 10,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E3A8A',
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 4,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
