import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { BookOpen, Clock, HelpCircle } from 'lucide-react-native';
import { KidsBibleStory } from '../../../types/KidsMinistryTypes';
import { useTheme } from '../../../context/ThemeContext';

/**
 * Resolves the complete English narrative text from either the single-page
 * `storyContent` field or legacy `pages` / `summary` fields.
 */
export function getFullStoryContent(
  story: Partial<Pick<KidsBibleStory, 'storyContent' | 'pages' | 'summary'>> | null | undefined
): string {
  if (!story) return '';
  if (story.storyContent && story.storyContent.trim()) {
    return story.storyContent.trim();
  }
  const pageParagraphs = (story.pages || [])
    .map(p => (p.textEnglish || '').trim())
    .filter(Boolean);
  if (pageParagraphs.length > 0) {
    return pageParagraphs.join('\n\n');
  }
  return (story.summary || '').trim();
}

/**
 * Resolves optional Telugu narrative text from single-page or legacy `pages`.
 */
export function getFullStoryTeluguContent(
  story: Partial<Pick<KidsBibleStory, 'storyContentTelugu' | 'pages' | 'summaryTelugu'>> | null | undefined
): string {
  if (!story) return '';
  if (story.storyContentTelugu && story.storyContentTelugu.trim()) {
    return story.storyContentTelugu.trim();
  }
  const pageParagraphs = (story.pages || [])
    .map(p => (p.textTelugu || '').trim())
    .filter(Boolean);
  if (pageParagraphs.length > 0) {
    return pageParagraphs.join('\n\n');
  }
  return (story.summaryTelugu || '').trim();
}

export function estimateStoryReadTime(text: string): string {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 150));
  return `${mins} min read`;
}

interface DropCapBodyProps {
  content: string;
  textColor: string;
  dropCapTextColor: string;
  dropCapBg: string;
  dropCapBorder: string;
  fontSize?: number;
  lineHeight?: number;
}

/**
 * Renders complete story content starting with a very large, decorative
 * editorial Drop-Cap initial letter alongside the opening lines, then flowing
 * seamlessly across full width below.
 */
export function DropCapStoryBody({
  content,
  textColor,
  dropCapTextColor,
  dropCapBg,
  dropCapBorder,
  fontSize = 16.5,
  lineHeight = 28,
}: DropCapBodyProps) {
  const clean = (content || '').trim();
  const paragraphs = clean
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  const firstParagraph = paragraphs[0] || '';
  const remainingParagraphs = paragraphs.slice(1);
  const firstLetter = firstParagraph ? firstParagraph.charAt(0).toUpperCase() : '';
  const restOfFirst = firstParagraph ? firstParagraph.slice(1).trimStart() : '';

  const [containerWidth, setContainerWidth] = useState(0);
  const [leadCharCount, setLeadCharCount] = useState<number | null>(null);

  useEffect(() => {
    setLeadCharCount(null);
  }, [restOfFirst, containerWidth]);

  if (!clean) {
    return null;
  }

  const dropCapWidth = 68;
  const dropCapGap = 14;
  const sideTextWidth = Math.max(140, containerWidth - dropCapWidth - dropCapGap);

  // Use measured 3-line break when available; fallback to a safe opening length until measured
  const splitPoint =
    leadCharCount !== null
      ? leadCharCount
      : restOfFirst.length <= 105
      ? restOfFirst.length
      : (() => {
          const slice = restOfFirst.slice(0, 105);
          const lastSpace = slice.lastIndexOf(' ');
          return lastSpace > 40 ? lastSpace : 105;
        })();

  const leadBesideCap = restOfFirst.slice(0, splitPoint).trimEnd();
  const tailBelowCap = restOfFirst.slice(splitPoint).trimStart();

  return (
    <View
      style={styles.bodyContainer}
      onLayout={e => {
        const w = Math.floor(e.nativeEvent.layout.width);
        if (w > 0 && Math.abs(w - containerWidth) > 2) {
          setContainerWidth(w);
        }
      }}
    >
      {/* Hidden exact-width measurer to compute how many characters sit next to the Drop-Cap */}
      {containerWidth > 0 && restOfFirst.length > 0 && (
        <Text
          pointerEvents="none"
          style={[
            styles.measureHiddenText,
            {
              width: sideTextWidth,
              fontSize,
              lineHeight,
            },
          ]}
          onTextLayout={e => {
            const lines = e.nativeEvent.lines || [];
            if (lines.length <= 3) {
              setLeadCharCount(restOfFirst.length);
            } else {
              const count = lines
                .slice(0, 3)
                .reduce((sum, l) => sum + (l.text ? l.text.length : 0), 0);
              if (count > 0 && count !== leadCharCount) {
                setLeadCharCount(count);
              }
            }
          }}
        >
          {restOfFirst}
        </Text>
      )}

      {/* Opening Paragraph with Decorative Drop-Cap */}
      <View style={styles.dropCapRow}>
        <View
          style={[
            styles.dropCapTile,
            {
              width: dropCapWidth,
              backgroundColor: dropCapBg,
              borderColor: dropCapBorder,
            },
          ]}
        >
          <Text style={[styles.dropCapLetter, { color: dropCapTextColor }]}>
            {firstLetter}
          </Text>
        </View>

        {leadBesideCap.length > 0 && (
          <View style={styles.dropCapSideCol}>
            <Text style={[styles.storyBodyText, { color: textColor, fontSize, lineHeight }]}>
              {leadBesideCap}
            </Text>
          </View>
        )}
      </View>

      {tailBelowCap.length > 0 && (
        <Text
          style={[
            styles.storyBodyText,
            styles.tailParagraph,
            { color: textColor, fontSize, lineHeight },
          ]}
        >
          {tailBelowCap}
        </Text>
      )}

      {remainingParagraphs.map((para, idx) => (
        <Text
          key={idx}
          style={[
            styles.storyBodyText,
            styles.subsequentParagraph,
            { color: textColor, fontSize, lineHeight },
          ]}
        >
          {para}
        </Text>
      ))}
    </View>
  );
}

