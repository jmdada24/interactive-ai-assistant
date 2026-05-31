# ALAB — Offline AI Study Companion

ALAB is a mobile learning app built for students who need access to study support even without reliable internet. The app is designed as an offline-first AI study companion where teachers can upload learning materials, and students can ask questions, review sources, generate quizzes, and study through flashcards.

The name **ALAB** comes from the Filipino word for “blaze” or “passion,” representing the goal of making learning more accessible, focused, and empowering for students.

---

## About the App

ALAB is being developed as a React Native mobile app for an AI-powered education project. The app focuses on helping students study using only the learning materials provided by their teachers.

Current app flow:

1. Loading screen
2. Onboarding screen
3. Student registration screen
4. Bookshelf screen
5. Book page with:
   - Sources
   - ALAB Chat
   - Study Tools
   - Quiz
   - Flashcards

The current version focuses on the mobile interface and navigation structure. Offline AI, PDF processing, SQLite storage, and local retrieval will be added later.

---

## Core Features

### Current Features

- Loading screen with ALAB branding
- Onboarding screen
- Student registration form
- Bookshelf page
- Book cards
- Book detail page
- Sources tab
- ALAB Chat tab
- Study Tools tab
- Quiz prototype
- Flashcards prototype
- Reusable app header
- Reusable bottom navigation
- Safe area support for mobile screens
- SVG-based icons

### Planned Features

- Upload PDF learning materials
- Store books and sources locally using SQLite
- Extract text from PDF files
- Chunk lessons for retrieval
- Store searchable lesson chunks
- Offline AI chat using Qwen
- Local RAG pipeline
- Quiz generation from uploaded lessons
- Flashcard generation from uploaded lessons
- Student progress tracking
- Badges, levels, and mastery points
- Offline voice input support

---

## Tech Stack

- React Native
- Expo
- Expo Router
- TypeScript
- React Native Safe Area Context
- React Native SVG

Planned AI and offline storage stack:

- Qwen local model
- SQLite
- ChromaDB or another local vector store
- PDF text extraction
- Offline Retrieval-Augmented Generation

---

## Project Structure

```txt
interactive-ai-assistant/
├── assets/
│   └── images/
│       ├── logo/
│       │   └── alab-logo.png
│       └── onboarding/
│           └── books-stack.png
│
├── src/
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── onboarding.tsx
│   │   ├── register.tsx
│   │   ├── bookshelf/
│   │   │   └── index.tsx
│   │   └── book/
│   │       └── [bookId]/
│   │           └── index.tsx
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Screen.tsx
│   │   │   └── AppHeader.tsx
│   │   ├── navigation/
│   │   │   └── BookBottomNav.tsx
│   │   └── icons/
│   │       └── icons.tsx
│   │
│   ├── data/
│   │   └── mockBooks.ts
│   │
│   ├── features/
│   │   ├── loading/
│   │   │   └── LoadingScreen.tsx
│   │   ├── onboarding/
│   │   │   └── OnboardingScreen.tsx
│   │   ├── registration/
│   │   │   └── RegistrationScreen.tsx
│   │   ├── bookshelf/
│   │   │   └── BookshelfScreen.tsx
│   │   └── book/
│   │       └── BookPage.tsx
│   │
│   └── types/
│       └── book.ts
│
├── app.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## Folder Guide

### `src/app`

This folder is for Expo Router routes only.

Example:

```txt
src/app/onboarding.tsx
```

maps to:

```txt
/onboarding
```

### `src/features`

This folder contains screen-level app sections.

Example:

```txt
src/features/bookshelf/BookshelfScreen.tsx
```

This keeps route files small and moves actual screen UI into feature folders.

### `src/components`

This folder contains reusable UI.

Current reusable components:

```txt
components/layout/Screen.tsx
components/layout/AppHeader.tsx
components/navigation/BookBottomNav.tsx
components/icons/icons.tsx
```

### `src/data`

Temporary mock data lives here until SQLite is added.

### `src/types`

Shared TypeScript types live here.

---

## Installation

Install dependencies:

```bash
npm install
```

Install required Expo packages:

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar react-native-svg
```

Start the app:

```bash
npx expo start
```

Start with a clean cache:

```bash
npx expo start -c
```

---

## Important Expo Router Setup

Make sure `package.json` has this:

```json
{
  "main": "expo-router/entry"
}
```

The root layout should be here:

```txt
src/app/_layout.tsx
```

---

## Safe Area Setup

The app uses:

```txt
react-native-safe-area-context
```

The root layout wraps the app with `SafeAreaProvider`, and screens use the reusable `Screen` component.

---

## SVG Icons

The app uses:

```txt
react-native-svg
```

Icons are stored as React Native SVG components in:

```txt
src/components/icons/icons.tsx
```

---

## Current Navigation Flow

```txt
/
↓
/onboarding
↓
/register
↓
/bookshelf
↓
/book/[bookId]
```

Inside the book page, the app currently uses an internal bottom navigation state for:

```txt
Sources
ALAB Chat
Tools
```

---

## Common Fixes

### Route Type Error

If TypeScript says a route like `/register` or `/bookshelf` is not assignable, restart Expo and TypeScript.

```bash
rm -rf .expo
npx expo start -c
```

Then restart the TypeScript server in VS Code:

```txt
Cmd + Shift + P
TypeScript: Restart TS Server
```

Temporary workaround:

```tsx
router.push('/register' as never);
```

### Missing SVG Package

If SVG icons fail, install:

```bash
npx expo install react-native-svg
```

### Safe Area Error

If `SafeAreaProvider` or `SafeAreaView` from safe area context is missing, install:

```bash
npx expo install react-native-safe-area-context
```

### Image Not Found

Check that these files exist:

```txt
assets/images/logo/alab-logo.png
assets/images/onboarding/books-stack.png
```

---

## Development Status

This project is currently in UI prototype development.

Implemented:

- App loading screen
- Onboarding
- Registration
- Bookshelf
- Book detail page
- Sources tab
- Chat tab
- Study tools tab
- Reusable header
- Reusable bottom navigation
- SVG icon system

Next development phase:

- SQLite setup
- PDF upload flow
- Source management
- Local AI integration
- Offline RAG pipeline
- Quiz and flashcard generation from uploaded content

---

## Project Goal

ALAB aims to support students in rural and low-connectivity learning environments by providing an offline study assistant that works with teacher-uploaded learning materials.

The long-term goal is to create a reliable local AI tutor that helps students ask questions, review lessons, generate quizzes, and study independently without depending on internet access.

---

## Team / Project Context

This app is part of an AI for Education project focused on offline learning support for students.

Project name:

```txt
ALAB
```

Target users:

```txt
Students, teachers, and schools with limited internet access
```

Main objective:

```txt
Make AI-assisted learning accessible even in offline environments.
```

---

## Reference Docs

- Expo Router Introduction: https://docs.expo.dev/router/introduction/
- Expo Router Core Concepts: https://docs.expo.dev/router/basics/core-concepts/
- Expo Router Manual Installation: https://docs.expo.dev/router/installation/
- React Native Safe Area Context: https://docs.expo.dev/versions/latest/sdk/safe-area-context/
- React Native SVG for Expo: https://docs.expo.dev/versions/latest/sdk/svg/

---