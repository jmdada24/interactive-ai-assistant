import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  IconBookCard,
  IconDots,
  IconNewBook,
  IconSearch,
} from '../../components/icons/icons';
import { AppHeader } from '../../components/layout/AppHeader';
import { Book } from '../../types/Book';

type BookshelfScreenProps = {
  userName: string;
  books: Book[];
  onBookSelect: (book: Book) => void;
  onAddBook: () => void;
};

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';

  return 'Good Evening';
}

export function BookshelfScreen({
  userName,
  books,
  onBookSelect,
  onAddBook,
}: BookshelfScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBooks = useMemo(() => {
    return books.filter((book) =>
      book.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [books, searchQuery]);

  return (
    <View style={styles.screen}>
      <AppHeader />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.heading}>
            <Text style={styles.greeting}>
              {getGreeting()}, {userName}
            </Text>

            <Text style={styles.title}>My Books</Text>

            <Text style={styles.description}>
              Tap a book to start asking questions
            </Text>
          </View>

          <View style={styles.searchBar}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search"
              placeholderTextColor="#747685"
              style={styles.searchInput}
            />

            <Pressable style={styles.searchButton}>
              <IconSearch color="#ffffff" size={18} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            <Pressable
              onPress={onAddBook}
              style={({ pressed }) => [
                styles.newBookCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.newBookIcon}>
                <IconNewBook color="#002576" size={16} />
              </View>

              <Text style={styles.newBookText}>New Book</Text>
            </Pressable>

            {filteredBooks.map((book) => (
              <Pressable
                key={book.id}
                onPress={() => onBookSelect(book)}
                style={({ pressed }) => [
                  styles.bookCard,
                  pressed && styles.cardPressed,
                ]}
              >
                <Pressable style={styles.dotsButton}>
                  <IconDots color="#C4C5D5" />
                </Pressable>

                <View style={styles.bookIconArea}>
                  <IconBookCard color={book.color} width={133} height={30} />
                </View>

                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {book.title}
                  </Text>

                  <Text style={styles.bookMeta} numberOfLines={1}>
                    {book.date} · {book.sources} sources
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  container: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  heading: {
    marginBottom: 32,
  },
  greeting: {
    color: '#747685',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    marginBottom: 4,
  },
  title: {
    color: '#1a1c1c',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  description: {
    color: '#444653',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    paddingTop: 4,
  },
  searchBar: {
    marginBottom: 32,
    backgroundColor: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#c4c5d5',
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 15,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    color: '#1a1c1c',
    fontSize: 16,
    fontWeight: '400',
    paddingVertical: 0,
    paddingHorizontal: 4,
  },
  searchButton: {
    marginLeft: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#002576',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  newBookCard: {
    width: '48%',
    minHeight: 180,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c4c5d5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  newBookIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dce1ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  newBookText: {
    color: '#1a1c1c',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  bookCard: {
    width: '48%',
    minHeight: 180,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c4c5d5',
    padding: 17,
    marginBottom: 16,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  dotsButton: {
    position: 'absolute',
    top: 9,
    right: 9,
    padding: 4,
    borderRadius: 999,
    zIndex: 2,
  },
  bookIconArea: {
    paddingTop: 16,
  },
  bookInfo: {
    paddingTop: 16,
  },
  bookTitle: {
    color: '#1a1c1c',
    fontSize: 14,
    lineHeight: 19.25,
    fontWeight: '600',
    marginBottom: 4,
  },
  bookMeta: {
    color: '#747685',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
});