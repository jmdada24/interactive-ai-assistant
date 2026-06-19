export type StudentSafetyStatus = 'safe' | 'educational_sensitive' | 'blocked';

export type StudentSafetyResult = {
  status: StudentSafetyStatus;
  responseText?: string;
};

export const studentSafetyRedirect =
  "Let's keep ALAB focused on studying. You can ask me about your lesson, a topic you want to understand, or a quiz/flashcard request.";

export function classifyStudentInput(text: string): StudentSafetyResult {
  const normalized = normalizeSafetyText(text);

  if (!normalized) {
    return { status: 'safe' };
  }

  const words = normalized.split(' ').filter(Boolean);
  const hasEducationalContext = hasAnyTerm(normalized, educationalContextTerms);
  const hasSensitiveEducationalTerm = hasAnyTerm(
    normalized,
    sensitiveEducationalTerms
  );
  const hasProfanity = hasAnyToken(words, profanityTerms);
  const hasHarassment = harassmentPatterns.some((pattern) =>
    pattern.test(normalized)
  );
  const hasSexualMisuse = sexualMisusePatterns.some((pattern) =>
    pattern.test(normalized)
  );
  const isMostlyProfanity =
    hasProfanity &&
    !hasEducationalContext &&
    words.length <= 8 &&
    words.filter((word) => profanityTerms.has(word)).length >=
      Math.max(1, Math.ceil(words.length / 2));

  if (hasEducationalContext && hasSensitiveEducationalTerm && !hasHarassment) {
    return { status: 'educational_sensitive' };
  }

  if (hasSexualMisuse || hasHarassment || isMostlyProfanity) {
    return {
      status: 'blocked',
      responseText: studentSafetyRedirect,
    };
  }

  if (hasSensitiveEducationalTerm) {
    return { status: 'educational_sensitive' };
  }

  return { status: 'safe' };
}

export function shouldBlockStudentInput(text: string) {
  return classifyStudentInput(text).status === 'blocked';
}

function normalizeSafetyText(text: string) {
  return text
    .toLowerCase()
    .replace(/[@$]/g, (value) => (value === '@' ? 'a' : 's'))
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAnyTerm(text: string, terms: Set<string>) {
  return Array.from(terms).some((term) =>
    new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(text)
  );
}

function hasAnyToken(words: string[], terms: Set<string>) {
  return words.some((word) => terms.has(word));
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const educationalContextTerms = new Set([
  'abuse',
  'anatomy',
  'biology',
  'book',
  'chapter',
  'class',
  'consent',
  'definition',
  'education',
  'explain',
  'flashcard',
  'health',
  'history',
  'infection',
  'law',
  'lesson',
  'literature',
  'material',
  'module',
  'pdf',
  'pregnancy',
  'quiz',
  'reproductive',
  'research',
  'science',
  'source',
  'study',
  'summarize',
  'teacher',
  'textbook',
  'topic',
]);

const sensitiveEducationalTerms = new Set([
  'assault',
  'breast',
  'condom',
  'genital',
  'hiv',
  'naked',
  'nude',
  'penis',
  'porn',
  'pregnancy',
  'puberty',
  'rape',
  'reproductive',
  'sex',
  'sexual',
  'sti',
  'std',
  'vagina',
]);

const profanityTerms = new Set([
  'asshole',
  'bastard',
  'bitch',
  'bullshit',
  'damn',
  'fuck',
  'fucker',
  'fucking',
  'idiot',
  'moron',
  'shit',
  'stupid',
]);

const harassmentPatterns = [
  /\b(?:you|u|they|he|she)\s+(?:are|re|is)\s+(?:an?\s+)?(?:idiot|moron|stupid|bitch|asshole)\b/i,
  /\b(?:kill|hurt)\s+(?:yourself|urself|him|her|them|that person)\b/i,
  /\b(?:i\s+)?hate\s+(?:you|him|her|them|my teacher|that student)\b/i,
];

const sexualMisusePatterns = [
  /\b(?:send|show|give|make|create|write|describe|tell)\b.{0,40}\b(?:porn|nude|nudes|naked|erotic)\b/i,
  /\b(?:how\s+to|teach\s+me\s+to)\b.{0,40}\b(?:seduce|have sex|get nudes)\b/i,
  /\b(?:sex|sexual)\b.{0,30}\b(?:fantasy|roleplay|story|scene)\b/i,
];
