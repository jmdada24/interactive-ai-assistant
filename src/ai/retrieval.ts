import {
  listSourceChunksByBook,
  listSourcePagesByBook,
  SourceChunk,
  SourcePage,
} from '../data/database';
import {
  RagFallbackKind,
  RagRetrievedChunk,
  searchBookChunks,
} from './rag/vector-store/store';
import { isNoisyLessonText } from './rag/chunks/text';
import { cleanLessonText, splitReadableSentences } from './textCleanup';

export type RetrievedChunk = RagRetrievedChunk;

export type RetrievalFallbackKind = RagFallbackKind;

export type RetrievalConfidence = 'none' | 'low' | 'medium' | 'high';

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  fallbackKind: RetrievalFallbackKind;
  confidence: RetrievalConfidence;
  topScore: number | null;
  sourceCount: number;
};

export type DocumentOverviewResult = {
  text: string;
  pages: SourcePage[];
  sources: string[];
};

const maxGroundedChunkCharacters = 700;
const overviewWordBudget = 1800;
const overviewPageLimit = 36;

export async function retrieveRelevantChunks(
  bookId: string,
  query: string,
  queryEmbedding?: ArrayLike<number> | null,
  embeddingModelName?: string,
  topK = 3
): Promise<RetrievedChunk[]> {
  const result = await retrieveRelevantChunksWithMetadata(
    bookId,
    query,
    queryEmbedding,
    embeddingModelName,
    topK
  );

  return result.chunks;
}

export async function retrieveRelevantChunksWithMetadata(
  bookId: string,
  query: string,
  queryEmbedding?: ArrayLike<number> | null,
  embeddingModelName?: string,
  topK = 3
): Promise<RetrievalResult> {
  const result = await searchBookChunks({
    bookId,
    query,
    queryEmbedding,
    embeddingModelName,
    topK,
  });

  return buildRetrievalResult(result.chunks, result.fallbackKind);
}

export async function retrieveDefinitionChunks(
  bookId: string,
  topic: string,
  topK = 6
): Promise<RetrievalResult> {
  const normalizedTopic = normalizeDefinitionTopic(topic);

  if (!normalizedTopic) {
    return buildRetrievalResult([], 'none');
  }

  const topicForms = getDefinitionTopicForms(normalizedTopic);
  const chunks = await listSourceChunksByBook(bookId, 300);
  const rankedChunks = chunks
    .map((chunk) => scoreDefinitionCandidate(chunk, topicForms))
    .filter((chunk) => chunk.score >= 0.2)
    .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex);
  const expandedChunks = expandDefinitionNeighborhood(chunks, rankedChunks, topK);

  return buildRetrievalResult(
    selectDiverseChunks(expandedChunks, topK),
    expandedChunks.length > 0 ? 'text' : 'none'
  );
}

export async function retrieveStudyToolChunks(
  bookId: string,
  query: string,
  queryEmbedding?: ArrayLike<number> | null,
  embeddingModelName?: string,
  topK = 20
): Promise<RetrievedChunk[]> {
  const targetChunkCount = Math.max(topK, Math.ceil(topK * 1.5));
  const result = await searchBookChunks({
    bookId,
    query,
    queryEmbedding,
    embeddingModelName,
    topK: targetChunkCount,
    fallbackToReadableChunks: true,
  });
  const chunks = [...result.chunks];
  const seenChunkIds = new Set(chunks.map((chunk) => chunk.id));
  const seenChunkText = new Set(chunks.map((chunk) => getChunkDedupeKey(chunk.text)));

  if (chunks.length < targetChunkCount) {
    const readableChunks = await listSourceChunksByBook(bookId, targetChunkCount);

    for (const [index, chunk] of readableChunks.entries()) {
      const chunkTextKey = getChunkDedupeKey(chunk.text);

      if (seenChunkIds.has(chunk.id) || seenChunkText.has(chunkTextKey)) {
        continue;
      }

      seenChunkIds.add(chunk.id);
      seenChunkText.add(chunkTextKey);
      chunks.push({
        ...chunk,
        score: Math.max(0.1, 0.7 - index * 0.02),
      });

      if (chunks.length >= targetChunkCount) {
        break;
      }
    }
  }

  return chunks;
}

