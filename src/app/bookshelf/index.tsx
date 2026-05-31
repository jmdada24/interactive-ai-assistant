import { useRouter } from 'expo-router';
import { MOCK_BOOKS } from '../../data/mockBooks';
import { BookshelfScreen } from '../../features/bookshelf/BookshelfScreen';
import { Book } from '../../types/Book';

export default function BookshelfRoute() {
  const router = useRouter();

  const handleBookSelect = (book: Book) => {
    router.push({
      pathname: '/book/[bookId]',
      params: {
        bookId: book.id,
      },
    } as never);
  };

  return (
    <BookshelfScreen
      userName="Maria"
      books={MOCK_BOOKS}
      onBookSelect={handleBookSelect}
      onAddBook={() => {
        console.log('Add new book');
      }}
    />
  );
}