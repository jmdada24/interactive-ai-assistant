import { useRouter } from 'expo-router';
import { RegistrationScreen } from '../features/registration/RegistrationScreen';

export default function RegisterRoute() {
  const router = useRouter();

  return (
    <RegistrationScreen
      onComplete={(firstName, lastName) => {
        console.log('Registered user:', { firstName, lastName });

        router.replace('/bookshelf' as never);
      }}
    />
  );
}