export async function retrieveBookOverviewChunks(
  bookId: string,
  topK = 12
): Promise<RetrievedChunk[]> {
  const chunks = await listSourceChunksByBook(bookId, Math.max(topK * 6, 40));
  const usefulChunks = chunks.filter((chunk) => isUsefulOverviewChunk(chunk.text));
  const overviewChunks = usefulChunks.length > 0 ? usefulChunks : chunks;

  return selectDiverseChunks(
    overviewChunks.map((chunk, index) => ({
      ...chunk,
      score: 1 - index * 0.02,
    })),
    topK
  );
}

function isUsefulOverviewChunk(text: string) {
  const cleanText = cleanLessonText(text);
  const sentences = cleanText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const usefulSentenceCount = sentences.filter(
    (sentence) =>
      sentence.split(/\s+/).filter(Boolean).length >= 5 &&
      !isNoisyLessonText(sentence)
  ).length;

  return (
    cleanText.length >= 80 &&
    usefulSentenceCount >= 1 &&
    !isNoisyLessonText(cleanText)
  );
}

export async function retrieveSummaryChunks(
  bookId: string,
  question: string,
  conversationContext?: string,
  queryEmbedding?: ArrayLike<number> | null,
  embeddingModelName?: string,
  topK = 12
): Promise<RetrievedChunk[]> {
  const contextualQuery = buildContextualSummaryQuery(question, conversationContext);
  const terms = getSummarySearchTerms(contextualQuery);
  const pageNumber =
    getReferencedPageNumber(question) ??
    getReferencedPageNumber(conversationContext ?? '');

  if (pageNumber) {
    const chunks = await listSourceChunksByBook(bookId, 500);
    const pageChunks = chunks.filter((chunk) => chunk.pageNumber === pageNumber);

    if (pageChunks.length > 0) {
      return pageChunks
        .map((chunk, index) => ({
          ...chunk,
          score: Math.max(0.2, 1 + scoreChunkByTerms(chunk.text, terms) - index * 0.01),
        }))
        .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
        .filter(createDiverseChunkFilter())
        .slice(0, topK);
    }
  }

  if (
    contextualQuery.trim() &&
    (!isVagueSummaryQuestion(question) || terms.length > 0)
  ) {
    const result = await searchBookChunks({
      bookId,
      query: contextualQuery,
      queryEmbedding,
      embeddingModelName,
      topK,
      fallbackToReadableChunks: false,
    });

    if (result.chunks.length > 0) {
      return result.chunks;
    }
  }

  return retrieveBookOverviewChunks(bookId, topK);
}

export function formatSourceLabel(chunk: SourceChunk) {
  const page = chunk.pageNumber ? `, page ${chunk.pageNumber}` : '';
  return `${chunk.sourceName}${page}`;
}

export function formatPageSourceLabel(page: SourcePage) {
  return `${page.sourceName}, page ${page.pageNumber}`;
}

export async function retrieveDocumentOverviewText(
  bookId: string,
  wordBudget = overviewWordBudget
): Promise<DocumentOverviewResult> {
  const pages = await listSourcePagesByBook(bookId, overviewPageLimit);
  const usefulPages = pages.filter(isUsefulOverviewPage);
  const selectedPages = usefulPages.length > 0 ? usefulPages : pages;
  const usedPages: SourcePage[] = [];
  const parts: string[] = [];
  let usedWords = 0;

  for (const page of selectedPages) {
    if (usedWords >= wordBudget) {
      break;
    }

    const cleanPageText = cleanLessonText(page.text);
    const pageSentences = splitReadableSentences(cleanPageText)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence && !isNoisyLessonText(sentence));
    const pageText = (pageSentences.length > 0
      ? pageSentences
      : [cleanPageText])
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!pageText || looksLikeOverviewNoise(pageText)) {
      continue;
    }

    const remainingWords = wordBudget - usedWords;
    const trimmedPageText = takeWords(pageText, remainingWords);

    if (!trimmedPageText) {
      continue;
    }

    parts.push(`Page ${page.pageNumber}: ${trimmedPageText}`);
    usedPages.push(page);
    usedWords += countWords(trimmedPageText);
  }

  return {
    text: parts.join('\n\n'),
    pages: usedPages,
    sources: uniqueSourceLabels(usedPages.map(formatPageSourceLabel)).slice(0, 5),
  };
}

