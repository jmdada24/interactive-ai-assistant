import { shortText } from '../chunks/text';
import { isValidFlashcardPair } from './flashcards';
import {
  buildFlashcardFacts,
  buildQuizFacts,
  buildStudyFacts,
  cleanStudyTerm,
  LessonFact,
  normalizeOption,
} from '../knowledge/facts';

export type StudyToolMode = 'mcq' | 'fill_blank' | 'essay';

type QuizQuestionStyle = 'meaning' | 'term' | 'definition' | 'direct';

const quizItemCount = 10;
const flashcardItemCount = 10;
const meaningQuestionRatio = 0.25;

export function buildSimpleStudyToolFallback(
  tool: 'quiz' | 'flashcards',
  chunks: { text: string }[],
  mode: StudyToolMode = 'mcq',
  itemCount = tool === 'quiz' ? quizItemCount : flashcardItemCount,
  variant = 0
) {
  const { baseSnippets, facts } = buildStudyFacts(chunks);
  const targetCount = getStudyToolItemCount(tool, itemCount);
  const quizFactPoolCount = Math.max(targetCount, targetCount * 3);
  const quizFacts = tool === 'quiz'
    ? buildQuizFacts(facts, baseSnippets, quizFactPoolCount)
    : [];
  const flashcardFacts = tool === 'flashcards'
    ? buildFlashcardFacts(facts, baseSnippets, targetCount)
    : [];
  const selectedFacts = tool === 'quiz'
    ? takeUniqueQuizFacts(quizFacts, Math.max(targetCount, targetCount * 3))
    : flashcardFacts.slice(0, targetCount);
  const variedFacts = rotateItems(selectedFacts, variant);

  if (variedFacts.length === 0) {
    return tool === 'quiz'
      ? 'ALAB needs clearer lesson definitions before making a quiz.'
      : 'ALAB needs clearer lesson definitions before making flashcards.';
  }

  if (tool === 'flashcards') {
    return buildFallbackFlashcards(variedFacts, targetCount);
  }

  const quizQuestions = buildFallbackQuizQuestions(
    variedFacts,
    mode,
    targetCount,
    variant
  );

  if (quizQuestions.length === 0) {
    return 'ALAB needs clearer lesson definitions before making a quiz.';
  }

  return quizQuestions.slice(0, targetCount).join('\n\n');
}

export function getStudyToolItemCount(
  tool: 'quiz' | 'flashcards',
  requestedCount?: number
) {
  const fallbackCount = tool === 'quiz' ? quizItemCount : flashcardItemCount;

  if (!requestedCount || !Number.isFinite(requestedCount)) {
    return fallbackCount;
  }

  return Math.max(1, Math.min(50, Math.round(requestedCount)));
}

export function hasValidMcqQuiz(text: string) {
  return countValidMcqQuestions(text) > 0;
}

export function countValidMcqQuestions(text: string) {
  return text
    .split(/(?=Question\s*\d*\s*[:.)-])/i)
    .map((block) => block.trim())
    .filter((block) => /^question\s*\d*\s*[:.)-]/i.test(block))
    .filter(hasValidMcqBlock)
    .length;
}

export function countFlashcards(text: string) {
  const lines = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let count = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (/^front\s*:/i.test(lines[index]) && /^back\s*:/i.test(lines[index + 1] ?? '')) {
      count += 1;
      index += 1;
    }
  }

  return count;
}

export function countValidStudyToolItems(
  tool: 'quiz' | 'flashcards',
  mode: StudyToolMode,
  text: string
) {
  return splitStudyToolBlocks(text, tool)
    .filter((block) => isValidStudyToolBlock(tool, mode, block))
    .length;
}

