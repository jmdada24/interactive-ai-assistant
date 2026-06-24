import { cleanStudentReadableText } from '../../../../ai/textCleanup';
export type { Flashcard } from '../../../../ai/rag/agent/flashcards';
export {
  parseExactFlashcardDeck,
  parseFlashcards,
} from '../../../../ai/rag/agent/flashcards';

export type QuizQuestion = {
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
};

export function parseQuizQuestions(text: string): QuizQuestion[] {
  const normalizedText = text
    .replace(/\s+(?=Question\s*\d*\s*[:.)-])/gi, '\n\n')
    .replace(/\s+(?=Question\s*:)/gi, '\n\n')
    .replace(/\s+(?=[A-Z][.)]\s+)/g, '\n')
    .replace(/\s+(?=Correct answer\s*:)/gi, '\n')
    .replace(/\s+(?=Explanation\s*:)/gi, '\n');
  const blocks = normalizedText
    .split(/(?=Question\s*\d*\s*[:.)-])|(?=Question\s*:)/i)
    .map((block) => block.trim())
    .filter((block) => /^question/i.test(block));

  const questions = blocks
    .map<QuizQuestion | null>((block) => {
      const lines = mergeQuizLines(block
        .split('\n')
        .map((line) => line.trim().replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, ''))
        .filter(Boolean));
      const questionLine = lines.find((line) => /^question/i.test(line)) ?? lines[0];
      const question = cleanQuizQuestionText(
        questionLine.replace(/^question\s*\d*\s*[:.)-]?\s*/i, '')
      );
      const options = normalizeQuizOptions(
        lines
          .filter((line) => /^[A-Z][.)]\s+/i.test(line))
          .map((line) => cleanMarkdownText(line.replace(/^[A-Z][.)]\s+/i, '')))
      );
      const answerLine = lines.find((line) => /^correct answer|^answer/i.test(line));
      const explanationLine = lines.find((line) => /^explanation/i.test(line));

      if (!question) {
        return null;
      }

      const parsedQuestion: QuizQuestion = {
        question,
        options,
        answer: answerLine
          ? cleanMarkdownText(answerLine.replace(/^correct answer\s*[:.)-]?|^answer\s*[:.)-]?/i, ''))
          : '',
      };

      if (explanationLine) {
        parsedQuestion.explanation = cleanMarkdownText(
          explanationLine.replace(/^explanation\s*[:.)-]?/i, '')
        );
      }

      return parsedQuestion;
    })
    .filter((question): question is QuizQuestion => Boolean(question))
    .filter((question) =>
      question.options.length === 4 &&
      Boolean(getCorrectOptionText(question)) &&
      hasMeaningfullyDistinctOptions(question.options)
    );

  if (questions.length > 0) {
    return questions;
  }

  return parseLooseQuizQuestions(text);
}

export function shuffleItems<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

export function normalizeSourceLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const labels: string[] = [];

  for (const source of value) {
    const label = getSourceLabel(source);
    const key = normalizeQuizOptionKey(label);

    if (!label || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    labels.push(label);
  }

  return labels;
}

export function getCorrectOptionText(question: QuizQuestion) {
  const normalizedAnswer = normalizeQuizOptionKey(question.answer);
  const letterMatch = normalizedAnswer.match(/^[a-d]\b|^[a-d][.)]/i);

  if (letterMatch) {
    const optionIndex = letterMatch[0].toLowerCase().charCodeAt(0) - 97;
    return question.options[optionIndex] ?? '';
  }

  return question.options.find((option) => {
    const normalizedOption = normalizeQuizOptionKey(option);
    return (
      normalizedOption === normalizedAnswer ||
      normalizedAnswer.includes(normalizedOption)
    );
  }) ?? '';
}

export function isCorrectQuizAnswer(question: QuizQuestion, selectedAnswer?: string) {
  if (!selectedAnswer || question.options.length === 0) {
    return false;
  }

  const correctOption = getCorrectOptionText(question).trim().toLowerCase();

  return (
    correctOption.length > 0 &&
    normalizeQuizOptionKey(selectedAnswer) === normalizeQuizOptionKey(correctOption)
  );
}

