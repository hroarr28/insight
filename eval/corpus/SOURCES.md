# Eval corpus

These files are the only documents the retrieval eval is allowed to search. They are excerpts of works that are in the public domain in the United States. This repository does not add a licence on top of that public-domain status.

The Project Gutenberg transcriptions were taken from the GITenberg mirrors on 20 November 2026, after gutenberg.org itself returned HTTP 503. The Gutenberg header, footer, trademark notice, and licence boilerplate are not included. What remains is the literary or official text.

Editorial changes, all mechanical:

- Line endings are LF.
- Hard-wrapped lines are joined into paragraphs. The words are unchanged.
- A markdown heading was added on a title the source already had (a chapter, a Federalist number, or "IN CONGRESS, July 4, 1776") so the heading-aware chunker has a real section boundary to split on. Headings were not invented for passages that have none.

## Works

| File | Work | Author | Date | Gutenberg ebook | What is included |
| --- | --- | --- | --- | --- | --- |
| `alice-wonderland.txt` | Alice's Adventures in Wonderland | Lewis Carroll | 1865 | 11 | Chapters I–III |
| `scandal-in-bohemia.txt` | The Adventures of Sherlock Holmes | Arthur Conan Doyle | 1892 | 1661 | "A Scandal in Bohemia" |
| `federalist-no-1.txt` | The Federalist Papers | Alexander Hamilton | 1787 | 1404 | No. 1 |
| `federalist-no-10.txt` | The Federalist Papers | James Madison | 1787 | 1404 | No. 10 |
| `declaration-of-independence.txt` | United States Declaration of Independence | Congress | 1776 | 1 | The Declaration only |

Gutenberg ebook 1 also contains later commentary and other early etexts. Those were not copied. The Declaration text is a United States government work and is in the public domain.

Questions in `eval/questions.json` point at short quotations copied from these files. A chunk is relevant when it contains one of those quotations.
