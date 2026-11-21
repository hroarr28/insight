# Insight — AI Document Search

Upload documents. Ask questions. Get answers with exact citations.

Built with a RAG (Retrieval-Augmented Generation) architecture: documents are chunked, embedded with OpenAI `text-embedding-3-small`, stored in Supabase pgvector, and retrieved via cosine similarity to ground AI responses in your actual content.

## Architecture

```
Upload → pdf-parse → Chunking (500 tokens, 50 overlap)
                          ↓
                  OpenAI Embeddings (text-embedding-3-small)
                          ↓
                  Supabase pgvector (1536 dimensions)
                          ↓
Question → Embed query → Cosine similarity search → Top 6 chunks
                          ↓
              GPT-4o-mini (grounded response with [Source N] citations)
                          ↓
                  Streamed answer + expandable source cards
```

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL + pgvector)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **Chat:** GPT-4o-mini via Vercel AI SDK
- **File parsing:** pdf-parse (PDF), native (TXT, MD)
- **Icons:** Lucide React

## Features

- Drag-and-drop document upload (PDF, TXT, MD)
- Automatic text extraction and intelligent chunking
- Vector embeddings with cosine similarity search
- Streaming AI responses grounded in document content
- Source citations with expandable context cards
- Conversation history for follow-up questions
- Document management (upload, list, delete)
- Dark theme, responsive layout

## Demo mode and local mode

The public site stays in demo mode unless a provider is configured. Demo mode does not call a paid API and does not need Supabase. It serves `samples/pocket-sundial.txt` and plays answers from `demo/replay.json`.

The file in the repo is a placeholder: `recorded` is false and every answer is null. Those are not model outputs. Until a recording is committed, the site lists the questions and says the recording has not been made.

Record the answers on a machine that has Ollama:

```bash
ollama pull gemma4:31b
ollama pull embeddinggemma
npm run demo:record
```

Optional settings: `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`), `OLLAMA_CHAT_MODEL` (default `gemma4:31b`), `OLLAMA_EMBED_MODEL` (default `embeddinggemma`). The script writes `demo/replay.json` with `recorded: true`. Deploy that file for the hosted demo to play it back. Recorded answers are labelled: "Recorded from local Gemma 4. Live mode runs locally via Ollama."

Local live mode uses your own Ollama daemon and, if you also want your own documents stored, Supabase:

```bash
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://127.0.0.1:11434
npm run dev
```

Uploads and deletion are disabled in the public demo. In live mode, deletion requires `ADMIN_SECRET` (at least 16 characters) as `Authorization: Bearer <secret>`. Ask, search, and upload are rate limited per isolate and reject oversized bodies. On Vercel production, OpenAI calls are also capped per day (`DEMO_DAILY_MODEL_CALLS`, default 40) through `supabase/migrations/002_demo_usage.sql`. Set `DEMO_MODE=false` to turn that cap off. The paid path is used only when `OPENAI_API_KEY` is set and `LLM_PROVIDER` is not `ollama`.

`npm run seed:sample` does not call a paid API unless `SEED_WITH_OPENAI=true`. The demo does not need that seed.

## Demo video

Video coming.

## Setup

1. For the public demo, leave provider keys unset, or set `APP_MODE=demo`. No Supabase project is required.
2. For live mode, copy `.env.example` to `.env.local`. Ollama needs `LLM_PROVIDER=ollama`. OpenAI needs `OPENAI_API_KEY` plus a Supabase project with `001_initial_schema.sql` and `002_demo_usage.sql`.
3. `npm install && npm run dev`

## Key Implementation Details

- **Chunking strategy:** 500-token chunks with 50-token overlap, split on paragraph boundaries to preserve context. Headings are tracked and stored as metadata.
- **Embedding model:** text-embedding-3-small chosen for cost efficiency ($0.02/1M tokens) with strong retrieval performance.
- **Search:** pgvector IVFFlat index with cosine distance. Threshold of 0.3 filters low-relevance results.
- **Streaming:** Vercel AI SDK `streamText` for real-time response rendering.
- **Grounding:** System prompt instructs the model to only use provided context, with [Source N] notation for citations.

## Hosted demo checklist

Demo mode needs no Supabase project and no paid API key. On Vercel, set `APP_MODE=demo` if an `OPENAI_API_KEY` is still saved there, then redeploy. You can remove that key. A paused Supabase project does not affect demo playback. After `npm run demo:record`, commit `demo/replay.json` and deploy so the hosted site plays the recording.
