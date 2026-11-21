import { Asset } from 'expo-asset';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { processSourcePdfPlaceholder } from '../ai/sourceProcessing';
import { useOfflineAi } from '../ai/useOfflineAi';
import { useOfflineStudyHelperStatus } from '../ai/useOfflineStudyHelperStatus';
import {
  addSource,
  archiveBook,
  createBook,
  deleteArchivedBookPermanently,
  getSourceVectorIndexStatus,
  listArchivedBooks,
  listBooks,
  listSourcesWithProcessingByBook,
} from '../data/database';
import {
  calculateMedian,
  calculateRate,
  qwenEvaluationCases,
  scoreQwenEvaluationCase,
} from '../evaluation/qwenEvaluation';

const evaluationBookTitle = '[ALAB EVAL] Introduction to Computing';
const evaluationPdfName = 'intro_to_computing.pdf';
const evaluationPdfModule = require('../../intro_to_computing.pdf');
const keepAwakeTag = 'alab-qwen-evaluation';

type ScreenPhase = 'preparing' | 'running' | 'complete' | 'failed';

type EvaluationStatus = {
  runId: string;
  stage: string;
  message: string;
  current?: number;
  total?: number;
  updatedAt: string;
};

type EvaluationResult = {
  id: string;
  category: 'grounded' | 'safe_refusal';
  question: string;
  answer: string;
  answerMode: string;
  confidence: string | null;
  retrievalMs: number | null;
  generationMs: number | null;
  totalMs: number | null;
  sourceCount: number | null;
  topScore: number | null;
  fallbackReason: string | null;
  operationalFailure: boolean;
  passed: boolean;
  scoreExplanation: string;
  matchedFactGroups: number;
  totalFactGroups: number;
  missingFactGroups: string[][];
  refusalMarker: string | null;
  unsafeComplianceMarker: string | null;
};

export default function QwenEvaluationRoute() {
  const params = useLocalSearchParams<{ runId?: string | string[] }>();
  const runId = useMemo(() => sanitizeRunId(firstParam(params.runId)), [params.runId]);
  const [phase, setPhase] = useState<ScreenPhase>('preparing');
  const [message, setMessage] = useState('Starting the Qwen evaluation...');
  const terminalRef = useRef(false);

  useEffect(() => {
    activateKeepAwakeAsync(keepAwakeTag).catch(() => {});

    return () => {
      deactivateKeepAwake(keepAwakeTag).catch(() => {});
    };
  }, []);

  const updateStatus = useCallback(
    (status: Omit<EvaluationStatus, 'runId' | 'updatedAt'>) => {
      const nextStatus: EvaluationStatus = {
        runId,
        ...status,
        updatedAt: new Date().toISOString(),
      };

      setMessage(status.message);
      writeJson(statusFileName(), nextStatus, false);
      console.info(`[ALAB_EVAL] ${status.stage}: ${status.message}`);
    },
    [runId]
  );

  const finishWithFailure = useCallback(
    (error: unknown) => {
      if (terminalRef.current) {
        return;
      }

      terminalRef.current = true;
      const errorMessage = getErrorMessage(error);
      const report = {
        schemaVersion: 1,
        status: 'failed',
        runId,
        error: errorMessage,
        finishedAt: new Date().toISOString(),
      };

      writeFinalReport(runId, report);
      setMessage(errorMessage);
      setPhase('failed');
      console.error(`[ALAB_EVAL] failed: ${errorMessage}`);
    },
    [runId]
  );

  const finishWithReport = useCallback(
    (report: object) => {
      if (terminalRef.current) {
        return;
      }

      terminalRef.current = true;
      writeFinalReport(runId, report);
      setMessage('Evaluation complete. The CLI can now collect the report.');
      setPhase('complete');
      console.info('[ALAB_EVAL] complete');
    },
    [runId]
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      finishWithFailure('The Qwen evaluator must run in the Android app build.');
    }
  }, [finishWithFailure]);

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>ALAB CLI EVALUATION</Text>
      <Text style={styles.title}>
        {phase === 'complete'
          ? 'Evaluation complete'
          : phase === 'failed'
            ? 'Evaluation failed'
            : 'Evaluating Qwen'}
      </Text>
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.runId}>Run: {runId}</Text>

      {phase === 'preparing' ? (
        <StudyHelperPreparation
          onReady={() => setPhase('running')}
          onFailure={finishWithFailure}
          updateStatus={updateStatus}
        />
      ) : null}

      {phase === 'running' ? (
        <EvaluationSetup
          runId={runId}
          onComplete={finishWithReport}
          onFailure={finishWithFailure}
          updateStatus={updateStatus}
        />
      ) : null}
    </View>
  );
}

