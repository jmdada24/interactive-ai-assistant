import * as SQLite from 'expo-sqlite';
import { Book } from '../types/Book';
import { StudentProfile } from '../types/StudentProfile';

type BookRow = {
  id: number;
  title: string;
  description: string | null;
  color: string;
  source_count: number;
  created_at: string;
  archived_at: string | null;
};

type StudentProfileRow = {
  id: number;
  first_name: string;
  last_name: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const bookColors = ['#002576', '#E12531', '#D1A600', '#0038a8'];

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('alab.db');
  }

  return databasePromise;
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

function mapBookRow(row: BookRow): Book {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description ?? undefined,
    date: formatBookDate(row.created_at),
    sources: row.source_count,
    color: row.color,
  };
}

export async function initializeDatabase() {
  const database = await getDatabase();

  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS student_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL,
      source_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
  `);

  const columns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(books)'
  );

  if (!columns.some((column) => column.name === 'archived_at')) {
    await database.execAsync('ALTER TABLE books ADD COLUMN archived_at TEXT;');
  }
}

export async function getStudentProfile(): Promise<StudentProfile | null> {
  await initializeDatabase();

  const database = await getDatabase();
  const row = await database.getFirstAsync<StudentProfileRow>(
    'SELECT id, first_name, last_name FROM student_profile WHERE id = 1'
  );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
  };
}

export async function saveStudentProfile(
  firstName: string,
  lastName: string
) {
  await initializeDatabase();

  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT INTO student_profile (id, first_name, last_name, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       updated_at = excluded.updated_at`,
    firstName,
    lastName,
    now
  );
}

export async function listBooks(): Promise<Book[]> {
  await initializeDatabase();

  const database = await getDatabase();
  const rows = await database.getAllAsync<BookRow>(
    `SELECT id, title, description, color, source_count, created_at, archived_at
     FROM books
     WHERE archived_at IS NULL
     ORDER BY created_at DESC`
  );

  return rows.map(mapBookRow);
}

export async function getBookById(id: string): Promise<Book | null> {
  await initializeDatabase();

  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    return null;
  }

  const database = await getDatabase();
  const row = await database.getFirstAsync<BookRow>(
    `SELECT id, title, description, color, source_count, created_at, archived_at
     FROM books
     WHERE id = ? AND archived_at IS NULL`,
    numericId
  );

  return row ? mapBookRow(row) : null;
}

export async function createBook(title: string, description: string) {
  await initializeDatabase();

  const database = await getDatabase();
  const now = new Date().toISOString();
  const countRow = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM books'
  );
  const color = bookColors[(countRow?.count ?? 0) % bookColors.length];
  const result = await database.runAsync(
    `INSERT INTO books (title, description, color, source_count, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    title,
    description.trim() || null,
    color,
    now,
    now
  );

  return getBookById(String(result.lastInsertRowId));
}

export async function listArchivedBooks(): Promise<Book[]> {
  await initializeDatabase();

  const database = await getDatabase();
  const rows = await database.getAllAsync<BookRow>(
    `SELECT id, title, description, color, source_count, created_at, archived_at
     FROM books
     WHERE archived_at IS NOT NULL
     ORDER BY archived_at DESC`
  );

  return rows.map(mapBookRow);
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

  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `UPDATE books
     SET title = ?, description = ?, updated_at = ?
     WHERE id = ? AND archived_at IS NULL`,
    title,
    description.trim() || null,
    now,
    numericId
  );

  return getBookById(id);
}

export async function archiveBook(id: string) {
  await initializeDatabase();

  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    return;
  }

  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `UPDATE books
     SET archived_at = ?, updated_at = ?
     WHERE id = ? AND archived_at IS NULL`,
    now,
    now,
    numericId
  );
}

export async function restoreBook(id: string) {
  await initializeDatabase();

  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    return;
  }

  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `UPDATE books
     SET archived_at = NULL, updated_at = ?
     WHERE id = ?`,
    now,
    numericId
  );
}
