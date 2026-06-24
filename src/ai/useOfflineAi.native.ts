import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isAvailable,
  Message,
  useLLM,
  useTextEmbeddings,
} from 'react-native-executorch';
import type { AiAnswerConfidence, AiAnswerMode } from '../data/database';
import {
  getAppSetting,
  hasReadySources,
  hasReadyStudyChunks,
  saveAiPerformanceMetric,
  saveGeneratedFlashcards,
  saveGeneratedQuiz,
} from '../data/database';
import {
  embeddingModelName,
  formatEmbeddingInput,
  modelDownloadedKey,
  modelProfileKey,
  offlineEmbeddingModel,
  offlineLlmModel,
  offlineModelProfile,
  offlineSearchModelProfile,
  searchModelDownloadedKey,
  searchModelProfileKey,
} from './offlineModelResources.native';
import {
  buildGroundedRetrievalQuery,
  buildSummaryRetrievalQuery,
  expandGroundedRetrievalQuestion,
  getSimpleDefinitionTopic,
  getStudyToolVariant,
  isStrictSourceOnlyRequest,
} from './answerRouting';
import {
  delay,
  GenerationWatchdog,
  isUsableGeneratedAnswer,
  withGenerationWatchdog,
} from './generationRuntime';
import {
  buildDirectGroundedAnswer,
  buildPdfOverviewSummary,
  buildPdfSummary,
  isBadGroundedAnswer,
} from './rag/agent/answers';
import { getChatRoute } from './rag/agent/chat';
import { classifyStudentInput } from './rag/agent/studentSafety';
import {
  formatFlashcards,
  parseRecoverableFlashcardDeck,
} from './rag/agent/flashcards';
import type { StudyToolMode } from './rag/agent/studyTools';
import {
  buildSimpleStudyToolFallback,
  countValidStudyToolItems,
  getStudyToolItemCount,
  hasValidMcqQuiz,
  mergeValidatedStudyToolOutput,
  normalizeStudyToolOutput,
} from './rag/agent/studyTools';
import {
  buildGeneralMessages,
  buildGroundedMessages,
  buildStudyToolMessages,
  formatSourceLabel,
  retrieveBookOverviewChunks,
  retrieveDefinitionChunks,
  retrieveDocumentOverviewText,
  retrieveRelevantChunksWithMetadata,
  retrieveSummaryChunks,
  retrieveStudyToolChunks,
} from './retrieval';
import { formatDirectAnswer } from './textCleanup';

type OfflineAiResponse = {
  text: string;
  sources: string[];
  answerMode: AiAnswerMode;
  confidence?: AiAnswerConfidence;
  metrics?: OfflineAiMetrics;
};

type OfflineAiMetrics = {
  retrievalMs?: number;
  generationMs?: number;
  totalMs?: number;
  sourceCount?: number;
  topScore?: number | null;
  fallbackReason?: string | null;
};

