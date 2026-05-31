import { useRouter } from 'expo-router';
import { LoadingScreen } from '../features/loading/LoadingScreen';

export default function IndexRoute() {
  const router = useRouter();

  return (
    <LoadingScreen
      onComplete={() => {
        router.replace('/onboarding' as never);
      }}
    />
  );
}