export function mergeValidatedStudyToolOutput(
  tool: 'quiz' | 'flashcards',
  mode: StudyToolMode,
  primaryText: string,
  fallbackText: string,
  itemCount: number
) {
  const selected: string[] = [];
  const seenPrompts = new Set<string>();
  const primaryBlocks = splitStudyToolBlocks(primaryText, tool);
  const fallbackBlocks = splitStudyToolBlocks(fallbackText, tool);

  for (const block of [...primaryBlocks, ...fallbackBlocks]) {
    if (!isValidStudyToolBlock(tool, mode, block)) {
      continue;
    }

    const prompt = getStudyToolPrompt(block, tool);
    const promptKey = normalizeOption(prompt);

    if (!promptKey || seenPrompts.has(promptKey)) {
      continue;
    }

    seenPrompts.add(promptKey);
    selected.push(block.trim());

    if (selected.length >= itemCount) {
      break;
    }
  }

  if (selected.length < itemCount) {
    for (const block of fallbackBlocks) {
      if (!isValidStudyToolBlock(tool, mode, block)) {
        continue;
      }

      const prompt = getStudyToolPrompt(block, tool);
      const promptKey = normalizeOption(prompt);

      if (!promptKey || seenPrompts.has(promptKey)) {
        continue;
      }

      seenPrompts.add(promptKey);
      selected.push(block.trim());

      if (selected.length >= itemCount) {
        break;
      }
    }
  }

  if (selected.length < itemCount) {
    for (const block of [...primaryBlocks, ...fallbackBlocks]) {
      if (!isValidStudyToolBlock(tool, mode, block)) {
        continue;
      }

      const prompt = getStudyToolPrompt(block, tool);
      const promptKey = normalizeOption(prompt);

      if (!promptKey || seenPrompts.has(promptKey)) {
        continue;
      }

      seenPrompts.add(promptKey);
      selected.push(block.trim());

      if (selected.length >= itemCount) {
        break;
      }
    }
  }

  return selected.join('\n\n');
}

export function normalizeStudyToolOutput(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/```(?:[a-zA-Z0-9_-]+)?/g, '')
    .replace(/`{1,3}/g, '')
    .replace(/^\s*[-*]\s+(?=(Question|Front|Back|Answer|Correct answer|Explanation)\s*:)/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitStudyToolBlocks(text: string, tool: 'quiz' | 'flashcards') {
  const normalized = normalizeStudyToolOutput(text);
  const startPattern = tool === 'quiz'
    ? /(?=^Question\s*\d*\s*[:.)-])/gim
    : /(?=^Front\s*:)/gim;

  return normalized
    .split(startPattern)
    .map((block) => block.trim())
    .filter((block) =>
      tool === 'quiz'
        ? /^Question\s*\d*\s*[:.)-]/i.test(block)
        : /^Front\s*:/i.test(block)
    );
}

function isValidStudyToolBlock(
  tool: 'quiz' | 'flashcards',
  mode: StudyToolMode,
  block: string
) {
  if (tool === 'flashcards') {
    const front = block.match(/^Front\s*:\s*(.+)$/im)?.[1]?.trim() ?? '';
    const back = block.match(/^Back\s*:\s*(.+)$/im)?.[1]?.trim() ?? '';

    return isValidFlashcardPair(front, back);
  }

  if (mode === 'mcq') {
    return hasValidMcqBlock(block);
  }

  const question = block.match(/^Question\s*\d*\s*[:.)-]\s*(.+)$/im)?.[1]?.trim() ?? '';
  const answer = block.match(/^Answer\s*:\s*(.+)$/im)?.[1]?.trim() ?? '';
  const explanation = block.match(/^Explanation\s*:\s*(.+)$/im)?.[1]?.trim() ?? '';

  if (!question || !answer || !explanation) {
    return false;
  }

  return mode !== 'fill_blank' || /_{3,}|\bblank\b/i.test(question);
}

function getStudyToolPrompt(block: string, tool: 'quiz' | 'flashcards') {
  const pattern = tool === 'quiz'
    ? /^Question\s*\d*\s*[:.)-]\s*(.+)$/im
    : /^Front\s*:\s*(.+)$/im;

  return block.match(pattern)?.[1]?.trim() ?? '';
}

function hasValidMcqBlock(block: string) {
  const lines = block
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const options = new Map<string, string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const optionMatch = line.match(/^([A-D])[.)]\s*(.*)$/i);

    if (!optionMatch) {
      continue;
    }

    const letter = optionMatch[1].toUpperCase();
    const inlineText = optionMatch[2].trim();
    const optionText = inlineText || lines[index + 1]?.trim() || '';

    if (optionText) {
      options.set(letter, optionText);
    }
  }

  const answerMatch = block.match(
    /(?:^|\n)Correct\s*answer\s*:\s*([A-D])[.)]?(?:\s+|\n)?([^\n]*)/i
  );

  if (options.size < 4 || !answerMatch) {
    return false;
  }

  const answerLetter = answerMatch[1].toUpperCase();
  const correctOption = options.get(answerLetter);
  const answerText = answerMatch[2]?.trim() ?? '';
  const question = block.match(/^Question\s*\d*\s*[:.)-]\s*(.+)$/im)?.[1]?.trim() ?? '';
  const optionValues = Array.from(options.values());

  if (
    !isCleanQuizQuestion(question) ||
    !correctOption ||
    optionValues.length !== 4 ||
    optionValues.some((option) => !isStrongQuizChoice(option)) ||
    optionValues.some((option) => isDirtyQuizText(option)) ||
    !hasMeaningfullyDistinctQuizOptions(optionValues)
  ) {
    return false;
  }

  return (
    !answerText ||
    normalizeAnswerText(answerText) === normalizeAnswerText(correctOption) ||
    normalizeAnswerText(answerText).includes(normalizeAnswerText(correctOption))
  );
}

