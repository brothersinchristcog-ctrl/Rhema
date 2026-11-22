import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { ChatThemePalette } from '../constants/chatTheme';
import { ChatPresenceState, ChurchMemberContact } from '../types/chat';
import AvatarWithStatus from './AvatarWithStatus';

interface ActiveMembersStripProps {
  me: { uid: string; name: string; photoUrl: string | null };
  members: ChurchMemberContact[];
  presenceMap: Record<string, ChatPresenceState>;
  palette: ChatThemePalette;
  fontFamily?: string;
  scaleFont: (s: number) => number;
  onPressMe: () => void;
  onPressMember: (member: ChurchMemberContact) => void;
}

export default function ActiveMembersStrip({
  me,
  members,
  presenceMap,
  palette,
  fontFamily,
  scaleFont,
  onPressMe,
  onPressMember,
}: ActiveMembersStripProps) {
  const ordered = React.useMemo(() => {
    const withStatus = members.slice(0, 18);
    return [...withStatus].sort((a, b) => {
      const aOnline = presenceMap[a.uid]?.online ? 1 : 0;
      const bOnline = presenceMap[b.uid]?.online ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return a.name.localeCompare(b.name);
    });
  }, [members, presenceMap]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {/* Me Avatar with '+' trigger */}
      <TouchableOpacity style={styles.item} onPress={onPressMe} activeOpacity={0.85}>
        <View style={[styles.ring, { borderColor: palette.glassBorder }]}>
          <AvatarWithStatus
            uri={me.photoUrl}
            name={me.name || 'Me'}
            size={54}
            dotBorderColor={palette.bg}
          />
          <View
            style={[
              styles.plusBadge,
              {
                backgroundColor: palette.isDark ? '#FFFFFF' : palette.accent,
                borderColor: palette.bg,
              },
            ]}
          >
            <Plus
              size={11}
              color={palette.isDark ? '#090B0E' : '#FFFFFF'}
              strokeWidth={3}
            />
          </View>
        </View>
        <Text
          style={[
            styles.label,
            { color: palette.textSecondary, fontFamily, fontSize: scaleFont(11.5) },
          ]}
          numberOfLines={1}
        >
          Me
        </Text>
      </TouchableOpacity>

      {ordered.map((m) => {
        const isOnline = presenceMap[m.uid]?.online === true;
        const firstName = m.firstName || m.name.split(/\s+/)[0] || m.name;
        return (
          <TouchableOpacity
            key={m.uid}
            style={styles.item}
            onPress={() => onPressMember(m)}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.ring,
                {
                  borderColor: isOnline ? palette.onlineDot : palette.glassBorder,
                  borderWidth: isOnline ? 2 : 1.2,
                },
              ]}
            >
              <AvatarWithStatus
                uri={m.photoUrl}
                name={m.name}
                size={54}
                dotBorderColor={palette.bg}
                badgeText={isOnline ? 'Live' : undefined}
              />
            </View>
            <Text
              style={[
                styles.label,
                {
                  color: isOnline ? palette.text : palette.textSecondary,
                  fontFamily,
                  fontSize: scaleFont(11.5),
                },
              ]}
              numberOfLines={1}
            >
              {firstName}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 14,
  },
  item: {
    alignItems: 'center',
    width: 62,
  },
  ring: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  plusBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  label: {
    marginTop: 6,
    fontWeight: '500',
    textAlign: 'center',
  },
});
