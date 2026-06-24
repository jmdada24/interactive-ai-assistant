import { formatStudentOutput } from '../../textCleanup';
import {
  cleanChunkText,
  isUsefulSentence,
  shortText,
  splitSentences,
  uniqueTexts,
} from '../chunks/text';

export type AnswerIntent = 'general' | 'grounded' | 'summary';

export function buildDirectGroundedAnswer(
  question: string,
  chunks: { text: string }[]
) {
  const queryTerms = getAnswerTerms(question);
  const definitionTopic = getDefinitionTopic(question);
  const isDefinitionQuestion = Boolean(definitionTopic);
  const directDefinition = definitionTopic
    ? findGlossaryDefinition(chunks, definitionTopic)
    : '';

  if (directDefinition) {
    return formatStudentOutput(directDefinition);
  }

  const snippets = uniqueTexts(
    chunks
      .flatMap((chunk) => splitSentences([chunk]))
      .filter(isUsefulSentence)
      .map((snippet) =>
        definitionTopic ? trimToTopicDefinition(snippet, definitionTopic) : snippet
      )
  );
  const rankedSnippets = snippets
    .map((snippet, index) => ({
      snippet,
      score: scoreAnswerSnippet(
        snippet,
        queryTerms,
        definitionTopic,
        index
      ),
    }))
    .sort((left, right) => right.score - left.score);
  const definitionSnippets = isDefinitionQuestion
    ? rankedSnippets.filter(({ snippet }) =>
      isDefinitionForTopic(snippet, definitionTopic)
    )
    : [];
  const bestRankedSnippet = definitionSnippets[0] ?? rankedSnippets[0];
  const bestSnippet = bestRankedSnippet &&
    (
      isDefinitionQuestion
        ? isDefinitionForTopic(bestRankedSnippet.snippet, definitionTopic)
        : queryTerms.length === 0 || bestRankedSnippet.score > 0.5
    )
    ? bestRankedSnippet.snippet
    : queryTerms.length === 0
      ? chunks.map((chunk) => cleanChunkText(chunk.text)).find(Boolean)
      : undefined;

  if (!bestSnippet) {
    return '';
  }

  const support = rankedSnippets
    .filter(({ snippet, score }) => {
      if (snippet === bestSnippet) {
        return false;
      }

      if (
        isDefinitionQuestion &&
        hasDefinitionCue(snippet) &&
        !isDefinitionForTopic(snippet, definitionTopic)
      ) {
        return false;
      }

      return queryTerms.length === 0 ? score > -0.1 : score > 0.35;
    })
    .slice(0, 3)
    .map(({ snippet }) => `- ${shortText(snippet, 150)}`);

  return formatStudentOutput([
    shortText(bestSnippet, 220),
    support.length > 0 ? '' : null,
    support.length > 0 ? 'Important points' : null,
    ...support,
  ].filter(Boolean).join('\n'));
}

export function buildMissingDefinitionAnswer(question: string) {
  const definitionTopic = getDefinitionTopic(question);

  if (!definitionTopic) {
    return '';
  }

  return formatStudentOutput([
    `I could not find a clear definition of ${definitionTopic} in this lesson yet.`,
  ].join('\n'));
}

export function buildPdfSummary(chunks: { text: string; score?: number }[]) {
  const sentences = splitSentences(chunks).filter(
    (sentence) => !looksLikeTableOfContentsLine(sentence)
  );
  const cleanSentences = uniqueTexts(sentences).slice(0, 7);
  const mainIdea = cleanSentences[0] ?? getFirstUsefulChunkText(chunks);
  const bullets = cleanSentences
    .slice(mainIdea ? 1 : 0, 7)
    .slice(0, 5)
    .map((sentence) => `- ${shortText(sentence, 170)}`);

  if (bullets.length === 0) {
    return formatStudentOutput([
      'Here is a quick summary of your lesson.',
      '',
      'Main idea',
      shortText(mainIdea, 190),
    ].join('\n'));
  }

  return formatStudentOutput([
    'Here is a quick summary of your lesson.',
    '',
    'Main idea',
    shortText(mainIdea, 190),
    '',
    'Important points',
    ...bullets,
    '',
    `Remember this: ${shortText(bullets[0].replace(/^-\s*/, ''), 150)}`,
  ].join('\n'));
}