function normalizeAnswerText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isStrongQuizOption(option: string) {
  if (/[.!?]/.test(option) || /\b(others?|printing|understand)\b/i.test(option) || isDirtyQuizText(option)) {
    return false;
  }

  const cleanOption = cleanStudyTerm(option);
  const normalized = normalizeOption(cleanOption);
  const words = normalized.split(/\s+/).filter(Boolean);

  return (
    cleanOption.length >= 3 &&
    cleanOption.length <= 70 &&
    words.length >= 1 &&
    words.length <= 7 &&
    words.some((word) => word.length > 2 && !weakQuizOptionWords.has(word)) &&
    !/[?？]/.test(cleanOption) &&
    !cleanOption.includes(',') &&
    !/^(and|or|but|so|because|if|when|while|with|to|of|in|on|for|from)\b/i.test(cleanOption) &&
    !/\b(is|are|was|were|means|refers|called)\b/i.test(cleanOption)
  );
}

function isStrongQuizChoice(option: string) {
  return isStrongQuizOption(option) || isStrongStatementOption(option);
}

function isStrongStatementOption(option: string) {
  if (
    /\b(others?|printing|understand)\b/i.test(option) ||
    /\.\s+[a-z]/.test(option) ||
    isDirtyQuizText(option)
  ) {
    return false;
  }

  const cleanOption = option
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '')
    .trim();
  const normalized = normalizeOption(cleanOption);
  const words = normalized.split(/\s+/).filter(Boolean);

  return (
    cleanOption.length >= 24 &&
    cleanOption.length <= 180 &&
    words.length >= 4 &&
    words.length <= 24 &&
    words.some((word) => word.length > 3 && !weakQuizOptionWords.has(word)) &&
    !/^(and|or|but|so|because|if|when|while|with|to|of|in|on|for|from)\b/i.test(cleanOption)
  );
}

function isCleanQuizQuestion(question: string) {
  const cleanQuestion = question.replace(/\s+/g, ' ').trim();
  const normalized = normalizeOption(cleanQuestion);

  if (
    !cleanQuestion ||
    cleanQuestion.length > 180 ||
    /lesson fact/i.test(cleanQuestion) ||
    isDirtyQuizText(cleanQuestion)
  ) {
    return false;
  }

  const whatIsMatch = /^what is (.+)\?*$/i.exec(cleanQuestion);
  const definitionMatch = /^which definition best matches (.+)\?*$/i.exec(cleanQuestion);
  const termSubject = whatIsMatch?.[1] ?? definitionMatch?.[1] ?? '';

  if (termSubject) {
    const cleanSubject = termSubject.replace(/[?？]+$/g, '').trim();
    const subjectWords = normalizeOption(cleanSubject).split(/\s+/).filter(Boolean);

    if (
      subjectWords.length > 5 ||
      looksLikeDefinitionFragmentTerm(cleanSubject, cleanQuestion) ||
      subjectWords.some((word) => quizQuestionSubjectBadWords.has(word))
    ) {
      return false;
    }
  }

  if (/^which term matches this definition:/i.test(cleanQuestion)) {
    const clue = cleanQuestion.replace(/^which term matches this definition:\s*/i, '');

    return (
      clue.split(/\s+/).filter(Boolean).length >= 4 &&
      clue.length <= 140 &&
      !isDirtyQuizText(clue)
    );
  }

  return normalized.length > 0;
}