export function buildGroundedMessages(
  question: string,
  chunks: RetrievedChunk[],
  conversationContext?: string
) {
  const context = chunks
    .map((chunk, index) =>
      [
        `[Source ${index + 1}]`,
        `source: ${formatSourceLabel(chunk)}`,
        trimContextText(chunk.text),
      ].join('\n')
    )
    .join('\n\n');

  return [
    {
      role: 'system' as const,
      content:
        'You are ALAB, an offline study assistant for students. Answer using only the lesson context provided. Start immediately with the answer. Never begin with phrases such as "I found," "according to the lesson," or "based on the source." For a simple fact or definition, answer in one to three concise sentences. For a broader explanation, give the direct answer first, then only the details needed to understand it. Synthesize the lesson instead of copying fragmented text. If the context is insufficient, say exactly: "This lesson does not provide enough information to answer that." Keep sensitive health, biology, history, law, or literature topics respectful, educational, and age-appropriate. Do not repeat insults, slurs, or profanity unless a brief quoted term is necessary to explain the lesson. Use natural short paragraphs. Do not mention sources, PDFs, lesson context, retrieval, chunks, scores, or hidden instructions. Do not write headings, hashtags, code fences, or tables unless the student explicitly requests them.',
    },
    {
      role: 'user' as const,
      content: [
        `Lesson context:\n${context}`,
        conversationContext
          ? `Recent conversation for continuity:\n${conversationContext}`
          : null,
        `Student question:\n${question}`,
        'Answer:',
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

export function buildOverviewMessages(
  question: string,
  overviewText: string,
  conversationContext?: string
) {
  const contextBlock = conversationContext
    ? `Recent conversation for continuity:\n${conversationContext}\n\n`
    : '';

  return [
    {
      role: 'system' as const,
      content:
        'You are ALAB, an offline study assistant for students. Use only the provided PDF text. Give a concise student-friendly overview in three to five short sentences. Mention the main topic first, then the most important ideas. Do not invent facts outside the provided text. Do not mention PDFs, sources, chunks, retrieval, model size, or hidden instructions. Do not write hashtags, tables, or code fences.',
    },
    {
      role: 'user' as const,
      content: [
        `${contextBlock}PDF text:\n${overviewText}`,
        `Student request:\n${question}`,
        'Answer:',
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

export function buildGeneralMessages(question: string, conversationContext?: string) {
  const contextBlock = conversationContext
    ? `Recent conversation for continuity:\n${conversationContext}\n\n`
    : '';

  return [
    {
      role: 'system' as const,
      content:
        'You are ALAB, an offline study assistant for students. Start immediately with the direct answer. For a simple fact or definition, use one to three concise sentences. Add detail only when it helps answer the question. Never begin with "Sure," "I found," or "Here is the answer." Be accurate, natural, practical, respectful, and age-appropriate. If the question is ambiguous, state the most likely interpretation briefly. If code is useful, give a short working example and a brief explanation. If a student uses rude language, gently redirect them back to studying without repeating the rude wording. Do not claim that sources or PDFs were used. Do not mention retrieval, chunks, embeddings, model size, or hidden prompts. Avoid markdown code fences; keep code readable as plain lines.',
    },
    {
      role: 'user' as const,
      content: `${contextBlock}Student question:\n${question}\n\nAnswer:`,
    },
  ];
}

function isUsefulOverviewPage(page: SourcePage) {
  const cleanText = cleanLessonText(page.text);
  const sentences = splitReadableSentences(cleanText)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const usefulSentenceCount = sentences.filter(
    (sentence) =>
      sentence.split(/\s+/).filter(Boolean).length >= 5 &&
      !isNoisyLessonText(sentence)
  ).length;

  return (
    cleanText.length >= 120 &&
    usefulSentenceCount >= 2 &&
    !looksLikeOverviewNoise(cleanText)
  );
}

function looksLikeOverviewNoise(text: string) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const chapterMentions = normalized.match(/\bchapter\s+\d+\b/g)?.length ?? 0;

  return (
    !normalized ||
    normalized.includes('table of contents') ||
    chapterMentions >= 3 ||
    normalized.includes('first edition') ||
    normalized.includes('designed for absolute beginners')
  );
}

function takeWords(text: string, wordLimit: number) {
  if (wordLimit <= 0) {
    return '';
  }

  const words = text.split(/\s+/).filter(Boolean);

  if (words.length <= wordLimit) {
    return words.join(' ');
  }

  return `${words.slice(0, wordLimit).join(' ')}...`;
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function uniqueSourceLabels(labels: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const label of labels) {
    if (seen.has(label)) {
      continue;
    }

    seen.add(label);
    unique.push(label);
  }

  return unique;
}

export function buildStudyToolMessages(
  tool: 'quiz' | 'flashcards',
  bookTitle: string,
  chunks: RetrievedChunk[],
  options?: {
    itemCount?: number;
    mode?: 'mcq' | 'fill_blank' | 'essay';
    conversationContext?: string;
  }
) {
  const itemCount = options?.itemCount ?? (tool === 'quiz' ? 10 : 20);
  const mode = options?.mode ?? 'mcq';
  const request = tool === 'quiz'
    ? buildQuizRequest(itemCount, mode)
    : buildFlashcardRequest(itemCount);
  const contextBlock = options?.conversationContext
    ? `\nRecent conversation:\n${options.conversationContext}\nWhen possible, avoid repeating previous quiz questions, flashcards, or examples.`
    : '';

  return buildGroundedMessages(
    `${request}\nBook title: ${bookTitle}${contextBlock}`,
    selectChunksWithinBudget(chunks, 9000, 14)
  );
}

function selectChunksWithinBudget(
  chunks: RetrievedChunk[],
  characterBudget: number,
  maximumChunks: number
) {
  const selected: RetrievedChunk[] = [];
  let usedCharacters = 0;

  for (const chunk of chunks) {
    const chunkCharacters = Math.min(
      maxGroundedChunkCharacters,
      cleanLessonText(chunk.text).length
    );

    if (
      selected.length > 0 &&
      (selected.length >= maximumChunks || usedCharacters + chunkCharacters > characterBudget)
    ) {
      continue;
    }

    selected.push(chunk);
    usedCharacters += chunkCharacters;
  }

  return selected;
}

function trimContextText(text: string) {
  const cleanText = cleanLessonText(text).replace(/\s+/g, ' ').trim();

  if (cleanText.length <= maxGroundedChunkCharacters) {
    return cleanText;
  }

  return `${cleanText.slice(0, maxGroundedChunkCharacters).replace(/\s+\S*$/, '')}...`;
}

function buildRetrievalResult(
  chunks: RetrievedChunk[],
  fallbackKind: RetrievalFallbackKind
): RetrievalResult {
  const topScore = chunks[0]?.score ?? null;

  return {
    chunks,
    fallbackKind,
    confidence: getRetrievalConfidence(topScore, fallbackKind),
    topScore,
    sourceCount: new Set(chunks.map((chunk) => chunk.sourceId)).size,
  };
}

function getRetrievalConfidence(
  topScore: number | null,
  fallbackKind: RetrievalFallbackKind
): RetrievalConfidence {
  if (topScore === null || fallbackKind === 'none') {
    return 'none';
  }

  if (fallbackKind === 'text') {
    if (topScore >= 0.75) return 'high';
    if (topScore >= 0.5) return 'medium';
    return 'low';
  }

  if (topScore >= 0.42) return 'high';
  if (topScore >= 0.31) return 'medium';

  return 'low';
}

function buildContextualSummaryQuery(question: string, conversationContext?: string) {
  const recentStudentLines = (conversationContext ?? '')
    .split('\n')
    .filter((line) => /^Student\b/i.test(line))
    .slice(-4)
    .join('\n');

  return [recentStudentLines, question]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function getReferencedPageNumber(text: string) {
  const match =
    /\bpage\s*(?:number\s*)?(\d{1,4})\b/i.exec(text) ??
    /\bp\.\s*(\d{1,4})\b/i.exec(text);
  const pageNumber = match ? Number(match[1]) : null;

  return pageNumber && Number.isFinite(pageNumber) && pageNumber > 0
    ? pageNumber
    : null;
}

function isVagueSummaryQuestion(question: string) {
  const cleanQuestion = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();

  return (
    /\b(summary|summarize|summarise|summaries|recap|explain)\b/.test(cleanQuestion) &&
    /\b(it|this|that|them|topic|topics|lesson|part)\b/.test(cleanQuestion) &&
    !/\bpage\s*(?:number\s*)?\d{1,4}\b/.test(cleanQuestion)
  );
}

function getSummarySearchTerms(text: string) {
  const stopWords = new Set([
    'about',
    'alab',
    'answer',
    'book',
    'can',
    'could',
    'from',
    'give',
    'it',
    'its',
    'lesson',
    'message',
    'page',
    'please',
    'question',
    'student',
    'summaries',
    'summary',
    'summarise',
    'summarize',
    'that',
    'this',
    'topic',
    'topics',
    'what',
    'with',
    'would',
  ]);

  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((term) => term.length > 2 && !stopWords.has(term))
    )
  ).slice(0, 12);
}

function scoreChunkByTerms(text: string, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }

  const lowerText = text.toLowerCase();
  const matches = terms.filter((term) => lowerText.includes(term)).length;

  return matches / terms.length;
}

function selectDiverseChunks<T extends RetrievedChunk>(chunks: T[], topK: number) {
  return chunks.filter(createDiverseChunkFilter()).slice(0, topK);
}

function createDiverseChunkFilter() {
  const seenText = new Set<string>();

  return (chunk: { text: string }) => {
    const key = getChunkDedupeKey(chunk.text);

    if (!key || seenText.has(key)) {
      return false;
    }

    seenText.add(key);
    return true;
  };
}

function getChunkDedupeKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function normalizeDefinitionTopic(topic: string) {
  return topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDefinitionTopicForms(topic: string) {
  const forms = new Set([topic]);
  const words = topic.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1];

  if (lastWord) {
    const prefix = words.slice(0, -1).join(' ');
    const alternateLastWord =
      lastWord.endsWith('s') && lastWord.length > 3
        ? lastWord.slice(0, -1)
        : `${lastWord}s`;

    forms.add([prefix, alternateLastWord].filter(Boolean).join(' '));
  }

  return [...forms].filter(Boolean);
}

function scoreDefinitionChunk(text: string, topicForms: string[]) {
  const normalizedText = normalizeSearchText(cleanLessonText(text));
  let bestScore = 0;

  for (const form of topicForms) {
    if (!form || !normalizedText.includes(form)) {
      continue;
    }

    const escapedForm = escapeRegExp(form);
    const directDefinition = new RegExp(
      `\\b(?:a\\s+|an\\s+|the\\s+)?${escapedForm}\\s+(?:is|are|means|refers\\s+to|describes|can\\s+be\\s+defined\\s+as)\\b`
    ).test(normalizedText);
    const nearbyDefinitionCue = new RegExp(
      `\\b${escapedForm}\\b.{0,120}\\b(is|are|means|refers\\s+to|defined\\s+as|describes)\\b`
    ).test(normalizedText);
    const topicCount = Math.min(3, countOccurrences(normalizedText, form));
    const score =
      0.25 +
      topicCount * 0.12 +
      (directDefinition ? 0.45 : 0) +
      (nearbyDefinitionCue ? 0.2 : 0);

    bestScore = Math.max(bestScore, score);
  }

  return clamp(bestScore);
}

function scoreDefinitionCandidate(chunk: SourceChunk, topicForms: string[]) {
  const score = scoreDefinitionChunk(chunk.text, topicForms);
  const headingScore = topicForms.some((form) =>
    normalizeSearchText(chunk.text).includes(`chapter`) &&
    normalizeSearchText(chunk.text).includes(form)
  )
    ? 0.25
    : 0;

  return {
    ...chunk,
    score: Math.max(score, headingScore),
  };
}

function expandDefinitionNeighborhood(
  allChunks: SourceChunk[],
  rankedChunks: RetrievedChunk[],
  topK: number
) {
  const selected = new Map<string, RetrievedChunk>();
  const chunksBySource = new Map<string, SourceChunk[]>();

  for (const chunk of allChunks) {
    const sourceChunks = chunksBySource.get(chunk.sourceId) ?? [];
    sourceChunks.push(chunk);
    chunksBySource.set(chunk.sourceId, sourceChunks);
  }

  for (const sourceChunks of chunksBySource.values()) {
    sourceChunks.sort((left, right) => left.chunkIndex - right.chunkIndex);
  }

  for (const chunk of rankedChunks) {
    selected.set(chunk.id, chunk);

    const sourceChunks = chunksBySource.get(chunk.sourceId) ?? [];
    const sourceIndex = sourceChunks.findIndex((candidate) => candidate.id === chunk.id);

    if (sourceIndex < 0) {
      continue;
    }

    for (const neighbor of sourceChunks.slice(sourceIndex, sourceIndex + 3)) {
      if (selected.has(neighbor.id)) {
        continue;
      }

      selected.set(neighbor.id, {
        ...neighbor,
        score: Math.max(0.22, chunk.score - 0.08),
      });
    }

    if (selected.size >= topK * 2) {
      break;
    }
  }

  return [...selected.values()]
    .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex);
}

function normalizeSearchText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countOccurrences(text: string, term: string) {
  let count = 0;
  let position = 0;

  while (position < text.length) {
    const matchIndex = text.indexOf(term, position);

    if (matchIndex < 0) {
      break;
    }

    count += 1;
    position = matchIndex + term.length;
  }

  return count;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildQuizRequest(
  itemCount: number,
  mode: 'mcq' | 'fill_blank' | 'essay'
) {
  if (mode === 'fill_blank') {
    return [
      `Create exactly ${itemCount} fill-in-the-blank quiz questions from only this lesson context.`,
      'Use concrete facts, definitions, and ideas from the lesson.',
      'Each blank must have one clear answer from the lesson.',
      'Keep wording respectful, educational, and age-appropriate for students.',
      'Do not use phrases like "according to the PDF" or "uploaded PDF".',
      'Use this plain format with each field on its own line and no markdown:',
      'Question: ...',
      'Answer: ...',
      'Explanation: ...',
    ].join('\n');
  }

  if (mode === 'essay') {
    return [
      `Create exactly ${itemCount} short essay quiz questions from only this lesson context.`,
      'Ask questions that help the student explain real ideas from the lesson.',
      'Provide a concise model answer and one grading hint.',
      'Keep wording respectful, educational, and age-appropriate for students.',
      'Do not use phrases like "according to the PDF" or "uploaded PDF".',
      'Use this plain format with each field on its own line and no markdown:',
      'Question: ...',
      'Answer: ...',
      'Explanation: ...',
    ].join('\n');
  }

  return [
    `Create exactly ${itemCount} multiple-choice quiz questions from only this lesson context.`,
    'Prefer term-and-definition questions, like "What is photosynthesis?" with definition choices, and "Which term matches this definition?" with term choices.',
    'Every question must be answerable from the lesson context.',
    'Every question must have exactly four unique options: A, B, C, and D.',
    'The correct answer must be one of the displayed options.',
    'Wrong options must be plausible and close to the same subject, but still clearly incorrect from the lesson.',
    'Do not use vague choices such as "Think of it this way", "All of the above", "None of the above", "This topic", or random fragments.',
    'Do not ask "Which statement is true?" unless all four options are complete, specific lesson statements.',
    'Keep wording respectful, educational, and age-appropriate for students.',
    'Do not use phrases like "according to the PDF" or "uploaded PDF".',
    'Do not invent facts that are not in the lesson context.',
    'Use this plain format with each field on its own line and no markdown:',
    'Question: ...',
    'A. ...',
    'B. ...',
    'C. ...',
    'D. ...',
    'Correct answer: A. ...',
    'Explanation: ...',
  ].join('\n');
}

function buildFlashcardRequest(itemCount: number) {
  return [
    `Create exactly ${itemCount} concise flashcards from only this lesson context.`,
    'Each front must ask for a real term, fact, or idea from the lesson.',
    'Each back must be short, accurate, and easy for a student to review.',
    'Keep wording respectful, educational, and age-appropriate for students.',
    'Do not use phrases like "according to the PDF" or "uploaded PDF".',
    'Do not invent facts that are not in the lesson context.',
    'Use this plain format with each field on its own line and no markdown:',
    'Front: ...',
    'Back: ...',
  ].join('\n');
}