export function normalizeQuizOptionKey(option: string) {
  return option.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cleanQuizQuestionText(text: string) {
  const cleanText = cleanMarkdownText(text)
    .replace(/\bWhat is this about\??$/i, '')
    .replace(/\babout the chapter\b/gi, 'about this topic')
    .replace(/\b(?:in|on|at|from)\s+(?:the\s+)?page\s*\d{1,4}\b/gi, '')
    .replace(/\bpage\s*\d{1,4}\b/gi, '')
    .replace(/\b(?:according to|based on)\s+(?:the\s+)?(?:lesson|pdf|source|book|text)\b[:,]?\s*/gi, '')
    .replace(/\b(?:this|the)\s+(?:lesson|pdf|source|book|text)\s+(?:says|states|explains|shows)\s+that\s+/gi, '')
    .replace(/\b(?:this|the)\s+(?:lesson|pdf|source|book|text)\b/gi, 'this topic')
    .replace(/\s+/g, ' ')
    .trim();
  const chapterMentions = cleanText.match(/\bchapter\s+\d+\b/gi)?.length ?? 0;

  if (!cleanText || chapterMentions >= 2) {
    return 'Which answer best matches this idea?';
  }

  return cleanText;
}

function normalizeQuizOptions(options: string[]) {
  const seen = new Set<string>();
  const uniqueOptions: string[] = [];

  for (const option of options) {
    const cleanOption = cleanQuizOptionText(option);
    const key = normalizeQuizOptionKey(cleanOption);

    if (
      !key ||
      seen.has(key) ||
      !isUsefulQuizOption(cleanOption) ||
      uniqueOptions.some((existingOption) =>
        areQuizOptionsTooSimilar(existingOption, cleanOption)
      )
    ) {
      continue;
    }

    seen.add(key);
    uniqueOptions.push(cleanOption);

    if (uniqueOptions.length === 4) {
      break;
    }
  }

  return uniqueOptions;
}

function cleanQuizOptionText(text: string) {
  const cleanText = cleanMarkdownText(text)
    .replace(/^(?:the|a|an|n)\s+/i, '')
    .replace(/^(?:concept|idea|meaning|definition)\s+of\s+(?:the|a|an)?\s*/i, '')
    .replace(/^(?:term|word|phrase)\s+(?:for|called|named)\s+(?:the|a|an)?\s*/i, '')
    .replace(/^(?:called|named|known as)\s+(?:the|a|an)?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const articleCollapsedText = collapseRepeatedArticleOptionText(cleanText);

  return articleCollapsedText
    .split(/\s+/)
    .filter((word, index, words) =>
      index === 0 ||
      normalizeQuizOptionKey(word) !== normalizeQuizOptionKey(words[index - 1])
    )
    .join(' ');
}

function isUsefulQuizOption(option: string) {
  if (/[?]/.test(option) || /\b(others?|printing|understand)\b/i.test(option) || /\.\s+[a-z]/.test(option)) {
    return false;
  }

  const normalized = normalizeQuizOptionKey(option);
  const words = normalized.split(/\s+/).filter(Boolean);

  const isTermChoice = (
    option.length >= 3 &&
    option.length <= 90 &&
    words.length >= 1 &&
    words.length <= 9 &&
    words.some((word) => word.length > 2 && !weakQuizOptionWords.has(word)) &&
    !looksLikeStudyHeadingPhrase(words) &&
    !looksLikeVerbPhraseTerm(words) &&
    !/[.!？]/.test(option) &&
    !option.includes(',') &&
    !/^(and|or|but|so|because|if|when|while|with|to|of|in|on|for|from)\b/i.test(option) &&
    !/\b(is|are|was|were|means|refers|called)\b/i.test(option)
  );
  const isStatementChoice = (
    option.length >= 24 &&
    option.length <= 180 &&
    words.length >= 4 &&
    words.length <= 28 &&
    words.some((word) => word.length > 3 && !weakQuizOptionWords.has(word)) &&
    !/^(and|or|but|so|because|if|when|while|with|to|of|in|on|for|from)\b/i.test(option)
  );

  return isTermChoice || isStatementChoice;
}

function collapseRepeatedArticleOptionText(text: string) {
  const match = text.match(/^(.+?)\s+(?:a|an|the|n)\s+(.+)$/i);

  if (!match) {
    return text;
  }

  const left = stripLeadingArticleOptionText(match[1]);
  const right = stripLeadingArticleOptionText(match[2]);

  if (normalizeQuizOptionKey(left) === normalizeQuizOptionKey(right)) {
    return right;
  }

  return text;
}

function stripLeadingArticleOptionText(text: string) {
  return text.replace(/^(?:a|an|the|n)\s+/i, '').trim();
}

function cleanMarkdownText(text: string) {
  return cleanStudentReadableText(text);
}

function parseLooseQuizQuestions(text: string): QuizQuestion[] {
  const blocks = text
    .replace(/\r/g, '\n')
    .replace(/\s+(?=Question\s*\d*\s*[:.)-])/gi, '\n\n')
    .split(/(?=Question\s*\d*\s*[:.)-])/i)
    .map((block) => block.trim())
    .filter((block) => /^question\s*\d*\s*[:.)-]/i.test(block));
  const questions: QuizQuestion[] = [];

  for (const block of blocks) {
    const question = parseLooseQuizBlock(block);

    if (
      question &&
      question.options.length === 4 &&
      Boolean(getCorrectOptionText(question))
    ) {
      questions.push(question);
    }
  }

  return questions;
}

