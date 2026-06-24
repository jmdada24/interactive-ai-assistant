import { AnswerIntent, isGenericSourceOverviewRequest } from './answers';

export type ChatRoute = {
  intent: AnswerIntent;
  directAnswer?: string;
  reason: string;
};

export function getChatRoute(question: string, hasSources: boolean): ChatRoute {
  const directAnswer = getDirectChatAnswer(question);

  if (directAnswer) {
    return {
      intent: 'general',
      directAnswer,
      reason: 'direct_chat',
    };
  }

  if (isSourceOverviewQuestion(question)) {
    return {
      intent: hasSources ? 'summary' : 'general',
      reason: hasSources ? 'source_overview' : 'overview_without_sources',
    };
  }

  if (isExplicitSourceQuestion(question)) {
    return {
      intent: 'grounded',
      reason: 'explicit_source',
    };
  }

  if (isGeneralConversation(question) || isGeneralTask(question)) {
    return {
      intent: 'general',
      reason: 'general_chat',
    };
  }

  if (hasSources && isLikelyStudyQuestion(question)) {
    return {
      intent: 'grounded',
      reason: 'study_question_try_sources',
    };
  }

  return {
    intent: 'general',
    reason: hasSources ? 'not_source_specific' : 'no_sources',
  };
}

function getDirectChatAnswer(question: string) {
  const normalized = normalizeQuestion(question);

  if (/^(hi|hello|hey|yo|good morning|good afternoon|good evening|kumusta|kamusta)\b/.test(normalized)) {
    return 'Hi, I am ALAB. Ask me about your lesson, a homework question, or anything you want explained in a simpler way.';
  }

  if (/^(thanks|thank you|salamat)\b/.test(normalized)) {
    return 'You are welcome. Keep going, one question at a time.';
  }

  if (/^(who are you|what are you|what is alab)\b/.test(normalized)) {
    return 'I am ALAB, your offline study assistant. I can answer from your uploaded lessons when they are relevant, and I can also help explain common study questions.';
  }

  return '';
}

function isSourceOverviewQuestion(question: string) {
  const normalized = normalizeQuestion(question);

  return (
    isGenericSourceOverviewRequest(question) ||
    /\b(what|tell|explain|summarize|summarise|describe)\b.{0,40}\b(topic|lesson|book|pdf|source|material)\b.{0,30}\b(about|overview|all about|main idea)\b/.test(normalized) ||
    /\bwhat\s+is\s+this\s+topic\s+(all\s+)?about\b/.test(normalized)
  );
}

function isExplicitSourceQuestion(question: string) {
  const normalized = normalizeQuestion(question);

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

function isGeneralConversation(question: string) {
  const normalized = normalizeQuestion(question);
  const words = normalized.split(/\s+/).filter(Boolean);

  return (
    words.length <= 4 &&
    /^(ok|okay|yes|no|nice|cool|great|wait|again|continue|help|please help)\b/.test(normalized)
  );
}

function isGeneralTask(question: string) {
  const normalized = normalizeQuestion(question);

  return (
    /^[\d\s+\-*/().=]+$/.test(normalized) ||
    /\b(write|create|make|give me|show me)\b.+\b(code|program|example|template|letter|essay|story|sentence|paragraph)\b/.test(normalized) ||
    /\btranslate\b|\bgrammar\b|\brewrite\b|\bproofread\b/.test(normalized)
  );
}

function isLikelyStudyQuestion(question: string) {
  const normalized = normalizeQuestion(question);

  return (
    /\b(what|who|when|where|why|how|define|explain|describe|compare|solve|calculate|example|meaning)\b/.test(normalized) ||
    normalized.endsWith('?')
  );
}

function normalizeQuestion(question: string) {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+\-*/().=]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