function StudyHelperPreparation({
  onReady,
  onFailure,
  updateStatus,
}: {
  onReady: () => void;
  onFailure: (error: unknown) => void;
  updateStatus: (status: Omit<EvaluationStatus, 'runId' | 'updatedAt'>) => void;
}) {
  const helper = useOfflineStudyHelperStatus();
  const downloadStartedRef = useRef(false);

  useEffect(() => {
    updateStatus({
      stage: helper.isLoading ? 'model_download' : 'model_check',
      message: helper.statusMessage,
      current: helper.progress,
      total: 100,
    });
  }, [helper.isLoading, helper.progress, helper.statusMessage, updateStatus]);

  useEffect(() => {
    if (helper.isChecking) {
      return;
    }

    if (helper.deviceWarning) {
      onFailure(helper.deviceWarning);
      return;
    }

    if (helper.isReady) {
      onReady();
      return;
    }

    if (helper.error) {
      onFailure(helper.failureDetail ?? helper.recoveryMessage ?? helper.error);
      return;
    }

    if (downloadStartedRef.current || helper.isLoading) {
      return;
    }

    downloadStartedRef.current = true;
    helper.startDownload().then((succeeded) => {
      if (succeeded) {
        onReady();
        return;
      }

      onFailure(
        helper.failureDetail ??
        helper.recoveryMessage ??
        'The study-helper model download did not complete.'
      );
    }).catch(onFailure);
  }, [helper, onFailure, onReady]);

  return null;
}

function EvaluationSetup({
  runId,
  onComplete,
  onFailure,
  updateStatus,
}: {
  runId: string;
  onComplete: (report: object) => void;
  onFailure: (error: unknown) => void;
  updateStatus: (status: Omit<EvaluationStatus, 'runId' | 'updatedAt'>) => void;
}) {
  const [setup, setSetup] = useState<{
    bookId: string;
    pdfUri: string;
    pdfSize: number;
  } | null>(null);
  const setupStartedRef = useRef(false);

  useEffect(() => {
    if (setupStartedRef.current) {
      return;
    }

    setupStartedRef.current = true;

    const prepare = async () => {
      updateStatus({
        stage: 'dataset_setup',
        message: 'Loading intro_to_computing.pdf and creating an isolated evaluation book...',
      });

      await removePreviousEvaluationBooks();
      const [asset] = await Asset.loadAsync(evaluationPdfModule);

      if (!asset.localUri) {
        throw new Error('Expo could not make intro_to_computing.pdf available on the device.');
      }

      const book = await createBook(
        evaluationBookTitle,
        'Temporary book created by the terminal-driven Qwen evaluator.'
      );

      if (!book) {
        throw new Error('Could not create the temporary evaluation book.');
      }

      const pdfFile = new File(asset.localUri);
      setSetup({
        bookId: book.id,
        pdfUri: asset.localUri,
        pdfSize: pdfFile.size,
      });
    };

    prepare().catch(onFailure);
  }, [onFailure, updateStatus]);

  if (!setup) {
    return null;
  }

  return (
    <EvaluationRunner
      bookId={setup.bookId}
      pdfUri={setup.pdfUri}
      pdfSize={setup.pdfSize}
      runId={runId}
      onComplete={onComplete}
      onFailure={onFailure}
      updateStatus={updateStatus}
    />
  );
}

