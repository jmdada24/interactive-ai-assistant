import {
  extractTextFromPage,
  getPageCount,
  isAvailable,
} from 'expo-pdf-text-extract';
import type { SourceProcessingStatus } from '../data/database';
import {
  replaceSourceChunks,
  replaceSourcePages,
  upsertSourceProcessingJob,
} from '../data/database';
import { indexSourceChunks } from './rag/vector-store/store';
import type { ExtractedPdfPage } from './sourceMarkdown';
import {
  buildMarkdownLessonPages,
  chunkMarkdownLessonPages,
  normalizeExtractedPdfText,
  previewMarkdownPages,
  removeRepeatedPageNoise,
} from './sourceMarkdown';

type PageText = ExtractedPdfPage;

export type SourceProcessingProgress = {
  phase: 'starting' | 'extracting' | 'chunking' | 'embedding' | 'complete';
  message: string;
  percent: number;
  current?: number;
  total?: number;
};

type PdfFailureDetails = {
  code: string;
  message: string;
  userMessage: string;
};

function logExtractionPreview(pages: PageText[]) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }

  const preview = pages
    .slice(0, 3)
    .map((page) => {
      const text = normalizeExtractedPdfText(page.text)
        .replace(/\s+/g, ' ')
        .slice(0, 600);

      return `Page ${page.pageNumber}: ${text}`;
    })
    .join('\n\n');

  if (preview) {
    console.info(`ALAB PDF extraction preview:\n${preview}`);
  }
}

function logMarkdownPreview(pages: { pageNumber: number; markdown: string }[]) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }

  const preview = previewMarkdownPages(pages);

  if (preview) {
    console.info(`ALAB Markdown lesson preview:\n${preview}`);
  }
}

function detailsForPdfFailure(error: unknown): PdfFailureDetails {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);

  if (code === 'PASSWORD_REQUIRED') {
    return {
      code,
      message,
      userMessage: 'This PDF needs a password before ALAB can read it.',
    };
  }

  if (code === 'INCORRECT_PASSWORD') {
    return {
      code,
      message,
      userMessage: 'The PDF password did not work.',
    };
  }

  if (code === 'CORRUPT_PDF') {
    return {
      code,
      message,
      userMessage: 'ALAB could not read this PDF file.',
    };
  }

  if (code === 'PDF_ERROR' || code === 'PDF_LOAD_ERROR') {
    return {
      code,
      message,
      userMessage: 'ALAB could not open this PDF file.',
    };
  }

  if (code === 'PDF_EXTRACTION_ERROR' || code === 'PDF_PAGE_ERROR') {
    return {
      code,
      message,
      userMessage: 'ALAB opened this PDF but could not extract readable text from it.',
    };
  }

  return {
    code,
    message,
    userMessage: 'ALAB could not read this PDF yet.',
  };
}

function errorMessageForPdfFailure(error: unknown) {
  const details = detailsForPdfFailure(error);

  return withDiagnostic(details.userMessage, details);
}

function withDiagnostic(message: string, details: PdfFailureDetails) {
  const diagnosticParts = [details.code, details.message]
    .map((part) => part.trim())
    .filter(Boolean);

  if (diagnosticParts.length === 0) {
    return message;
  }

  return `${message} (${diagnosticParts.join(': ')})`;
}

