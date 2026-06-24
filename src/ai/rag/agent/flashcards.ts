import { cleanStudentReadableText } from '../../textCleanup';

export type Flashcard = {
  front: string;
  back: string;
};

export function parseExactFlashcardDeck(text: string, expectedCount: number) {
  const cards = parseFlashcards(text);

  return cards.length === expectedCount ? cards : [];
}

export function parseRecoverableFlashcardDeck(text: string, expectedCount: number) {
  const exactCards = parseExactFlashcardDeck(text, expectedCount);

  if (exactCards.length === expectedCount) {
    return exactCards;
  }

  return completeFlashcardDeck(parseFlashcards(text), expectedCount);
}

export function formatFlashcards(cards: Flashcard[]) {
  return cards
    .map((card) =>
      [
        `Front: ${card.front}`,
        `Back: ${card.back}`,
      ].join('\n')
    )
    .join('\n\n');
}

export function parseFlashcards(text: string): Flashcard[] {
  const lines = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const cards: Flashcard[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const frontLine = lines[index];
    const backLine = lines[index + 1];

    if (/^front\s*:/i.test(frontLine) && /^back\s*:/i.test(backLine ?? '')) {
      const front = cleanFlashcardFrontText(frontLine.replace(/^front\s*:/i, ''));
      const back = cleanFlashcardBackText(backLine.replace(/^back\s*:/i, ''));

      if (isUsefulFlashcard(front, back)) {
        cards.push({ front, back });
      }

      index += 1;
    }
  }

  return cards;
}

export function isValidFlashcardPair(front: string, back: string) {
  const cleanFront = cleanFlashcardFrontText(front);
  const cleanBack = cleanFlashcardBackText(back);

  return isUsefulFlashcard(cleanFront, cleanBack);
}

function completeFlashcardDeck(cards: Flashcard[], expectedCount: number) {
  if (cards.length === 0 || expectedCount <= 0) {
    return [];
  }

  const completedCards: Flashcard[] = [];
  const seenFronts = new Set<string>();
  const seenBacks = new Set<string>();

  for (const card of cards) {
    const frontKey = normalizeFlashcardKey(card.front);
    const backKey = normalizeFlashcardKey(card.back).slice(0, 140);

    if (
      !frontKey ||
      seenFronts.has(frontKey) ||
      (backKey && seenBacks.has(backKey))
    ) {
      continue;
    }

    seenFronts.add(frontKey);

    if (backKey) {
      seenBacks.add(backKey);
    }

    if (isUsefulFlashcard(card.front, card.back)) {
      completedCards.push(card);
    }

    if (completedCards.length >= expectedCount) {
      break;
    }
  }

  return completedCards;
}

export function isUsefulFlashcard(front: string, back: string) {
  const normalizedFront = normalizeFlashcardKey(front);
  const frontWords = normalizedFront.split(/\s+/).filter(Boolean);

  return (
    front.length >= 3 &&
    front.length <= 45 &&
    frontWords.length >= 1 &&
    frontWords.length <= 7 &&
    hasMeaningfulFlashcardFrontWord(normalizedFront) &&
    !looksLikeStudyHeadingPhrase(frontWords) &&
    !looksLikeVerbPhraseTerm(frontWords) &&
    !isFunctionWordOnlyFlashcardFront(normalizedFront) &&
    !isInstructionLikeFlashcardFront(normalizedFront) &&
    !isQuestionLikeText(front) &&
    !questionTermStarts.has(frontWords[0] ?? '') &&
    !front.includes(',') &&
    !/[.!?]$/.test(front) &&
    (
      !flashcardFragmentStarts.has(frontWords[0] ?? '') ||
      isAcceptedLeadingFunctionWordTerm(normalizedFront)
    ) &&
    (
      !weakFlashcardFrontStarts.has(frontWords[0] ?? '') ||
      isAcceptedLeadingFunctionWordTerm(normalizedFront)
    ) &&
    !/\b(is|are|was|were|has|have|had|can|could|should|would|will)\b/i.test(front) &&
    isUsefulFlashcardBack(front, back)
  );
}

