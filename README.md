# Insight

The public site is a recorded demo of retrieval over a fictional sample set. Helmfell Yard is not a real company. The samples are short original notes written for this demo: a visitor badge policy, a cold-room entry note, a Probe 4 manual, and a field receipt rule. `demo/questions.json` lists four questions about those files, including one that needs more than one file. `demo/replay.json` was recorded from local `gemma4:31b` with `embeddinggemma` embeddings. The site streams those four stored answers and their sources. It does not invent replies. A question that is not in the recording gets a short message that lists the four recorded questions.

A leftover `OPENAI_API_KEY` does not turn the paid API on. Live mode starts only when `APP_MODE=live`.

## Architecture

Public demo, the hosted default:

```
Question → match a recorded question → stream the stored answer and citations
```

Live mode, only with `APP_MODE=live`:

```
Upload → chunk → embed (Ollama, or OpenAI if you opt in)
                          ↓
                  Supabase pgvector
                          ↓
Question → embed → cosine search → grounded answer with [Source N]
```

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Public demo:** replay of answers recorded from local `gemma4:31b` with `embeddinggemma`. No Supabase and no paid API.
- **Live, local:** Ollama (`gemma4:31b` and `embeddinggemma`) when `APP_MODE=live` and `LLM_PROVIDER=ollama`
- **Live, paid:** OpenAI `text-embedding-3-small` and GPT-4o-mini, only when `APP_MODE=live` and `OPENAI_API_KEY` is set
- **Database for live mode:** Supabase (PostgreSQL + pgvector)
- **File parsing:** pdf-parse (PDF), native (TXT, MD)

## Features

- Drag-and-drop document upload (PDF, TXT, MD)
- Automatic text extraction and intelligent chunking
- Vector embeddings with cosine similarity search
- Streaming AI responses grounded in document content
- Source citations, open by default, with the document name and the quoted passage. `[Source n]` in an answer scrolls to that card.
- Conversation history for follow-up questions
- Document management (upload, list, delete)
- Dark theme, responsive layout

## Demo mode and local mode

Demo mode is the default, including when `OPENAI_API_KEY` is present. It does not call a paid API and does not need Supabase. It serves the Helmfell Yard files under `samples/` and plays the four answers in `demo/replay.json`, recorded from local `gemma4:31b` with `embeddinggemma`. The empty state says answers are retrieved from the sample documents. A recorded answer leads with how many passages it used, for example "Answered from 4 passages in your documents", and the source cards stay open. The Gemma note stays under that line: "Recorded from local Gemma 4. Live mode runs locally via Ollama."

`npm run demo:record` remakes that file on a machine with Ollama:

```bash
ollama pull gemma4:31b
ollama pull embeddinggemma
npm run demo:record
```

Optional settings: `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`), `OLLAMA_CHAT_MODEL` (default `gemma4:31b`), `OLLAMA_EMBED_MODEL` (default `embeddinggemma`). The script replaces `demo/replay.json`. Commit that file if the hosted site should play the new recording.

Local live mode requires `APP_MODE=live`. With `LLM_PROVIDER=ollama` it uses your Ollama daemon. Without that, it uses OpenAI only when `OPENAI_API_KEY` is set. If live mode is on and neither is available, requests fail and stay off the demo playback.

```bash
# APP_MODE=live
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://127.0.0.1:11434
npm run dev
```

`npm run demo:record` prints each question as it starts, then the elapsed time and whether it succeeded or failed.

Uploads and deletion are disabled in the public demo. In live mode, deletion requires `ADMIN_SECRET` (at least 16 characters) as `Authorization: Bearer <secret>`. Ask, search, and upload are rate limited per isolate and reject oversized bodies. On Vercel production, OpenAI calls are also capped per day (`DEMO_DAILY_MODEL_CALLS`, default 40) through `supabase/migrations/002_demo_usage.sql`. Set `DEMO_MODE=false` to turn that cap off.

`npm run seed:sample` does not call a paid API unless `SEED_WITH_OPENAI=true`. When that flag is set it stores every file listed in `demo/questions.json`. The demo does not need that seed.

## Demo video

Video coming.

## Setup

1. The public demo needs no keys. A saved `OPENAI_API_KEY` does not enable paid calls. No Supabase project is required.
2. For live mode, copy `.env.example` to `.env.local` and set `APP_MODE=live`. Ollama also needs `LLM_PROVIDER=ollama`. OpenAI needs `OPENAI_API_KEY` plus a Supabase project with `001_initial_schema.sql` and `002_demo_usage.sql`.
3. `npm install && npm run dev`

## Key Implementation Details

- **Chunking strategy:** 500-token chunks with 50-token overlap, split on paragraph boundaries to preserve context. Headings are tracked and stored as metadata.
- **Embedding model (live OpenAI only):** text-embedding-3-small. The public demo does not call it. Local live mode uses `embeddinggemma`.
- **Search:** pgvector IVFFlat index with cosine distance. Threshold of 0.3 filters low-relevance results.
- **Streaming:** Vercel AI SDK `streamText` for real-time response rendering.
- **Grounding:** System prompt instructs the model to only use provided context, with [Source N] notation for citations.

## Hosted demo checklist

Demo mode needs no Supabase project and no paid API key. A leftover `OPENAI_API_KEY` on Vercel does not start paid calls. A paused Supabase project does not affect demo playback. The committed `demo/replay.json` is a recording from local `gemma4:31b` with `embeddinggemma`. Run `npm run demo:record` only when you want to replace it, then commit that file. Set `APP_MODE=live` only where you intend to run live answers.
