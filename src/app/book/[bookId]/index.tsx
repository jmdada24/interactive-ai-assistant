import { useLocalSearchParams, useRouter } from 'expo-router';
import { MOCK_BOOKS } from '../../../data/mockBooks';
import { BookPage } from '../../../features/book/BookPage';

export default function BookRoute() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const book =
    MOCK_BOOKS.find((item) => item.id === bookId) ?? MOCK_BOOKS[0];

  return (
    <BookPage
      book={book}
      onBack={() => {
        router.back();
      }}
    />
  );
}