interface BibleStoryReaderContentProps {
  title: string;
  titleTelugu?: string;
  scriptureRef?: string;
  thumbnailUrl?: string;
  coverEmoji?: string;
  readTime?: string;
  storyContent: string;
  teluguContent?: string;
  reflectionQuestions?: Array<{
    questionEnglish: string;
    questionTelugu: string;
  }>;
  isPreviewBadge?: boolean;
}

/**
 * Shared responsive Bible Story article renderer used identically in
 * Admin Story Preview and Member Story Details.
 */
export default function BibleStoryReaderContent({
  title,
  titleTelugu,
  scriptureRef,
  thumbnailUrl,
  coverEmoji,
  readTime,
  storyContent,
  teluguContent,
  reflectionQuestions,
  isPreviewBadge,
}: BibleStoryReaderContentProps) {
  const { isDark, colors: themeColors } = useTheme();
  const [showTelugu, setShowTelugu] = useState(false);

  const cardBg = isDark ? '#18181B' : (themeColors.surface || '#FFFFFF');
  const innerBg = isDark ? '#0F172A' : '#F1F5F9';
  const border = isDark ? '#27272A' : (themeColors.border || '#E2E8F0');
  const textPrimary = isDark ? '#FFFFFF' : (themeColors.text || '#0F172A');
  const textSecondary = isDark ? '#9CA3AF' : (themeColors.textSecondary || '#64748B');
  const textBody = isDark ? '#E4E4E7' : '#1E293B';
  const goldAccent = isDark ? '#FBBF24' : '#B45309';
  const dropCapBg = isDark ? 'rgba(251, 191, 36, 0.14)' : '#FEF3C7';
  const dropCapBorder = isDark ? 'rgba(251, 191, 36, 0.42)' : '#F59E0B';
  const badgeBg = isDark ? 'rgba(59, 130, 246, 0.16)' : '#EFF6FF';
  const badgeColor = isDark ? '#93C5FD' : '#1D4ED8';

  const cleanContent = (storyContent || '').trim();
  const cleanTelugu = (teluguContent || '').trim();
  const hasTelugu = cleanTelugu.length > 0 && cleanTelugu !== cleanContent;
  const computedReadTime = readTime?.trim() || estimateStoryReadTime(cleanContent);

  return (
    <View style={styles.wrapper}>
      {isPreviewBadge && (
        <View style={[styles.previewBanner, { backgroundColor: badgeBg, borderColor: border }]}>
          <Text style={[styles.previewBannerText, { color: badgeColor }]}>
            PREVIEW MODE · Matches Member View
          </Text>
        </View>
      )}

      {/* ── PROMINENT 16:9 THUMBNAIL ── */}
      <View style={[styles.heroThumbnailFrame, { backgroundColor: innerBg, borderColor: border }]}>
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.heroThumbnailImg}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.heroFallback}>
            <Text style={styles.heroFallbackEmoji}>{coverEmoji || '📖'}</Text>
            <Text style={[styles.heroFallbackLabel, { color: textSecondary }]}>
              16:9 Story Cover
            </Text>
          </View>
        )}
      </View>

      {/* ── STORY META & PROMINENT TITLE ── */}
      <View style={styles.headerBlock}>
        <View style={styles.metaRow}>
          {scriptureRef ? (
            <View style={[styles.scripturePill, { backgroundColor: dropCapBg, borderColor: dropCapBorder }]}>
              <BookOpen size={12} color={goldAccent} />
              <Text style={[styles.scripturePillText, { color: goldAccent }]}>
                {scriptureRef}
              </Text>
            </View>
          ) : null}
          <View style={[styles.timePill, { backgroundColor: isDark ? '#18181B' : '#F1F5F9' }]}>
            <Clock size={12} color={textSecondary} />
            <Text style={[styles.timePillText, { color: textSecondary }]}>{computedReadTime}</Text>
          </View>
        </View>

        <Text style={[styles.articleTitle, { color: textPrimary }]}>
          {title?.trim() || 'Untitled Bible Story'}
        </Text>

        {titleTelugu && titleTelugu.trim() && titleTelugu.trim() !== title.trim() ? (
          <Text style={[styles.articleTitleTelugu, { color: textSecondary }]}>
            {titleTelugu.trim()}
          </Text>
        ) : null}
      </View>

      <View style={[styles.divider, { backgroundColor: border }]} />

      {/* Optional Language Toggle if Telugu version exists */}
      {hasTelugu && (
        <View style={[styles.langToggleRow, { backgroundColor: isDark ? '#18181B' : '#F1F5F9', borderColor: border }]}>
          <TouchableOpacity
            style={[styles.langTab, !showTelugu && { backgroundColor: cardBg }]}
            onPress={() => setShowTelugu(false)}
            activeOpacity={0.85}
          >
            <Text style={[styles.langTabText, { color: !showTelugu ? textPrimary : textSecondary }]}>
              English
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langTab, showTelugu && { backgroundColor: cardBg }]}
            onPress={() => setShowTelugu(true)}
            activeOpacity={0.85}
          >
            <Text style={[styles.langTabText, { color: showTelugu ? textPrimary : textSecondary }]}>
              తెలుగు (Telugu)
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── COMPLETE STORY BODY WITH DECORATIVE DROP-CAP ── */}
      {cleanContent.length > 0 ? (
        <DropCapStoryBody
          content={showTelugu && hasTelugu ? cleanTelugu : cleanContent}
          textColor={textBody}
          dropCapTextColor={goldAccent}
          dropCapBg={dropCapBg}
          dropCapBorder={dropCapBorder}
        />
      ) : (
        <Text style={[styles.emptyBodyHint, { color: textSecondary }]}>
          No story content added yet.
        </Text>
      )}

      {/* ── OPTIONAL DISCUSSION QUESTIONS ── */}
      {reflectionQuestions && reflectionQuestions.length > 0 && (
        <View
          style={[
            styles.reflectionCard,
            {
              backgroundColor: isDark ? 'rgba(251, 191, 36, 0.08)' : '#FFFBEB',
              borderColor: isDark ? 'rgba(251, 191, 36, 0.25)' : '#FDE68A',
            },
          ]}
        >
          <View style={styles.reflectionHeader}>
            <HelpCircle size={17} color={goldAccent} />
            <Text style={[styles.reflectionTitle, { color: goldAccent }]}>
              Family Reflection Questions
            </Text>
          </View>
          {reflectionQuestions.map((q, idx) => (
            <View key={idx} style={styles.questionItem}>
              <Text style={[styles.questionEng, { color: textPrimary }]}>
                {idx + 1}. {q.questionEnglish}
              </Text>
              {q.questionTelugu ? (
                <Text style={[styles.questionTel, { color: textSecondary }]}>
                  {q.questionTelugu}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  previewBanner: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
    alignItems: 'center',
  },
  previewBannerText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroThumbnailFrame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 18,
  },
  heroThumbnailImg: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroFallbackEmoji: {
    fontSize: 44,
  },
  heroFallbackLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  headerBlock: {
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  scripturePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  scripturePillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  timePillText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  articleTitle: {
    fontSize: 25,
    lineHeight: 32,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  articleTitleTelugu: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '600',
  },
  divider: {
    width: '100%',
    height: 1,
    marginVertical: 16,
  },
  langToggleRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 4,
  },
  langTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  langTabText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  bodyContainer: {
    width: '100%',
    position: 'relative',
  },
  measureHiddenText: {
    position: 'absolute',
    opacity: 0,
    top: 0,
    left: 0,
    zIndex: -1,
    fontWeight: '400',
  },
  dropCapRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  dropCapTile: {
    height: 76,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  dropCapLetter: {
    fontSize: 52,
    lineHeight: 58,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '900',
    includeFontPadding: false,
  },
  dropCapSideCol: {
    flex: 1,
  },
  storyBodyText: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '400',
    letterSpacing: 0.15,
  },
  tailParagraph: {
    marginTop: 4,
    marginBottom: 14,
  },
  subsequentParagraph: {
    marginTop: 12,
    marginBottom: 2,
  },
  emptyBodyHint: {
    fontSize: 15,
    fontStyle: 'italic',
    paddingVertical: 20,
    textAlign: 'center',
  },
  reflectionCard: {
    marginTop: 24,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  reflectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reflectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  questionItem: {
    gap: 2,
  },
  questionEng: {
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 20,
  },
  questionTel: {
    fontSize: 12,
    lineHeight: 18,
  },
});
