import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { classifyStudentInput } from '../../../../ai/rag/agent/studentSafety';
import { useOfflineSpeech } from '../../../../ai/useOfflineSpeech';
import { IconMic, IconSend } from '../../../../components/icons/icons';
import { appendChatMessage, hasProcessingSources, listRecentChatMessagesByBook } from '../../../../data/database';
import { Book } from '../../../../types/Book';
import { ChatMessage, OfflineAi } from '../types';
import { formatAiStatus, formatAnalysisDuration, getComposerPlaceholder, getStudyToolIntent, mapStoredChatMessage } from './chatHelpers';
import { RenderedMarkdown, TypingDots } from './MessageContent';
import { styles } from './styles';

export function ALABChat({
  book,
  offlineAi,
  onComposerFocusChange,
}: {
  book: Book;
  offlineAi: OfflineAi;
  onComposerFocusChange?: (isFocused: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 700;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [pendingVoiceStart, setPendingVoiceStart] = useState(false);
  const offlineSpeech = useOfflineSpeech();

  const scrollRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);
  const activeRequestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      activeRequestIdRef.current += 1;
      setIsComposerFocused(false);
      onComposerFocusChange?.(false);
    };
  }, [onComposerFocusChange]);

  useEffect(() => {
    const keyboardDidHide = Keyboard.addListener('keyboardDidHide', () => {
      setIsComposerFocused(false);
      onComposerFocusChange?.(false);
    });

    return () => keyboardDidHide.remove();
  }, [onComposerFocusChange]);

  useEffect(() => {
    let isActive = true;

    listRecentChatMessagesByBook(book.id)
      .then((savedMessages) => {
        if (isActive) {
          setMessages(savedMessages.map(mapStoredChatMessage));
        }
      })
      .catch(() => {
        if (isActive) {
          setMessages([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [book.id]);

  const handleSend = useCallback(async (promptText?: string) => {
    if (isTyping) {
      return;
    }

    const question = (promptText ?? input).trim();

    if (!question) return;

    const safety = classifyStudentInput(question);

    if (safety.status === 'blocked') {
      const safetyMessage: ChatMessage = {
        id: `safety-${Date.now()}`,
        role: 'ai',
        text: safety.responseText ?? '',
        kind: 'status',
      };

      if (isMountedRef.current) {
        setInput('');
        setMessages((previous) => [...previous, safetyMessage]);
      }

      await appendChatMessage(book.id, {
        role: 'ai',
        text: safetyMessage.text,
        kind: 'status',
      });
      return;
    }

    const conversationContext = buildConversationContext(messages);
    const requestId = activeRequestIdRef.current + 1;
    const startedAt = Date.now();
    activeRequestIdRef.current = requestId;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: question,
    };

    if (isMountedRef.current) {
      setMessages((previous) => [...previous, userMessage]);
    }
    await appendChatMessage(book.id, {
      role: 'user',
      text: question,
      kind: 'answer',
    });
    if (isMountedRef.current && activeRequestIdRef.current === requestId) {
      setInput('');
      setIsTyping(true);
    }

    try {
      const isReadingSources = await hasProcessingSources(book.id);

      if (!isMountedRef.current || activeRequestIdRef.current !== requestId) {
        return;
      }

      if (isReadingSources) {
        const statusMessage: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'ai',
          text: 'Analyzing the book. Please wait...',
          kind: 'status',
        };

        setMessages((previous) => [...previous, statusMessage]);
        await appendChatMessage(book.id, {
          role: 'ai',
          text: statusMessage.text,
          kind: 'status',
        });
        return;
      }

      const intent = getStudyToolIntent(question);
      const waitingMessageId = `waiting-${Date.now()}`;
      const waitingMessage = intent
        ? intent.tool === 'quiz'
          ? 'ALAB is preparing this quiz from your lesson. Please wait...'
          : 'ALAB is preparing these flashcards from your lesson. Please wait...'
        : null;

      if (waitingMessage) {
        setMessages((previous) => [
          ...previous,
          {
            id: waitingMessageId,
            role: 'ai',
            text: waitingMessage,
            kind: 'status',
          },
        ]);
      }

      const answer = intent
        ? await offlineAi.generateStudyTool(
          intent.tool,
          intent.mode,
          intent.count,
          [conversationContext, `Student request: ${question}`]
            .filter(Boolean)
            .join('\n')
        )
        : await offlineAi.answerQuestion(question, conversationContext);

      if (!isMountedRef.current || activeRequestIdRef.current !== requestId) {
        return;
      }

      const aiKind: ChatMessage['kind'] = answer.answerMode === 'status'
          ? 'status'
          : 'answer';
      const aiMessage: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'ai',
        text: answer.text,
        sources: answer.sources,
        analysisText: `Analyzed ${formatAnalysisDuration(Date.now() - startedAt)}`,
        kind: aiKind,
      };

      await appendChatMessage(book.id, {
        role: 'ai',
        text: aiMessage.text,
        sources: aiMessage.sources,
        kind: aiMessage.kind,
      });
      setMessages((previous) => [
        ...previous,
        aiMessage,
      ]);
    } catch {
      if (!isMountedRef.current || activeRequestIdRef.current !== requestId) {
        return;
      }

      const aiMessage: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'ai',
        text: 'Something went wrong while ALAB was preparing the offline answer. Please try again.',
        analysisText: `Analyzed ${formatAnalysisDuration(Date.now() - startedAt)}`,
        kind: 'status',
      };

      setMessages((previous) => [
        ...previous,
        aiMessage,
      ]);
      await appendChatMessage(book.id, {
        role: 'ai',
        text: aiMessage.text,
        kind: 'status',
      });
    } finally {
      if (isMountedRef.current && activeRequestIdRef.current === requestId) {
        setIsTyping(false);
      }
    }
  }, [book.id, input, isTyping, messages, offlineAi]);

  const addLocalStatusMessage = useCallback((text: string) => {
    const statusMessage: ChatMessage = {
      id: `voice-status-${Date.now()}`,
      role: 'ai',
      text,
      kind: 'status',
    };

    setMessages((previous) => [...previous, statusMessage]);
  }, []);

  const startVoiceCapture = useCallback(async () => {
    try {
      const didStart = await offlineSpeech.startListening();

      if (!didStart) {
        addLocalStatusMessage('Please allow microphone access so ALAB can listen to your question.');
        setPendingVoiceStart(false);
        return;
      }

      addLocalStatusMessage('I am listening. Tap the mic again when you are done.');
      setPendingVoiceStart(false);
    } catch {
      addLocalStatusMessage('Voice input could not start. Please try again.');
      setPendingVoiceStart(false);
    }
  }, [addLocalStatusMessage, offlineSpeech]);

  const handleVoicePress = useCallback(async () => {
    if (isTyping || offlineSpeech.isTranscribing || pendingVoiceStart) {
      return;
    }

    if (offlineSpeech.isListening) {
      try {
        const transcript = await offlineSpeech.stopAndTranscribe();

        if (!transcript) {
          addLocalStatusMessage('I did not hear a question. Please try again.');
          return;
        }

        setInput(transcript);
        addLocalStatusMessage('I added what I heard to the message box.');
      } catch {
        addLocalStatusMessage('Voice input could not prepare your question. Please try again.');
      }

      return;
    }

    if (!offlineSpeech.isVoiceAvailable) {
      addLocalStatusMessage('Voice input needs the Android app build.');
      return;
    }

    const hasMicPermission = await offlineSpeech.requestPermission();

    if (!hasMicPermission) {
      addLocalStatusMessage('Please allow microphone access so ALAB can listen to your question.');
      return;
    }

    if (!offlineSpeech.hasCheckedDownload) {
      addLocalStatusMessage('Checking your saved study helper...');
      return;
    }

    if (!offlineSpeech.shouldLoadModel) {
      addLocalStatusMessage('Please prepare the study helper from My Books first.');
      return;
    }

    if (!offlineSpeech.isReady) {
      const didPrepare = offlineSpeech.prepareVoiceInput();
      const progress = Math.round(offlineSpeech.downloadProgress * 100);

      if (didPrepare) {
        setPendingVoiceStart(true);
      }

      addLocalStatusMessage(
        `Voice input is getting ready${progress > 0 ? ` (${progress}%)` : ''}.`
      );
      return;
    }

    await startVoiceCapture();
  }, [
    addLocalStatusMessage,
    isTyping,
    offlineSpeech,
    pendingVoiceStart,
    startVoiceCapture,
  ]);

  useEffect(() => {
    if (!pendingVoiceStart || isTyping || offlineSpeech.isListening || offlineSpeech.isTranscribing) {
      return;
    }

    if (offlineSpeech.error) {
      setPendingVoiceStart(false);
      addLocalStatusMessage('Voice input could not get ready. Please try again.');
      return;
    }

    if (!offlineSpeech.isReady) {
      return;
    }

    void startVoiceCapture();
  }, [
    addLocalStatusMessage,
    isTyping,
    offlineSpeech.error,
    offlineSpeech.isListening,
    offlineSpeech.isReady,
    offlineSpeech.isTranscribing,
    pendingVoiceStart,
    startVoiceCapture,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);

    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  return (
    <View style={styles.chatRoot}>
      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.chatContent,
          isComposerFocused && styles.chatContentKeyboardFocused,
          isTablet && styles.tabletTabContent,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && !isTyping ? (
          <View style={styles.chatIntro}>
            <Text style={styles.chatIntroTitle}>{"Let's study together..."}</Text>

            <Text style={styles.chatIntroText}>
              I only use the lessons you uploaded. Ask me anything,
              ask for examples, or ask for a simpler explanation.
            </Text>

            <Text style={styles.aiStatusText}>
              {formatAiStatus(offlineAi)}
            </Text>
          </View>
        ) : (
          <View style={styles.messageList}>
            {messages.map((message) => {
              const isUser = message.role === 'user';

              return (
                <View
                  key={message.id}
                  style={[
                    styles.messageRow,
                    isUser ? styles.messageRowUser : styles.messageRowAI,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isUser ? styles.userBubble : styles.aiBubble,
                    ]}
                  >
                    {isUser ? (
                      <Text style={[styles.messageText, styles.userMessageText]}>
                        {message.text}
                      </Text>
                    ) : (
                      <RenderedMarkdown text={message.text} />
                    )}

                    {!isUser && message.analysisText ? (
                      <Text style={styles.analysisText}>{message.analysisText}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}

            {isTyping ? (
              <View style={[styles.messageRow, styles.messageRowAI]}>
                <View style={styles.typingBubble}>
                  <TypingDots />
                </View>
              </View>
            ) : null}

            {isComposerFocused ? (
              <View style={styles.keyboardScrollSpacer} />
            ) : null}
          </View>
        )}
      </ScrollView>

      <KeyboardStickyView
        enabled={Platform.OS === 'android' || Platform.OS === 'ios'}
        offset={{ closed: 0, opened: 18 }}
        style={styles.chatInputDock}
      >
        <View
          style={[
            styles.chatInputArea,
            {
              paddingBottom: isComposerFocused ? 14 : Math.max(insets.bottom, 6),
            },
          ]}
        >
          <View style={styles.chatInputBar}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={getComposerPlaceholder(offlineSpeech)}
              placeholderTextColor="#747685"
              editable={!isTyping && !offlineSpeech.isListening && !offlineSpeech.isTranscribing}
              style={[styles.chatInput, isTyping && styles.disabledChatInput]}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
              onFocus={() => {
                setIsComposerFocused(true);
                onComposerFocusChange?.(true);
                setTimeout(() => {
                  scrollRef.current?.scrollToEnd({ animated: true });
                }, 120);
                setTimeout(() => {
                  scrollRef.current?.scrollToEnd({ animated: true });
                }, 320);
              }}
              onBlur={() => {
                setIsComposerFocused(false);
                onComposerFocusChange?.(false);
              }}
            />

            <Pressable
              disabled={isTyping || offlineSpeech.isTranscribing || pendingVoiceStart}
              onPress={handleVoicePress}
              style={[
                styles.voiceButton,
                offlineSpeech.isListening && styles.listeningVoiceButton,
                (isTyping || offlineSpeech.isTranscribing || pendingVoiceStart) &&
                  styles.disabledVoiceButton,
              ]}
            >
              <IconMic
                color={offlineSpeech.isListening ? '#ffffff' : '#002576'}
                size={17}
              />
            </Pressable>

            <Pressable
              disabled={isTyping || offlineSpeech.isListening || offlineSpeech.isTranscribing}
              onPress={() => handleSend()}
              style={[
                styles.sendButton,
                (isTyping || offlineSpeech.isListening || offlineSpeech.isTranscribing) &&
                  styles.disabledSendButton,
              ]}
            >
              <IconSend color="#ffffff" size={13.3} />
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>

    </View>
  );
}

function buildConversationContext(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.kind !== 'status')
    .slice(-8)
    .map((message) => {
      const role = message.role === 'user' ? 'Student' : 'ALAB';
      const kind = message.kind === 'quiz'
        ? 'quiz'
        : message.kind === 'flashcards'
          ? 'flashcards'
          : 'message';
      const text = compactMessageText(message.text, message.kind);

      return `${role} ${kind}: ${text}`;
    })
    .join('\n');
}

function compactMessageText(
  text: string,
  kind?: ChatMessage['kind']
) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const maxLength = kind === 'quiz' || kind === 'flashcards' ? 260 : 180;

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
}
