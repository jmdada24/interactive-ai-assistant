import { Book } from '../types/Book';
import { StudentProfile } from '../types/StudentProfile';

type WebDatabaseState = {
  books: StoredBook[];
  nextBookId: number;
  profile: StudentProfile | null;
};

type StoredBook = {
  id: number;
  title: string;
  description: string | null;
  color: string;
  sourceCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const storageKey = 'alab.web.database';
const bookColors = ['#002576', '#E12531', '#D1A600', '#0038a8'];

function createInitialState(): WebDatabaseState {
  return {
    books: [],
    nextBookId: 1,
    profile: null,
  };
}

function getStorage() {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }

  return globalThis.localStorage;
}

function readState(): WebDatabaseState {
  const storage = getStorage();

  if (!storage) {
    return createInitialState();
  }

  const rawState = storage.getItem(storageKey);

  if (!rawState) {
    return createInitialState();
  }

  try {
    return {
      ...createInitialState(),
      ...JSON.parse(rawState),
    };
  } catch {
    return createInitialState();
  }
}

function writeState(state: WebDatabaseState) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(storageKey, JSON.stringify(state));
}

function formatBookDate(createdAt: string) {
  const createdDate = new Date(createdAt);

  if (Number.isNaN(createdDate.getTime())) {
    return 'Today';
  }

  return createdDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function mapBook(book: StoredBook): Book {
  return {
    id: String(book.id),
    title: book.title,
    description: book.description ?? undefined,
    date: formatBookDate(book.createdAt),
    sources: book.sourceCount,
    color: book.color,
  };
}

export async function initializeDatabase() {
  const storage = getStorage();

  if (storage && !storage.getItem(storageKey)) {
    writeState(createInitialState());
  }
}

export async function getStudentProfile(): Promise<StudentProfile | null> {
  await initializeDatabase();

  return readState().profile;
}

export async function saveStudentProfile(
  firstName: string,
  lastName: string
) {
  await initializeDatabase();

  const state = readState();

  state.profile = {
    id: 1,
    firstName,
    lastName,
  };

  writeState(state);
}

export async function listBooks(): Promise<Book[]> {
  await initializeDatabase();

  return readState().books.filter((book) => !book.archivedAt).map(mapBook);
}

export async function getBookById(id: string): Promise<Book | null> {
  await initializeDatabase();

  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    return null;
  }

  const book = readState().books.find(
    (item) => item.id === numericId && !item.archivedAt
  );

  return book ? mapBook(book) : null;
}

export async function createBook(title: string, description: string) {
  await initializeDatabase();

  const state = readState();
  const now = new Date().toISOString();
  const nextBook: StoredBook = {
    id: state.nextBookId,
    title,
    description: description.trim() || null,
    color: bookColors[state.books.length % bookColors.length],
    sourceCount: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  state.books = [nextBook, ...state.books];
  state.nextBookId += 1;

  writeState(state);

  return mapBook(nextBook);
}

export async function listArchivedBooks(): Promise<Book[]> {
  await initializeDatabase();

  return readState().books.filter((book) => book.archivedAt).map(mapBook);
}

export async function updateBook(
  id: string,
  title: string,
  description: string
) {
  await initializeDatabase();

  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    return null;
  }

  const state = readState();
  const book = state.books.find(
    (item) => item.id === numericId && !item.archivedAt
  );

  if (!book) {
    return null;
  }

  book.title = title;
  book.description = description.trim() || null;
  book.updatedAt = new Date().toISOString();

  writeState(state);

  return mapBook(book);
}

export async function archiveBook(id: string) {
  await initializeDatabase();

  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    return;
  }

  const state = readState();
  const book = state.books.find((item) => item.id === numericId);

  if (!book || book.archivedAt) {
    return;
  }

  const now = new Date().toISOString();

  book.archivedAt = now;
  book.updatedAt = now;

  writeState(state);
}

export async function restoreBook(id: string) {
  await initializeDatabase();

  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    return;
  }

  const state = readState();
  const book = state.books.find((item) => item.id === numericId);

  if (!book) {
    return;
  }

  book.archivedAt = null;
  book.updatedAt = new Date().toISOString();

  writeState(state);
}
