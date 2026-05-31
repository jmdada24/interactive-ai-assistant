import { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    Image,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Screen } from '../../components/layout/Screen';

type LoadingScreenProps = {
  onComplete: () => void;
};

const logo = require('../../../assets/images/logo/alab-logo.png');

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]).start();

    const timer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => clearTimeout(timer);
  }, [fadeAnim, translateY, progress, onComplete]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Screen style={styles.screen}>
      <View style={styles.blueBlob} />
      <View style={styles.yellowBlob} />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.logoArea}>
          <View style={styles.logoWrapper}>
            <Image source={logo} style={styles.logo} resizeMode="cover" />
          </View>

          <Text style={styles.appName}>ALAB</Text>
          <Text style={styles.tagline}>Your Study Companion</Text>
        </View>

        <View style={styles.progressArea}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, { width: progressWidth }]}
            />
          </View>

          <Text style={styles.loadingText}>
            Mabuhay! Preparing your lessons...
          </Text>
        </View>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#f8f8f8',
  },
  blueBlob: {
    position: 'absolute',
    width: 384,
    height: 384,
    borderRadius: 192,
    backgroundColor: '#002576',
    opacity: 0.08,
    top: -221,
    right: -98,
  },
  yellowBlob: {
    position: 'absolute',
    width: 384,
    height: 384,
    borderRadius: 192,
    backgroundColor: '#d1a600',
    opacity: 0.08,
    bottom: -221,
    left: -98,
  },
  content: {
    zIndex: 1,
    alignItems: 'center',
  },
  logoArea: {
    width: 156,
    height: 218,
    marginBottom: 30,
  },
  logoWrapper: {
    position: 'absolute',
    left: 17,
    top: 30,
    width: 122,
    height: 122,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  appName: {
    position: 'absolute',
    left: 0,
    top: 152,
    color: '#002576',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.75,
  },
  tagline: {
    position: 'absolute',
    left: 0,
    top: 190,
    color: '#747685',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  progressArea: {
    width: 192,
    alignItems: 'center',
  },
  progressTrack: {
    width: 192,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#e2e2e2',
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#0038a8',
  },
  loadingText: {
    color: '#0038a8',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '400',
  },
});