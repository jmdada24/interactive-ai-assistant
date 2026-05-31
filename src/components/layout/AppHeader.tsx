import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconUserProfile } from '../icons/icons';

type AppHeaderProps = {
  onProfileClick?: () => void;
};

const logo = require('../../../assets/images/logo/alab-logo.png');

export function AppHeader({ onProfileClick }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.inner}>
        <View style={styles.brand}>
          <View style={styles.logoBox}>
            <Image source={logo} style={styles.logo} resizeMode="cover" />
          </View>

          <Text style={styles.logoText}>ALAB</Text>
        </View>

        <Pressable
          onPress={onProfileClick}
          style={({ pressed }) => [
            styles.profileButton,
            pressed && styles.pressed,
          ]}
        >
          <IconUserProfile color="#747685" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 65,
    width: '100%',
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,197,213,0.15)',
    zIndex: 10,
  },
  inner: {
    height: '100%',
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBox: {
    width: 56,
    height: 48,
    overflow: 'visible',
  },
  logo: {
    position: 'absolute',
    width: 61,
    height: 61,
    top: -6,
    left: -6,
  },
  logoText: {
    marginLeft: -5,
    color: '#002576',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c4c5d5',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});