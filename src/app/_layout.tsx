import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as NavigationBar from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import {
  AppState,
  LogBox,
  Platform,
  StatusBar as NativeStatusBar,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeExecutorch } from '../ai/executorch';

initializeExecutorch();
SystemUI.setBackgroundColorAsync('#f8f8f8');
LogBox.ignoreLogs([
  '[React Native ExecuTorch] Load failed: Error: Already downloading this file',
  '[React Native ExecuTorch] Load failed: Error: Software caused connection abort',
  '[React Native ExecuTorch] No content-length header',
]);

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    applyLightAndroidSystemBars();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        applyLightAndroidSystemBars();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <ExpoStatusBar hidden={false} style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function applyLightAndroidSystemBars() {
  NativeStatusBar.setHidden(false, 'none');
  NativeStatusBar.setBarStyle('dark-content', false);
  NativeStatusBar.setTranslucent(true);
  NativeStatusBar.setBackgroundColor('transparent', false);
  void NavigationBar.setVisibilityAsync('visible');
  NavigationBar.setStyle('light');
}
