export interface ReplaySource {
  content: string;
  heading: string | null;
  document_name: string;
  chunk_index: number;
  similarity: number;
}

export interface ReplayQuestion {
  id: string;
  question: string;
  answer: string | null;
  sources: ReplaySource[];
}

export interface ReplayDocument {
  id: string;
  name: string;
  file_type: string;
  chunk_count: number;
  created_at: string;
}

export interface ReplayFile {
  recorded: boolean;
  note: string;
  chat_model: string;
  embed_model: string;
  ollama_base_url: string;
  recorded_at: string | null;
  documents: ReplayDocument[];
  questions: ReplayQuestion[];
}

export interface Playback {
  recorded: boolean;
  text: string;
  sources: ReplaySource[];
}

export function normalizeQuestion(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asSource(value: unknown): ReplaySource | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.content !== "string") return null;
  if (typeof record.document_name !== "string") return null;
  if (typeof record.chunk_index !== "number") return null;
  if (typeof record.similarity !== "number") return null;
  const heading = record.heading;
  if (heading !== null && typeof heading !== "string") return null;
  return {
    content: record.content,
    heading,
    document_name: record.document_name,
    chunk_index: record.chunk_index,
    similarity: record.similarity,
  };
}

export function loadReplay(raw: unknown): ReplayFile {
  const record = asRecord(raw);
  if (!record) throw new Error("Replay file must be an object");
  if (!Array.isArray(record.questions) || !Array.isArray(record.documents)) {
    throw new Error("Replay file is missing questions or documents");
  }
  const questions: ReplayQuestion[] = record.questions.map((item, index) => {
    const row = asRecord(item);
    if (!row || typeof row.question !== "string" || !row.question.trim()) {
      throw new Error(`Replay question ${index} is invalid`);
    }
    const answer = typeof row.answer === "string" && row.answer.trim() ? row.answer : null;
    const sources = Array.isArray(row.sources)
      ? row.sources.map(asSource).filter((source): source is ReplaySource => source !== null)
      : [];
    return {
      id: typeof row.id === "string" ? row.id : `q${index + 1}`,
      question: row.question.trim(),
      answer,
      sources,
    };
  });
  const documents: ReplayDocument[] = record.documents.map((item, index) => {
    const row = asRecord(item);
    if (!row || typeof row.name !== "string") {
      throw new Error(`Replay document ${index} is invalid`);
    }
    return {
      id: typeof row.id === "string" ? row.id : `doc-${index + 1}`,
      name: row.name,
      file_type: typeof row.file_type === "string" ? row.file_type : "text/plain",
      chunk_count: typeof row.chunk_count === "number" ? row.chunk_count : 0,
      created_at: typeof row.created_at === "string" ? row.created_at : "2026-01-01T00:00:00.000Z",
    };
  });
  const answersReady = questions.length > 0 && questions.every((item) => item.answer !== null);
  const recorded = record.recorded === true && answersReady;
  return {
    recorded,
    note: typeof record.note === "string" ? record.note : "",
    chat_model: typeof record.chat_model === "string" ? record.chat_model : "gemma4:31b",
    embed_model: typeof record.embed_model === "string" ? record.embed_model : "embeddinggemma",
    ollama_base_url:
      typeof record.ollama_base_url === "string" ? record.ollama_base_url : "http://127.0.0.1:11434",
    recorded_at: typeof record.recorded_at === "string" ? record.recorded_at : null,
    documents,
    questions,
  };
}

export function questionList(replay: ReplayFile): string[] {
  return replay.questions.map((item) => item.question);
}

export function unrecordedMessage(replay: ReplayFile): string {
  const lines = questionList(replay).map((question) => `- ${question}`);
  return [
    "These demo questions have not been recorded yet, so there is no answer to play back.",
    "On a machine with Ollama, run npm run demo:record, then redeploy the updated demo/replay.json.",
    "Questions waiting to be recorded:",
    ...lines,
  ].join("\n");
}

export function unknownQuestionMessage(replay: ReplayFile): string {
  const lines = questionList(replay).map((question) => `- ${question}`);
  return [
    "That question is not in the recorded demo set.",
    "Try one of these:",
    ...lines,
    "Live answers run on your own machine. Set APP_MODE=live and LLM_PROVIDER=ollama, then follow the local mode steps in the README.",
  ].join("\n");
}

/** Plays a stored answer only when the file is marked recorded and the answer is present. */
export function playbackFor(replay: ReplayFile, question: string): Playback {
  if (!replay.recorded) {
    return { recorded: false, text: unrecordedMessage(replay), sources: [] };
  }
  const wanted = normalizeQuestion(question);
  const match = replay.questions.find((item) => normalizeQuestion(item.question) === wanted);
  if (!match || !match.answer) {
    return { recorded: false, text: unknownQuestionMessage(replay), sources: [] };
  }
  return { recorded: true, text: match.answer, sources: match.sources };
}