export function buildPdfOverviewSummary(overviewText: string) {
  const sentences = uniqueTexts(
    splitSentences([{ text: overviewText }])
      .map(removePageLead)
      .filter((sentence) => !looksLikeTableOfContentsLine(sentence))
  ).slice(0, 8);
  const mainIdea = sentences[0] ?? removePageLead(overviewText);
  const bullets = sentences
    .slice(mainIdea ? 1 : 0)
    .slice(0, 4)
    .map((sentence) => `- ${shortText(sentence, 170)}`);

  if (!mainIdea) {
    return '';
  }

  if (bullets.length === 0) {
    return formatStudentOutput([
      'Here is a quick summary of your lesson.',
      '',
      'Main idea',
      shortText(mainIdea, 220),
    ].join('\n'));
  }

  return formatStudentOutput([
    'Here is a quick summary of your lesson.',
    '',
    'Main idea',
    shortText(mainIdea, 220),
    '',
    'Important points',
    ...bullets,
  ].join('\n'));
}

export function getAnswerIntent(question: string, hasSources: boolean): AnswerIntent {
  if (
    isSummaryRequest(question) ||
    isGenericSourceOverviewRequest(question) ||
    (hasSources && isTopicOverviewRequest(question))
  ) {
    return 'summary';
  }

  if (isExplicitLessonRequest(question)) {
    return 'grounded';
  }

  if (isGeneralKnowledgeRequest(question)) {
    return 'general';
  }

  return hasSources ? 'grounded' : 'general';
}

export function isBadGroundedAnswer(answer: string) {
  const normalized = answer.toLowerCase();

  return (
    normalized.trim().length < 12 ||
    normalized.includes('no pdf') ||
    normalized.includes('pdf included') ||
    normalized.includes('no document') ||
    normalized.includes('no file') ||
    normalized.includes('not provided') ||
    normalized.includes('lesson context:') ||
    normalized.includes('student question:') ||
    normalized.includes('chunk_id') ||
    normalized.includes('retrieval score') ||
    /^(i found (this|a|the)|a helpful detail is|according to (the|your) (pdf|lesson|source))/i.test(
      normalized.trim()
    )
  );
}

