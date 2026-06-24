export function buildSummaryRetrievalQuery(
  question: string,
  conversationContext?: string
) {
  return [conversationContext, question]
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function buildGroundedRetrievalQuery(
  question: string,
  conversationContext?: string,
  alwaysIncludeContext = false
) {
  if (!alwaysIncludeContext && !isFollowUpQuestion(question)) {
    return question.trim();
  }

  const recentStudentContext = (conversationContext ?? '')
    .split('\n')
    .filter((line) => /^Student\b/i.test(line))
    .slice(-2)
    .join('\n')
    .slice(-500);

  return [recentStudentContext, question]
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function expandGroundedRetrievalQuestion(question: string) {
  const definitionTopic = getSimpleDefinitionTopic(question);
  const extraTerms: string[] = [];

  if (definitionTopic) {
    extraTerms.push(
      definitionTopic,
      `${definitionTopic} definition`,
      `${definitionTopic} meaning`,
      `${definitionTopic} refers to`
    );
  }

  if (extraTerms.length === 0) {
    return question;
  }

  return `${question}\n${extraTerms.join(' ')}`;
}

export function getSimpleDefinitionTopic(question: string) {
  const match = question.match(
    /^\s*(?:what|who)\s+(?:is|are|was|were)\s+(.+?)[?.!]*\s*$/i
  );
  const topic = match?.[1]
    ?.toLowerCase()
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!topic || topic.split(/\s+/).length > 4) {
    return '';
  }

  return topic;
}

export function isStrictSourceOnlyRequest(question: string) {
  const normalized = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    /\b(only|strictly|just|must)\b.{0,40}\b(pdf|lesson|source|book|material)\b/.test(normalized) ||
    /\b(pdf|lesson|source|book|material)\b.{0,40}\b(only|strictly|just)\b/.test(normalized) ||
    /\bdo not use\b.{0,40}\b(general|outside|other|internet|prior)\b/.test(normalized)
  );
}

export function getStudyToolVariant(conversationContext?: string) {
  if (!conversationContext) {
    return 0;
  }

  let hash = 0;

  for (let index = 0; index < conversationContext.length; index += 1) {
    hash = (hash * 31 + conversationContext.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function isFollowUpQuestion(question: string) {
  const normalized = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  return (
    wordCount <= 12 &&
    /\b(it|its|this|that|these|those|they|them|more|again|continue|previous|above)\b/i.test(
      normalized
    )
  );
}
