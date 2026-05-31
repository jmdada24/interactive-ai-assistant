import { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    Image,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { IconArrow } from '../../components/icons/icons';
import { Screen } from '../../components/layout/Screen';

type OnboardingScreenProps = {
  onGetStarted: () => void;
};

const illustration = require('../../../assets/images/book-stack.png');

export function OnboardingScreen({ onGetStarted }: OnboardingScreenProps) {
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY = useRef(new Animated.Value(24)).current;

  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(contentY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(buttonY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [contentOpacity, contentY, buttonOpacity, buttonY]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.accentGlow} />

      <View style={styles.mainContent}>
        <Animated.View
          style={[
            styles.contentCard,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentY }],
            },
          ]}
        >
          <View style={styles.illustrationWrapper}>
            <Image
              source={illustration}
              style={styles.illustration}
              resizeMode="cover"
            />
          </View>

          <View style={styles.textBlock}>
            <Text style={styles.title}>Welcome to ALAB</Text>
            <Text style={styles.subtitle}>
              Your offline AI study buddy, built for students everywhere.
            </Text>
          </View>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.ctaWrapper,
          {
            opacity: buttonOpacity,
            transform: [{ translateY: buttonY }],
          },
        ]}
      >
        <Pressable
          onPress={onGetStarted}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>Get Started</Text>
          <IconArrow color="#ffffff" size={16} />
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f9f9f9',
    overflow: 'hidden',
  },
  accentGlow: {
    position: 'absolute',
    width: 234,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#ffe08b',
    bottom: 88,
    left: -78,
    opacity: 0.2,
  },
  mainContent: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 183,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentCard: {
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
  },
  illustrationWrapper: {
    width: 280,
    height: 280,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 32,
    backgroundColor: '#eef1f1',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  illustration: {
    width: '100%',
    height: '100%',
  },
  textBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    color: '#002576',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.75,
    textAlign: 'center',
  },
  subtitle: {
    color: '#444653',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '400',
    textAlign: 'center',
  },
  ctaWrapper: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 999,
    backgroundColor: '#002576',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
});