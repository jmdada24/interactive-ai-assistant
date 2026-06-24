import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import type { Flashcard } from '../../../../ai/rag/agent/flashcards';
import { styles } from './styles';

export function FlashcardReviewCard({
  card,
  activeIndex,
  totalCards,
}: {
  card: Flashcard;
  activeIndex: number;
  totalCards: number;
}) {
  const flipAnimation = useRef(new Animated.Value(0)).current;
  const isFlipAnimating = useRef(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const frontIsLong = card.front.length > 150;
  const backIsLong = card.back.length > 150;
  const frontRotation = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotation = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  const frontOpacity = flipAnimation.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flipAnimation.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  function flipCard() {
    if (isFlipAnimating.current) {
      return;
    }

    const nextIsFlipped = !isFlipped;
    isFlipAnimating.current = true;
    setIsFlipped(nextIsFlipped);

    Animated.timing(flipAnimation, {
      toValue: nextIsFlipped ? 1 : 0,
      duration: 340,
      useNativeDriver: true,
    }).start(() => {
      isFlipAnimating.current = false;
    });
  }

  useEffect(() => {
    flipAnimation.stopAnimation();
    flipAnimation.setValue(0);
    isFlipAnimating.current = false;
    setIsFlipped(false);
  }, [activeIndex, card.front, card.back, flipAnimation]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Flashcard ${activeIndex + 1} of ${totalCards}. ${
        isFlipped ? 'Back' : 'Front'
      }: ${isFlipped ? card.back : card.front}`}
      accessibilityHint="Double tap to flip the card"
      accessibilityState={{ expanded: isFlipped }}
      onPress={flipCard}
      style={({ pressed }) => [
        styles.flashcardReviewCard,
        pressed && styles.pressedScale,
      ]}
    >
      <Animated.View
        pointerEvents={isFlipped ? 'none' : 'auto'}
        style={[
          styles.flashcardFace,
          {
            opacity: frontOpacity,
            transform: [{ perspective: 1000 }, { rotateY: frontRotation }],
          },
        ]}
      >
        <Text style={styles.flashcardFaceLabel}>FRONT</Text>
        <View style={styles.flashcardReviewBody}>
          <ScrollView
            nestedScrollEnabled
            style={styles.flashcardReviewScroller}
            contentContainerStyle={styles.flashcardReviewScrollerContent}
            showsVerticalScrollIndicator={false}
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={[
                styles.flashcardReviewText,
                frontIsLong && styles.flashcardLongReviewText,
              ]}
            >
              {card.front}
            </Text>
          </ScrollView>
        </View>
        <Text style={styles.flashcardFlipPrompt}>Tap to reveal the answer</Text>
      </Animated.View>

      <Animated.View
        pointerEvents={isFlipped ? 'auto' : 'none'}
        style={[
          styles.flashcardFace,
          styles.flippedFlashcardReviewCard,
          {
            opacity: backOpacity,
            transform: [{ perspective: 1000 }, { rotateY: backRotation }],
          },
        ]}
      >
        <Text style={styles.flashcardFaceLabel}>BACK</Text>
        <View style={styles.flashcardReviewBody}>
          <ScrollView
            nestedScrollEnabled
            style={styles.flashcardReviewScroller}
            contentContainerStyle={styles.flashcardReviewScrollerContent}
            showsVerticalScrollIndicator={false}
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={[
                styles.flashcardReviewText,
                styles.flashcardBackReviewText,
                backIsLong && styles.flashcardLongReviewText,
              ]}
            >
              {card.back}
            </Text>
          </ScrollView>
        </View>
        <Text style={styles.flashcardFlipPrompt}>Tap to see the question</Text>
      </Animated.View>
    </Pressable>
  );
}
