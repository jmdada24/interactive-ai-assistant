import {
  cleanStudentReadableText,
  splitReadableSentences,
} from './textCleanup';

const targetWordsPerChunk = 120;
const maxWordsPerChunk = 170;
const overlapWords = 28;
const minimumWordsPerChunk = 25;

export type ExtractedPdfPage = {
  pageNumber: number;
  text: string;
};

export type MarkdownLessonPage = {
  pageNumber: number;
  markdown: string;
};

export type MarkdownLessonChunk = {
  pageNumber: number;
  text: string;
  tokenEstimate: number;
};

type TextBlock = {
  text: string;
  heading: string | null;
  isHeading: boolean;
  keepWithPrevious?: boolean;
};

export function normalizeExtractedPdfText(text: string) {
  return cleanStudentReadableText(text)
    .replace(/\r/g, '\n')
    .replace(/([A-Za-z])-\n(?=[A-Za-z])/g, '$1')
    .replace(/[ \t]*\n[ \t]*(?=[a-z,;:)])/g, ' ')
    .replace(/([^\n.!?:;])\n(?=[A-Za-z0-9(])/g, '$1 ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function removeRepeatedPageNoise(pages: ExtractedPdfPage[]) {
  if (pages.length < 4) {
    return pages;
  }

  const lineCounts = new Map<string, number>();

  for (const page of pages) {
    const seenOnPage = new Set<string>();

    for (const line of page.text.split('\n')) {
      const normalizedLine = normalizeRepeatedLine(line);

      if (
        normalizedLine.length < 4 ||
        normalizedLine.length > 90 ||
        /^[#\s-]+$/.test(normalizedLine)
      ) {
        continue;
      }

      seenOnPage.add(normalizedLine);
    }

    for (const line of seenOnPage) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
  }

  const repeatedLines = new Set(
    Array.from(lineCounts)
      .filter(([, count]) => count >= Math.max(3, Math.ceil(pages.length * 0.45)))
      .map(([line]) => line)
  );

  if (repeatedLines.size === 0) {
    return pages;
  }

  return pages.map((page) => ({
    ...page,
    text: page.text
      .split('\n')
      .filter((line) => !repeatedLines.has(normalizeRepeatedLine(line)))
      .join('\n')
      .trim(),
  }));
}

export function buildMarkdownLessonPages(pages: ExtractedPdfPage[]) {
  return pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      markdown: pageToMarkdown(page),
    }))
    .filter((page) => page.markdown.length > 0);
}

export function chunkMarkdownLessonPages(pages: MarkdownLessonPage[]) {
  return pages.flatMap(chunkMarkdownPage);
}

export function previewMarkdownPages(pages: MarkdownLessonPage[], limit = 3) {
  return pages
    .slice(0, limit)
    .map((page) => page.markdown.slice(0, 900))
    .join('\n\n');
}

