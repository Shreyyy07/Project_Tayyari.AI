"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Upload, Loader2, Sparkles, FileText, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import Navbar from "@/components/custom/navbar";
import { UploadClient } from "@uploadcare/upload-client";
import { useRouter } from "next/navigation";

const client = new UploadClient({
  publicKey: process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY!,
});

const fadeInUp = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: 0.7,
    ease: [0.22, 1, 0.36, 1],
  },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

type RecentChat = {
  id: number;
  title: string;
  description: string;
  timestamp: string;
  icon: string;
  color: string;
  progress: number;
};

const RECENT_COLORS = [
  "from-purple-600/5 to-blue-600/5",
  "from-blue-600/5 to-cyan-600/5",
  "from-green-600/5 to-emerald-600/5",
];
const RECENT_ICONS = ["🧠", "⚛️", "📈"];

function getTimeAgo(ts: number) {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60 * 1000) return "just now";
  if (diff < 3600 * 1000) return `${Math.floor(diff / (60 * 1000))} min ago`;
  if (diff < 24 * 3600 * 1000) return `${Math.floor(diff / (3600 * 1000))} hour ago`;
  return `${Math.floor(diff / (24 * 3600 * 1000))} days ago`;
}

export default function UploadModule() {
  const router = useRouter();
  const [showAllConversations, setShowAllConversations] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [notes, setNotes] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<
    { name: string; url: string }[]
  >([]);

  // --- Recent Chat State ---
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);

  useEffect(() => {
    const LOCALSTORAGE_KEY = "tayyari-chat-messages-v2";
    function extractRecentChats(): RecentChat[] {
      try {
        const raw = localStorage.getItem(LOCALSTORAGE_KEY);
        if (!raw) return [];
        const messages = JSON.parse(raw) as any[];
        const pairs: { user: any; ai: any }[] = [];
        let i = 0;
        while (i < messages.length) {
          if (messages[i].sender === "user") {
            let userMsg = messages[i];
            let aiMsg = messages[i + 1] && messages[i + 1].sender === "ai" ? messages[i + 1] : null;
            pairs.push({ user: userMsg, ai: aiMsg });
            i += aiMsg ? 2 : 1;
          } else {
            i++;
          }
        }
        return pairs
          .slice(-3)
          .reverse()
          .map((pair, idx) => {
            const title =
              pair.user.content?.substring(0, 48) +
              (pair.user.content.length > 48 ? "..." : "");
            let description = "";
            if (pair.ai?.content) {
              const headingMatch = pair.ai.content.match(/(?:^|\n)##\s*(.*)/);
              if (headingMatch) {
                description = headingMatch[1];
              } else {
                description =
                  pair.ai.content
                    .replace(/[#>*_\-\n]/g, " ")
                    .substring(0, 60) + "...";
              }
            }
            const timestamp = getTimeAgo(pair.user.id);
            return {
              id: pair.user.id,
              title: title || "Untitled",
              description: description || "No summary available",
              timestamp,
              icon: RECENT_ICONS[idx % RECENT_ICONS.length],
              color: RECENT_COLORS[idx % RECENT_COLORS.length],
              progress: 100,
            };
          });
      } catch {
        return [];
      }
    }
    setRecentChats(extractRecentChats());
    const onStorage = () => setRecentChats(extractRecentChats());
    window.addEventListener("storage", onStorage);
    const interval = setInterval(() => setRecentChats(extractRecentChats()), 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showAllConversations) {
        setShowAllConversations(false);
      }
    };
    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [showAllConversations]);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const hasValidFile = Array.from(e.dataTransfer.items).some(
      (item) =>
        item.type === "application/pdf" ||
        (item.kind === "file" && item.type.includes("pdf"))
    );
    setIsDragging(hasValidFile);
    if (!hasValidFile) {
      e.dataTransfer.dropEffect = "none";
    }
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
  };

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      await handleFiles(files);
    }
  };

  const validateFiles = (files: File[]) => {
    const validFiles: File[] = [];
    const invalidFiles: File[] = [];
    files.forEach(file => {
      if (file.type === "application/pdf") {
        validFiles.push(file);
      } else {
        invalidFiles.push(file);
      }
    });
    return { validFiles, invalidFiles };
  };

  const handleFiles = async (files: File[]) => {
    const { validFiles, invalidFiles } = validateFiles(files);
    if (invalidFiles.length > 0) {
      toast.error("Only PDF files are allowed");
      return;
    }
    if (validFiles.length === 0) {
      return;
    }
    setUploading(true);
    setProgress(0);
    const uploadedData: { name: string; url: string }[] = [];
    for (const file of files) {
      try {
        const { cdnUrl } = await client.uploadFile(file);
        uploadedData.push({ name: file.name, url: cdnUrl });
        toast.success(`${file.name} uploaded successfully`, {
          icon: <Sparkles className="w-4 h-4" />,
        });
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setUploadedFiles((prev) => [...prev, ...uploadedData]);
    setUploading(false);
    setProgress(0);
  };

  const handleSubmit = async () => {
    if (!notes.trim() && uploadedFiles.length === 0) {
      toast.error("Please add some notes or upload content");
      return;
    }
    if (notes.trim()) {
      router.push(`/learn/chat?prompt=${encodeURIComponent(notes.trim())}`);
    } else {
      router.push("/learn/chat");
    }
    setUploading(true);
    setProgress(0);
    try {
      const payload = {
        notes: notes,
        files: uploadedFiles.map((file) => file.url),
      };
      localStorage.setItem("chatPayload", JSON.stringify(payload));
      await fetch("http://127.0.0.1:5000/process-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Error details:", error);
    }
    setUploading(false);
    setProgress(0);
    setNotes("");
  };

  return (
    <>
      <Navbar loggedIn={true} />

      <AnimatePresence>
        {showAllConversations && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
            onClick={() => setShowAllConversations(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-x-0 bottom-0 bg-white rounded-t-[2.5rem] p-8 min-h-[80vh] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAllConversations(false)}
                      className="rounded-full"
                    >
                      <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <h2 className="text-3xl font-bold">All Conversations</h2>
                  </div>
                </div>
                <div className="space-y-4">
                  {recentChats.length === 0 && (
                    <div className="text-center text-gray-500 text-lg py-8">
                      No conversations yet.
                    </div>
                  )}
                  {recentChats.map((conv) => (
                    <motion.div
                      key={conv.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="group relative rounded-2xl bg-gradient-to-tr from-gray-50 to-blue-50 p-6 hover:shadow-lg transition-all"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className={cn("absolute inset-0 rounded-2xl bg-gradient-to-r", conv.color)} />
                      <div className="relative flex items-center gap-6">
                        <div className="h-16 w-16 rounded-xl bg-white/80 backdrop-blur-sm flex items-center justify-center text-3xl flex-shrink-0">
                          {conv.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xl font-medium text-gray-900">{conv.title}</h3>
                            <span className="text-sm text-gray-500">{conv.timestamp}</span>
                          </div>
                          <p className="text-gray-600 mb-3">{conv.description}</p>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">Progress</span>
                              <span className="font-medium text-gray-900">{conv.progress}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <motion.div
                                className="h-full bg-gradient-to-r from-blue-600 to-violet-600"
                                initial={{ width: 0 }}
                                animate={{ width: `${conv.progress}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-blue-50/30 px-4">
        <motion.div
          className="container mx-auto max-w-4xl pt-24 pb-12 space-y-16"
          initial="initial"
          animate="animate"
          variants={{
            animate: {
              transition: {
                staggerChildren: 0.2,
              },
            },
          }}
        >
          <motion.div
            variants={scaleIn}
            className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-xl shadow-blue-100/50 relative"
          >
            <div className="space-y-12">
              <div className="text-center">
                <h1 className="text-4xl md:text-5xl font-bold">
                  <span className="text-gray-900">What would you like to</span>
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-violet-600"> learn?</span>
                </h1>
              </div>
              <div className="space-y-6">
                <div className="relative"
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  <Textarea
                    placeholder="For example: 'Explain quantum computing basics' or 'Help me understand machine learning concepts'"
                    className="w-full text-lg md:text-xl bg-gray-50/50 rounded-2xl p-6 min-h-[160px] resize-none border border-gray-100 focus:border-blue-200 focus:ring-blue-100 placeholder:text-gray-400"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  {isDragging && (
                    <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/50 backdrop-blur-[1px] flex items-center justify-center">
                      <div className="text-center">
                        <Upload className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                        <p className="text-blue-600 font-medium">Drop your files here</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-4 right-4 flex items-center gap-3">
                    <div
                      className={cn(
                        "flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg px-4 py-2 cursor-pointer transition-all duration-200 hover:border-blue-400 hover:bg-blue-50/50 group",
                        uploading && "opacity-50 pointer-events-none"
                      )}
                    >
                      <input
                        type="file"
                        onChange={onFileSelect}
                        accept=".pdf,.ppt,.pptx,.mp4"
                        multiple
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <Upload className="h-4 w-4 text-blue-600 group-hover:scale-110 transition-transform" />
                        <span className="text-gray-600">Upload</span>
                      </label>
                    </div>
                    <Button
                      onClick={handleSubmit}
                      className="bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-90 px-6 py-2 text-base rounded-lg shadow-lg shadow-blue-600/20"
                      disabled={uploading}
                    >
                      <motion.div
                        className="flex items-center gap-2"
                        whileTap={{ scale: 0.98 }}
                      >
                        <Sparkles className="w-4 h-4" />
                        Let's explore
                      </motion.div>
                    </Button>
                  </div>
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-1.5 text-sm shadow-sm"
                      >
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-gray-600 truncate max-w-[200px]">
                          {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <AnimatePresence>
              {uploading && (
                <motion.div
                  className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-[2.5rem] flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="text-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                    <p className="text-lg font-medium text-gray-900">
                      Processing your content...
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {recentChats.length > 0 && (
            <motion.div
              variants={scaleIn}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Recent Learning</h2>
                <Button 
                  variant="ghost" 
                  className="text-blue-600"
                  onClick={() => setShowAllConversations(true)}
                >
                  View All
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recentChats.map((conv) => (
                  <motion.div
                    key={conv.id}
                    className="group relative rounded-2xl bg-gradient-to-tr from-gray-50 to-blue-50 p-6 hover:shadow-lg transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={cn("absolute inset-0 rounded-2xl bg-gradient-to-r", conv.color)} />
                    <div className="relative flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-white/80 backdrop-blur-sm flex items-center justify-center text-2xl flex-shrink-0">
                        {conv.icon}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 line-clamp-1">{conv.title}</h3>
                        <p className="text-sm text-gray-500">{conv.timestamp}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </>
  );
}