function removePageLead(text: string) {
  return text
    .replace(/^page\s+\d+\s*:?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findGlossaryDefinition(chunks: { text: string }[], topic: string) {
  const topicForms = getTopicForms(topic);

  for (const chunk of chunks) {
    const cleanText = cleanChunkText(chunk.text);

    for (const form of topicForms) {
      const definition = extractDefinitionAfterTopic(cleanText, form);

      if (definition) {
        return formatDefinitionSentence(form, definition);
      }
    }
  }

  return '';
}

function extractDefinitionAfterTopic(text: string, topic: string) {
  const cleanText = text
    .replace(/\bterm\s+definition\b/gi, ' ')
    .replace(new RegExp(`\\*\\*${escapeRegExp(topic)}\\*\\*\\s*:\\s*`, 'i'), `${topic} `)
    .replace(/\s+/g, ' ')
    .trim();
  const pattern = new RegExp(`\\b${escapeRegExp(topic)}\\b\\s+`, 'gi');
  const matches = [...cleanText.matchAll(pattern)];

  if (matches.length === 0) {
    return '';
  }

  for (const match of matches) {
    const beforeTopic = cleanText.slice(0, match.index).trim();
    const previousWord = beforeTopic.split(/\s+/).filter(Boolean).pop() ?? '';
    const previousWordIsLowercase = /^[a-z]+$/.test(previousWord);

    if (
      previousWordIsLowercase &&
      !['a', 'an', 'the', 'term', 'definition'].includes(previousWord.toLowerCase())
    ) {
      continue;
    }

    const afterTopic = cleanText.slice(match.index + match[0].length).trim();
    const directDefinition =
      /^((?:is|are|means|refers\s+to|describes|is\s+called|can\s+be\s+defined\s+as)\b.+)$/i.exec(
        afterTopic
      )?.[1] ??
      extractGlossaryDefinitionText(afterTopic);

    if (!directDefinition) {
      continue;
    }

    const firstSentence = directDefinition
      .split(/(?<=[.!?])\s+/)[0]
      ?.trim()
      .replace(/\s+/g, ' ');

    if (!firstSentence || firstSentence.split(/\s+/).length < 3) {
      continue;
    }

    if (looksLikeTableOfContentsLine(firstSentence)) {
      continue;
    }

    return firstSentence;
  }

  return '';
}

function extractGlossaryDefinitionText(textAfterTopic: string) {
  const cleanText = textAfterTopic
    .replace(/^[:\-–—]\s*/, '')
    .trim();

  if (!/^(a|an|the|words?|giving|repetition|opposite|human|extreme|direct|indirect)\b/i.test(cleanText)) {
    return '';
  }

  const firstSentence = cleanText
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim();

  if (!firstSentence || firstSentence.split(/\s+/).length < 3) {
    return '';
  }

  return firstSentence;
}

function formatDefinitionSentence(topic: string, definition: string) {
  const cleanDefinition = definition
    .replace(/^(?:is|are|means|refers\s+to|describes|is\s+called|can\s+be\s+defined\s+as)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedTopic = normalizeAnswerText(topic);
  const displayTopic = normalizedTopic;
  const lowerDefinition = lowerFirst(cleanDefinition);

  if (!cleanDefinition) {
    return '';
  }

  if (/^(a|an|the)\s+/i.test(cleanDefinition)) {
    return `${articleFor(displayTopic)} ${displayTopic} is ${lowerDefinition}`;
  }

  return `${capitalize(displayTopic)} means ${lowerDefinition}`;
}

function articleFor(topic: string) {
  return /^[aeiou]/i.test(topic) ? 'An' : 'A';
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lowerFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function scoreAnswerSnippet(
  snippet: string,
  queryTerms: string[],
  definitionTopic: string,
  originalIndex: number
) {
  const normalized = normalizeAnswerText(snippet);
  const matchedTerms = queryTerms.filter((term) => normalized.includes(term));
  const coverage = queryTerms.length > 0
    ? matchedTerms.length / queryTerms.length
    : 0;
  const definitionBonus = definitionTopic && isDefinitionForTopic(snippet, definitionTopic)
    ? 5
    : 0;
  const wrongDefinitionPenalty = definitionTopic &&
    hasDefinitionCue(snippet) &&
    !isDefinitionForTopic(snippet, definitionTopic)
    ? 4
    : 0;
  const directnessPenalty = /^(page\s+\d+|section:|the importance of|you may|in this (lesson|chapter))/i.test(
    normalized
  )
    ? 1
    : 0;
  const motivationalIntroPenalty = isMotivationalIntroSnippet(normalized) ? 4 : 0;

  return coverage * 5 +
    definitionBonus -
    wrongDefinitionPenalty -
    directnessPenalty -
    motivationalIntroPenalty -
    originalIndex * 0.01;
}

function trimToTopicDefinition(snippet: string, topic: string) {
  const forms = getTopicForms(topic);

  for (const form of forms) {
    const pattern = new RegExp(
      `\\b(?:an?\\s+|the\\s+)?${escapeRegExp(form)}\\s+(?:is|are|means|refers\\s+to|describes|is\\s+called|can\\s+be\\s+defined\\s+as)\\b`,
      'i'
    );
    const match = pattern.exec(snippet);

    if (match?.index !== undefined) {
      return snippet.slice(match.index).trim();
    }
  }

  return snippet;
}

function isDefinitionForTopic(snippet: string, topic: string) {
  const normalized = normalizeAnswerText(snippet);

  return getTopicForms(topic).some((form) => {
    const escapedForm = escapeRegExp(form);

    return new RegExp(
      `\\b(?:a\\s+|an\\s+|the\\s+)?${escapedForm}\\s+(?:is|are|means|refers\\s+to|describes|is\\s+called|can\\s+be\\s+defined\\s+as)\\b`
    ).test(normalized);
  });
}

function hasDefinitionCue(snippet: string) {
  return /\b(is|are|means|refers\s+to|defined\s+as|describes|is\s+called)\b/i.test(
    snippet
  );
}

function getTopicForms(topic: string) {
  const normalizedTopic = normalizeAnswerText(topic);
  const forms = new Set([normalizedTopic]);
  const words = normalizedTopic.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1];

  if (lastWord) {
    const prefix = words.slice(0, -1).join(' ');

    if (lastWord.endsWith('s') && lastWord.length > 3) {
      forms.add([prefix, lastWord.slice(0, -1)].filter(Boolean).join(' '));
    } else {
      forms.add([prefix, `${lastWord}s`].filter(Boolean).join(' '));
    }
  }

  return [...forms].filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isMotivationalIntroSnippet(normalizedText: string) {
  return (
    normalizedText.includes('you have taken your first step') ||
    normalizedText.includes('you do not need to run these right now') ||
    normalizedText.includes('just read and understand what they do')
  );
}

function getDefinitionTopic(question: string) {
  const match = question.match(
    /^\s*(?:what|who)\s+(?:is|are|was|were)\s+(.+?)[?.!]*\s*$/i
  );

  return match
    ? normalizeAnswerText(match[1]).replace(/^(?:a|an|the)\s+/, '')
    : '';
}

function getAnswerTerms(question: string) {
  return Array.from(
    new Set(
      normalizeAnswerText(question)
        .split(/\s+/)
        .filter((term) => term.length > 2 && !answerStopWords.has(term))
    )
  ).slice(0, 10);
}

function normalizeAnswerText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const answerStopWords = new Set([
  'about',
  'according',
  'alab',
  'book',
  'can',
  'chapter',
  'could',
  'does',
  'detail',
  'details',
  'explain',
  'file',
  'from',
  'give',
  'just',
  'lesson',
  'material',
  'pdf',
  'pdfs',
  'please',
  'source',
  'sources',
  'tell',
  'that',
  'this',
  'thing',
  'things',
  'topic',
  'topics',
  'uploaded',
  'what',
  'when',
  'where',
  'which',
  'with',
  'would',
  'you',
]);

function isSummaryRequest(question: string) {
  const normalized = question.toLowerCase();

  return (
    normalized.includes('summarize') ||
    normalized.includes('summarise') ||
    normalized.includes('summaries') ||
    normalized.includes('summary') ||
    normalized.includes('sum up') ||
    normalized.includes('overview') ||
    normalized.includes('main idea') ||
    normalized.includes('topics about the pdf') ||
    normalized.includes('topics in the pdf') ||
    normalized.includes('topics from the pdf') ||
    normalized.includes('what is this pdf about') ||
    normalized.includes('what is the pdf about')
  );
}

function isTopicOverviewRequest(question: string) {
  const normalized = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    /\b(topics?|contents?|parts?|ideas?)\b/.test(normalized) &&
    (
      /\b(summary|summarize|summarise|summaries|tell|give|list|show|what|about)\b/.test(normalized) ||
      normalized.split(/\s+/).filter(Boolean).length <= 8
    )
  );
}

export function isGenericSourceOverviewRequest(question: string) {
  const normalized = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hasSourceReference =
    /\b(pdf|pdfs|source|sources|lesson|book|material|uploaded)\b/.test(normalized);
  const hasSpecificPointer = /\b(page|chapter|section|module|unit)\s*\d+\b/.test(normalized);
  const asksForOverview =
    /\b(tell|give|show|list|describe|summarize|summarise|summary|summaries)\b/.test(normalized) ||
    /\b(things|topics|topic|details|information|overview|about)\b/.test(normalized);
  const contentTerms = normalized
    .split(/\s+/)
    .filter((term) => term.length > 2 && !answerStopWords.has(term));

  return hasSourceReference && asksForOverview && !hasSpecificPointer && contentTerms.length <= 2;
}

function looksLikeTableOfContentsLine(text: string) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const chapterMentions = normalized.match(/\bchapter\s+\d+\b/g)?.length ?? 0;

  return (
    normalized.includes('table of contents') ||
    chapterMentions >= 2 ||
    /\bchapter\s+\d+\s+.+\bchapter\s+\d+\b/.test(normalized)
  );
}

function getFirstUsefulChunkText(chunks: { text: string }[]) {
  const cleanChunk = chunks
    .map((chunk) => cleanChunkText(chunk.text))
    .find((text) => text && !looksLikeTableOfContentsLine(text));

  return shortText(cleanChunk ?? chunks[0]?.text ?? '', 180);
}

function isExplicitLessonRequest(question: string) {
  const normalized = question.toLowerCase();

  return (
    /\b(this|the|my|our)\s+(lesson|book|pdf|source|sources|module|chapter|material|textbook)\b/.test(normalized) ||
    /\bfrom\s+(the|this|my|our)?\s*(lesson|book|pdf|source|sources|module|chapter|material|textbook)\b/.test(normalized) ||
    /\baccording to\s+(the|this|my|our)?\s*(lesson|book|pdf|source|sources|module|chapter|material|textbook)\b/.test(normalized) ||
    normalized.includes('in the uploaded') ||
    normalized.includes('in your uploaded') ||
    normalized.includes('based on the lesson') ||
    normalized.includes('based on my lesson')
  );
}

function isGeneralKnowledgeRequest(question: string) {
  const normalized = question.toLowerCase();

  if (
    /\b(java|javascript|python|html|css|sql|c\+\+|c#|code|program|function|class|algorithm)\b/.test(normalized) ||
    /\b(write|create|make|give me|show me)\b.+\b(code|program|example|template|letter|essay|story|sentence|paragraph)\b/.test(normalized) ||
    /\btranslate\b|\bgrammar\b|\brewrite\b|\bproofread\b/.test(normalized)
  ) {
    return true;
  }

  return /^[\d\s+\-*/().=]+$/.test(normalized.trim());
}