function parseLooseQuizBlock(block: string): QuizQuestion | null {
  const normalizedBlock = cleanMarkdownText(block)
    .replace(/\s+/g, ' ')
    .trim();
  const questionMatch = normalizedBlock.match(
    /^Question\s*\d*\s*[:.)-]?\s*([\s\S]*?)(?=\s+A[.)]\s+)/i
  );

  if (!questionMatch) {
    return null;
  }

  const question = cleanQuizQuestionText(questionMatch[1]);
  const optionStart = questionMatch[0].length;
  const answerStart = findFirstIndex(
    normalizedBlock,
    /\s+(?:Correct\s+answer|Answer)\s*:/i,
    optionStart
  );
  const explanationStart = findFirstIndex(
    normalizedBlock,
    /\s+Explanation\s*:/i,
    optionStart
  );
  const optionEnd = Math.min(
    ...[answerStart, explanationStart, normalizedBlock.length]
      .filter((index) => index >= 0)
  );
  const optionArea = normalizedBlock.slice(optionStart, optionEnd).trim();
  const options = parseLooseOptions(optionArea);
  const answerMatch = normalizedBlock.match(
    /\b(?:Correct\s+answer|Answer)\s*:\s*([A-D])(?:[.)]?\s*([\s\S]*?))?(?=\s+Explanation\s*:|$)/i
  );
  const answerLetter = answerMatch?.[1]?.toUpperCase() ?? '';
  const answerIndex = answerLetter ? answerLetter.charCodeAt(0) - 65 : -1;
  const answerText = cleanMarkdownText(answerMatch?.[2] ?? '').trim();
  const explanationMatch = normalizedBlock.match(/\bExplanation\s*:\s*([\s\S]*)$/i);
  const parsedQuestion: QuizQuestion = {
    question,
    options,
    answer: answerLetter
      ? `${answerLetter}. ${answerText || options[answerIndex] || ''}`.trim()
      : '',
  };

  if (explanationMatch?.[1]) {
    parsedQuestion.explanation = cleanMarkdownText(explanationMatch[1]);
  }

  return parsedQuestion;
}

function parseLooseOptions(optionArea: string) {
  const optionMatches = Array.from(optionArea.matchAll(
    /(?:^|\s)([A-D])[.)]\s+([\s\S]*?)(?=\s+[A-D][.)]\s+|$)/gi
  ));
  const optionsByLetter = new Map<string, string>();

  for (const match of optionMatches) {
    const letter = match[1].toUpperCase();
    const option = cleanMarkdownText(match[2]).replace(/\s+/g, ' ').trim();

    if (option) {
      optionsByLetter.set(letter, option);
    }
  }

  return normalizeQuizOptions(
    ['A', 'B', 'C', 'D']
      .map((letter) => optionsByLetter.get(letter) ?? '')
      .filter(Boolean)
  );
}

function findFirstIndex(text: string, pattern: RegExp, startIndex: number) {
  const match = pattern.exec(text.slice(startIndex));

  return match ? startIndex + match.index : -1;
}

function hasMeaningfullyDistinctOptions(options: string[]) {
  if (options.length !== 4) {
    return false;
  }

  for (let leftIndex = 0; leftIndex < options.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < options.length; rightIndex += 1) {
      if (areQuizOptionsTooSimilar(options[leftIndex], options[rightIndex])) {
        return false;
      }
    }
  }

  return true;
}

