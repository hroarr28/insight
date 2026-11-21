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
import type { Document, Message, SearchResult } from "@/lib/types";
import { LIMITS } from "@/lib/validation";

function decodeSources(header: string): SearchResult[] {
  try {
    const binary = atob(header);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.documents) setDocuments(data.documents);
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
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleAsk = async () => {
    if (!input.trim() || asking) return;

    const question = input.trim();
    setInput("");

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
        let message = "Sorry, something went wrong. Please try again.";
        try {
          const data = await res.json();
          if (data && typeof data.error === "string") message = data.error;
        } catch {
          // The error body was not JSON.
        }
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: message },
        ]);
        return;
      }

      let sources: SearchResult[] = [];
      const sourcesHeader = res.headers.get("X-Sources");
      if (sourcesHeader) sources = decodeSources(sourcesHeader);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        sources,
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-72" : "w-0"
        } transition-all duration-200 bg-surface border-r border-border overflow-hidden flex flex-col shrink-0`}
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-brand" />
            <h1 className="font-semibold text-lg">Insight</h1>
          </div>

          {/* Upload area */}
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
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-all"
                  aria-label={`Delete ${doc.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Architecture info */}
        <div className="p-3 border-t border-border">
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Hybrid RAG: pgvector + Postgres full text, fused with reciprocal
            rank fusion. Optional rerank stays off unless configured.
          </p>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-raised transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-zinc-500" />
            <span className="text-sm text-zinc-400">
              Ask questions about your documents
            </span>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-6">
                <MessageSquare className="w-8 h-8 text-brand" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                Ask your documents anything
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                Upload PDFs, text files, or markdown documents, then ask
                questions. Insight finds relevant passages and generates
                answers with exact citations.
              </p>
              <div className="grid gap-2 w-full">
                {[
                  "What are the key findings?",
                  "Summarise the main points",
                  "What does it say about...?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="text-left text-sm px-4 py-2.5 rounded-lg border border-border hover:border-brand/50 hover:bg-brand/5 text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
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
                    className={`max-w-[80%] ${
                      message.role === "user"
                        ? "bg-brand/20 border border-brand/30 rounded-2xl rounded-tr-md px-4 py-2.5"
                        : ""
                    }`}
                  >
                    {message.role === "user" ? (
                      <p className="text-sm">{message.content}</p>
                    ) : (
                      <div className="prose-answer text-sm text-zinc-300">
                        {message.content || (
                          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="ml-10 mt-2">
                    <button
                      onClick={() =>
                        setExpandedSources(
                          expandedSources === message.id
                            ? null
                            : message.id
                        )
                      }
                      className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      {message.sources.length} sources
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${
                          expandedSources === message.id
                            ? "rotate-90"
                            : ""
                        }`}
                      />
                    </button>
                    {expandedSources === message.id && (
                      <div className="mt-2 space-y-2">
                        {message.sources.map((source, i) => (
                          <div
                            key={i}
                            className="text-xs bg-surface border border-border rounded-lg p-3"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-brand font-mono font-medium">
                                Source {i + 1}
                              </span>
                              <span className="text-zinc-600">
                                {source.document_name}
                              </span>
                              {source.heading && (
                                <span className="text-zinc-500">
                                  — {source.heading}
                                </span>
                              )}
                              <span className="text-zinc-700 ml-auto">
                                {source.similarity != null
                                  ? `${(source.similarity * 100).toFixed(0)}% match`
                                  : "keyword"}
                              </span>
                            </div>
                            <p className="text-zinc-400 line-clamp-3 leading-relaxed">
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
        <div className="p-4 border-t border-border">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="max-w-3xl mx-auto flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                documents.length === 0
                  ? "Upload a document first..."
                  : "Ask a question about your documents..."
              }
              maxLength={LIMITS.maxQueryChars}
              disabled={documents.length === 0 || asking}
              className="flex-1 bg-raised border border-border rounded-xl px-4 py-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || asking || documents.length === 0}
              className="px-4 py-3 bg-brand hover:bg-brand-dim text-white rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
