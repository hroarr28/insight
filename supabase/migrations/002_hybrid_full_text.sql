-- Hybrid retrieval: english full-text search alongside the existing vector index.
-- 001_initial_schema.sql is unchanged. match_documents stays the vector leg.
--
-- The generated tsvector keeps the index in step with content and heading.
-- Headings are weight A and body text is weight B, so a section title outranks
-- a passing mention.
--
-- search_documents_fts ORs the english lexemes of the question. A natural
-- language question almost never contains every term inside one chunk, so an
-- AND query (plainto_tsquery / websearch_to_tsquery) would return nothing and
-- hybrid search would silently collapse to the vector list. Stopwords are
-- dropped by to_tsvector. Reciprocal rank fusion happens in the application,
-- which keeps the fusion rule testable and identical in the eval harness.

alter table document_chunks
  add column if not exists content_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(heading, '')), 'A')
    || setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored;

create index if not exists document_chunks_content_tsv_idx
  on document_chunks
  using gin (content_tsv);

create or replace function search_documents_fts(
  query_text text,
  match_count int default 20
)
returns table (
  id uuid,
  content text,
  heading text,
  document_name text,
  chunk_index integer,
  rank real
)
language plpgsql
stable
set search_path = public
as $$
declare
  tsq tsquery := null;
  lex text;
begin
  if query_text is null or length(btrim(query_text)) = 0 or match_count < 1 then
    return;
  end if;

  for lex in
    select s.lexeme
    from unnest(to_tsvector('english', left(query_text, 2000)))
      as s(lexeme, positions, weights)
    where s.lexeme ~ '^[a-z0-9]+$'
    group by s.lexeme
    order by s.lexeme
    limit 40
  loop
    if tsq is null then
      tsq := lex::tsquery;
    else
      tsq := tsq || lex::tsquery;
    end if;
  end loop;

  if tsq is null then
    return;
  end if;

  return query
  select
    dc.id,
    dc.content,
    dc.heading,
    d.name as document_name,
    dc.chunk_index,
    ts_rank_cd(dc.content_tsv, tsq)::real as rank
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where dc.content_tsv @@ tsq
  order by rank desc, dc.id
  limit match_count;
end;
$$;

grant execute on function public.search_documents_fts(text, integer)
  to anon, authenticated, service_role;