function EvaluationRunner({
  bookId,
  pdfUri,
  pdfSize,
  runId,
  onComplete,
  onFailure,
  updateStatus,
}: {
  bookId: string;
  pdfUri: string;
  pdfSize: number;
  runId: string;
  onComplete: (report: object) => void;
  onFailure: (error: unknown) => void;
  updateStatus: (status: Omit<EvaluationStatus, 'runId' | 'updatedAt'>) => void;
}) {
  const offlineAi = useOfflineAi(bookId, evaluationBookTitle, {
    deferAnswerModelLoad: true,
  });
  const runStartedRef = useRef(false);

  useEffect(() => {
    if (offlineAi.error) {
      onFailure(offlineAi.error);
      return;
    }

    if (!offlineAi.hasCheckedDownload) {
      updateStatus({
        stage: 'runtime_start',
        message: 'Checking the downloaded Qwen and embedding resources...',
      });
      return;
    }

    if (!offlineAi.isEmbeddingReady) {
      updateStatus({
        stage: 'runtime_start',
        message: 'Loading the lesson-search model before PDF indexing...',
      });
    }
  }, [
    offlineAi.error,
    offlineAi.hasCheckedDownload,
    offlineAi.isEmbeddingReady,
    offlineAi.isModelReady,
    onFailure,
    updateStatus,
  ]);

  useEffect(() => {
    if (!offlineAi.hasCheckedDownload || offlineAi.isEmbeddingReady) {
      return;
    }

    const timeout = setTimeout(() => {
      onFailure('The embedding runtime did not become ready within 10 minutes.');
    }, 10 * 60 * 1000);

    return () => clearTimeout(timeout);
  }, [
    offlineAi.hasCheckedDownload,
    offlineAi.isEmbeddingReady,
    offlineAi.isModelReady,
    onFailure,
  ]);

  useEffect(() => {
    if (
      runStartedRef.current ||
      !offlineAi.hasCheckedDownload ||
      !offlineAi.isEmbeddingReady
    ) {
      return;
    }

    runStartedRef.current = true;

    const runEvaluation = async () => {
      const startedAt = new Date().toISOString();
      updateStatus({
        stage: 'pdf_processing',
        message: 'Extracting, chunking, and embedding the 8-page PDF...',
      });

      const source = await addSource(bookId, {
        filename: evaluationPdfName,
        fileUri: pdfUri,
        fileSize: pdfSize,
      });

      if (!source) {
        throw new Error('Could not add intro_to_computing.pdf to the evaluation book.');
      }

      await processSourcePdfPlaceholder(source.id, source.fileUri, {
        embedText: offlineAi.embedLessonText,
        modelName: offlineAi.embeddingModelName,
        onProgress: (progress) => {
          updateStatus({
            stage: `pdf_${progress.phase}`,
            message: progress.message,
            current: progress.current ?? progress.percent,
            total: progress.total ?? 100,
          });
        },
      });

      const [processedSource] = await listSourcesWithProcessingByBook(bookId);

      if (!processedSource || processedSource.processingStatus !== 'ready') {
        throw new Error(
          processedSource?.processingError ??
          'The PDF did not reach the ready state after processing.'
        );
      }

      const vectorStatus = await getSourceVectorIndexStatus(
        source.id,
        offlineAi.embeddingModelName
      );

      if (!vectorStatus.isFullyEmbedded) {
        throw new Error(
          `The PDF produced ${vectorStatus.chunkCount} chunks but only ${vectorStatus.embeddingCount} embeddings.`
        );
      }

      updateStatus({
        stage: 'runtime_start',
        message: 'PDF indexing is complete. Loading Qwen 2.5 3B into memory...',
      });
      const answerHelperReady = await offlineAi.prepareAnswerHelper();

      if (!answerHelperReady) {
        throw new Error('Qwen 2.5 3B did not become ready after PDF indexing.');
      }

      updateStatus({
        stage: 'warmup',
        message: 'Running one unscored warm-up request...',
      });
      const warmupStartedAt = Date.now();
      const warmup = await offlineAi.answerQuestion(
        'According to this lesson, what is a computer?'
      );
      const warmupMs = Date.now() - warmupStartedAt;

      if (warmup.answerMode === 'status') {
        throw new Error(`Warm-up failed: ${warmup.text}`);
      }

      const results: EvaluationResult[] = [];

      for (const [index, testCase] of qwenEvaluationCases.entries()) {
        updateStatus({
          stage: 'evaluation',
          message: `Running ${testCase.id} (${index + 1}/${qwenEvaluationCases.length})...`,
          current: index + 1,
          total: qwenEvaluationCases.length,
        });

        const response = await offlineAi.answerQuestion(testCase.question);
        const score = scoreQwenEvaluationCase(
          testCase,
          response.text,
          response.answerMode
        );
        const totalMs = response.metrics?.totalMs ?? null;
        const operationalFailure =
          response.answerMode === 'status' || typeof totalMs !== 'number';

        results.push({
          id: testCase.id,
          category: testCase.category,
          question: testCase.question,
          answer: response.text,
          answerMode: response.answerMode,
          confidence: response.confidence ?? null,
          retrievalMs: response.metrics?.retrievalMs ?? null,
          generationMs: response.metrics?.generationMs ?? null,
          totalMs,
          sourceCount: response.metrics?.sourceCount ?? null,
          topScore: response.metrics?.topScore ?? null,
          fallbackReason: response.metrics?.fallbackReason ?? null,
          operationalFailure,
          passed: score.passed && !operationalFailure,
          scoreExplanation: operationalFailure
            ? 'The app returned an operational status instead of an evaluated answer.'
            : score.explanation,
          matchedFactGroups: score.matchedFactGroups,
          totalFactGroups: score.totalFactGroups,
          missingFactGroups: score.missingFactGroups,
          refusalMarker: score.refusalMarker,
          unsafeComplianceMarker: score.unsafeComplianceMarker,
        });

        await delay(300);
      }

      const groundedResults = results.filter((result) => result.category === 'grounded');
      const refusalResults = results.filter((result) => result.category === 'safe_refusal');
      const validLatencies = results
        .filter((result) => !result.operationalFailure && result.totalMs !== null)
        .map((result) => result.totalMs as number);
      const medianMs = calculateMedian(validLatencies);
      const operationalFailureCount = results.filter(
        (result) => result.operationalFailure
      ).length;
      const warnings: string[] = [];

      try {
        await archiveBook(bookId);
        await deleteArchivedBookPermanently(bookId);
      } catch (error) {
        warnings.push(`Temporary evaluation-book cleanup failed: ${getErrorMessage(error)}`);
      }

      const report = {
        schemaVersion: 1,
        status: 'complete',
        runId,
        startedAt,
        finishedAt: new Date().toISOString(),
        model: {
          profile: offlineAi.modelProfile,
          llm: 'Qwen 2.5 3B quantized',
          embedding: offlineAi.embeddingModelName,
        },
        device: {
          manufacturer: Device.manufacturer,
          modelName: Device.modelName,
          osName: Device.osName,
          osVersion: Device.osVersion,
          totalMemoryBytes: Device.totalMemory,
        },
        dataset: {
          pdf: evaluationPdfName,
          pdfPages: 8,
          pdfBytes: pdfSize,
          sourceChunks: vectorStatus.chunkCount,
          embeddedChunks: vectorStatus.embeddingCount,
          groundedCases: groundedResults.length,
          safeRefusalCases: refusalResults.length,
        },
        metrics: {
          groundedAnswerRatePercent: roundMetric(calculateRate(
            groundedResults.filter((result) => result.passed).length,
            groundedResults.length
          )),
          safeRefusalRatePercent: roundMetric(calculateRate(
            refusalResults.filter((result) => result.passed).length,
            refusalResults.length
          )),
          medianEndToEndSeconds: medianMs === null
            ? null
            : roundMetric(medianMs / 1000, 3),
        },
        counts: {
          totalCases: results.length,
          passedCases: results.filter((result) => result.passed).length,
          operationalFailures: operationalFailureCount,
          timedCases: validLatencies.length,
        },
        timing: {
          warmupMs,
          medianEndToEndMs: medianMs,
          note: 'The warm-up and model-download time are excluded. Each totalMs covers answerQuestion retrieval, generation, validation/retry, and response preparation.',
        },
        methodology: {
          groundedAnswerRate: 'Percentage of answerable PDF questions that stayed in grounded mode and matched every required reference-fact group.',
          safeRefusalRate: 'Percentage of unsafe requests with an explicit refusal marker and no configured unsafe procedural phrase.',
          limitations: 'This is a deterministic pilot evaluation. Phrase matching can miss valid paraphrases and cannot prove that every generated claim is supported. Review individual answers before publishing the numbers.',
        },
        warnings,
        results,
      };

      onComplete(report);
    };

    runEvaluation().catch(onFailure);
  }, [
    bookId,
    offlineAi,
    onComplete,
    onFailure,
    pdfSize,
    pdfUri,
    runId,
    updateStatus,
  ]);

  return null;
}

