import { useRouter } from 'expo-router';
import { saveStudentProfile } from '../data/database';
import { RegistrationScreen } from '../features/registration/RegistrationScreen';

export default function RegisterRoute() {
  const router = useRouter();

  return (
    <RegistrationScreen
      onComplete={async (firstName, lastName) => {
        await saveStudentProfile(firstName, lastName);

        router.replace('/bookshelf' as never);
      }}
    />
  );
}