function isDirtyQuizText(value: string) {
  const cleanValue = value.replace(/\s+/g, ' ').trim();
  const normalized = normalizeOption(cleanValue);
  const words = normalized.split(/\s+/).filter(Boolean);

  return (
    !normalized ||
    /\b(?:hardware vs|software vs|input receiving|processing working|storage saving|output showing|term definition)\b/i.test(cleanValue) ||
    /\b\d+\s*$/.test(cleanValue) ||
    words.length > 0 && quizDirtyEndWords.has(words[words.length - 1]) ||
    words.filter((word) => quizTableBleedWords.has(word)).length >= 2 ||
    /\b(?:input|processing|storage|output)\b.+\b(?:input|processing|storage|output)\b/i.test(cleanValue)
  );
}

function hasMeaningfullyDistinctQuizOptions(options: string[]) {
  const normalizedOptions = options.map(normalizeOption);

  for (let leftIndex = 0; leftIndex < normalizedOptions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedOptions.length; rightIndex += 1) {
      const left = normalizedOptions[leftIndex];
      const right = normalizedOptions[rightIndex];
      const shorter = left.length < right.length ? left : right;
      const longer = left.length < right.length ? right : left;

      if (!left || !right || left === right || (shorter.length >= 10 && longer.includes(shorter))) {
        return false;
      }
    }
  }

  return true;
}

function buildFallbackFlashcards(
  facts: LessonFact[],
  targetCount: number
) {
  const selectedFacts = takeUniqueFlashcardFacts(facts, targetCount);

  return selectedFacts
    .map((fact, index) => {
      const baseFront = cleanFlashcardFront(fact.term || fact.sourceText || `Lesson idea ${index + 1}`);
      const back = buildFlashcardBack(fact);

      return [
        `Front: ${baseFront}`,
        `Back: ${back}`,
      ].join('\n');
    })
    .join('\n\n');
}

function takeUniqueFlashcardFacts(facts: LessonFact[], targetCount: number) {
  const selected: LessonFact[] = [];
  const seenTerms = new Set<string>();
  const seenDetails = new Set<string>();

  for (const fact of facts) {
    const front = cleanFlashcardFront(fact.term || fact.sourceText);
    const frontKey = normalizeOption(front);
    const detailKey = normalizeOption(fact.detail).slice(0, 120);

    if (
      !frontKey ||
      seenTerms.has(frontKey) ||
      (detailKey && seenDetails.has(detailKey))
    ) {
      continue;
    }

    seenTerms.add(frontKey);

    if (detailKey) {
      seenDetails.add(detailKey);
    }

    selected.push(fact);

    if (selected.length >= targetCount) {
      break;
    }
  }

  return selected;
}

