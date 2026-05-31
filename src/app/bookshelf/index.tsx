import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  archiveBook,
  createBook,
  getStudentProfile,
  listBooks,
  updateBook,
} from '../../data/database';
import { BookshelfScreen } from '../../features/bookshelf/BookshelfScreen';
import { Book } from '../../types/Book';
import { StudentProfile } from '../../types/StudentProfile';

export default function BookshelfRoute() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [profile, setProfile] = useState<StudentProfile | null>(null);

  const loadBookshelf = useCallback(async () => {
    const savedProfile = await getStudentProfile();

    if (!savedProfile) {
      router.replace('/register' as never);
      return;
    }

    setProfile(savedProfile);
    setBooks(await listBooks());
  }, [router]);

  useEffect(() => {
    loadBookshelf();
  }, [loadBookshelf]);

  const handleBookSelect = (book: Book) => {
    router.push({
      pathname: '/book/[bookId]',
      params: {
        bookId: book.id,
      },
    } as never);
  };

  const handleAddBook = async (title: string, description: string) => {
    const book = await createBook(title, description);

    if (!book) return;

    setBooks((currentBooks) => [book, ...currentBooks]);
  };

  const handleUpdateBook = async (
    bookId: string,
    title: string,
    description: string
  ) => {
    const updatedBook = await updateBook(bookId, title, description);

    if (!updatedBook) return;

    setBooks((currentBooks) =>
      currentBooks.map((book) => (book.id === bookId ? updatedBook : book))
    );
  };

  const handleArchiveBook = async (bookId: string) => {
    await archiveBook(bookId);

    setBooks((currentBooks) =>
      currentBooks.filter((book) => book.id !== bookId)
    );
  };

  return (
    <BookshelfScreen
      userName={profile?.firstName ?? 'Student'}
      books={books}
      onBookSelect={handleBookSelect}
      onAddBook={handleAddBook}
      onArchiveBook={handleArchiveBook}
      onBooksChanged={loadBookshelf}
      onProfileUpdated={setProfile}
      onUpdateBook={handleUpdateBook}
    />
  );
}
