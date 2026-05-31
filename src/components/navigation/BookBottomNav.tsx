import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconChat, IconSources, IconTools } from '../icons/icons';

export type BookTab = 'sources' | 'chat' | 'tools';

type BookBottomNavProps = {
  activeTab: BookTab;
  onTabChange: (tab: BookTab) => void;
};

export function BookBottomNav({ activeTab, onTabChange }: BookBottomNavProps) {
  const insets = useSafeAreaInsets();

  const tabs: { id: BookTab; label: string }[] = [
    { id: 'sources', label: 'Sources' },
    { id: 'chat', label: 'ALAB Chat' },
    { id: 'tools', label: 'Tools' },
  ];

  return (
    <View
      style={[
        styles.nav,
        {
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const iconColor = isActive ? '#ffffff' : '#444653';
        const textColor = isActive ? '#ffffff' : '#444653';

        return (
          <Pressable
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            style={({ pressed }) => [
              styles.tab,
              isActive && styles.activeTab,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.iconBox}>
              {tab.id === 'sources' ? (
                <IconSources color={iconColor} size={22} />
              ) : null}

              {tab.id === 'chat' ? (
                <IconChat color={iconColor} size={22} />
              ) : null}

              {tab.id === 'tools' ? (
                <IconTools color={iconColor} size={19.5} />
              ) : null}
            </View>

            <Text style={[styles.label, { color: textColor }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    width: '100%',
    minHeight: 90,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingHorizontal: 14,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  tab: {
    minWidth: 80,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#0038a8',
  },
  iconBox: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  pressed: {
    opacity: 0.8,
  },
});