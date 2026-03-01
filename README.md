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

## Setup

1. Create a Supabase project and run `supabase/migrations/001_initial_schema.sql`
2. Copy `.env.example` to `.env.local` and fill in your keys
3. `npm install && npm run dev`

## Key Implementation Details

- **Chunking strategy:** 500-token chunks with 50-token overlap, split on paragraph boundaries to preserve context. Headings are tracked and stored as metadata.
- **Embedding model:** text-embedding-3-small chosen for cost efficiency ($0.02/1M tokens) with strong retrieval performance.
- **Search:** pgvector IVFFlat index with cosine distance. Threshold of 0.3 filters low-relevance results.
- **Streaming:** Vercel AI SDK `streamText` for real-time response rendering.
- **Grounding:** System prompt instructs the model to only use provided context, with [Source N] notation for citations.
