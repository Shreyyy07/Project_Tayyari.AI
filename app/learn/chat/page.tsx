"use client";

import type React from "react";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ComponentPropsWithoutRef,
} from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MicrophoneIcon,
  PaperAirplaneIcon,
  StopIcon,
} from "@heroicons/react/24/solid";
import { Loader2, Speaker } from "lucide-react";
import Navbar from "@/components/custom/navbar";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// === BRAND COLORS & THEME MATCHING LANDING PAGE ===
const SOFT_BG_GRADIENT =
  "bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#e8eafe] via-[#f7e8fc] to-[#f7e8fc]";
const CARD_BG =
  "bg-white/80 backdrop-blur-2xl shadow-2xl rounded-[2.5rem] border border-[#e2e6fa]";
// Chat bubbles
const USER_BUBBLE =
  "bg-gradient-to-tr from-[#4f5eff]/90 to-[#7a5cfa]/90 text-white border border-[#c3cafd]/60";
const AI_BUBBLE =
  "bg-white/90 border border-[#f1eafd] shadow-md";
const AI_BUBBLE_EXTRA = "before:absolute before:inset-0 before:bg-gradient-to-r before:from-[#e8eafe]/60 before:to-[#f7e8fc]/30 before:opacity-80 before:pointer-events-none";

interface Message {
  id: number;
  content: string;
  sender: "user" | "ai";
  quiz?: QuizBlock;
}

interface QuizBlock {
  questions: QuizQuestion[];
  userAnswers: (string | null)[];
  results: (boolean | null)[];
  showResults: boolean;
  showButton: boolean;
}

interface QuizQuestion {
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  diagram?: string;
}

