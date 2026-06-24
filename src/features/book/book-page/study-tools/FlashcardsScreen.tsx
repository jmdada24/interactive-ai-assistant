import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { parseRecoverableFlashcardDeck } from '../../../../ai/rag/agent/flashcards';
import type { Flashcard } from '../../../../ai/rag/agent/flashcards';
import { AppHeader } from '../../../../components/layout/AppHeader';
import { Screen } from '../../../../components/layout/Screen';
import { Book } from '../../../../types/Book';
import { OfflineAi } from '../types';
import { FlashcardReviewCard } from './FlashcardReviewCard';
import { styles } from './styles';

const flashcardCount = 10;

export function FlashcardsScreen({
  book,
  offlineAi,
  onBack,
}: {
  book: Book;
  offlineAi: OfflineAi;
  onBack: () => void | Promise<void>;
}) {
  const didGenerateInitialCards = useRef(false);
  const generationCountRef = useRef(0);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWaitingForHelper, setIsWaitingForHelper] = useState(false);
  const [statusText, setStatusText] = useState('Preparing flashcards...');

  const runFlashcardsGeneration = useCallback(async () => {
    setIsGenerating(true);
    setStatusText(`Preparing flashcards from ${book.title}...`);

    try {
      generationCountRef.current += 1;
      const answer = await offlineAi.generateStudyTool(
        'flashcards',
        'mcq',
        flashcardCount,
        `Flashcard set ${generationCountRef.current}`
      );
      const parsedCards = parseRecoverableFlashcardDeck(answer.text, flashcardCount);

      if (parsedCards.length === 0) {
        setStatusText(getFlashcardGenerationFailureText(flashcardCount));
        return;
      }

      setCards(parsedCards);
      setActiveIndex(0);
      setStatusText(
        parsedCards.length === flashcardCount
          ? `Flashcards ready: ${parsedCards.length} cards`
          : getShortFlashcardReadyText(parsedCards.length, flashcardCount)
      );
    } catch {
      setStatusText(
        cards.length > 0
          ? 'Something went wrong while preparing flashcards. Your last valid cards are still here.'
          : 'Something went wrong while preparing flashcards. Please generate again.'
      );
    } finally {
      setIsGenerating(false);
    }
  }, [book.title, cards.length, offlineAi]);

  const generateFlashcards = useCallback(() => {
    if (isGenerating || isWaitingForHelper) {
      return;
    }

    if (offlineAi.isAnswerHelperPrepared && !offlineAi.isModelReady) {
      offlineAi.prepareAnswerHelper();
      setIsWaitingForHelper(true);
      setStatusText('Opening the study helper before generating flashcards...');
      return;
    }

    void runFlashcardsGeneration();
  }, [
    isGenerating,
    isWaitingForHelper,
    offlineAi,
    runFlashcardsGeneration,
  ]);

  useEffect(() => {
    if (didGenerateInitialCards.current) {
      return;
    }

    didGenerateInitialCards.current = true;
    generateFlashcards();
  }, [generateFlashcards]);

  useEffect(() => {
    if (!isWaitingForHelper || !offlineAi.isModelReady) {
      return;
    }

    setIsWaitingForHelper(false);
    void runFlashcardsGeneration();
  }, [isWaitingForHelper, offlineAi.isModelReady, runFlashcardsGeneration]);

  const activeCard = cards[activeIndex];

  return (
    <Screen style={styles.toolScreen}>
      <AppHeader />

      <View style={styles.toolScreenHeader}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backText}>Back to book</Text>
        </Pressable>
        <Text style={styles.toolScreenTitle}>Flashcards</Text>
        <Text style={styles.toolScreenSubtitle}>{book.title}</Text>
      </View>

      <ScrollView
        style={styles.tabScroll}
        contentContainerStyle={styles.toolSessionContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.toolControls}>
          <Text style={styles.toolControlLabel}>Review cards</Text>
          <Pressable
            onPress={generateFlashcards}
            disabled={isGenerating || isWaitingForHelper}
            style={({ pressed }) => [
              styles.generateButton,
              (isGenerating || isWaitingForHelper) && styles.disabledGenerateButton,
              pressed && !isGenerating && !isWaitingForHelper && styles.pressedScale,
            ]}
          >
            <Text style={styles.generateButtonText}>
              {isGenerating || isWaitingForHelper ? 'Generating...' : 'Generate flashcards'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.toolStatusText}>{statusText}</Text>

        {activeCard ? (
          <>
            <View style={styles.flashcardProgressRow}>
              <Text style={styles.quizCounter}>
                CARD {activeIndex + 1} OF {cards.length}
              </Text>
              <Text style={styles.flashcardHint}>Tap the card to flip</Text>
            </View>

            <FlashcardReviewCard
              card={activeCard}
              activeIndex={activeIndex}
              totalCards={cards.length}
            />

            <View style={styles.quizNavigation}>
              <Pressable
                disabled={activeIndex === 0}
                onPress={() => {
                  setActiveIndex((current) => Math.max(0, current - 1));
                }}
                style={({ pressed }) => [
                  styles.quizActionSecondary,
                  activeIndex === 0 && styles.disabledAction,
                  pressed && activeIndex > 0 && styles.pressedScale,
                ]}
              >
                <Text style={styles.quizActionSecondaryText}>Previous</Text>
              </Pressable>

              <Pressable
                disabled={activeIndex === cards.length - 1}
                onPress={() => {
                  setActiveIndex((current) => Math.min(cards.length - 1, current + 1));
                }}
                style={({ pressed }) => [
                  styles.quizActionPrimary,
                  activeIndex === cards.length - 1 && styles.disabledAction,
                  pressed && activeIndex < cards.length - 1 && styles.pressedScale,
                ]}
              >
                <Text style={styles.quizActionPrimaryText}>Next</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function getFlashcardGenerationFailureText(expectedCount: number) {
  return `ALAB could not find enough clear review points for ${expectedCount} cards yet. Try adding a longer lesson or clearer source.`;
}

function getShortFlashcardReadyText(actualCount: number, requestedCount: number) {
  return `Flashcards ready: ${actualCount} cards. I made fewer than ${requestedCount} because this lesson only has ${actualCount} clear review points so far.`;
}
