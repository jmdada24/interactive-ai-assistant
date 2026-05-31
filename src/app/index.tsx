import { useRouter } from 'expo-router';
import { getStudentProfile } from '../data/database';
import { LoadingScreen } from '../features/loading/LoadingScreen';

export default function IndexRoute() {
  const router = useRouter();

  return (
    <LoadingScreen
      onComplete={async () => {
        const profile = await getStudentProfile();

        router.replace(profile ? '/bookshelf' : ('/onboarding' as never));
      }}
    />
  );
}