function areQuizOptionsTooSimilar(left: string, right: string) {
  const normalizedLeft = normalizeQuizOptionKey(left);
  const normalizedRight = normalizeQuizOptionKey(right);

  if (!normalizedLeft || !normalizedRight || normalizedLeft === normalizedRight) {
    return true;
  }

  const shorter = normalizedLeft.length < normalizedRight.length
    ? normalizedLeft
    : normalizedRight;
  const longer = normalizedLeft.length < normalizedRight.length
    ? normalizedRight
    : normalizedLeft;

  if (shorter.length >= 16 && longer.includes(shorter)) {
    return true;
  }

  const leftTokens = getMeaningfulOptionTokens(normalizedLeft);
  const rightTokens = getMeaningfulOptionTokens(normalizedRight);

  if (leftTokens.length < 3 || rightTokens.length < 3) {
    return false;
  }

  const rightSet = new Set(rightTokens);
  const intersection = leftTokens.filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const overlap = intersection / Math.max(1, union);
  const coverage = intersection / Math.max(1, Math.min(leftTokens.length, rightTokens.length));

  return overlap >= 0.72 || coverage >= 0.86;
}

function getMeaningfulOptionTokens(value: string) {
  return value
    .split(/\s+/)
    .map((token) => token.replace(/s$/, ''))
    .filter((token) => token.length > 2 && !quizOptionStopWords.has(token));
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

function getSourceLabel(source: unknown): string {
  if (typeof source === 'string') {
    return source.replace(/\s+/g, ' ').trim();
  }

  if (typeof source !== 'object' || source === null) {
    return '';
  }

  const sourceRecord = source as Record<string, unknown>;
  const sourceName = getStringField(
    sourceRecord,
    'sourceName',
    'source_name',
    'name',
    'filename',
    'title',
    'label'
  );
  const pageNumber = getNumberField(
    sourceRecord,
    'pageNumber',
    'page_number',
    'page'
  );

  if (!sourceName) {
    return '';
  }

  return pageNumber ? `${sourceName}, page ${pageNumber}` : sourceName;
}

function getStringField(
  record: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.replace(/\s+/g, ' ').trim();
    }
  }

  return '';
}

function getNumberField(
  record: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsedValue = Number(value);

      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  return null;
}

const quizOptionStopWords = new Set([
  'about',
  'according',
  'answer',
  'because',
  'chapter',
  'choice',
  'detail',
  'does',
  'from',
  'idea',
  'lesson',
  'main',
  'meaning',
  'option',
  'point',
  'question',
  'says',
  'statement',
  'that',
  'the',
  'this',
  'topic',
  'what',
  'which',
  'with',
]);

const weakQuizOptionWords = new Set([
  ...quizOptionStopWords,
  'an',
  'are',
  'but',
  'can',
  'concept',
  'do',
  'does',
  'every',
  'has',
  'have',
  'if',
  'is',
  'it',
  'its',
  'just',
  'less',
  'like',
  'nothing',
  'of',
  'one',
  'or',
  'others',
  'so',
  'to',
  'was',
  'were',
]);

const studyHeadingWords = new Set([
  ...weakQuizOptionWords,
  'action',
  'actions',
  'analyzing',
  'following',
  'making',
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

function mergeQuizLines(lines: string[]) {
  const mergedLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];
    const followingLine = lines[index + 2];

    if (/^[A-D][.)]$/i.test(line) && nextLine) {
      mergedLines.push(`${line} ${nextLine}`);
      index += 1;
      continue;
    }

    if (/^correct$/i.test(line) && /^answer\s*[:.)-]?/i.test(nextLine ?? '')) {
      const answerLine = nextLine && /^[A-D][.)]?$/i.test(nextLine.replace(/^answer\s*[:.)-]?\s*/i, '')) && followingLine
        ? `${nextLine} ${followingLine}`
        : nextLine ?? '';
      mergedLines.push(`Correct ${answerLine}`);
      index += answerLine === nextLine ? 1 : 2;
      continue;
    }

    if (/^correct answer\s*[:.)-]?\s*$/i.test(line) && /^[A-D][.)]\s+/i.test(nextLine ?? '')) {
      mergedLines.push(`${line} ${nextLine}`);
      index += 1;
      continue;
    }

    if (/^correct answer\s*[:.)-]?\s*[A-D][.)]?$/i.test(line) && nextLine) {
      mergedLines.push(`${line} ${nextLine}`);
      index += 1;
      continue;
    }

    if (/^answer\s*[:.)-]?\s*$/i.test(line) && /^[A-D][.)]\s+/i.test(nextLine ?? '')) {
      mergedLines.push(`${line} ${nextLine}`);
      index += 1;
      continue;
    }

    if (/^answer\s*[:.)-]?\s*[A-D][.)]?$/i.test(line) && nextLine) {
      mergedLines.push(`${line} ${nextLine}`);
      index += 1;
      continue;
    }

    mergedLines.push(line);
  }

  return mergedLines;
}