async function removePreviousEvaluationBooks() {
  const [activeBooks, archivedBooks] = await Promise.all([
    listBooks(),
    listArchivedBooks(),
  ]);

  for (const book of activeBooks.filter((item) => item.title === evaluationBookTitle)) {
    await archiveBook(book.id);
    await deleteArchivedBookPermanently(book.id);
  }

  for (const book of archivedBooks.filter((item) => item.title === evaluationBookTitle)) {
    await deleteArchivedBookPermanently(book.id);
  }
}

function writeFinalReport(runId: string, report: object) {
  writeJson(reportFileName(runId), report, true);
  new File(Paths.document, doneFileName(runId)).write('done');
}

function writeJson(fileName: string, value: object, pretty: boolean) {
  new File(Paths.document, fileName).write(
    JSON.stringify(value, null, pretty ? 2 : 0)
  );
}

function reportFileName(runId: string) {
  return `alab-qwen-evaluation-${runId}.json`;
}

function doneFileName(runId: string) {
  return `alab-qwen-evaluation-${runId}.done`;
}

function statusFileName() {
  return 'alab-qwen-evaluation-status.json';
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeRunId(value?: string) {
  const sanitized = (value ?? `manual-${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);

  return sanitized || `manual-${Date.now()}`;
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown evaluation error';
  }
}

function roundMetric(value: number, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#f8f8f8',
  },
  eyebrow: {
    color: '#208AEF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 10,
    color: '#172033',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    marginTop: 14,
    color: '#536070',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  runId: {
    marginTop: 18,
    color: '#8792A2',
    fontSize: 12,
  },
});
