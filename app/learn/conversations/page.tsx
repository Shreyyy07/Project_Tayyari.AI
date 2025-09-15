"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftIcon, ClockIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface Message {
  id: number;
  content: string;
  sender: "user" | "ai";
  quiz?: QuizBlock;
  isOriginalPrompt?: boolean;
}

interface QuizBlock {
  questions: any[];
  userAnswers: (string | null)[];
  results: (boolean | null)[];
  showResults: boolean;
  showButton: boolean;
  score?: number;
  totalQuestions?: number;
}

interface Conversation {
  id: string;
  title: string;
  topic: string;
  timestamp: number;
  messages: Message[];
  quizProgress: {
    totalQuizzes: number;
    completedQuizzes: number;
    averageScore: number;
    lastQuizScore: number;
  };
}

const ConversationsPage: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const router = useRouter();

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = () => {
    const allKeys = Object.keys(localStorage);
    const conversationKeys = allKeys.filter(key => key.startsWith('tayyari-conversation-'));
    
    const loadedConversations: Conversation[] = [];
    
    conversationKeys.forEach(key => {
      try {
        const conversation = JSON.parse(localStorage.getItem(key) || '{}');
        if (conversation.id) {
          // Recalculate quiz progress to ensure accuracy
          const quizMessages = conversation.messages.filter((m: Message) => m.quiz && m.quiz.showResults);
          const totalQuizzes = quizMessages.length;
          let totalScore = 0;
          let lastQuizScore = 0;
          
          quizMessages.forEach((msg: Message, index: number) => {
            if (msg.quiz && msg.quiz.results) {
              const correct = msg.quiz.results.filter(r => r === true).length;
              const score = Math.round((correct / msg.quiz.results.length) * 100);
              totalScore += score;
              if (index === quizMessages.length - 1) lastQuizScore = score;
            }
          });
          
          const averageScore = totalQuizzes > 0 ? Math.round(totalScore / totalQuizzes) : 0;
          
          // Update the conversation with correct progress
          conversation.quizProgress = {
            totalQuizzes: totalQuizzes,
            completedQuizzes: totalQuizzes,
            averageScore: averageScore,
            lastQuizScore: lastQuizScore,
          };
          
          loadedConversations.push(conversation);
        }
      } catch (error) {
        console.error('Error loading conversation:', error);
      }
    });
    
    // Sort by timestamp (newest first) and take last 3
    loadedConversations.sort((a, b) => b.timestamp - a.timestamp);
    setConversations(loadedConversations.slice(0, 3));
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'bg-green-500';
    if (progress >= 60) return 'bg-blue-500';
    if (progress >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const handleConversationClick = (conversation: Conversation) => {
  // Clear any existing chat messages first
  localStorage.removeItem('tayyari-chat-messages-v2');
  
  // Set the selected conversation messages
  localStorage.setItem('tayyari-chat-messages-v2', JSON.stringify(conversation.messages));
  
  // Navigate to chat with a specific conversation ID
  router.push(`/learn/chat?conversationId=${conversation.id}`);
};

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_60%_20%,_#e8eafe_60%,_#f7e8fc_100%)] p-6">
      <motion.div
        className="max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/learn/chat')}
            className="h-10 w-10 rounded-full bg-white/80 hover:bg-white shadow-md"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold text-[#4f5eff]">All Conversations</h1>
        </div>

        {/* Conversations List */}
        <div className="space-y-4">
          {conversations.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-gray-500 text-lg">No conversations yet</div>
              <div className="text-gray-400 text-sm mt-2">Start a new chat to see your learning progress!</div>
            </div>
          ) : (
            conversations.map((conversation) => (
              <motion.div
                key={conversation.id}
                className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-[#e2e6fa] hover:shadow-xl transition-all cursor-pointer"
                onClick={() => handleConversationClick(conversation)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Conversation Title */}
                    <h3 className="text-xl font-bold text-[#2a2657] mb-2">
                      {conversation.title}
                    </h3>
                    
                    {/* Topic Tag */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700">
                        📚 {conversation.topic}
                      </span>
                    </div>

                    {/* Progress Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-semibold text-[#4f5eff]">
                          {conversation.quizProgress.averageScore}%
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <motion.div
                          className={`h-full ${getProgressColor(conversation.quizProgress.averageScore)} rounded-full`}
                          initial={{ width: 0 }}
                          animate={{ width: `${conversation.quizProgress.averageScore}%` }}
                          transition={{ duration: 1, delay: 0.2 }}
                        />
                      </div>

                      {/* Quiz Stats */}
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {conversation.quizProgress.completedQuizzes} quizzes completed
                        </span>
                        {conversation.quizProgress.lastQuizScore > 0 && (
                          <span className="flex items-center gap-1">
                            <TrophyIcon className="h-3 w-3" />
                            Last: {conversation.quizProgress.lastQuizScore}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 text-xs text-gray-400 ml-4">
                    <ClockIcon className="h-3 w-3" />
                    {formatTime(conversation.timestamp)}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Start New Chat Button */}
        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Button
            onClick={() => {
              // Clear current chat and start fresh
              localStorage.removeItem('tayyari-chat-messages-v2');
              router.push('/learn/chat');
            }}
            className="bg-gradient-to-r from-[#4f5eff] to-[#7a5cfa] text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            Start New Chat
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ConversationsPage;