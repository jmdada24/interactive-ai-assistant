import type { Message } from 'react-native-executorch';
import { isBadGroundedAnswer } from './rag/agent/answers';

export type GenerationWatchdog = {
  firstTokenMs: number;
  idleMs: number;
  maximumMs: number;
};

export function withGenerationWatchdog(
  promise: Promise<string>,
  getGeneratedTokenCount: () => number,
  watchdog: GenerationWatchdog,
  onStall: () => void
): Promise<string> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let lastProgressAt = startedAt;
    let lastTokenCount = 0;
    let didFinish = false;
    const finish = (value: string) => {
      if (didFinish) {
        return;
      }

      didFinish = true;
      clearInterval(progressTimer);
      resolve(value);
    };
    const progressTimer = setInterval(() => {
      let tokenCount = lastTokenCount;

      try {
        tokenCount = getGeneratedTokenCount();
      } catch {
        // Native progress can be briefly unavailable while generation starts.
      }

      if (tokenCount > lastTokenCount) {
        lastTokenCount = tokenCount;
        lastProgressAt = Date.now();
      }

      const now = Date.now();
      const allowedIdleMs = lastTokenCount > 0
        ? watchdog.idleMs
        : watchdog.firstTokenMs;
      const hasStalled = now - lastProgressAt >= allowedIdleMs;
      const exceededSafetyLimit = now - startedAt >= watchdog.maximumMs;

      if (hasStalled || exceededSafetyLimit) {
        onStall();
        finish('');
      }
    }, 500);

    promise
      .then(finish)
      .catch(() => finish(''));
  });
}

export function buildRecoveryMessages(messages: Message[]) {
  return messages.map((message, index) => {
    if (index !== messages.length - 1 || message.role !== 'user') {
      return message;
    }

    return {
      ...message,
      content: [
        message.content,
        'Your previous attempt was empty or unusable. Answer the student’s exact question now.',
        'Return only the final direct answer. Use one to three concise sentences for a simple question.',
        'Do not mention sources, lesson context, PDFs, retrieval, or this retry instruction.',
      ].join('\n\n'),
    };
  });
}

export function isUsableGeneratedAnswer(answer: string) {
  const normalized = answer.toLowerCase().trim();

  return (
    normalized.length >= 12 &&
    !normalized.includes('could not generate') &&
    !normalized.includes('unable to generate') &&
    !normalized.includes('as an ai') &&
    !normalized.includes('student question:')
  );
}

export function isUsableGroundedAnswer(answer: string) {
  return isUsableGeneratedAnswer(answer) && !isBadGroundedAnswer(answer);
}

export function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
