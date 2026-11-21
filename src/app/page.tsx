"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  Send,
  FileText,
  Trash2,
  Loader2,
  Search,
  MessageSquare,
  X,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import {
  answerPieces,
  retrievalLine,
  RETRIEVAL_EMPTY_LINE,
  sourceCardsOpen,
  sourceElementId,
} from "@/lib/answer-view";
import { FICTIONAL_SAMPLE_NOTE } from "@/lib/sample-plan";
import type { Document, Message, SearchResult } from "@/lib/types";

const RECORDED_LABEL =
  "Recorded from local Gemma 4. Live mode runs locally via Ollama.";

interface DemoInfo {
  demo: boolean;
  recorded: boolean;
  label: string;
  questions: string[];
}

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopNavOpen, setDesktopNavOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(() => new Set());
  const [demo, setDemo] = useState<DemoInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.documents) setDocuments(data.documents);
      if (data.demo) {
        setDemo({
          demo: true,
          recorded: Boolean(data.recorded),
          label: typeof data.label === "string" ? data.label : "",
          questions: Array.isArray(data.questions) ? data.questions : [],
        });
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Upload failed");
        return;
      }

      await fetchDocuments();
    } catch (err) {
      console.error("Upload error:", err);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(typeof data.error === "string" ? data.error : "Delete failed.");
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleAsk = async (preset?: string) => {
    const question = (typeof preset === "string" ? preset : input).trim();
    if (!question || asking) return;

    setInput("");
    setMobileNavOpen(false);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMessage]);
    setAsking(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: messages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: typeof data.error === "string" ? data.error : "Sorry, something went wrong. Please try again.",
          },
        ]);
        return;
      }

      let sources: SearchResult[] = [];
      const sourcesHeader = res.headers.get("X-Sources");
      if (sourcesHeader) {
        try {
          sources = JSON.parse(atob(sourcesHeader));
        } catch {
          // Ignore parse errors
        }
      }
      const recorded = res.headers.get("x-demo-recorded") === "true";

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        sources,
        demoLabel: recorded ? RECORDED_LABEL : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Stream the response (plain text stream)
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let fullText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, content: fullText }
                : m
            )
          );
        }
      }
    } catch (err) {
      console.error("Ask error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const toggleSources = (messageId: string) => {
    setCollapsedSources((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const revealSource = (messageId: string, source: number) => {
    setCollapsedSources((current) => {
      if (!current.has(messageId)) return current;
      const next = new Set(current);
      next.delete(messageId);
      return next;
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(sourceElementId(messageId, source))?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    });
  };

  const toggleNav = () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setDesktopNavOpen((open) => !open);
    } else {
      setMobileNavOpen((open) => !open);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 w-full overflow-hidden">
      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          aria-label="Close documents"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      {/* Sidebar: drawer on phones, column on desktop */}
      <aside
        className={`flex flex-col shrink-0 bg-surface border-border overflow-hidden
          fixed inset-y-0 left-0 z-40 h-full w-[min(18rem,calc(100vw-2.75rem))] border-r
          transition-transform duration-200
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
          md:static md:z-auto md:h-auto md:translate-x-0 md:transition-[width]
          ${desktopNavOpen ? "md:w-72 md:border-r" : "md:w-0 md:border-0"}`}
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-brand" />
            <h1 className="font-semibold text-lg">Insight</h1>
          </div>

          {demo?.demo ? (
            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-zinc-300">{FICTIONAL_SAMPLE_NOTE}</p>
              {demo.label ? (
                <p className="text-xs leading-relaxed text-zinc-500">{demo.label}</p>
              ) : null}
            </div>
          ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-brand bg-brand/10"
                : "border-border-light hover:border-brand/50 hover:bg-brand/5"
            }`}
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Processing...</span>
              </div>
            ) : (
              <>
                <Upload className="w-5 h-5 text-zinc-500 mx-auto mb-1" />
                <p className="text-xs text-zinc-500">
                  Drop PDF, TXT, or MD here
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </div>
          )}
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-2 px-1">
            Documents ({documents.length})
          </p>
          {documents.length === 0 && (
            <p className="text-xs text-zinc-600 px-1">
              No documents yet. Upload one to get started.
            </p>
          )}
          <div className="space-y-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="group flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-raised transition-colors"
              >
                <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">{doc.name}</p>
                  <p className="text-xs text-zinc-600">
                    {doc.chunk_count} chunks
                  </p>
                </div>
                {demo?.demo ? null : (
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-all"
                  aria-label={`Delete ${doc.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Architecture info */}
        <div className="p-3 border-t border-border">
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            {demo?.demo
              ? "Answers are retrieved from the fictional sample documents. Live mode uses Ollama on your machine."
              : "RAG pipeline: pdf-parse + chunking + embeddings + pgvector + a grounded chat model"}
          </p>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 sm:px-4">
          <button
            onClick={toggleNav}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-raised hover:text-white"
            aria-label="Toggle documents"
          >
            <span className="md:hidden">
              {mobileNavOpen ? <X className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
            <span className="hidden md:inline">
              {desktopNavOpen ? <X className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="truncate text-sm text-zinc-400">
              Ask questions about your documents
            </span>
          </div>
        </header>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          {messages.length === 0 && (
            <div className="flex min-h-full w-full flex-col">
              <div className="mx-auto my-auto flex w-full max-w-md flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-6">
                <MessageSquare className="w-8 h-8 text-brand" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                Ask your documents anything
              </h2>
              {demo?.demo ? (
                <div className="mb-6 space-y-2 text-sm leading-relaxed">
                  <p className="text-zinc-100">{RETRIEVAL_EMPTY_LINE}</p>
                  {documents.length > 0 ? (
                    <p className="break-words text-xs text-zinc-400">
                      {documents.map((doc) => doc.name).join(", ")}
                    </p>
                  ) : null}
                  <p className="text-xs text-zinc-500">{FICTIONAL_SAMPLE_NOTE}</p>
                  {demo.label ? <p className="text-xs text-zinc-500">{demo.label}</p> : null}
                </div>
              ) : (
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  Upload PDFs, text files, or markdown documents, then ask questions. Insight finds relevant passages and generates answers with exact citations.
                </p>
              )}
              <div className="grid gap-2 w-full">
                {(demo?.questions?.length
                  ? demo.questions
                  : [
                      "What are the key findings?",
                      "Summarise the main points",
                      "What does it say about...?",
                    ]
                ).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleAsk(suggestion)}
                    className="whitespace-normal break-words rounded-lg border border-border px-4 py-2.5 text-left text-sm text-zinc-400 transition-colors hover:border-brand/50 hover:bg-brand/5 hover:text-zinc-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              </div>
            </div>
          )}

          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((message) => (
              <div key={message.id}>
                <div
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : ""
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
                      <BookOpen className="w-3.5 h-3.5 text-brand" />
                    </div>
                  )}
                  <div
                    className={`min-w-0 max-w-[85%] sm:max-w-[80%] ${
                      message.role === "user"
                        ? "rounded-2xl rounded-tr-md border border-brand/30 bg-brand/20 px-4 py-2.5"
                        : ""
                    }`}
                  >
                    {message.role === "user" ? (
                      <p className="break-words text-sm">{message.content}</p>
                    ) : (
                      <div className="prose-answer min-w-0 break-words text-sm text-zinc-300">
                        {message.sources && message.sources.length > 0 ? (
                          <p className="text-sm font-medium text-zinc-100">
                            {retrievalLine(message.sources.length)}
                          </p>
                        ) : null}
                        {message.demoLabel ? (
                          <p className="text-xs text-zinc-500">{message.demoLabel}</p>
                        ) : null}
                        {message.content ? (
                          <p className="whitespace-pre-wrap break-words">
                            {answerPieces(message.content).map((piece, index) =>
                              piece.type === "text" ? (
                                <span key={index}>{piece.text}</span>
                              ) : (
                                <a
                                  key={index}
                                  href={`#${sourceElementId(message.id, piece.source)}`}
                                  className="text-brand-light underline decoration-brand/50 underline-offset-2"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    revealSource(message.id, piece.source);
                                  }}
                                >
                                  {piece.label}
                                </a>
                              )
                            )}
                          </p>
                        ) : (
                          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 min-w-0 sm:ml-10">
                    <button
                      type="button"
                      aria-expanded={sourceCardsOpen(collapsedSources, message.id, message.sources.length)}
                      onClick={() => toggleSources(message.id)}
                      className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      {sourceCardsOpen(collapsedSources, message.id, message.sources.length)
                        ? "Hide sources"
                        : "Show sources"}
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${
                          sourceCardsOpen(collapsedSources, message.id, message.sources.length)
                            ? "rotate-90"
                            : ""
                        }`}
                      />
                    </button>
                    {sourceCardsOpen(collapsedSources, message.id, message.sources.length) && (
                      <div className="mt-2 space-y-2">
                        {message.sources.map((source, i) => (
                          <div
                            key={sourceElementId(message.id, i + 1)}
                            id={sourceElementId(message.id, i + 1)}
                            className="scroll-mt-3 overflow-hidden text-xs bg-surface border border-border rounded-lg p-3"
                          >
                            <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="font-mono font-medium text-brand">
                                Source {i + 1}
                              </span>
                              <span className="break-all text-zinc-400">
                                {source.document_name}
                              </span>
                              {source.heading && (
                                <span className="break-words text-zinc-500">
                                  — {source.heading}
                                </span>
                              )}
                              <span className="text-zinc-600 sm:ml-auto">
                                {(source.similarity * 100).toFixed(0)}% match
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap break-words leading-relaxed text-zinc-400">
                              {source.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="mx-auto flex max-w-3xl gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                demo?.demo
                  ? "Ask about the sample documents..."
                  : documents.length === 0
                  ? "Upload a document first..."
                  : "Ask a question about your documents..."
              }
              maxLength={2000}
              disabled={(documents.length === 0 && !demo?.demo) || asking}
              className="min-w-0 flex-1 rounded-xl border border-border bg-raised px-4 py-3 text-base placeholder:text-zinc-600 focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/20 disabled:opacity-50 md:text-sm"
            />
            <button
              type="submit"
              disabled={!input.trim() || asking || (documents.length === 0 && !demo?.demo)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Send question"
            >
              {asking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
