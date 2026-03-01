-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Documents table
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  file_type text not null default 'text/plain',
  chunk_count integer not null default 0,
  created_at timestamptz default now() not null
);

-- Document chunks with vector embeddings
create table if not exists document_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade not null,
  content text not null,
  chunk_index integer not null,
  heading text,
  embedding vector(1536) not null,
  created_at timestamptz default now() not null
);

-- Index for vector similarity search
create index if not exists document_chunks_embedding_idx
  on document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index for document lookups
create index if not exists document_chunks_document_id_idx
  on document_chunks(document_id);

-- Function for semantic search
create or replace function match_documents(
  query_embedding vector(1536),
  match_threshold float default 0.3,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  heading text,
  document_name text,
  chunk_index integer,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    dc.id,
    dc.content,
    dc.heading,
    d.name as document_name,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Row Level Security (open for demo — add auth for production)
alter table documents enable row level security;
alter table document_chunks enable row level security;

create policy "Public read documents" on documents for select using (true);
create policy "Public insert documents" on documents for insert with check (true);
create policy "Public delete documents" on documents for delete using (true);

create policy "Public read chunks" on document_chunks for select using (true);
create policy "Public insert chunks" on document_chunks for insert with check (true);
create policy "Public delete chunks" on document_chunks for delete using (true);