const answerGenerationWatchdog: GenerationWatchdog = {
  firstTokenMs: 6000,
  idleMs: 5000,
  maximumMs: 15000,
};
const studyToolGenerationWatchdog: GenerationWatchdog = {
  firstTokenMs: 120000,
  idleMs: 60000,
  maximumMs: 600000,
};
const answerHelperWarmupTimeoutMs = 20000;
const generationConfig = {
  temperature: 0.2,
  topP: 0.82,
  minP: 0.05,
  repetitionPenalty: 1.08,
  outputTokenBatchSize: 4,
  batchTimeInterval: 80,
};
export function useOfflineAi(bookId: string, bookTitle: string) {
  const [hasSearchHelperPrepared, setHasSearchHelperPrepared] = useState(false);
  const [hasAnswerHelperPrepared, setHasAnswerHelperPrepared] = useState(false);
  const [shouldLoadLlm, setShouldLoadLlm] = useState(false);
  const [hasCheckedDownload, setHasCheckedDownload] = useState(false);
  const shouldLoadEmbeddings = hasSearchHelperPrepared;
  const llmReadyRef = useRef(false);
  const llmErrorRef = useRef<unknown>(null);
  const llmGeneratingRef = useRef(false);
  const activeGenerationPromiseRef = useRef<Promise<string> | null>(null);
  const generationCancelledRef = useRef(false);
  const shouldLoadLlmRef = useRef(false);
  const llm = useLLM({
    model: offlineLlmModel,
    preventLoad: !shouldLoadLlm,
  });
  const embeddings = useTextEmbeddings({
    model: offlineEmbeddingModel,
    preventLoad: !shouldLoadEmbeddings,
  });

  useEffect(() => {
    llmReadyRef.current = llm.isReady;
    llmErrorRef.current = llm.error ?? null;
    llmGeneratingRef.current = llm.isGenerating;
  }, [llm.error, llm.isGenerating, llm.isReady]);

  useEffect(() => {
    shouldLoadLlmRef.current = shouldLoadLlm;
  }, [shouldLoadLlm]);

  useEffect(() => {
    let isActive = true;

    Promise.all([
      getAppSetting(modelDownloadedKey),
      getAppSetting(modelProfileKey),
      getAppSetting(searchModelDownloadedKey),
      getAppSetting(searchModelProfileKey),
    ])
      .then(([
        downloadedValue,
        profileValue,
        searchDownloadedValue,
        searchProfileValue,
      ]) => {
        const hasFullStudyHelper =
          downloadedValue === 'true' && profileValue === offlineModelProfile;
        const hasSearchHelper =
          searchDownloadedValue === 'true' &&
          searchProfileValue === offlineSearchModelProfile;

        if (isActive && (hasFullStudyHelper || hasSearchHelper)) {
          setHasSearchHelperPrepared(true);
        }

        if (isActive && hasFullStudyHelper) {
          setHasAnswerHelperPrepared(true);
        }
      })
      .finally(() => {
        if (isActive) {
          setHasCheckedDownload(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const waitForAnswerHelperReady = useCallback(async () => {
    if (!hasAnswerHelperPrepared) {
      return false;
    }

    if (llmReadyRef.current) {
      return true;
    }

    if (llmErrorRef.current) {
      return false;
    }

    if (!shouldLoadLlmRef.current) {
      shouldLoadLlmRef.current = true;
      setShouldLoadLlm(true);
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < answerHelperWarmupTimeoutMs) {
      if (llmReadyRef.current) {
        return true;
      }

      if (llmErrorRef.current) {
        return false;
      }

      await delay(200);
    }

    return false;
  }, [hasAnswerHelperPrepared]);

  const interruptLlm = useCallback(() => {
    try {
      llm.interrupt();
    } catch {
      // The model may already be unloading or not fully loaded.
    }
  }, [llm]);

  const generateLlmText = useCallback(
    (messages: Message[], watchdog: GenerationWatchdog) => {
      const generationPromise = llm.generate(messages);

      activeGenerationPromiseRef.current = generationPromise;
      llmGeneratingRef.current = true;

      generationPromise.then(
        () => {
          if (activeGenerationPromiseRef.current === generationPromise) {
            activeGenerationPromiseRef.current = null;
            llmGeneratingRef.current = false;
          }
        },
        () => {
          if (activeGenerationPromiseRef.current === generationPromise) {
            activeGenerationPromiseRef.current = null;
            llmGeneratingRef.current = false;
          }
        }
      );

      return withGenerationWatchdog(
        generationPromise,
        llm.getGeneratedTokenCount,
        watchdog,
        interruptLlm
      );
    },
    [interruptLlm, llm]
  );

  const generateReliableAnswer = useCallback(
    async (
      messages: Message[],
      validator: (answer: string) => boolean
    ) => {
      let generationMs = 0;

      if (generationCancelledRef.current) {
        return { text: '', generationMs, didRetry: false };
      }

      const generationStartedAt = Date.now();
      const rawAnswer = await generateLlmText(
        messages,
        answerGenerationWatchdog
      );
      generationMs += Date.now() - generationStartedAt;
      const cleanAnswer = formatDirectAnswer(rawAnswer);

      if (validator(cleanAnswer)) {
        return {
          text: cleanAnswer,
          generationMs,
          didRetry: false,
        };
      }

      return { text: '', generationMs, didRetry: false };
    },
    [generateLlmText]
  );

  const answerQuestion = useCallback(
    async (
      question: string,
      conversationContext?: string
    ): Promise<OfflineAiResponse> => {
      generationCancelledRef.current = false;
      const startedAt = Date.now();
      const makeResponse = async ({
        text,
        sources = [],
        answerMode,
        confidence = 'none',
        retrievalMs,
        generationMs,
        topScore = null,
        fallbackReason = null,
      }: {
        text: string;
        sources?: string[];
        answerMode: AiAnswerMode;
        confidence?: AiAnswerConfidence;
        retrievalMs?: number;
        generationMs?: number;
        topScore?: number | null;
        fallbackReason?: string | null;
      }): Promise<OfflineAiResponse> => {
        const metrics: OfflineAiMetrics = {
          retrievalMs,
          generationMs,
          totalMs: Date.now() - startedAt,
          sourceCount: sources.length,
          topScore,
          fallbackReason,
        };

        try {
          const showedSources = sources.length > 0;

          await saveAiPerformanceMetric({
            bookId,
            answerMode,
            confidence,
            retrievalMs,
            generationMs,
            totalMs: metrics.totalMs,
            sourceCount: sources.length,
            topScore,
            fallbackReason,
            outputLength: text.length,
            showedSources,
          });
        } catch {
          // The answer should still work if local metrics cannot be saved.
        }

        return {
          text,
          sources,
          answerMode,
          confidence,
          metrics,
        };
      };

      const safety = classifyStudentInput(question);

      if (safety.status === 'blocked') {
        return makeResponse({
          text: safety.responseText ?? '',
          answerMode: 'status',
          fallbackReason: 'student_safety_blocked',
        });
      }

      const answerGeneralQuestion = async (
        fallbackReasonPrefix = 'general'
      ): Promise<OfflineAiResponse> => {
        if (!hasAnswerHelperPrepared) {
          return makeResponse({
            text: 'Please finish preparing the study helper from My Books first.',
            answerMode: 'status',
            fallbackReason: 'answer_helper_not_prepared',
          });
        }

        if (llmErrorRef.current) {
          return makeResponse({
            text: 'The study helper had trouble opening on this device. Please close other apps and try again.',
            answerMode: 'status',
            fallbackReason: `${fallbackReasonPrefix}_llm_error`,
          });
        }

        const isAnswerHelperReady = await waitForAnswerHelperReady();

        if (!isAnswerHelperReady) {
          return makeResponse({
            text: 'ALAB is still opening the study helper. Please try again in a moment.',
            answerMode: 'status',
            fallbackReason: `${fallbackReasonPrefix}_llm_warmup_timeout`,
          });
        }

        llm.configure({ generationConfig });

        const generated = await generateReliableAnswer(
          buildGeneralMessages(question, conversationContext) as Message[],
          isUsableGeneratedAnswer
        );

        return makeResponse({
          text: generated.text ||
            'ALAB could not generate a reliable answer this time. Please try again in a moment.',
          answerMode: generated.text ? 'general' : 'status',
          confidence: generated.text ? 'medium' : 'none',
          generationMs: generated.generationMs,
          fallbackReason: generated.text
            ? generated.didRetry
              ? `${fallbackReasonPrefix}_recovered_on_retry`
              : null
            : `${fallbackReasonPrefix}_empty_general_answer`,
        });
      };

      const forwardQueryEmbedding = async (text: string) => {
        if (!shouldLoadEmbeddings || !embeddings.isReady) {
          return null;
        }

        try {
          return await embeddings.forward(formatEmbeddingInput(text, 'query'));
        } catch {
          return null;
        }
      };

      if (!isAvailable) {
        return makeResponse({
          text: 'The study helper is not available on this device yet.',
          answerMode: 'status',
          fallbackReason: 'executorch_unavailable',
        });
      }

      if (!hasCheckedDownload) {
        return makeResponse({
          text: 'Checking your saved study helper...',
          answerMode: 'status',
          fallbackReason: 'checking_download',
        });
      }

      const hasSources = await hasReadySources(bookId);
      const chatRoute = getChatRoute(question, hasSources);
      const intent = chatRoute.intent;
      const isExplicitLessonQuestion = chatRoute.reason === 'explicit_source';

      if (chatRoute.directAnswer) {
        return makeResponse({
          text: chatRoute.directAnswer,
          answerMode: 'general',
          confidence: 'high',
          fallbackReason: chatRoute.reason,
        });
      }

      if (!shouldLoadEmbeddings && intent === 'general') {
        return answerGeneralQuestion('model_not_prepared_general');
      }

      if (!hasSources && intent !== 'general') {
        return makeResponse({
          text: 'I need a ready source before I can answer from this book.',
          answerMode: 'status',
          fallbackReason: 'no_ready_sources',
        });
      }

      if (intent === 'summary') {
        const isFastOverviewRequest = chatRoute.reason === 'source_overview';

        if (isFastOverviewRequest) {
          const retrievalStartedAt = Date.now();
          const overview = await retrieveDocumentOverviewText(bookId);
          const retrievalMs = Date.now() - retrievalStartedAt;
          const fallbackSummary = buildPdfOverviewSummary(overview.text);

          if (overview.text && fallbackSummary) {
            return makeResponse({
              text: fallbackSummary,
              sources: overview.sources,
              answerMode: 'summary',
              confidence: 'low',
              retrievalMs,
              fallbackReason: 'overview_direct_page_text',
            });
          }
        }

        const retrievalStartedAt = Date.now();
        const summaryQuery = buildSummaryRetrievalQuery(question, conversationContext);
        const summaryEmbedding = await forwardQueryEmbedding(summaryQuery);
        const chunks = await retrieveSummaryChunks(
          bookId,
          question,
          conversationContext,
          summaryEmbedding,
          embeddingModelName,
          12
        );
        const retrievalMs = Date.now() - retrievalStartedAt;

        if (chunks.length === 0) {
          return makeResponse({
            text: 'I could not find readable PDF text to summarize yet.',
            answerMode: 'summary',
            retrievalMs,
            fallbackReason: 'no_summary_chunks',
          });
        }

        const sources = chunks.slice(0, 5).map(formatSourceLabel);
        const fallbackSummary = buildPdfSummary(chunks);

        if (fallbackSummary) {
          return makeResponse({
            text: fallbackSummary,
            sources,
            answerMode: 'summary',
            confidence: 'low',
            retrievalMs,
            topScore: chunks[0]?.score ?? null,
            fallbackReason: isFastOverviewRequest
              ? 'summary_direct_overview_answer'
              : 'summary_direct_answer',
          });
        }

        return makeResponse({
          text: 'I found readable lesson text, but it is too fragmented for a complete summary. Ask about one topic, section, or keyword from the lesson and I will focus on that part.',
          answerMode: 'status',
          confidence: 'none',
          retrievalMs,
          topScore: chunks[0]?.score ?? null,
          fallbackReason: 'summary_direct_unavailable',
        });
      }

      if (intent === 'general') {
        return answerGeneralQuestion();
      }

      let queryEmbedding: Float32Array | null = null;
      const retrievalStartedAt = Date.now();
      const definitionTopic = getSimpleDefinitionTopic(question);
      const retrievalQuery = buildGroundedRetrievalQuery(
        expandGroundedRetrievalQuestion(question),
        conversationContext
      );

      queryEmbedding = await forwardQueryEmbedding(retrievalQuery);

      let retrievalResult = await retrieveRelevantChunksWithMetadata(
        bookId,
        retrievalQuery,
        queryEmbedding,
        embeddingModelName,
        definitionTopic ? 6 : 3
      );
      let retrievalMs = Date.now() - retrievalStartedAt;
      let chunks = retrievalResult.chunks;

      if (chunks.length === 0 && definitionTopic) {
        const definitionResult = await retrieveDefinitionChunks(
          bookId,
          definitionTopic,
          6
        );
        retrievalMs = Date.now() - retrievalStartedAt;

        if (definitionResult.chunks.length > 0) {
          retrievalResult = definitionResult;
          chunks = definitionResult.chunks;
        }
      }

      if (chunks.length === 0) {
        if (
          !isExplicitLessonQuestion ||
          !isStrictSourceOnlyRequest(question)
        ) {
          return answerGeneralQuestion('no_retrieval_general');
        }

        return makeResponse({
          text: 'The lesson does not have enough information about that yet.',
          answerMode: 'grounded',
          confidence: 'none',
          retrievalMs,
          fallbackReason: `no_relevant_${retrievalResult.fallbackKind}_chunks`,
        });
      }

      let answerChunks = chunks;
      let sources = chunks.slice(0, 3).map(formatSourceLabel);
      let directAnswer = buildDirectGroundedAnswer(question, answerChunks);
      let directFallbackReason = 'specific_retrieval_direct';

      if (!directAnswer && definitionTopic) {
        const overviewChunks = await retrieveBookOverviewChunks(bookId, 16);
        const overviewAnswer = buildDirectGroundedAnswer(question, overviewChunks);

        retrievalMs = Date.now() - retrievalStartedAt;

        if (overviewAnswer) {
          answerChunks = overviewChunks;
          sources = answerChunks.slice(0, 3).map(formatSourceLabel);
          directAnswer = overviewAnswer;
          directFallbackReason = 'specific_definition_overview_direct';
        }
      }

      if (!directAnswer && definitionTopic) {
        if (hasAnswerHelperPrepared && !llmErrorRef.current) {
          const isAnswerHelperReady = await waitForAnswerHelperReady();

          if (isAnswerHelperReady) {
            llm.configure({ generationConfig });

            const generated = await generateReliableAnswer(
              buildGroundedMessages(
                question,
                answerChunks.slice(0, 4),
                conversationContext
              ) as Message[],
              (answer) =>
                isUsableGeneratedAnswer(answer) &&
                !isBadGroundedAnswer(answer)
            );

            if (generated.text) {
              return makeResponse({
                text: generated.text,
                sources,
                answerMode: 'grounded',
                confidence: retrievalResult.confidence,
                retrievalMs,
                generationMs: generated.generationMs,
                topScore: retrievalResult.topScore,
                fallbackReason: 'specific_definition_grounded_generation',
              });
            }
          }
        }

        return makeResponse({
          text: 'I found related lesson text, but ALAB could not prepare a clear definition from it yet. Try asking for the chapter or topic summary.',
          sources,
          answerMode: 'grounded',
          confidence: 'low',
          retrievalMs,
          topScore: retrievalResult.topScore,
          fallbackReason: 'specific_definition_related_text_no_clear_answer',
        });
      }

      if (directAnswer) {
        return makeResponse({
          text: directAnswer,
          sources,
          answerMode: 'grounded',
          confidence: retrievalResult.confidence,
          retrievalMs,
          topScore: retrievalResult.topScore,
          fallbackReason: directFallbackReason,
        });
      }

      return makeResponse({
        text: 'This lesson does not provide enough information to answer that.',
        answerMode: 'status',
        confidence: 'none',
        retrievalMs,
        topScore: retrievalResult.topScore,
        fallbackReason: 'specific_retrieval_no_direct_answer',
      });
    },
    [
      bookId,
      embeddings,
      hasAnswerHelperPrepared,
      hasCheckedDownload,
      generateReliableAnswer,
      llm,
      shouldLoadEmbeddings,
      waitForAnswerHelperReady,
    ]
  );

  const generateStudyTool = useCallback(
    async (
      tool: 'quiz' | 'flashcards',
      mode: StudyToolMode = 'mcq',
      requestedCount?: number,
      conversationContext?: string
    ): Promise<OfflineAiResponse> => {
      generationCancelledRef.current = false;
      const startedAt = Date.now();
      const makeStudyResponse = async ({
        text,
        sources = [],
        confidence = 'none',
        retrievalMs,
        generationMs,
        topScore = null,
        fallbackReason = null,
      }: {
        text: string;
        sources?: string[];
        confidence?: AiAnswerConfidence;
        retrievalMs?: number;
        generationMs?: number;
        topScore?: number | null;
        fallbackReason?: string | null;
      }): Promise<OfflineAiResponse> => {
        const metrics: OfflineAiMetrics = {
          retrievalMs,
          generationMs,
          totalMs: Date.now() - startedAt,
          sourceCount: sources.length,
          topScore,
          fallbackReason,
        };

        try {
          await saveAiPerformanceMetric({
            bookId,
            answerMode: sources.length > 0 ? 'study_tool' : 'status',
            confidence,
            retrievalMs,
            generationMs,
            totalMs: metrics.totalMs,
            sourceCount: sources.length,
            topScore,
            fallbackReason,
            outputLength: text.length,
            showedSources: sources.length > 0,
          });
        } catch {
          // The study tool remains useful even if metrics cannot be saved.
        }

        return {
          text,
          sources,
          answerMode: sources.length > 0 ? 'study_tool' : 'status',
          confidence,
          metrics,
        };
      };

      const safety = conversationContext
        ? classifyStudentInput(conversationContext)
        : { status: 'safe' as const };

      if (safety.status === 'blocked') {
        return makeStudyResponse({
          text: safety.responseText ?? '',
          fallbackReason: 'student_safety_blocked',
        });
      }

      if (!hasCheckedDownload) {
        return makeStudyResponse({
          text: `Checking your saved study helper before making ${tool === 'quiz' ? 'this quiz' : 'these flashcards'}...`,
          fallbackReason: 'checking_download',
        });
      }

      const hasChunks = await hasReadyStudyChunks(bookId);

      if (!hasChunks) {
        return makeStudyResponse({
          text: `ALAB is still preparing your lesson. Please wait until the source says Ready to study, then ask for ${tool === 'quiz' ? 'the quiz' : 'flashcards'} again.`,
          fallbackReason: 'no_ready_chunks',
        });
      }

      const itemCount = getStudyToolItemCount(tool, requestedCount);
      const query =
        tool === 'quiz'
          ? `${itemCount} ${mode} quiz topics from ${bookTitle}`
          : `${itemCount} key terms and concepts from ${bookTitle}`;
      const contextualQuery = buildGroundedRetrievalQuery(
        query,
        conversationContext,
        true
      );
      const retrievalStartedAt = Date.now();
      const queryEmbedding = shouldLoadEmbeddings && embeddings.isReady
        ? await embeddings.forward(formatEmbeddingInput(contextualQuery, 'query'))
        : null;
      const chunks = await retrieveStudyToolChunks(
        bookId,
        contextualQuery,
        queryEmbedding,
        embeddingModelName,
        itemCount
      );
      const retrievalMs = Date.now() - retrievalStartedAt;

      if (chunks.length === 0) {
        return makeStudyResponse({
          text: `ALAB is still preparing your lesson. Please wait until the source says Ready to study, then ask for ${tool === 'quiz' ? 'the quiz' : 'flashcards'} again.`,
          retrievalMs,
          fallbackReason: 'no_study_tool_chunks',
        });
      }

      const fallbackToolText = buildSimpleStudyToolFallback(
        tool,
        chunks,
        mode,
        itemCount,
        getStudyToolVariant(conversationContext)
      );
      const sources = chunks.map(formatSourceLabel);
      let finalToolText = fallbackToolText;
      let generationMs: number | undefined;
      let confidence: AiAnswerConfidence = 'medium';
      let fallbackReason: string | null = hasAnswerHelperPrepared
        ? null
        : 'study_tool_local_fallback_answer_helper_not_prepared';

      if (hasAnswerHelperPrepared && !llmErrorRef.current) {
        if (llm.isReady) {
          llm.configure({ generationConfig });
          const generationStartedAt = Date.now();
          const generatedToolText = await generateLlmText(
            buildStudyToolMessages(tool, bookTitle, chunks, {
              itemCount,
              mode,
              conversationContext,
            }) as Message[],
            studyToolGenerationWatchdog
          );
          generationMs = Date.now() - generationStartedAt;
          const normalizedToolText = normalizeStudyToolOutput(generatedToolText);
          const generatedItemCount = countValidStudyToolItems(
            tool,
            mode,
            normalizedToolText
          );
          const mergedToolText = mergeValidatedStudyToolOutput(
            tool,
            mode,
            normalizedToolText,
            fallbackToolText,
            itemCount
          );

          if (mergedToolText) {
            finalToolText = mergedToolText;
          }

          const mergedItemCount = countValidStudyToolItems(
            tool,
            mode,
            finalToolText
          );

          if (generatedItemCount >= itemCount && mergedItemCount >= itemCount) {
            confidence = 'high';
            fallbackReason = null;
          } else if (mergedItemCount >= itemCount) {
            confidence = 'medium';
            fallbackReason = 'study_tool_llm_partial_local_completion';
          } else if (generatedItemCount > 0) {
            confidence = 'low';
            fallbackReason = 'study_tool_llm_partial_count_shortfall';
          } else {
            fallbackReason = 'study_tool_llm_invalid_local_fallback';
          }
        } else {
          fallbackReason = 'study_tool_llm_not_open_local_fallback';
        }
      } else if (hasAnswerHelperPrepared && llmErrorRef.current) {
        fallbackReason = 'study_tool_llm_error_local_fallback';
      }

      let finalItemCount = countValidStudyToolItems(tool, mode, finalToolText);

      if (tool === 'quiz' && finalItemCount === 0) {
        return makeStudyResponse({
          text: `ALAB could not make quiz questions yet. Please try again.`,
          retrievalMs,
          generationMs,
          topScore: chunks[0]?.score ?? null,
          fallbackReason: fallbackReason ?? 'quiz_count_shortfall',
        });
      }

      if (tool === 'quiz' && finalItemCount < itemCount) {
        confidence = confidence === 'high' ? 'medium' : confidence;
        fallbackReason = fallbackReason ?? 'quiz_clean_count_shortfall';
      }

      if (
        tool === 'quiz' &&
        mode === 'mcq' &&
        !hasValidMcqQuiz(finalToolText)
      ) {
        return makeStudyResponse({
          text: 'ALAB found readable lesson text, but it does not contain enough distinct facts to build a multiple-choice quiz yet.',
          retrievalMs,
          generationMs,
          topScore: chunks[0]?.score ?? null,
          fallbackReason: fallbackReason ?? 'invalid_mcq_quiz',
        });
      }

      if (
        tool === 'flashcards' &&
        finalItemCount < itemCount
      ) {
        const recoveredFlashcards = parseRecoverableFlashcardDeck(finalToolText, itemCount);

        if (recoveredFlashcards.length > finalItemCount) {
          finalToolText = formatFlashcards(recoveredFlashcards);
          finalItemCount = countValidStudyToolItems(tool, mode, finalToolText);
          confidence = finalItemCount >= itemCount ? 'high' : 'medium';
          fallbackReason = finalItemCount >= itemCount
            ? fallbackReason
            : 'flashcard_clean_count_shortfall';
        }

        if (finalItemCount === 0) {
          return makeStudyResponse({
            text: 'ALAB found readable lesson text, but it does not contain enough clear terms and definitions to build flashcards yet.',
            retrievalMs,
            generationMs,
            topScore: chunks[0]?.score ?? null,
            fallbackReason: fallbackReason ?? 'invalid_flashcards',
          });
        } else {
          confidence = confidence === 'high' ? 'medium' : confidence;
          fallbackReason = fallbackReason ?? 'flashcard_clean_count_shortfall';
        }
      }

      try {
        await saveGeneratedStudyTool(
          tool,
          bookId,
          chunks.map((chunk) => chunk.id),
          finalToolText
        );
      } catch {
        // The generated message is still useful even if study-tool history fails.
      }

      return makeStudyResponse({
        text: finalToolText,
        sources,
        confidence,
        retrievalMs,
        generationMs,
        topScore: chunks[0]?.score ?? null,
        fallbackReason,
      });
    },
    [
      bookId,
      bookTitle,
      embeddings,
      generateLlmText,
      hasAnswerHelperPrepared,
      hasCheckedDownload,
      llm,
      shouldLoadEmbeddings,
    ]
  );

  const prepareAnswerHelper = useCallback(() => {
    if (hasAnswerHelperPrepared && !shouldLoadLlm) {
      setShouldLoadLlm(true);
    }
  }, [hasAnswerHelperPrepared, shouldLoadLlm]);

  const hasActiveGeneration = useCallback(
    () => Boolean(activeGenerationPromiseRef.current || llmGeneratingRef.current),
    []
  );

  const stopActiveGeneration = useCallback(async () => {
    if (!hasActiveGeneration()) {
      return true;
    }

    generationCancelledRef.current = true;
    interruptLlm();

    const startedAt = Date.now();

    while (hasActiveGeneration() && Date.now() - startedAt < 15000) {
      await delay(50);
    }

    return !hasActiveGeneration();
  }, [hasActiveGeneration, interruptLlm]);

  const embedLessonText = useCallback(
    async (text: string): Promise<Float32Array | null> => {
      if (!shouldLoadEmbeddings || !embeddings.isReady || embeddings.error) {
        return null;
      }

      try {
        return await embeddings.forward(formatEmbeddingInput(text, 'passage'));
      } catch {
        return null;
      }
    },
    [embeddings, shouldLoadEmbeddings]
  );

  return {
    answerQuestion,
    generateStudyTool,
    prepareAnswerHelper,
    stopActiveGeneration,
    hasActiveGeneration,
    embedLessonText,
    embeddingModelName,
    isAvailable,
    hasCheckedDownload,
    isAnswerHelperPrepared: hasAnswerHelperPrepared,
    shouldLoadModel: hasAnswerHelperPrepared || hasSearchHelperPrepared,
    isModelReady: llm.isReady,
    isEmbeddingReady: embeddings.isReady,
    isGenerating: llm.isGenerating,
    llmDownloadProgress: llm.downloadProgress,
    embeddingDownloadProgress: embeddings.downloadProgress,
    error: llm.error ?? embeddings.error,
  };
}

async function saveGeneratedStudyTool(
  tool: 'quiz' | 'flashcards',
  bookId: string,
  chunkIds: string[],
  text: string
) {
  try {
    if (tool === 'quiz') {
      await saveGeneratedQuiz(bookId, chunkIds, text);
      return;
    }

    await saveGeneratedFlashcards(bookId, chunkIds, text);
  } catch {
    // The generated message is still useful even if study-tool history fails.
  }
}