function cleanFlashcardFrontText(text: string) {
  return cleanStudentReadableText(text)
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/^\W+|\W+$/g, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFlashcardBackText(text: string) {
  return cleanStudentReadableText(text)
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFlashcardKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasMeaningfulFlashcardFrontWord(normalizedFront: string) {
  return normalizedFront
    .split(/\s+/)
    .filter(Boolean)
    .some((word) =>
      word.length > 2 &&
      !flashcardFrontStopWords.has(word)
    );
}

function looksLikeStudyHeadingPhrase(words: string[]) {
  return (
    words.length >= 2 &&
    words.every((word) => studyHeadingWords.has(word))
  );
}

function looksLikeVerbPhraseTerm(words: string[]) {
  return words.length > 1 && words.some((word) => studyTermVerbWords.has(word));
}

function isFunctionWordOnlyFlashcardFront(normalizedFront: string) {
  const words = normalizedFront.split(/\s+/).filter(Boolean);

  return (
    words.length === 0 ||
    words.every((word) => flashcardFrontStopWords.has(word))
  );
}

function isInstructionLikeFlashcardFront(normalizedFront: string) {
  return (
    !isAcceptedLeadingFunctionWordTerm(normalizedFront) &&
    (
      /^(answer|choose|circle|complete|consider|draw|explain|fill|find|identify|list|look|make|read|select|solve|try|write)\b/.test(normalizedFront) ||
      /\b(answer the|choose the|circle the|complete the|fill in|keep (?:the|your)|look at|make up|select the|test your|try making|try to|write down)\b/.test(normalizedFront)
    )
  );
}

function isUsefulFlashcardBack(front: string, back: string) {
  const cleanBack = back.trim();

  return (
    cleanBack.length >= 24 &&
    cleanBack.length <= 260 &&
    cleanBack.split(/\s+/).filter(Boolean).length >= 4 &&
    /^[A-Z0-9]/.test(cleanBack) &&
    !isQuestionLikeText(cleanBack) &&
    !/^(is|are|was|were|has|have|had|can|could|should|would|will)\b/i.test(cleanBack) &&
    !looksLikeSentenceContinuation(front, cleanBack) &&
    !normalizeFlashcardKey(cleanBack).startsWith('this statement is true')
  );
}

function isQuestionLikeText(text: string) {
  const normalized = normalizeFlashcardKey(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const firstWord = words[0] ?? '';
  const secondWord = words[1] ?? '';

  if (!normalized) {
    return true;
  }

  if (/[?？]\s*$/.test(text.trim())) {
    return true;
  }

  if (!questionTermStarts.has(firstWord)) {
    return false;
  }

  if (questionAuxiliaryStarts.has(firstWord)) {
    return true;
  }

  return words.length <= 4 || questionAuxiliaryStarts.has(secondWord);
}

function looksLikeSentenceContinuation(front: string, back: string) {
  const normalizedFront = normalizeFlashcardKey(front);
  const firstFrontWord = normalizedFront.split(/\s+/)[0] ?? '';

  return (
    (
      flashcardFragmentStarts.has(firstFrontWord) &&
      !isAcceptedLeadingFunctionWordTerm(normalizedFront)
    ) ||
    back.length === 0 ||
    /^[a-z]/.test(back.trim())
  );
}

function isAcceptedLeadingFunctionWordTerm(normalizedFront: string) {
  return /^(if statement|if clause|for loop|for statement|while loop|while statement|with statement|in operator)$/.test(normalizedFront);
}

const flashcardFrontStopWords = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'all',
  'also',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'during',
  'each',
  'few',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'here',
  'him',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'many',
  'may',
  'more',
  'most',
  'much',
  'must',
  'my',
  'next',
  'no',
  'not',
  'now',
  'of',
  'on',
  'only',
  'or',
  'other',
  'our',
  'over',
  'own',
  'same',
  'several',
  'she',
  'should',
  'so',
  'some',
  'something',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'us',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

const studyHeadingWords = new Set([
  ...flashcardFrontStopWords,
  'action',
  'actions',
  'analyzing',
  'following',
  'making',
  'others',
  'printing',
  'repeating',
  'sorting',
  'understand',
  'using',
]);

const studyTermVerbWords = new Set([
  'allows',
  'compares',
  'contains',
  'controls',
  'gives',
  'helps',
  'holds',
  'lets',
  'represents',
  'repeats',
  'runs',
  'stores',
  'tells',
  'uses',
]);

const weakFlashcardFrontStarts = new Set([
  ...flashcardFrontStopWords,
  'activity',
  'answer',
  'example',
  'exercise',
  'information',
  'lesson',
  'page',
  'question',
  'sentence',
  'statement',
  'text',
  'worksheet',
]);

const questionTermStarts = new Set([
  'am',
  'are',
  'can',
  'could',
  'did',
  'do',
  'does',
  'had',
  'has',
  'have',
  'how',
  'is',
  'should',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'would',
]);

const questionAuxiliaryStarts = new Set([
  'am',
  'are',
  'can',
  'could',
  'did',
  'do',
  'does',
  'had',
  'has',
  'have',
  'is',
  'should',
  'was',
  'were',
  'will',
  'would',
]);

const flashcardFragmentStarts = new Set([
  'also',
  'although',
  'and',
  'as',
  'after',
  'at',
  'before',
  'because',
  'but',
  'by',
  'during',
  'for',
  'from',
  'in',
  'if',
  'it',
  'its',
  'of',
  'on',
  'or',
  'over',
  'since',
  'so',
  'that',
  'then',
  'there',
  'these',
  'they',
  'this',
  'though',
  'through',
  'to',
  'under',
  'using',
  'when',
  'where',
  'while',
  'with',
]);