const LOCALSTORAGE_KEY = "tayyari-chat-messages-v2";

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);

  const searchParams = useSearchParams();

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      setTimeout(() => {
        containerRef.current?.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 120);
    }
  }, []);

  // === STATE RESTORATION ===
  useEffect(() => {
    const saved = localStorage.getItem(LOCALSTORAGE_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        setMessages([]);
      }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(messages));
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // === PROMPT FROM /LEARN PAGE ===
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (prompt && messages.length === 0) {
      const userMessage: Message = {
        id: Date.now(),
        content: prompt,
        sender: "user",
      };
      setMessages([userMessage]);
      setIsLoading(true);
      axios
        .post("http://127.0.0.1:5000/process-content", {
          notes: prompt,
          files: [],
        })
        .then((response) => {
          const aiContent =
            response.data.explanation ||
            response.data.response ||
            response.data.summary ||
            "Sorry, I couldn't generate a response";
          const aiMessage: Message = {
            id: Date.now() + 1,
            content: aiContent,
            sender: "ai",
          };
          setMessages([userMessage, aiMessage]);
        })
        .catch(() => {
          setMessages([
            userMessage,
            {
              id: Date.now() + 1,
              content: "Oops! Something went wrong. Please try again.",
              sender: "ai",
            },
          ]);
        })
        .finally(() => setIsLoading(false));
    }
    // eslint-disable-next-line
  }, []);

  // === SEND MESSAGE ===
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage: Message = {
      id: Date.now(),
      content: input,
      sender: "user",
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/process-content",
        {
          notes: input,
          files: [],
        }
      );
      const aiContent =
        response.data.explanation ||
        response.data.response ||
        response.data.summary ||
        response.data.learning_plan ||
        "Sorry, I couldn't generate a response";

      const aiMessage: Message = {
        id: Date.now() + 1,
        content: aiContent,
        sender: "ai",
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: Date.now() + 1,
        content: "Oops! Something went wrong. Please try again.",
        sender: "ai",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // === VOICE RECORDING ===
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/wav" });
        const audioFile = new File([audioBlob], "recorded_audio.wav", {
          type: "audio/wav",
        });
        audioChunks.current = [];
        setIsTranscribing(true);
        const formData = new FormData();
        formData.append("file", audioFile);
        try {
          const response = await axios.post(
            "http://127.0.0.1:5000/speech2text",
            formData,
            {
              headers: { "Content-Type": "multipart/form-data" },
            }
          );
          setInput((prev) => prev + (prev ? " " : "") + response.data.text);
        } catch (error) {
        } finally {
          setIsTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch (error) {}
  };
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
    }
  };

  // === TEXT TO SPEECH ===
  const toggleSpeech = async (text: string) => {
    if (isSpeaking) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsSpeaking(false);
      return;
    }
    try {
      setIsProcessingAudio(true);
      const formData = new FormData();
      formData.append("text", text);
      const response = await axios.post(
        "http://127.0.0.1:5000/process-text2speech",
        formData,
        { responseType: "blob" }
      );
      const audioBlob = new Blob([response.data], { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(audioBlob);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };
        audioRef.current.play();
        setIsSpeaking(true);
      }
    } catch (error) {
      setIsSpeaking(false);
    } finally {
      setIsProcessingAudio(false);
    }
  };

  // === EXPLAIN MORE ===
  const handleExplainMore = async (content: string) => {
    setIsLoading(true);
    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/explain-more",
        {
          question: "Explain in more depth",
          context: content,
        }
      );
      const aiContent =
        response.data.response ||
        "I couldn't generate a deeper explanation";
      const aiMessage: Message = {
        id: Date.now(),
        content: aiContent,
        sender: "ai",
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          content: "Sorry, I couldn't generate a deeper explanation.",
          sender: "ai",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // === QUIZ ===
  const handleInteractiveQuestions = async (content: string) => {
    setIsLoading(true);
    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/interactive-questions",
        { context: content }
      );
      const questions = response.data.questions;
      if (
        Array.isArray(questions) &&
        questions.length > 0 &&
        questions[0].question_text !== "Could not generate proper questions."
      ) {
        const quizBlock: QuizBlock = {
          questions,
          userAnswers: Array(questions.length).fill(null),
          results: Array(questions.length).fill(null),
          showResults: false,
          showButton: false,
        };
        const aiMessage: Message = {
          id: Date.now(),
          content: "Quiz Time!",
          sender: "ai",
          quiz: quizBlock,
        };
        setMessages((prev) => [...prev, aiMessage]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            content:
              "Sorry, I couldn't generate quiz questions for this content. Try rephrasing or using another topic.",
            sender: "ai",
          },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          content: "Sorry, I couldn't generate interactive questions.",
          sender: "ai",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // === QUIZ ANSWER ===
  const handleQuizAnswer = (
    messageIdx: number,
    questionIdx: number,
    selected: string
  ) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const oldQuiz = newMessages[messageIdx].quiz;
      if (!oldQuiz) return prev;
      if (oldQuiz.showResults) return prev;
      const quiz: QuizBlock = {
        ...oldQuiz,
        userAnswers: [...oldQuiz.userAnswers],
        results: [...oldQuiz.results],
      };
      quiz.userAnswers[questionIdx] = selected;
      if (
        quiz.userAnswers.every((ans) => typeof ans === "string") &&
        !quiz.showResults
      ) {
        quiz.showButton = true;
      }
      newMessages[messageIdx] = { ...newMessages[messageIdx], quiz };
      return newMessages;
    });
  };

  // === SHOW CORRECT ANSWERS BUTTON (IMMUTABLE UPDATE) ===
  const handleQuizReveal = (messageIdx: number) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const oldQuiz = newMessages[messageIdx].quiz;
      if (!oldQuiz || oldQuiz.showResults) return prev;
      const quiz: QuizBlock = {
        ...oldQuiz,
        userAnswers: [...oldQuiz.userAnswers],
        results: oldQuiz.questions.map(
          (q, i) => oldQuiz.userAnswers[i] === q.correct_answer
        ),
        showResults: true,
        showButton: false,
      };
      newMessages[messageIdx] = { ...newMessages[messageIdx], quiz };
      return newMessages;
    });
  };

  // === NEW CHAT ===
  const handleNewChat = () => {
    setMessages([]);
    window.location.reload();
  };

  // === "Learn More With Quizzes" ===
  const handleLearnMoreWithQuizzes = (quiz: QuizBlock) => {
    const context = quiz.questions.map(
      (q, i) => `Q${i + 1}: ${q.question_text}\nA: ${q.correct_answer}\nExplanation: ${q.explanation}\n`
    ).join("\n");
    handleExplainMore(context);
  };

  return (
    <div
      className={`min-h-screen flex flex-col ${SOFT_BG_GRADIENT} transition-all`}
      style={{
        background: "radial-gradient(ellipse at 60% 20%, #e8eafe 60%, #f7e8fc 100%)",
        minHeight: "100vh",
      }}
    >
      <Navbar loggedIn={true} />
      <motion.div
        className={`${CARD_BG} flex flex-col flex-grow p-8 md:p-12 mx-auto my-10 max-w-4xl`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          minHeight: "72vh",
          boxShadow: "0 10px 40px 0 #e0daff80",
        }}
      >
        <div className="flex flex-col h-full">
          <div
            ref={containerRef}
            className="messages-container flex-grow overflow-y-auto mb-4 space-y-6 pb-[160px]"
          >
            <AnimatePresence mode="popLayout">
              {messages.map((message, idx) => (
                <motion.div
                  key={message.id}
                  className="flex justify-center"
                  initial={{
                    opacity: 0,
                    y: 20,
                    scale: 0.95,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.95,
                    transition: { duration: 0.2 },
                  }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  layout
                >
                  <div
                    className={[
                      "w-[97%] md:w-[85%] p-6 md:p-7 rounded-2xl shadow transition-all relative",
                      message.sender === "user"
                        ? USER_BUBBLE
                        : `${AI_BUBBLE} ${AI_BUBBLE_EXTRA}`,
                      message.sender === "ai"
                        ? "hover:shadow-[#a6b1ff]/40 hover:scale-[1.01] duration-200"
                        : "hover:shadow-[#c3cafd]/40 hover:scale-[1.01]",
                    ].join(" ")}
                  >
                    {message.sender === "ai" && message.quiz ? (
                      <QuizUI
                        quiz={message.quiz}
                        messageIdx={idx}
                        onSelect={handleQuizAnswer}
                        onReveal={handleQuizReveal}
                        onLearnMore={handleLearnMoreWithQuizzes}
                        onNewChat={handleNewChat}
                      />
                    ) : message.sender === "ai" ? (
                      <>
                        <ReactMarkdown
                          remarkPlugins={[remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={{
                            h2: ({ children, ...props }) => (
                              <h2
                                {...props}
                                className="text-3xl font-extrabold flex items-center gap-2 mb-3 text-[#4f5eff]"
                              >
                                {children}
                              </h2>
                            ),
                            li: ({ children, ...props }) => (
                              <li {...props} className="mb-2 text-lg leading-relaxed flex items-start gap-2 text-[#2a2657]">
                                <span>•</span>
                                <span>{children}</span>
                              </li>
                            ),
                            p: ({ children }) => (
                              <div className="prose prose-sm max-w-none dark:prose-invert mb-4 font-medium text-[1.05rem] transition-colors">
                                {children}
                              </div>
                            ),
                            img: ({ ...props }) => (
                              <img
                                {...props}
                                className="mx-auto my-4 rounded-xl border-2 border-fuchsia-200/40 shadow-2xl animate-fadeIn"
                                style={{ maxHeight: 260, objectFit: "contain" }}
                              />
                            ),
                            code: ({
                              className,
                              children,
                            }: ComponentPropsWithoutRef<"code"> & {
                              className?: string;
                            }) =>
                              className?.includes("language-") ? (
                                <pre className="rounded-lg bg-black/90 text-white p-3 overflow-x-auto font-mono my-2 text-xs">
                                  <code className={className}>{children}</code>
                                </pre>
                              ) : (
                                <code className="bg-fuchsia-100/75 px-1 py-0.5 rounded text-fuchsia-700">{children}</code>
                              ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                        <div className="flex gap-2 mt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs font-semibold bg-gradient-to-tr from-fuchsia-100 to-blue-100 border border-blue-200 text-blue-700 hover:from-fuchsia-200 hover:to-blue-200"
                            onClick={() => handleExplainMore(message.content)}
                          >
                            Learn More
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs font-semibold bg-gradient-to-tr from-green-100 to-cyan-100 border border-green-200 text-green-800 hover:from-green-200 hover:to-cyan-200"
                            onClick={() =>
                              handleInteractiveQuestions(message.content)
                            }
                          >
                            Take Quiz
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs font-semibold bg-gradient-to-tr from-yellow-100 to-pink-100 border border-pink-200 text-pink-700 hover:from-yellow-200 hover:to-pink-200"
                            onClick={() => toggleSpeech(message.content)}
                            disabled={isProcessingAudio}
                          >
                            {isProcessingAudio ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Speaker className="h-4 w-4 mr-1" />
                            )}
                            {isSpeaking ? "Stop" : isProcessingAudio ? "Processing..." : "Listen"}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <span className="font-bold text-lg tracking-wide">{message.content}</span>
                    )}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[70%] p-4 rounded-xl bg-gradient-to-r from-fuchsia-100 via-blue-100 to-cyan-100 border-2 border-blue-200/40 shadow-lg flex items-center gap-2">
                    <div
                      className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-fuchsia-500 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </motion.div>
              )}
              <div key="scroll-anchor" ref={messagesEndRef} className="h-0" />
            </AnimatePresence>
          </div>

          <form
            onSubmit={handleSubmit}
            className="fixed bottom-0 left-0 right-0 p-6 z-50"
          >
            <div className="max-w-[1200px] mx-auto relative">
              <div className="absolute inset-0 bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg shadow-cyan-300/10 -z-10 border-2 border-blue-100/40" />
              <div className="relative flex items-end">
                <div className="relative flex-1">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    placeholder="Type your message here…"
                    className="min-h-[100px] p-4 pr-24 rounded-xl resize-none bg-white/60 border-fuchsia-200 focus:border-fuchsia-500 focus:ring-blue-500 font-semibold text-lg"
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <div className="relative">
                      <Button
                        type="button"
                        onClick={recording ? stopRecording : startRecording}
                        disabled={isTranscribing}
                        variant="ghost"
                        size="icon"
                        className={`h-9 w-9 rounded-lg transition-colors ${
                          recording
                            ? "text-red-500 bg-red-50 hover:bg-red-100"
                            : "text-blue-600 hover:bg-blue-50"
                        }`}
                      >
                        {recording ? (
                          <StopIcon className="h-5 w-5" />
                        ) : isTranscribing ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <MicrophoneIcon className="h-5 w-5" />
                        )}
                      </Button>
                      {isTranscribing && (
                        <motion.div
                          className="absolute inset-0 rounded-lg border border-blue-400/50"
                          animate={{ opacity: [0.5, 1] }}
                          transition={{
                            duration: 1,
                            repeat: Number.POSITIVE_INFINITY,
                            repeatType: "reverse",
                            ease: "easeInOut",
                          }}
                        />
                      )}
                    </div>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      disabled={!input.trim() || isLoading}
                      className={`h-9 w-9 rounded-lg transition-colors ${
                        input.trim()
                          ? "text-fuchsia-600 hover:bg-fuchsia-50"
                          : "text-gray-400"
                      }`}
                    >
                      <PaperAirplaneIcon className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </motion.div>
      <audio ref={audioRef} className="hidden" />
      <style jsx global>{`
        body {
          background: radial-gradient(ellipse at 60% 20%, #e8eafe 60%, #f7e8fc 100%);
        }
        .prose h2 {
          font-size: 2rem !important;
          color: #4f5eff;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .prose li {
          color: #2a2657;
          font-size: 1.1rem;
        }
        .prose img {
          box-shadow: 0 2px 16px #e8eafe80;
        }
        .messages-container::-webkit-scrollbar-thumb {
          background: #e8eafe;
        }
      `}</style>
    </div>
  );
};

// === QUIZ UI COMPONENT ===
function QuizUI({
  quiz,
  messageIdx,
  onSelect,
  onReveal,
  onLearnMore,
  onNewChat,
}: {
  quiz: QuizBlock;
  messageIdx: number;
  onSelect: (
    messageIdx: number,
    questionIdx: number,
    selected: string
  ) => void;
  onReveal: (messageIdx: number) => void;
  onLearnMore: (quiz: QuizBlock) => void;
  onNewChat: () => void;
}) {
  if (
    quiz.questions.length === 1 &&
    quiz.questions[0].question_text === "Could not generate proper questions."
  ) {
    return (
      <div className="text-pink-700 font-bold text-center">
        Sorry, quiz could not be generated for this topic.<br />
        Try rephrasing or choose another subject.
      </div>
    );
  }
  return (
    <div>
      <div className="font-bold text-lg mb-2">Quiz</div>
      {quiz.questions.map((q, qi) => (
        <div key={qi} className="mb-5">
          <div className="font-medium mb-1">{qi + 1}. {q.question_text}</div>
          {q.diagram && (
            <ReactMarkdown
              components={{
                img: ({ ...props }) => (
                  <img
                    {...props}
                    className="mx-auto my-4 rounded-xl border-2 border-fuchsia-200/40 shadow-2xl animate-fadeIn"
                    style={{ maxHeight: 180, objectFit: "contain" }}
                  />
                ),
                p: ({ children }) => (
                  <p className="my-2">{children}</p>
                ),
              }}
            >
              {q.diagram}
            </ReactMarkdown>
          )}
          <ul className="flex flex-col gap-2 mb-2">
            {q.options.map((opt, oi) => {
              const selected = quiz.userAnswers[qi] === opt;
              const correct = quiz.showResults && opt === q.correct_answer;
              const wrong =
                quiz.showResults && selected && !correct;
              return (
                <li key={oi}>
                  <button
                    className={[
                      "w-full text-left px-4 py-2 rounded-lg border transition",
                      selected
                        ? "bg-[#e7e9fd] border-[#7a5cfa]"
                        : "bg-white/70 border-[#d4d1fd]",
                      correct
                        ? "bg-green-500/80 border-green-700 font-bold text-white"
                        : "",
                      wrong ? "bg-red-500/80 border-red-600 font-medium text-white" : "",
                      "hover:bg-[#e8eafe]"
                    ].join(" ")}
                    disabled={quiz.showResults}
                    onClick={() => onSelect(messageIdx, qi, opt)}
                  >
                    {opt}
                  </button>
                </li>
              );
            })}
          </ul>
          {quiz.showResults && (
            <div
              className={
                quiz.results[qi]
                  ? "text-green-700 font-semibold"
                  : "text-red-700 font-semibold"
              }
            >
              {quiz.results[qi]
                ? "Correct!"
                : (
                  <>
                    Incorrect. Correct answer: <b>{q.correct_answer}</b>
                    <div className="text-gray-600 text-sm mt-1">
                      <ReactMarkdown>{q.explanation}</ReactMarkdown>
                    </div>
                  </>
                )
              }
            </div>
          )}
        </div>
      ))}
      {!quiz.showResults && quiz.showButton && (
        <Button
          className="mt-2 bg-gradient-to-r from-[#4f5eff] to-[#7a5cfa] text-white font-semibold text-base"
          onClick={() => onReveal(messageIdx)}
        >
          Show Correct Answers
        </Button>
      )}
      <div className="text-xs text-gray-400 mt-2">
        (Select an answer for each question, then click "Show Correct Answers")
      </div>
      {quiz.showResults && (
        <div className="flex gap-4 mt-6 justify-center">
          <Button
            className="bg-gradient-to-r from-[#4f5eff] to-[#7a5cfa] text-white px-6"
            onClick={() => onLearnMore(quiz)}
          >
            Learn More with Quizzes
          </Button>
          <Button
            className="bg-gradient-to-r from-gray-200 to-gray-400 px-6"
            onClick={onNewChat}
          >
            New Chat
          </Button>
        </div>
      )}
    </div>
  );
}

export default Chat;