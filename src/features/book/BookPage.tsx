import { useEffect, useRef, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import {
    IconChevronRight,
    IconFlashcard,
    IconPDF,
    IconPlus,
    IconQuiz,
    IconSend,
} from '../../components/icons/icons';
import { AppHeader } from '../../components/layout/AppHeader';
import { Screen } from '../../components/layout/Screen';
import { BookBottomNav, BookTab } from '../../components/navigation/BookBottomNav';
import { Book } from '../../types/Book';

type Source = {
  id: string;
  name: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'ai';
  text: string;
};

function SourcesTab({ book }: { book: Book }) {
  const [sources, setSources] = useState<Source[]>(
    book.sources > 0
      ? Array.from({ length: book.sources }, (_, index) => ({
          id: String(index + 1),
          name: `Chapter ${index + 1}.pdf`,
        }))
      : []
  );

  const handleUpload = () => {
    setSources((previous) => [
      ...previous,
      {
        id: String(previous.length + 1),
        name: `Chapter ${previous.length + 1}.pdf`,
      },
    ]);
  };

  if (sources.length === 0) {
    return (
      <View style={styles.emptySources}>
        <View style={styles.emptySourcesInner}>
          <Text style={styles.centerTitle}>Add your resources</Text>

          <Text style={styles.centerText}>
            Manage your study materials here. Upload PDFs or images to provide
            ALAB with the knowledge it needs to help you study.
          </Text>

          <Pressable
            onPress={handleUpload}
            style={({ pressed }) => [
              styles.uploadButton,
              pressed && styles.pressedScale,
            ]}
          >
            <IconPlus color="#002576" size={12} />
            <Text style={styles.uploadButtonText}>Upload PDF</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.sourcesContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.centerTitle}>Resources</Text>

      <Pressable
        onPress={handleUpload}
        style={({ pressed }) => [
          styles.uploadButton,
          pressed && styles.pressedScale,
        ]}
      >
        <IconPlus color="#002576" size={12} />
        <Text style={styles.uploadButtonText}>UPLOAD PDF</Text>
      </Pressable>

      <View style={styles.sourceList}>
        {sources.map((source) => (
          <View key={source.id} style={styles.sourceCard}>
            <View style={styles.pdfIconCircle}>
              <IconPDF color="#93000A" size={20} />
            </View>

            <Text style={styles.sourceName} numberOfLines={1}>
              {source.name}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function ChatTab({ book }: { book: Book }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const handleSend = () => {
    if (!input.trim()) return;

    const question = input.trim();

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: question,
    };

    setMessages((previous) => [...previous, userMessage]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const aiMessage: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'ai',
        text: `Great question about "${book.title}"! Based on your uploaded sources, I can help you understand this topic. Ask me to explain a concept, create a quiz, or give you a simpler explanation!`,
      };

      setMessages((previous) => [...previous, aiMessage]);
      setIsTyping(false);
    }, 1000);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);

    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  return (
    <KeyboardAvoidingView
      style={styles.chatRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && !isTyping ? (
          <View style={styles.chatIntro}>
            <Text style={styles.chatIntroTitle}>Let's study together...</Text>

            <Text style={styles.chatIntroText}>
              I only use the lessons your teacher uploaded. Ask me anything,
              request a quiz, or ask for a simpler explanation.
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
                  <Text
                    style={[
                      styles.messageBubble,
                      isUser ? styles.userBubble : styles.aiBubble,
                    ]}
                  >
                    {message.text}
                  </Text>
                </View>
              );
            })}

            {isTyping ? (
              <View style={[styles.messageRow, styles.messageRowAI]}>
                <View style={styles.typingBubble}>
                  <Text style={styles.typingText}>•••</Text>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <View style={styles.chatInputArea}>
        <View style={styles.chatInputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask a Question or Create Something..."
            placeholderTextColor="#747685"
            style={styles.chatInput}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          <Pressable onPress={handleSend} style={styles.sendButton}>
            <IconSend color="#ffffff" size={13.3} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ToolsTab({ book }: { book: Book }) {
  const [quizActive, setQuizActive] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  const sampleQuiz = [
    {
      question: `What is a key concept covered in "${book.title}"?`,
      options: [
        'States of Matter',
        'Long Division',
        'Sentence Structure',
        'Philippine History',
      ],
      correct: 0,
    },
    {
      question: 'Which of the following best describes energy?',
      options: [
        'The ability to do work',
        'A type of solid',
        'A chemical element',
        'A form of light only',
      ],
      correct: 0,
    },
  ];

  if (quizActive) {
    const question = sampleQuiz[quizStep % sampleQuiz.length];
    const isLast = quizStep >= sampleQuiz.length - 1;

    return (
      <ScrollView
        style={styles.tabScroll}
        contentContainerStyle={styles.quizContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.quizTopRow}>
          <Text style={styles.quizCounter}>
            QUESTION {Math.min(quizStep + 1, sampleQuiz.length)} /{' '}
            {sampleQuiz.length}
          </Text>

          <Pressable
            onPress={() => {
              setQuizActive(false);
              setQuizStep(0);
              setSelectedAnswer(null);
            }}
          >
            <Text style={styles.exitQuiz}>Exit Quiz</Text>
          </Pressable>
        </View>

        <View style={styles.quizCard}>
          <Text style={styles.quizQuestion}>{question.question}</Text>

          <View style={styles.optionList}>
            {question.options.map((option, index) => {
              const isCorrect =
                selectedAnswer !== null && index === question.correct;
              const isWrong =
                selectedAnswer === index && index !== question.correct;

              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    if (selectedAnswer !== null) return;

                    setSelectedAnswer(index);

                    setTimeout(() => {
                      if (isLast) {
                        setQuizActive(false);
                        setQuizStep(0);
                      } else {
                        setQuizStep((step) => step + 1);
                      }

                      setSelectedAnswer(null);
                    }, 800);
                  }}
                  style={[
                    styles.optionButton,
                    isCorrect && styles.correctOption,
                    isWrong && styles.wrongOption,
                  ]}
                >
                  <Text style={styles.optionText}>
                    {String.fromCharCode(65 + index)}. {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.toolsContent}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={styles.toolsTitle}>Study Tools</Text>

        <Text style={styles.toolsDescription}>
          Master your subjects with interactive tools. Generate quizzes or
          flashcards directly from your uploaded sources.
        </Text>
      </View>

      <View style={styles.toolCards}>
        <Pressable
          onPress={() => {
            setQuizActive(true);
            setQuizStep(0);
          }}
          style={({ pressed }) => [
            styles.toolCard,
            pressed && styles.pressedScale,
          ]}
        >
          <View style={styles.redAccent} />

          <View style={styles.quizIconCircle}>
            <IconQuiz color="#E12531" size={23.3} />
          </View>

          <Text style={styles.toolTitle}>Quiz</Text>
          <Text style={styles.toolDescription}>
            Test your knowledge on uploaded lessons.
          </Text>

          <View style={styles.chevronRow}>
            <View style={styles.chevronCircle}>
              <IconChevronRight color="#1A1C1C" size={10} />
            </View>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.toolCard,
            pressed && styles.pressedScale,
          ]}
        >
          <View style={styles.yellowAccent} />

          <View style={styles.flashcardIconCircle}>
            <IconFlashcard color="#D1A600" size={23.4} />
          </View>

          <Text style={styles.toolTitle}>Flashcards</Text>
          <Text style={styles.toolDescription}>
            Quick review for key terms and concepts.
          </Text>

          <View style={styles.chevronRow}>
            <View style={styles.chevronCircle}>
              <IconChevronRight color="#1A1C1C" size={10} />
            </View>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

type BookPageProps = {
  book: Book;
  onBack: () => void;
};

export function BookPage({ book, onBack }: BookPageProps) {
  const [activeTab, setActiveTab] = useState<BookTab>('sources');

  return (
    <Screen style={styles.screen}>
      <AppHeader onProfileClick={onBack} />

      <View style={styles.bookHeader}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backText}>My Books</Text>
        </Pressable>

        <Text style={styles.bookPageTitle} numberOfLines={1}>
          {book.title}
        </Text>
      </View>

      <View style={styles.tabContent}>
        {activeTab === 'sources' && <SourcesTab book={book} />}
        {activeTab === 'chat' && <ChatTab book={book} />}
        {activeTab === 'tools' && <ToolsTab book={book} />}
      </View>

      <BookBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f8f8f8',
  },
  bookHeader: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  backArrow: {
    color: '#0038a8',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  backText: {
    color: '#0038a8',
    fontSize: 14,
    fontWeight: '500',
  },
  bookPageTitle: {
    color: '#1a1c1c',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
  tabContent: {
    flex: 1,
    overflow: 'hidden',
  },
  tabScroll: {
    flex: 1,
  },
  emptySources: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySourcesInner: {
    width: '100%',
    maxWidth: 345,
    alignItems: 'center',
    gap: 16,
  },
  centerTitle: {
    color: '#002576',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '600',
    textAlign: 'center',
  },
  centerText: {
    color: '#444653',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    textAlign: 'center',
  },
  uploadButton: {
    width: '100%',
    marginTop: 16,
    backgroundColor: '#fecb00',
    borderWidth: 1,
    borderColor: 'rgba(196,197,213,0.3)',
    borderRadius: 12,
    paddingVertical: 25,
    paddingHorizontal: 33,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  uploadButtonText: {
    color: '#1a1c1c',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressedScale: {
    transform: [{ scale: 0.97 }],
  },
  sourcesContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 20,
  },
  sourceList: {
    gap: 10,
  },
  sourceCard: {
    alignItems: 'center',
    gap: 4,
    padding: 9,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(196,197,213,0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pdfIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffdad6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceName: {
    maxWidth: '100%',
    color: '#444653',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  chatRoot: {
    flex: 1,
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  chatIntro: {
    gap: 8,
  },
  chatIntroTitle: {
    color: '#002576',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '600',
  },
  chatIntroText: {
    color: '#444653',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  messageList: {
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAI: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  userBubble: {
    backgroundColor: '#0038a8',
    color: '#ffffff',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#ffffff',
    color: '#444653',
    borderBottomLeftRadius: 4,
  },
  typingBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  typingText: {
    color: '#747685',
    fontSize: 18,
    letterSpacing: 2,
  },
  chatInputArea: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#f9f9f9',
  },
  chatInputBar: {
    backgroundColor: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#c4c5d5',
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    color: '#1a1c1c',
    fontSize: 14,
    fontWeight: '400',
    paddingVertical: 0,
  },
  sendButton: {
    marginLeft: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#002576',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolsContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 32,
  },
  toolsTitle: {
    color: '#002576',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  toolsDescription: {
    color: '#444653',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  toolCards: {
    gap: 16,
  },
  toolCard: {
    position: 'relative',
    overflow: 'hidden',
    padding: 25,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(196,197,213,0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  redAccent: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderBottomLeftRadius: 96,
    backgroundColor: 'rgba(225,37,49,0.05)',
    top: -35,
    right: -31,
  },
  yellowAccent: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderBottomLeftRadius: 96,
    backgroundColor: 'rgba(209,166,0,0.05)',
    top: -31,
    right: -31,
  },
  quizIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(225,37,49,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  flashcardIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(209,166,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  toolTitle: {
    color: '#1a1c1c',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
    marginBottom: 4,
  },
  toolDescription: {
    color: '#444653',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    marginBottom: 16,
  },
  chevronRow: {
    alignItems: 'flex-end',
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eeeeee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 20,
  },
  quizTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quizCounter: {
    color: '#747685',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  exitQuiz: {
    color: '#0038a8',
    fontSize: 14,
    fontWeight: '500',
  },
  quizCard: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(196,197,213,0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  quizQuestion: {
    color: '#1a1c1c',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    marginBottom: 24,
  },
  optionList: {
    gap: 10,
  },
  optionButton: {
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#c4c5d5',
  },
  correctOption: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderColor: 'rgba(34,197,94,0.5)',
  },
  wrongOption: {
    backgroundColor: 'rgba(225,37,49,0.1)',
    borderColor: 'rgba(225,37,49,0.5)',
  },
  optionText: {
    color: '#1a1c1c',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
});