function pageToMarkdown(page: ExtractedPdfPage) {
  const text = normalizeExtractedPdfText(page.text);

  if (!text) {
    return '';
  }

  const blocks = splitPageIntoBlocks(text);
  const lines = getPageLeadLines(page.pageNumber, text);
  const leadHeading = cleanHeading(lines[0] ?? '');
  let skippedLeadHeading = false;

  for (const block of blocks) {
    if (block.isHeading) {
      const blockHeading = cleanHeading(block.text);

      if (
        !skippedLeadHeading &&
        (
          normalizeHeadingKey(blockHeading) === normalizeHeadingKey(leadHeading) ||
          normalizeHeadingKey(blockHeading).startsWith(`${normalizeHeadingKey(leadHeading)} `) ||
          normalizeHeadingKey(leadHeading).startsWith(`${normalizeHeadingKey(blockHeading)} `)
        )
      ) {
        skippedLeadHeading = true;
        continue;
      }

      lines.push('', formatHeading(block.text));
      continue;
    }

    lines.push('', formatLessonBlock(block.text));
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function getPageLeadLines(pageNumber: number, text: string) {
  if (/^table of contents\b/i.test(text)) {
    return ['## Table of Contents'];
  }

  const chapter = getChapterHeading(text);

  if (chapter && chapter.index <= 20) {
    return [`## ${chapter.heading}`];
  }

  const title = getCoverTitle(text);

  if (pageNumber === 1 && title) {
    return [`# ${title}`];
  }

  return [`## Page ${pageNumber}`];
}

function formatHeading(text: string) {
  const chapter = getChapterHeading(text);

  if (chapter && chapter.index === 0) {
    return `## ${chapter.heading}`;
  }

  return `### ${cleanHeading(text)}`;
}

function formatLessonBlock(text: string) {
  const tableOfContents = formatTableOfContentsBlock(text);

  if (tableOfContents) {
    return tableOfContents;
  }

  const metadata = formatMetadataBlock(text);

  if (metadata) {
    return metadata;
  }

  const glossary = formatGlossaryLikeBlock(text);

  if (glossary) {
    return glossary;
  }

  const examples = formatExampleBlock(text);

  if (examples) {
    return examples;
  }

  return text;
}

function getCoverTitle(text: string) {
  const lines = splitSoftLines(text);
  const firstContentLine = lines.find((line) => {
    const cleanLine = cleanHeading(line);

    return cleanLine.length >= 4 &&
      !isMetadataLine(cleanLine) &&
      !/^table of contents\b/i.test(cleanLine);
  });

  return firstContentLine ? cleanHeading(firstContentLine) : '';
}

function getChapterHeading(text: string) {
  const match =
    /\bChapter\s+(\d+)\s*:?\s+([^.!?]{2,80}\?)/i.exec(text) ??
    /\bChapter\s+(\d+)\s*:?\s+(.+?)(?=\s+(?:Term\s+Definition|Definition|Feature|Example|Examples?|Literal|Figurative|[A-Z][A-Za-z/-]{1,30}\s+(?:is|are|means|refers\b|a comparison|a direct|words used|giving|an extreme|words that|a phrase|repetition|opposite))\b|$)/i.exec(text);

  if (!match) {
    return null;
  }

  return {
    index: match.index,
    heading: `Chapter ${match[1]}: ${cleanHeading(match[2])}`,
    matchedText: match[0],
  };
}

function splitSoftLines(text: string) {
  return text
    .replace(/\s+(?=\b(?:Chapter|Section|Unit|Module|Lesson)\s+\d+\b)/gi, '\n')
    .replace(/\s+(?=\b(?:Edition|Level|Pages|Grade|Subject|Module|Unit)\s*:)/gi, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isMetadataLine(line: string) {
  return /^(Edition|Level|Pages|Grade|Subject|Module|Unit)\s*:/i.test(line);
}

function formatTableOfContentsBlock(text: string) {
  if (!/^table of contents\b/i.test(text)) {
    return '';
  }

  const chapterMatches = [
    ...text.matchAll(/Chapter\s+(\d+)\s*:?\s+(.+?)(?:\s+(\d{1,4}))?(?=\s+Chapter\s+\d+\b|$)/gi),
  ];

  if (chapterMatches.length === 0) {
    return text;
  }

  return [
    ...chapterMatches.map((match) => {
      const title = cleanHeading(match[2].replace(/\s+\d+\s*$/, ''));

      return `- Chapter ${match[1]}: ${title}`;
    }),
  ].join('\n');
}

function formatMetadataBlock(text: string) {
  const metadataPattern = /\b(Edition|Level|Pages|Grade|Subject|Module|Unit)\s*:\s*([^:]+?)(?=\s+\b(?:Edition|Level|Pages|Grade|Subject|Module|Unit)\s*:|$)/gi;
  const matches = [...text.matchAll(metadataPattern)];

  if (matches.length === 0) {
    return '';
  }

  const prefix = text.slice(0, matches[0].index).trim();
  const suffixStart = (matches.at(-1)?.index ?? 0) + (matches.at(-1)?.[0].length ?? 0);
  const suffix = text.slice(suffixStart).trim();
  const lines = matches.map((match) => `- **${match[1]}**: ${match[2].trim()}`);

  return [prefix, ...lines, suffix]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function formatGlossaryLikeBlock(text: string) {
  const glossaryHeader = /\bTerm\s+Definition\b/i.test(text);
  const definitionRows = extractDefinitionRows(text);

  if (!glossaryHeader && definitionRows.length < 2) {
    return '';
  }

  return definitionRows
    .map((row) => `- **${row.term}**: ${row.definition}`)
    .join('\n');
}

function formatExampleBlock(text: string) {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const exampleLead = /^(Examples?|.+?\s+Examples?)\s*:\s*/i.exec(normalizedText);

  if (!exampleLead) {
    return '';
  }

  const label = cleanHeading(exampleLead[1]);
  const body = normalizedText.slice(exampleLead[0].length).trim();
  const examples = body
    .split(/\s+(?=(?:"[^"]+"|'[^']+'|[A-Z][a-z]+(?:,|\s+vs\.|\s+can\b)))/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (examples.length <= 1) {
    return `**${label}**: ${body}`;
  }

  return [
    `**${label}**`,
    ...examples.map((example) => `- ${example}`),
  ].join('\n');
}

function extractDefinitionRows(text: string) {
  const cleanText = text
    .replace(/\bTerm\s+Definition\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const rows: { term: string; definition: string }[] = [];
  const definitionCue =
    '(?:is|are|means|refers to|describes|can mean|can be defined as|a comparison|a direct|words used|giving|an extreme|words that|a phrase|repetition|opposite)';
  const rowPattern = new RegExp(
    `\\b([A-Z][A-Za-z][A-Za-z\\s/-]{1,42}?)\\s+(${definitionCue}\\b.+?)(?=\\s+[A-Z][A-Za-z][A-Za-z\\s/-]{1,42}?\\s+${definitionCue}\\b|$)`,
    'gi'
  );

  for (const match of cleanText.matchAll(rowPattern)) {
    const term = cleanHeading(match[1]);
    const definition = match[2].trim();

    if (
      term &&
      definition &&
      term.split(/\s+/).length <= 5 &&
      definition.split(/\s+/).length >= 3
    ) {
      rows.push({ term, definition });
    }
  }

  return rows;
}

function chunkMarkdownPage(page: MarkdownLessonPage): MarkdownLessonChunk[] {
  const blocks = splitPageIntoBlocks(page.markdown)
    .flatMap(splitOversizedBlock)
    .filter((block) => !block.isHeading);

  if (blocks.length === 0) {
    return [];
  }

  if (countWords(page.markdown) <= maxWordsPerChunk) {
    return [
      {
        pageNumber: page.pageNumber,
        text: page.markdown,
        tokenEstimate: estimateTokens(page.markdown),
      },
    ];
  }

  const chunks: MarkdownLessonChunk[] = [];
  let activeHeading: string | null = null;
  let currentBlocks: string[] = [];
  let currentWords = 0;

  const flushChunk = () => {
    const text = currentBlocks.join('\n\n').trim();

    if (!text || countWords(text) < minimumWordsPerChunk) {
      currentBlocks = [];
      currentWords = 0;
      return;
    }

    chunks.push({
      pageNumber: page.pageNumber,
      text: buildChunkText(page.pageNumber, activeHeading, text),
      tokenEstimate: estimateTokens(text),
    });
    currentBlocks = [];
    currentWords = 0;
  };

  for (const block of blocks) {
    const blockWords = countWords(block.text);

    if (
      currentBlocks.length > 0 &&
      block.heading &&
      activeHeading &&
      block.heading !== activeHeading &&
      !block.keepWithPrevious
    ) {
      flushChunk();
    }

    if (
      currentBlocks.length > 0 &&
      currentWords + blockWords > maxWordsPerChunk &&
      !block.keepWithPrevious
    ) {
      flushChunk();
    }

    activeHeading = block.heading ?? activeHeading;
    currentBlocks.push(block.text);
    currentWords += blockWords;

    if (currentWords >= targetWordsPerChunk) {
      flushChunk();
    }
  }

  flushChunk();

  if (chunks.length === 0) {
    const fallbackWords = page.markdown.split(/\s+/).filter(Boolean);

    for (let start = 0; start < fallbackWords.length; start += maxWordsPerChunk - overlapWords) {
      const chunkWords = fallbackWords.slice(start, start + maxWordsPerChunk);

      if (chunkWords.length >= minimumWordsPerChunk) {
        chunks.push({
          pageNumber: page.pageNumber,
          text: `## Page ${page.pageNumber}\n\n${chunkWords.join(' ')}`,
          tokenEstimate: Math.ceil(chunkWords.length * 1.35),
        });
      }
    }
  }

  return chunks;
}

function splitPageIntoBlocks(pageText: string): TextBlock[] {
  const rawBlocks = pageText
    .split(/\n{2,}/)
    .flatMap(splitInlineLessonBlocks)
    .map((block) => block.trim())
    .filter(Boolean);
  const blocks: TextBlock[] = [];
  let activeHeading: string | null = null;

  for (const rawBlock of rawBlocks) {
    const lines = rawBlock
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      continue;
    }

    const normalizedBlock = lines.join(' ').replace(/\s+/g, ' ').trim();

    if (!normalizedBlock) {
      continue;
    }

    const chapter = getChapterHeading(normalizedBlock);

    if (chapter && chapter.index === 0) {
      activeHeading = chapter.heading;
      blocks.push({
        text: activeHeading,
        heading: activeHeading,
        isHeading: true,
      });

      const body = normalizedBlock.slice(chapter.matchedText.length).trim();

      if (body) {
        blocks.push({
          text: body,
          heading: activeHeading,
          isHeading: false,
        });
      }

      continue;
    }

    if (lines.length === 1 && isLikelyHeading(lines[0])) {
      activeHeading = cleanHeading(lines[0]);
      blocks.push({
        text: activeHeading,
        heading: activeHeading,
        isHeading: true,
      });
      continue;
    }

    blocks.push({
      text: normalizedBlock,
      heading: activeHeading,
      isHeading: false,
      keepWithPrevious: isKeepWithPreviousBlock(normalizedBlock),
    });
  }

  return blocks;
}

function splitInlineLessonBlocks(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .replace(/\s+(?=\bTable of Contents\b)/gi, '\n\n')
    .replace(/\s+(?=\bChapter\s+\d+\s*:?\s+)/gi, '\n\n')
    .replace(/\s+(?=\b(?:Feature|Type of Comparison|Meaning|Definition|Examples?|Personification Example|Hyperbole Example|Onomatopoeia Example|Idiom Example|Alliteration Example|Synonym Example|Antonym Example|Homonym Example)\s*:)/gi, '\n\n')
    .replace(/\s+(?=\bTerm\s+Definition\b)/gi, '\n\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function isKeepWithPreviousBlock(text: string) {
  return /^(Examples?|.+?\s+Examples?|Meaning|Definition|Feature|Type of Comparison)\s*:/i.test(text) ||
    /^[-*]\s+/.test(text);
}

function splitOversizedBlock(block: TextBlock): TextBlock[] {
  const wordCount = countWords(block.text);

  if (wordCount <= maxWordsPerChunk) {
    return [block];
  }

  const sentences = splitReadableSentences(block.text);
  const pieces: TextBlock[] = [];
  let current: string[] = [];

  for (const sentence of sentences) {
    const nextWords = countWords([...current, sentence].join(' '));

    if (current.length > 0 && nextWords > targetWordsPerChunk) {
      pieces.push({
        text: current.join(' '),
        heading: block.heading,
        isHeading: false,
      });
      current = [];
    }

    if (countWords(sentence) > maxWordsPerChunk) {
      const words = sentence.split(/\s+/).filter(Boolean);
      const step = Math.max(1, maxWordsPerChunk - overlapWords);

      for (let start = 0; start < words.length; start += step) {
        const chunkWords = words.slice(start, start + maxWordsPerChunk);

        if (chunkWords.length >= minimumWordsPerChunk) {
          pieces.push({
            text: chunkWords.join(' '),
            heading: block.heading,
            isHeading: false,
          });
        }
      }
      continue;
    }

    current.push(sentence);
  }

  if (current.length > 0) {
    pieces.push({
      text: current.join(' '),
      heading: block.heading,
      isHeading: false,
    });
  }

  return pieces;
}

function buildChunkText(pageNumber: number, heading: string | null, text: string) {
  const section = heading ? `### ${heading}\n\n` : '';

  return `## Page ${pageNumber}\n\n${section}${text}`.trim();
}

function cleanHeading(line: string) {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\d+(?:\.\d+)*\s+/, '')
    .replace(/[:\-.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeadingKey(line: string) {
  return cleanHeading(line)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyHeading(line: string) {
  const cleanLine = cleanHeading(line);
  const words = cleanLine.split(/\s+/).filter(Boolean);

  if (words.length === 0 || words.length > 12 || cleanLine.length > 90) {
    return false;
  }

  if (/^#{1,6}\s+/.test(line)) {
    return true;
  }

  if (/[.!?]$/.test(cleanLine)) {
    return false;
  }

  if (/[?,;]/.test(cleanLine) || isInstructionLikeLine(cleanLine)) {
    return false;
  }

  const alphaWords = words.filter((word) => /[A-Za-z]/.test(word));
  const capitalizedWords = alphaWords.filter((word) => /^[A-Z][a-z0-9]+/.test(word));
  const titleCaseRatio = alphaWords.length > 0
    ? capitalizedWords.length / alphaWords.length
    : 0;
  const looksLikeTitleCase =
    alphaWords.length >= 2 &&
    alphaWords.length <= 8 &&
    titleCaseRatio >= 0.65;

  return (
    /^(chapter|section|unit|module|lesson|topic|part|activity|example|summary|review)\b/i.test(cleanLine) ||
    /^[A-Z0-9\s:()/-]+$/.test(cleanLine) ||
    looksLikeTitleCase
  );
}

function isInstructionLikeLine(line: string) {
  return /^(answer|choose|circle|complete|consider|count|describe|draw|explain|fill|find|identify|list|look|make|read|select|solve|try|use|write)\b/i.test(line);
}

function normalizeRepeatedLine(line: string) {
  return line
    .replace(/\bpage\s+\d+\b/gi, '')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function estimateTokens(text: string) {
  return Math.ceil(countWords(text) * 1.35);
}
