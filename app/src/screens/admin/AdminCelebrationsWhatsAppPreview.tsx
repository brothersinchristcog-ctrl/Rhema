import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Image, ActivityIndicator, Alert } from 'react-native';
import { Edit2, ChevronLeft, ArrowLeft, Share2 } from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, G, Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import { getCelebrationCardTextColor, buildCelebrationWhatsAppMessage } from '../../utils/celebrationDateHelper';

const ICONS = {
  whatsapp: (
    <Svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
      <G>
        <Path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.2.2-.3.2-.5.1-.2 0-.4 0-.5 0-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-1 1-1 2.3 0 1.4 1 2.7 1.1 2.9.1.2 2 3 4.8 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2-.1-.2-.2-.2-.4-.3Z" />
      </G>
    </Svg>
  ),
};

export default function AdminCelebrationsWhatsAppPreview({ 
  member, 
  category,
  theme,
  layout,
  photoUri,
  titleOverlay,
  nameOverlay,
  message, 
  verse,
  churchName,
  onEdit, 
  onSendWhatsApp,
  onSendPush
}: { 
  member: any, 
  category: string,
  theme: any,
  layout?: 'theme' | 'photo',
  photoUri?: string | null,
  titleOverlay?: string,
  nameOverlay?: string,
  message: string,
  verse: {ref: string, text: string},
  churchName: string,
  onEdit: () => void,
  onSendWhatsApp: (imageUri?: string, sendMode?: 'deeplink' | 'share_card') => Promise<void>,
  onSendPush: (imageUri: string) => Promise<void>
}) {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isSendingCard, setIsSendingCard] = useState(false);
  const [isSendingPush, setIsSendingPush] = useState(false);
  
  const colors = theme?.imageUrl 
    ? ['#000000', '#000000'] 
    : (theme?.color ? [theme.color, theme.color] : (theme?.c || ['#5A6BC4', '#1E2A63']));
  const cardTextColor = getCelebrationCardTextColor(colors, Boolean(theme?.imageUrl));
  const accentStrokeColor = cardTextColor === '#FFFFFF' ? '#FFFFFF' : '#64748B';
  
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  
  const nameWords = String(member?.name || 'Member').trim().split(/\s+/).filter(Boolean);
  const initials = ((nameWords[0]?.[0] || 'M') + (nameWords[1]?.[0] || '')).toUpperCase();
  const recipientPhone = member?.phone || member?.referencePhone || '';
  const previewWhatsAppText = buildCelebrationWhatsAppMessage({
    memberName: member?.name,
    nameOverlay,
    celebrationType: category,
    titleOverlay,
    dateStr: member?.dateStr,
    age: member?.age,
    greetingMessage: message,
    verse,
    churchName,
  });

  const viewShotRef = useRef<ViewShot>(null);

  const handleCaptureAndSend = async (type: 'whatsapp' | 'whatsapp_card' | 'push') => {
    if (type === 'whatsapp') setIsSendingWhatsApp(true);
    if (type === 'whatsapp_card') setIsSendingCard(true);
    if (type === 'push') setIsSendingPush(true);
    
    try {
      // Allow layout and image rendering to complete before capturing
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 260)));

      let uri: string | undefined;
      try {
        if (viewShotRef.current && typeof viewShotRef.current.capture === 'function') {
          uri = await viewShotRef.current.capture();
        }
      } catch (snapErr) {
        if (type !== 'whatsapp') throw snapErr;
        console.warn('[Celebrations] Non-blocking snapshot capture warning for deep link:', snapErr);
      }

      if (!uri && type !== 'whatsapp') {
        throw new Error('ViewShot capture returned empty URI');
      }

      console.log(`[Celebrations] Prepared greeting card action for ${type}:`, uri ? 'captured' : 'text-only');

      if (type === 'whatsapp') {
        await onSendWhatsApp(uri, 'deeplink');
      } else if (type === 'whatsapp_card') {
        await onSendWhatsApp(uri, 'share_card');
      } else {
        await onSendPush(uri!);
      }
    } catch (err: any) {
      console.error(`Capture for ${type} failed:`, err);
      if (type === 'whatsapp_card') {
        Alert.alert(
          'Image Snapshot Failed',
          'Could not capture the card image snapshot. Would you like to send the prepared wish via WhatsApp chat instead?',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open WhatsApp Chat', 
              onPress: () => onSendWhatsApp(undefined, 'deeplink') 
            }
          ]
        );
      } else if (type === 'whatsapp') {
        await onSendWhatsApp(undefined, 'deeplink');
      } else {
        Alert.alert('Error', 'Failed to snapshot celebration card image for push notification.');
      }
    } finally {
      setIsSendingWhatsApp(false);
      setIsSendingCard(false);
      setIsSendingPush(false);
    }
  };

    return (
    <View style={styles.container}>
      {/* ── Fixed Header ── */}
      <View style={[
        styles.topBar,
        {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? '#27272A' : '#CBD5E1',
          paddingBottom: 14,
          paddingTop: 12,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }
      ]}>
        <TouchableOpacity 
          style={[
            styles.circularBackBtn,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : '#CBD5E1',
              borderWidth: 1.5,
            }
          ]} 
          onPress={onEdit} 
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.topBarTitle, { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">{categoryLabel} Preview Greeting</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>


        <View style={styles.waHeader}>
          <View style={[styles.avatar, { backgroundColor: colors[1], overflow: 'hidden' }]}>
            {(() => {
              const displayPhoto = member.profilePhoto || member.photoUrl || member.photoURL || member.PhotoUrl || member.Photo || member.ProfilePhoto;
              if (displayPhoto && typeof displayPhoto === 'string' && displayPhoto.startsWith('http')) {
                return <Image source={{ uri: displayPhoto }} style={{ width: '100%', height: '100%' }} />;
              }
              return <Text style={styles.avatarText}>{initials}</Text>;
            })()}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.waName}>{member?.name || 'Member'}</Text>
            <Text style={styles.waStatus}>
              {recipientPhone
                ? `${recipientPhone}${member?.isReferencePhone ? ' (Parent Ref)' : ''}`
                : 'No WhatsApp number on record'}
            </Text>
          </View>
        </View>

        <View style={styles.waBody}>
          <View style={styles.waBubble}>
            <ViewShot 
              ref={viewShotRef} 
              options={{ format: 'png', quality: 1, result: 'tmpfile' }} 
              style={[styles.greetingFrame, { backgroundColor: colors[1] }]}
            >
              <View collapsable={false} style={styles.greetingCaptureInner}>
                {theme?.imageUrl && (
                  <Image source={{ uri: theme.imageUrl }} style={[StyleSheet.absoluteFillObject, { resizeMode: 'cover' }]} />
                )}
                <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice">
                  <Defs>
                    <LinearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0%" stopColor={colors[0]} stopOpacity={theme?.imageUrl ? 0.25 : 1} />
                      <Stop offset="100%" stopColor={colors[1]} stopOpacity={theme?.imageUrl ? 0.72 : 1} />
                    </LinearGradient>
                  </Defs>
                  <Rect width="400" height="500" fill="url(#pg)" />
                  {!theme?.imageUrl && (
                    <>
                      <G fill={accentStrokeColor} opacity="0.10">
                        <Circle cx="60" cy="60" r="70" />
                        <Circle cx="360" cy="440" r="90" />
                        <Circle cx="370" cy="60" r="40" />
                      </G>
                      <G fill="none" stroke={accentStrokeColor} strokeOpacity="0.22" strokeWidth="1.5">
                        <Circle cx="200" cy="250" r="150" />
                        <Circle cx="200" cy="250" r="110" />
                      </G>
                    </>
                  )}
                </Svg>

                <View style={styles.greetingOverlay}>
                  {!!churchName && (
                    <Text style={[styles.gCrest, { color: cardTextColor }]}>{churchName}</Text>
                  )}
                  
                  {layout === 'theme' && photoUri && (
                    <View style={{ alignItems: 'center', marginVertical: 10 }}>
                      <Image source={{ uri: photoUri }} style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: '#FFFFFF' }} />
                    </View>
                  )}

                  <Text style={[styles.gTitle, { color: cardTextColor }]}>{titleOverlay || categoryLabel}</Text>
                  <Text style={[styles.gName, { color: cardTextColor }]}>{nameOverlay || member?.name}</Text>
                  <Text style={[styles.gMsg, { color: cardTextColor }]}>{message}</Text>
                  {verse?.text ? (
                    <Text style={[styles.gVerse, { color: cardTextColor }, /[\u0C00-\u0C7F]/.test(verse.text) && { fontFamily: undefined }]}>
                      "{verse.text.length > 100 ? verse.text.substring(0, 100) + '...' : verse.text}"
                      {'\n'}— {verse.ref}
                    </Text>
                  ) : null}
                  <Text style={[styles.gSender, { color: cardTextColor }]}>Sent with love</Text>
                </View>
              </View>
            </ViewShot>

            <Text style={styles.waCaption}>{previewWhatsAppText}</Text>
            <Text style={styles.waTime}>Today ✓✓</Text>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: '#37469B' }]} onPress={() => handleCaptureAndSend('push')} disabled={isSendingWhatsApp || isSendingCard || isSendingPush}>
            {isSendingPush ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnPrimaryText}>Send Push</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: '#128C7E' }]} onPress={() => handleCaptureAndSend('whatsapp')} disabled={isSendingWhatsApp || isSendingCard || isSendingPush}>
            {isSendingWhatsApp ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                {ICONS.whatsapp}
                <Text style={styles.btnPrimaryText}>WhatsApp</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.shareCardBtn,
            {
              backgroundColor: isDark ? '#0B2F2B' : '#ECFDF5',
              borderColor: isDark ? '#14B8A6' : '#0F766E',
            },
          ]}
          onPress={() => handleCaptureAndSend('whatsapp_card')}
          disabled={isSendingWhatsApp || isSendingCard || isSendingPush}
          activeOpacity={0.8}
        >
          {isSendingCard ? (
            <ActivityIndicator color={isDark ? '#5EEAD4' : '#0F766E'} size="small" />
          ) : (
            <>
              <Share2 size={17} color={isDark ? '#5EEAD4' : '#0F766E'} strokeWidth={2.2} />
              <Text style={[styles.shareCardBtnText, { color: isDark ? '#CCFBF1' : '#0F766E' }]}>
                Share Wish Card Image + Message
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.actionHintText, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
          WhatsApp opens {member?.name ? `${member.name}'s` : "recipient's"} chat directly with the full wish & saves the card to Gallery. Share Wish Card attaches the card image + wish.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#64748B',
    marginBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  topBarBack: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 80,
  },
  topBarBackText: {
    color: '#fff',
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    marginLeft: 4,
  },
  topBarTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingRight: 80,
  },
  topBarSub: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'Inter-Medium',
    fontSize: 12,
  },
  topBarTitle: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
    fontSize: 16,
  },
  waHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#075E54',
    padding: 12,
    paddingHorizontal: 14,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontFamily: 'Fraunces-Bold',
    fontSize: 13,
  },
  waName: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  waStatus: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    opacity: 0.8,
  },
  waBody: {
    backgroundColor: '#E5DDD5',
    padding: 16,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  waBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    width: '94%',
    alignSelf: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 10,
  },
  waCaption: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#111111',
    lineHeight: 19.5,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 2,
  },
  waVerse: {
    fontFamily: 'CormorantGaramond-Italic',
    fontSize: 13,
    color: '#333333',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  waTime: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: '#8b8b8b',
    textAlign: 'right',
    paddingRight: 4,
    paddingTop: 2,
  },
  greetingFrame: {
    width: '100%',
    minHeight: 370,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#1E2A63',
  },
  greetingCaptureInner: {
    width: '100%',
    minHeight: 370,
    position: 'relative',
    justifyContent: 'center',
  },
  greetingOverlay: {
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  gCrest: {
    fontFamily: 'Inter-Bold',
    fontSize: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#FFFFFF',
    opacity: 0.85,
    marginBottom: 8,
    textAlign: 'center',
  },
  gTitle: {
    fontFamily: 'Fraunces-Bold',
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  gName: {
    fontFamily: 'Fraunces-SemiBold',
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  gMsg: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  gVerse: {
    fontFamily: 'Inter-Italic',
    fontSize: 10,
    lineHeight: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  gSender: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    color: '#FFFFFF',
    opacity: 0.7,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
    buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    alignItems: 'stretch',
  },
  btnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F1F5F9', // light gray solid background
  },
  btnOutlineText: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#475569', // slate gray text
  },
    btnPrimary: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#BE9A3A',
    shadowColor: '#BE9A3A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 6,
  },
  btnPrimaryText: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  shareCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 12,
    paddingHorizontal: 14,
  },
  shareCardBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 13.5,
  },
  actionHintText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 8,
  }
}));
