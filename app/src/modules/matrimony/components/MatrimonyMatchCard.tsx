import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bookmark,
  Heart,
  Image as ImageIcon,
  Mail,
  Phone,
  User,
  X,
} from 'lucide-react-native';
import MatrimonyCachedImage from './MatrimonyCachedImage';
import ProtectedPhotoPlaceholder from './ProtectedPhotoPlaceholder';
import VerifiedRibbonBadge from './VerifiedRibbonBadge';
import { MatrimonyMatchCandidate } from '../types/matrimony';

const CORAL_RED = '#E04B5A';
const ORANGE = '#EA580C';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function formatCompactHeight(cm?: number | null): string | null {
  if (!cm || cm <= 0) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function formatRecencyLabel(joinedAtMs: number): string {
  if (!joinedAtMs) return 'Verified Member';
  const diffHours = Math.max(0, Math.floor((Date.now() - joinedAtMs) / (1000 * 60 * 60)));
  if (diffHours < 24) return 'Joined today';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `Joined ${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks <= 4) return `Joined ${diffWeeks}w ago`;
  return 'Verified Member';
}

export interface MatrimonyMatchCardProps {
  item: MatrimonyMatchCandidate;
  index: number;
  displayLayout: 'photo' | 'list';
  matchTier: 'regular' | 'prime';
  isActionBusy: boolean;
  isShortlistBusy: boolean;
  isPhotoReqBusy: boolean;
  isDark: boolean;
  cardSurface: string;
  borderColor: string;
  textColor: string;
  textSecondaryColor: string;
  fontFamily?: string;
  scaleFont: (size: number) => number;
  onOpenDetail: (index: number) => void;
  onOpenPhotoViewer: (item: MatrimonyMatchCandidate, index: number) => void;
  onToggleShortlist: (targetUid: string) => void;
  onRequestPhotoAccess: (targetUid: string) => void;
  onDismiss: (targetUid: string) => void;
  onSendInterest: (candidate: MatrimonyMatchCandidate) => void;
  onCall: (candidate: MatrimonyMatchCandidate) => void;
  onSendMessage: (candidate: MatrimonyMatchCandidate) => void;
}

const MatrimonyMatchCardComponent: React.FC<MatrimonyMatchCardProps> = ({
  item,
  index,
  displayLayout,
  matchTier,
  isActionBusy,
  isShortlistBusy,
  isPhotoReqBusy,
  isDark,
  cardSurface,
  borderColor,
  textColor,
  textSecondaryColor,
  fontFamily,
  scaleFont,
  onOpenDetail,
  onOpenPhotoViewer,
  onToggleShortlist,
  onRequestPhotoAccess,
  onDismiss,
  onSendInterest,
  onCall,
  onSendMessage,
}) => {
  const detailsParts = [
    item.age ? `${item.age} Yrs` : null,
    formatCompactHeight(item.heightCm),
    item.education?.qualification,
    item.career?.profession,
    item.location?.village || item.location?.city || item.location?.state,
    item.faithSummary?.baptized === true ? 'Baptized' : null,
  ].filter(Boolean);

  const hasSentInterest = Boolean(item.interestStatus);
  const isMutual = item.interestStatus === 'accepted';
  const isNewlyJoinedProfile = Boolean(
    item.joinedAtMs && Date.now() - item.joinedAtMs <= THIRTY_DAYS_MS
  );

  const renderCardActions = () => {
    if (hasSentInterest && item.interestStatus !== 'declined') {
      const isFemale =
        String(item.gender || '').toLowerCase().includes('female') ||
        String(item.gender || '').toLowerCase() === 'f';
      const pronoun = isFemale ? 'her' : 'him';
      return (
        <View style={{ marginTop: 12 }}>
          <Text
            style={[
              styles.sentStatusHint,
              { color: textColor, fontFamily, fontSize: scaleFont(13.5) },
            ]}
          >
            {isMutual
              ? `Interest accepted by ${item.displayName}`
              : `You sent ${pronoun} an interest`}
          </Text>
          <View style={[styles.cardActionsRow, { marginTop: 10 }]}>
            <TouchableOpacity
              style={[styles.callOutlineBtn, { borderColor: CORAL_RED }]}
              activeOpacity={0.82}
              onPress={() => onCall(item)}
            >
              <Phone size={15} color={CORAL_RED} strokeWidth={2} />
              <Text style={[styles.callOutlineText, { fontFamily, fontSize: scaleFont(14) }]}>
                Call Now
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sendMessageSolidBtn}
              activeOpacity={0.85}
              onPress={() => onSendMessage(item)}
            >
              <Mail size={15} color="#FFFFFF" strokeWidth={2} />
              <Text style={[styles.sendMessageSolidText, { fontFamily, fontSize: scaleFont(14) }]}>
                Send Message
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.cardActionsRow}>
        <TouchableOpacity
          style={[
            styles.dontShowBtn,
            { borderColor: isDark ? '#475569' : '#CBD5E1' },
          ]}
          disabled={isActionBusy}
          onPress={() => onDismiss(item.uid)}
          activeOpacity={0.8}
        >
          <X size={16} color={textSecondaryColor} />
          <Text
            style={[
              styles.dontShowText,
              { color: textSecondaryColor, fontFamily, fontSize: scaleFont(14) },
            ]}
          >
            Don&apos;t Show
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sendInterestBtn}
          disabled={isActionBusy}
          onPress={() => onSendInterest(item)}
          activeOpacity={0.88}
        >
          {isActionBusy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Heart size={16} color="#FFFFFF" />
              <Text style={[styles.sendInterestText, { fontFamily, fontSize: scaleFont(14) }]}>
                Send Interest
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (displayLayout === 'list') {
    return (
      <View
        style={[
          styles.matchCard,
          {
            backgroundColor: cardSurface,
            borderColor,
          },
        ]}
      >
        <View style={styles.listTopRow}>
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => onOpenDetail(index)}
            style={styles.listThumbBox}
          >
            {item.signedProfilePhoto ? (
              <MatrimonyCachedImage
                uri={item.signedProfilePhoto}
                recyclingKey={item.uid}
                style={styles.cardPhoto}
                resizeMode="cover"
              />
            ) : item.isPhotoProtected ? (
              <ProtectedPhotoPlaceholder
                gender={item.gender}
                compact
                requestStatus={item.photoRequestStatus}
                onRequestPhoto={
                  isPhotoReqBusy ? undefined : () => onRequestPhotoAccess(item.uid)
                }
                fontFamily={fontFamily}
              />
            ) : (
              <View
                style={[
                  styles.photoPlaceholder,
                  { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' },
                ]}
              >
                <User size={44} color={isDark ? '#64748B' : '#94A3B8'} />
              </View>
            )}

            {isNewlyJoinedProfile && (
              <LinearGradient
                colors={['#8B5CF6', '#6D28D9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.newlyJoinedRibbonCompact}
                pointerEvents="none"
              >
                <Text style={styles.newlyJoinedRibbonTextCompact} numberOfLines={1}>
                  NEWLY
                </Text>
                <Text style={styles.newlyJoinedRibbonTextCompact} numberOfLines={1}>
                  JOINED
                </Text>
              </LinearGradient>
            )}

            <TouchableOpacity
              style={[
                styles.listShortlistBox,
                item.isShortlisted && { backgroundColor: CORAL_RED, borderColor: CORAL_RED },
              ]}
              activeOpacity={0.85}
              disabled={isShortlistBusy}
              onPress={() => onToggleShortlist(item.uid)}
            >
              <Bookmark
                size={13}
                color={item.isShortlisted ? '#FFFFFF' : '#475569'}
                fill={item.isShortlisted ? '#FFFFFF' : 'transparent'}
              />
            </TouchableOpacity>

            {item.photoCount > 0 && (
              <TouchableOpacity
                style={styles.photoCountBadgeCompact}
                activeOpacity={0.85}
                onPress={() => onOpenPhotoViewer(item, index)}
              >
                <Text style={styles.photoCountText}>{item.photoCount}</Text>
                <ImageIcon size={12} color="#334155" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onOpenDetail(index)}
            style={styles.listRightCol}
          >
            <VerifiedRibbonBadge
              fontFamily={fontFamily}
              variant={matchTier === 'prime' ? 'prime_verified' : 'verified'}
              tier={item.candidateTier}
            />

            <Text
              style={[
                styles.candidateName,
                { color: textColor, fontFamily, fontSize: scaleFont(17.5), marginTop: 4 },
              ]}
              numberOfLines={1}
            >
              {item.displayName}
            </Text>

            <Text
              style={[
                styles.candidateSubMeta,
                { color: textSecondaryColor, fontFamily, fontSize: scaleFont(12.5) },
              ]}
              numberOfLines={1}
            >
              {item.profileCode} | {formatRecencyLabel(item.joinedAtMs)}
            </Text>

            <Text
              style={[
                styles.detailsSummary,
                { color: textColor, fontFamily, fontSize: scaleFont(13.5), marginTop: 4 },
              ]}
            >
              {detailsParts.join('  •  ')}
            </Text>
          </TouchableOpacity>
        </View>

        {renderCardActions()}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.matchCard,
        {
          backgroundColor: cardSurface,
          borderColor,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.94}
        onPress={() => onOpenDetail(index)}
        style={styles.photoBox}
      >
        {item.signedProfilePhoto ? (
          <MatrimonyCachedImage
            uri={item.signedProfilePhoto}
            recyclingKey={item.uid}
            style={styles.cardPhoto}
            resizeMode="cover"
          />
        ) : item.isPhotoProtected ? (
          <ProtectedPhotoPlaceholder
            gender={item.gender}
            requestStatus={item.photoRequestStatus}
            onRequestPhoto={
              isPhotoReqBusy ? undefined : () => onRequestPhotoAccess(item.uid)
            }
            fontFamily={fontFamily}
          />
        ) : (
          <View
            style={[
              styles.photoPlaceholder,
              { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' },
            ]}
          >
            <User size={68} color={isDark ? '#64748B' : '#94A3B8'} />
            <Text style={[styles.noPhotoText, { color: textSecondaryColor, fontFamily }]}>
              No Photo Uploaded
            </Text>
          </View>
        )}

        {isNewlyJoinedProfile && (
          <LinearGradient
            colors={['#8B5CF6', '#6D28D9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.newlyJoinedRibbon}
            pointerEvents="none"
          >
            <Text style={styles.newlyJoinedRibbonText} numberOfLines={1}>
              NEWLY
            </Text>
            <Text style={styles.newlyJoinedRibbonTextBottom} numberOfLines={1}>
              JOINED
            </Text>
          </LinearGradient>
        )}

        <TouchableOpacity
          style={[
            styles.shortlistPill,
            item.isShortlisted && { backgroundColor: CORAL_RED },
          ]}
          activeOpacity={0.85}
          disabled={isShortlistBusy}
          onPress={() => onToggleShortlist(item.uid)}
        >
          <Bookmark
            size={14}
            color="#FFFFFF"
            fill={item.isShortlisted ? '#FFFFFF' : 'transparent'}
          />
          <Text style={styles.shortlistPillText}>
            {item.isShortlisted ? 'Shortlisted' : 'Shortlist'}
          </Text>
        </TouchableOpacity>

        {item.photoCount > 0 && (
          <TouchableOpacity
            style={styles.photoCountBadge}
            activeOpacity={0.85}
            onPress={() => onOpenPhotoViewer(item, index)}
          >
            <Text style={styles.photoCountText}>{item.photoCount}</Text>
            <ImageIcon size={13} color="#334155" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onOpenDetail(index)}
        style={styles.cardBody}
      >
        <View style={styles.verifiedRow}>
          <VerifiedRibbonBadge
            fontFamily={fontFamily}
            variant={matchTier === 'prime' ? 'prime_verified' : 'verified'}
            tier={item.candidateTier}
          />
        </View>

        <Text
          style={[
            styles.candidateName,
            { color: textColor, fontFamily, fontSize: scaleFont(19) },
          ]}
          numberOfLines={1}
        >
          {item.displayName}
        </Text>

        <Text
          style={[
            styles.candidateSubMeta,
            { color: textSecondaryColor, fontFamily, fontSize: scaleFont(12.5) },
          ]}
          numberOfLines={1}
        >
          {item.profileCode} | {formatRecencyLabel(item.joinedAtMs)}
        </Text>

        <Text
          style={[
            styles.detailsSummary,
            { color: textColor, fontFamily, fontSize: scaleFont(14.5) },
          ]}
        >
          {detailsParts.join('  •  ')}
        </Text>

        {item.sharedInterests.length > 0 && (
          <View style={styles.sharedRow}>
            <Text style={[styles.sharedLabel, { fontFamily }]}>
              Shared: {item.sharedInterests.slice(0, 3).join(', ')}
              {item.sharedInterests.length > 3 ? ` +${item.sharedInterests.length - 3}` : ''}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {renderCardActions()}
    </View>
  );
};

export const MatrimonyMatchCard = React.memo(
  MatrimonyMatchCardComponent,
  (prev, next) =>
    prev.item === next.item &&
    prev.index === next.index &&
    prev.displayLayout === next.displayLayout &&
    prev.matchTier === next.matchTier &&
    prev.isActionBusy === next.isActionBusy &&
    prev.isShortlistBusy === next.isShortlistBusy &&
    prev.isPhotoReqBusy === next.isPhotoReqBusy &&
    prev.isDark === next.isDark &&
    prev.cardSurface === next.cardSurface &&
    prev.borderColor === next.borderColor &&
    prev.fontFamily === next.fontFamily
);

export default MatrimonyMatchCard;

const styles = StyleSheet.create({
  matchCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  photoBox: {
    width: '100%',
    height: 360,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  cardPhoto: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  newlyJoinedRibbon: {
    position: 'absolute',
    top: -10,
    left: -44,
    width: 120,
    height: 52,
    paddingBottom: 5,
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 4,
    zIndex: 4,
  },
  newlyJoinedRibbonText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
    lineHeight: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  newlyJoinedRibbonTextBottom: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  newlyJoinedRibbonCompact: {
    position: 'absolute',
    top: -9,
    left: -37,
    width: 100,
    height: 44,
    paddingBottom: 4,
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'flex-end',
    elevation: 4,
    zIndex: 4,
  },
  newlyJoinedRibbonTextCompact: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '800',
    lineHeight: 8.5,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  noPhotoText: {
    fontSize: 13,
    fontWeight: '600',
  },
  shortlistPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  shortlistPillText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  photoCountBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  photoCountText: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  cardBody: {
    paddingTop: 12,
    gap: 4,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  candidateName: {
    fontWeight: '800',
  },
  candidateSubMeta: {
    fontWeight: '500',
  },
  detailsSummary: {
    marginTop: 6,
    lineHeight: 21,
    fontWeight: '500',
  },
  sharedRow: {
    marginTop: 4,
  },
  sharedLabel: {
    color: ORANGE,
    fontSize: 12.5,
    fontWeight: '700',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  dontShowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1.2,
  },
  dontShowText: {
    fontWeight: '700',
  },
  sendInterestBtn: {
    flex: 1.25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: CORAL_RED,
  },
  sendInterestText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  callOutlineBtn: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1.2,
  },
  callOutlineText: {
    color: CORAL_RED,
    fontWeight: '700',
  },
  sendMessageSolidBtn: {
    flex: 1.45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: CORAL_RED,
  },
  sendMessageSolidText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  listTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  listThumbBox: {
    width: 118,
    height: 145,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  listRightCol: {
    flex: 1,
  },
  listShortlistBox: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCountBadgeCompact: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  sentStatusHint: {
    fontWeight: '700',
  },
});
