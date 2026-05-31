import { useRouter } from 'expo-router';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';

export default function OnboardingRoute() {
  const router = useRouter();

  return (
    <OnboardingScreen
      onGetStarted={() => {
        router.push('/register' as never);
      }}
    />
  );
}