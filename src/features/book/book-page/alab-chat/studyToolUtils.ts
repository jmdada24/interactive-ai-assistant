import { cleanStudentReadableText } from '../../../../ai/textCleanup';

export type QuizQuestion = {
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
};

export type Flashcard = {
  front: string;
  back: string;
};

export function parseQuizQuestions(text: string): QuizQuestion[] {
  const normalizedText = text
    .replace(/\s+(?=Question\s*\d*\s*[:.)-])/gi, '\n\n')
    .replace(/\s+(?=[A-Z][.)]\s+)/g, '\n')
    .replace(/\s+(?=Correct answer\s*:)/gi, '\n')
    .replace(/\s+(?=Explanation\s*:)/gi, '\n');
  const blocks = normalizedText
    .split(/\n\s*\n|(?=Question\s*\d*[:.])/i)
    .map((block) => block.trim())
    .filter(Boolean);

  const questions = blocks
    .map<QuizQuestion | null>((block) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim().replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, ''))
        .filter(Boolean);
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
    .filter((question): question is QuizQuestion => Boolean(question));

  return questions.length > 0
    ? questions
    : [{ question: text.trim(), options: [], answer: '', explanation: undefined }];
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
      cards.push({
        front: cleanMarkdownText(frontLine.replace(/^front\s*:/i, '')),
        back: cleanMarkdownText(backLine.replace(/^back\s*:/i, '')),
      });
      index += 1;
    }
  }

  if (cards.length > 0) {
    return cards;
  }

  return lines.map((line, index) => ({
    front: `Card ${index + 1}`,
    back: cleanMarkdownText(line.replace(/^[-*]\s+/, '')),
  }));
}

export function shuffleItems<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
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
    .replace(/\babout the chapter\b/gi, 'about this lesson')
    .replace(/\s+/g, ' ')
    .trim();
  const chapterMentions = cleanText.match(/\bchapter\s+\d+\b/gi)?.length ?? 0;

  if (!cleanText || chapterMentions >= 2) {
    return 'Which answer best matches this lesson idea?';
  }

  return cleanText;
}

function normalizeQuizOptions(options: string[]) {
  const seen = new Set<string>();
  const uniqueOptions: string[] = [];

  for (const option of options) {
    const cleanOption = cleanMarkdownText(option).replace(/\s+/g, ' ').trim();
    const key = normalizeQuizOptionKey(cleanOption);

    if (!key || seen.has(key)) {
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

function cleanMarkdownText(text: string) {
  return cleanStudentReadableText(text);
}