function cleanFlashcardFront(value: string) {
  const cleanValue = cleanStudyTerm(value)
    .replace(/[,.;:!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleanValue.split(/\s+/).filter(Boolean);
  const compactValue = words.slice(0, 5).join(' ');

  return shortText(compactValue || 'Lesson Idea', 40)
    .replace(/[,.;:!?]+$/g, '')
    .trim();
}

function buildFlashcardBack(fact: LessonFact) {
  const cleanDetail = capitalizeFirst(
    shortText(fact.detail.replace(/_____+/g, fact.term), 200)
  );

  return cleanDetail;
}

function capitalizeFirst(value: string) {
  const cleanValue = value.trim();

  if (!cleanValue) {
    return 'This card reviews an important lesson idea.';
  }

  return `${cleanValue.charAt(0).toUpperCase()}${cleanValue.slice(1)}`;
}

function buildFallbackQuizQuestion(
  fact: LessonFact,
  allFacts: LessonFact[],
  index: number,
  mode: StudyToolMode,
  questionStyle: QuizQuestionStyle = 'direct',
  occurrence = 1
) {
  if (mode === 'fill_blank') {
    return [
      `Question: ${buildFillBlankQuestion(fact)}`,
      `Answer: ${fact.term}`,
      `Explanation: ${shortText(fact.detail.replace(/_____+/g, fact.term), 170)}`,
    ].join('\n');
  }

  if (mode === 'essay') {
    return [
      `Question: Explain ${fact.term} in your own words.`,
      `Answer: ${shortText(fact.detail.replace(/_____+/g, fact.term), 210)}`,
      `Explanation: Include the main idea and one clear example.`,
    ].join('\n');
  }

  if (fact.kind === 'statement') {
    return null;
  }

  const asksForTerm = questionStyle === 'meaning' || questionStyle === 'term';
  const options = asksForTerm
    ? buildTermOptions(fact, allFacts, index)
    : buildDefinitionOptions(fact, allFacts, index);

  if (options.length >= 4) {
    const correctAnswer = asksForTerm
      ? cleanAnswerOption(fact.term)
      : cleanDefinitionOption(fact.detail.replace(/_____+/g, fact.term));
    const correctIndex = options.findIndex(
      (option) => normalizeOption(option) === normalizeOption(correctAnswer)
    );
    const answerLetter = String.fromCharCode(65 + Math.max(0, correctIndex));
    const correctOption = options[Math.max(0, correctIndex)] ?? correctAnswer;
    const questionText = asksForTerm
      ? buildTermAnswerQuestion(fact, questionStyle)
      : buildDefinitionAnswerQuestion(fact, questionStyle);

    return [
      `Question: ${buildReviewQuestionText(questionText, occurrence)}`,
      `A. ${options[0]}`,
      `B. ${options[1]}`,
      `C. ${options[2]}`,
      `D. ${options[3]}`,
      `Correct answer: ${answerLetter}. ${correctOption}`,
      `Explanation: ${shortText(fact.detail.replace(/_____+/g, fact.term), 170)}`,
    ].join('\n');
  }

  return null;
}

function buildFallbackQuizQuestions(
  facts: LessonFact[],
  mode: StudyToolMode,
  targetCount: number,
  variant: number
) {
  const selectedQuestions: string[] = [];
  const seenQuestions = new Set<string>();
  const styles = buildQuizQuestionStyles(facts.length, variant);
  const rotatedFacts = rotateItems(facts, variant);

  for (let index = 0; index < rotatedFacts.length; index += 1) {
    const fact = rotatedFacts[index];
    const question = buildFallbackQuizQuestion(
      fact,
      facts,
      index + variant,
      mode,
      styles[index] ?? 'direct',
      1
    );

    if (!question || !isValidStudyToolBlock('quiz', mode, question)) {
      continue;
    }

    const promptKey = normalizeOption(getStudyToolPrompt(question, 'quiz'));

    if (!promptKey || seenQuestions.has(promptKey)) {
      continue;
    }

    seenQuestions.add(promptKey);
    selectedQuestions.push(question);

    if (selectedQuestions.length >= targetCount) {
      return selectedQuestions;
    }
  }

  return selectedQuestions;
}

function buildReviewQuestionText(question: string, occurrence: number) {
  if (occurrence <= 1) {
    return question;
  }

  const prefixes = [
    'Another check:',
    'Practice check:',
  ];
  const prefix = prefixes[(occurrence - 2) % prefixes.length];

  return `${prefix} ${question.replace(/[?？]\s*$/, '?')}`;
}

function buildTermAnswerQuestion(
  fact: LessonFact,
  questionStyle: QuizQuestionStyle
) {
  const clue = cleanQuestionClue(fact.detail.replace(/_____+/g, fact.term));

  if (!clue) {
    return `Which term matches this definition: ${formatQuestionEnding(clue)}`;
  }

  const calledQuestion = buildCalledTermQuestion(clue, fact.term);

  if (calledQuestion) {
    return calledQuestion;
  }

  if (questionStyle === 'meaning') {
    return `What is the term for ${formatQuestionEnding(formatTermForClue(clue))}`;
  }

  return `Which term matches this definition: ${formatQuestionEnding(clue)}`;
}

function buildDefinitionAnswerQuestion(
  fact: LessonFact,
  questionStyle: QuizQuestionStyle
) {
  if (questionStyle === 'definition') {
    return `Which definition best matches ${fact.term}?`;
  }

  return `What is ${fact.term}?`;
}

function formatTermForClue(value: string) {
  const cleanValue = value.trim();

  if (/^(?:compares|describes|lets|allows|helps|stores|holds|tells|gives|uses|runs|repeats|controls|contains|represents)\b/i.test(cleanValue)) {
    return `something that ${cleanValue}`;
  }

  return cleanValue;
}

function buildFillBlankQuestion(fact: LessonFact) {
  if (fact.detail.includes('_____')) {
    return shortText(fact.detail, 150);
  }

  return `_____ means ${shortText(fact.detail, 135)}`;
}

function buildCalledTermQuestion(clue: string, term: string) {
  const match = clue.match(
    new RegExp(`^(.+?)\\s+(?:is|are)\\s+called\\s+${escapeRegExp(term)}$`, 'i')
  );

  if (!match) {
    return null;
  }

  return `What is ${formatQuestionSubject(match[1])} called?`;
}

function buildTermOptions(
  fact: LessonFact,
  allFacts: LessonFact[],
  index: number
) {
  const distractors = [
    ...allFacts
      .filter((item) => item.kind !== 'statement')
      .map((item) => item.term),
  ].filter((term) =>
    normalizeOption(term) !== normalizeOption(fact.term) &&
    isStrongQuizOption(term)
  );
  const uniqueDistractors = uniqueByNormalized(distractors).slice(0, 12);
  const selectedDistractors = rotateItems(uniqueDistractors, index).slice(0, 3);
  const paddedOptions = uniqueByNormalized([
    fact.term,
    ...selectedDistractors,
  ]).slice(0, 4);

  return rotateItems(paddedOptions, index).slice(0, 4);
}

function buildDefinitionOptions(
  fact: LessonFact,
  allFacts: LessonFact[],
  index: number
) {
  const correctDefinition = cleanDefinitionOption(fact.detail.replace(/_____+/g, fact.term));
  const distractors = allFacts
    .filter((item) => item.kind !== 'statement')
    .map((item) => cleanDefinitionOption(item.detail.replace(/_____+/g, item.term)))
    .filter((statement) => normalizeOption(statement) !== normalizeOption(correctDefinition));
  const options = uniqueDefinitionOptionsByNormalized([
    correctDefinition,
    ...rotateItems(distractors, index).slice(0, 3),
  ]).slice(0, 4);

  return rotateItems(options, index).slice(0, 4);
}

function cleanQuestionClue(value: string) {
  return shortText(value, 120)
    .replace(/\s+/g, ' ')
    .replace(/^(is|are|means|refers to|describes)\s+/i, '')
    .replace(/\b(?:in|on|at|from)\s+(?:the\s+)?page\s*\d{1,4}\b/gi, '')
    .replace(/\bpage\s*\d{1,4}\b/gi, '')
    .replace(/\b(?:according to|based on)\s+(?:the\s+)?(?:lesson|pdf|source|book|text)\b[:,]?\s*/gi, '')
    .replace(/\b(?:this|the)\s+(?:lesson|pdf|source|book|text)\s+(?:says|states|explains|shows)\s+that\s+/gi, '')
    .replace(/\b(?:this|the)\s+(?:lesson|pdf|source|book|text)\b/gi, 'this topic')
    .replace(/[.?!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDefinitionOption(value: string) {
  return sentenceCase(
    shortText(value, 150)
      .replace(/\s+/g, ' ')
      .replace(/[.?!]+$/g, '')
      .trim()
  );
}

function formatQuestionEnding(value: string) {
  const cleanValue = value
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '')
    .trim();

  if (!cleanValue) {
    return 'this idea?';
  }

  return `${lowercaseFirst(cleanValue)}?`;
}

function formatQuestionSubject(value: string) {
  const cleanValue = value
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '')
    .trim();

  return cleanValue ? lowercaseFirst(cleanValue) : 'this idea';
}

function cleanAnswerOption(value: string) {
  const cleanValue = value
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '')
    .trim();
  const words = cleanValue.split(/\s+/).filter(Boolean);

  if (words.length > 3) {
    return sentenceCase(cleanValue);
  }

  return cleanStudyTerm(cleanValue);
}

function buildQuizQuestionStyles(totalQuestions: number, variant: number) {
  if (totalQuestions <= 0) {
    return [];
  }

  const meaningCount = Math.max(1, Math.round(totalQuestions * meaningQuestionRatio));
  const styles = Array.from<QuizQuestionStyle>({ length: totalQuestions }).fill('direct');
  const spacing = Math.max(1, Math.floor(totalQuestions / meaningCount));

  for (let count = 0; count < meaningCount; count += 1) {
    const position = (variant + count * spacing) % totalQuestions;
    styles[position] = 'meaning';
  }

  return styles.map((style, index) => {
    if (style === 'meaning') {
      return style;
    }

    const pattern = (index + variant) % 4;

    if (pattern === 0) {
      return 'definition';
    }

    if (pattern === 1) {
      return 'term';
    }

    return 'direct';
  });
}

function sentenceCase(value: string) {
  const lower = value
    .split(/\s+/)
    .map((word) => word.length <= 3 && word === word.toUpperCase() ? word : word.toLowerCase())
    .join(' ');

  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function lowercaseFirst(value: string) {
  if (!value) {
    return value;
  }

  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rotateItems<T>(items: T[], offset: number) {
  if (items.length === 0) {
    return items;
  }

  const start = offset % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function uniqueByNormalized(items: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const item of items) {
    const cleanItem = cleanAnswerOption(item);
    const key = normalizeOption(cleanItem);

    if (!key || seen.has(key) || !isStrongQuizOption(cleanItem)) {
      continue;
    }

    seen.add(key);
    unique.push(cleanItem);
  }

  return unique;
}

function uniqueDefinitionOptionsByNormalized(items: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const item of items) {
    const cleanItem = cleanDefinitionOption(item);
    const key = normalizeOption(cleanItem);

    if (!key || seen.has(key) || !isStrongStatementOption(cleanItem)) {
      continue;
    }

    seen.add(key);
    unique.push(cleanItem);
  }

  return unique;
}

function takeUniqueQuizFacts(facts: LessonFact[], targetCount: number) {
  const selected: LessonFact[] = [];
  const seenTerms = new Set<string>();
  const seenDetails = new Set<string>();

  for (const fact of facts) {
    const term = cleanAnswerOption(fact.term);
    const detail = cleanDefinitionOption(fact.detail.replace(/_____+/g, fact.term));
    const termKey = normalizeOption(term);
    const detailKey = normalizeOption(detail).slice(0, 120);

    if (
      fact.kind === 'statement' ||
      !termKey ||
      !detailKey ||
      seenTerms.has(termKey) ||
      seenDetails.has(detailKey) ||
      !isStrongQuizOption(term) ||
      !isStrongStatementOption(detail) ||
      looksLikeDefinitionFragmentTerm(term, detail) ||
      isDirtyQuizText(term) ||
      isDirtyQuizText(detail) ||
      !isValidFlashcardPair(term, detail)
    ) {
      continue;
    }

    seenTerms.add(termKey);
    seenDetails.add(detailKey);
    selected.push({
      ...fact,
      term,
      detail,
    });

    if (selected.length >= targetCount) {
      break;
    }
  }

  return selected;
}

function looksLikeDefinitionFragmentTerm(term: string, detail: string) {
  const normalizedTerm = normalizeOption(term);
  const normalizedDetail = normalizeOption(detail);
  const termWords = normalizedTerm.split(/\s+/).filter(Boolean);
  const detailWords = normalizedDetail.split(/\s+/).filter(Boolean);

  if (termWords.length <= 1) {
    return false;
  }

  const startsLikeDefinition =
    quizDefinitionFragmentStarts.has(termWords[0] ?? '') ||
    termWords.some((word) => quizDefinitionFragmentVerbs.has(word));
  const termIsDetailPrefix =
    detailWords.length >= termWords.length &&
    detailWords.slice(0, termWords.length).join(' ') === normalizedTerm;

  return startsLikeDefinition || termIsDetailPrefix;
}

const weakQuizOptionWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'can',
  'concept',
  'do',
  'does',
  'every',
  'for',
  'from',
  'has',
  'have',
  'if',
  'in',
  'is',
  'it',
  'its',
  'just',
  'less',
  'like',
  'nothing',
  'of',
  'on',
  'one',
  'or',
  'others',
  'so',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'with',
]);

const quizDefinitionFragmentStarts = new Set([
  'a',
  'an',
  'the',
  'words',
  'word',
  'phrase',
  'phrases',
  'giving',
  'using',
  'used',
  'repetition',
  'opposite',
  'human',
  'extreme',
  'direct',
  'indirect',
]);

const quizDefinitionFragmentVerbs = new Set([
  'imitate',
  'imitates',
  'compare',
  'compares',
  'comparison',
  'giving',
  'using',
  'used',
  'meaning',
  'describe',
  'describes',
]);

const quizQuestionSubjectBadWords = new Set([
  'as',
  'like',
  'used',
  'using',
  'working',
  'saving',
  'showing',
  'received',
  'receiving',
  'stores',
  'store',
  'outputs',
  'inputs',
]);

const quizDirtyEndWords = new Set([
  'as',
  'vs',
  'and',
  'or',
  'the',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'for',
]);

const quizTableBleedWords = new Set([
  'input',
  'receiving',
  'processing',
  'working',
  'storage',
  'saving',
  'output',
  'showing',
  'operation',
  'example',
]);