export async function processSourcePdfPlaceholder(
  sourceId: string,
  fileUri?: string,
  options?: {
    embedText: (text: string) => Promise<ArrayLike<number> | null>;
    modelName: string;
    onStatusChange?: (status: SourceProcessingStatus) => void;
    onProgress?: (progress: SourceProcessingProgress) => void;
  }
) {
  const setStatus = async (status: SourceProcessingStatus, error?: string) => {
    options?.onStatusChange?.(status);
    await upsertSourceProcessingJob(sourceId, status, error);
  };

  const setProgress = (progress: SourceProcessingProgress) => {
    options?.onProgress?.(progress);
  };

  if (!fileUri || !isAvailable()) {
    await setStatus(
      'failed',
      'Saved. ALAB needs the Android app build to read this PDF.'
    );
    return;
  }

  try {
    setProgress({
      phase: 'starting',
      message: 'Opening the PDF...',
      percent: 2,
    });
    await setStatus('extracting');

    let pageCount = 0;

    try {
      setProgress({
        phase: 'extracting',
        message: 'Counting PDF pages...',
        percent: 5,
      });
      pageCount = await getPageCount(fileUri);
    } catch (error) {
      await setStatus(
        'failed',
        errorMessageForPdfFailure(error)
      );
      return;
    }

    let pages: PageText[] = [];
    const pageFailures: PdfFailureDetails[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      setProgress({
        phase: 'extracting',
        message: `Reading page ${pageNumber} of ${pageCount}...`,
        percent: Math.min(55, Math.round(5 + (pageNumber / pageCount) * 50)),
        current: pageNumber,
        total: pageCount,
      });

      try {
        const text = normalizeExtractedPdfText(
          await extractTextFromPage(fileUri, pageNumber)
        );

        if (text) {
          pages.push({ pageNumber, text });
        }
      } catch (error) {
        const details = detailsForPdfFailure(error);
        pageFailures.push(details);
        console.warn(
          `ALAB PDF page extraction failed on page ${pageNumber}: ${details.code} - ${details.message}`
        );
      }
    }

    if (pages.length === 0) {
      const firstPageFailure = pageFailures[0];

      await setStatus(
        'failed',
        firstPageFailure
          ? withDiagnostic(
            'ALAB opened this PDF, but every page failed during text extraction.',
            firstPageFailure
          )
          : 'ALAB could not find readable text in this PDF. It may be a scanned image-only file.'
      );
      return;
    }

    pages = removeRepeatedPageNoise(pages)
      .filter((page) => page.text.trim().length > 0);

    if (pages.length === 0) {
      await setStatus(
        'failed',
        'ALAB could not find readable lesson text after cleaning this PDF.'
      );
      return;
    }

    logExtractionPreview(pages);
    const markdownPages = buildMarkdownLessonPages(pages);

    if (markdownPages.length === 0) {
      await setStatus(
        'failed',
        'ALAB could not turn this PDF into readable lesson notes.'
      );
      return;
    }

    logMarkdownPreview(markdownPages);

    setProgress({
      phase: 'chunking',
      message: 'Saving clean lesson notes...',
      percent: 58,
      current: markdownPages.length,
      total: pageCount,
    });
    await replaceSourcePages(
      sourceId,
      markdownPages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.markdown,
      }))
    );
    await setStatus('chunking');

    setProgress({
      phase: 'chunking',
      message: 'Breaking the PDF into study chunks...',
      percent: 62,
    });
    const chunks = chunkMarkdownLessonPages(markdownPages).map((chunk, index) => ({
      chunkIndex: index,
      pageNumber: chunk.pageNumber,
      text: chunk.text,
      tokenEstimate: chunk.tokenEstimate,
    }));

    if (chunks.length === 0) {
      await setStatus(
        'failed',
        'ALAB could not prepare readable study text from this PDF.'
      );
      return;
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.info(`ALAB prepared ${chunks.length} study chunks for source ${sourceId}.`);
    }

    const savedChunks = await replaceSourceChunks(sourceId, chunks);
    let indexingWasSkipped = false;
    let savedEmbeddingCount = 0;

    if (options) {
      await setStatus('embedding');

      const indexStatus = await indexSourceChunks(sourceId, savedChunks, {
        embedText: options.embedText,
        modelName: options.modelName,
        onIndexedChunk: (current, total) => {
          setProgress({
            phase: 'embedding',
            message: `Preparing lesson search ${current} of ${total}...`,
            percent: Math.min(
              96,
              Math.round(65 + (current / total) * 30)
            ),
            current,
            total,
          });
        },
      });

      savedEmbeddingCount = indexStatus.embeddingCount;
      indexingWasSkipped = !indexStatus.isFullyEmbedded;
    }

    if (indexingWasSkipped || savedEmbeddingCount !== savedChunks.length) {
      console.info(
        `ALAB embedded ${savedEmbeddingCount} of ${savedChunks.length} chunks for source ${sourceId}.`
      );
      await setStatus(
        'failed',
        'ALAB saved the lesson text but could not finish lesson search. Please prepare the study helper, then upload this source again.'
      );
      return;
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.info(
        `ALAB embedded ${savedEmbeddingCount} of ${savedChunks.length} chunks for source ${sourceId}.`
      );
    }

    setProgress({
      phase: 'complete',
      message: 'Ready to study',
      percent: 100,
      current: savedEmbeddingCount,
      total: savedChunks.length,
    });
    await setStatus('ready');
  } catch (error) {
    await setStatus(
      'failed',
      errorMessageForPdfFailure(error)
    );
  }
}
