export const SAMPLE_COMPANY = "Helmfell Yard";

export const FICTIONAL_SAMPLE_NOTE = `Fictional sample. ${SAMPLE_COMPANY} is not a real company.`;

export interface SampleDocumentRef {
  path: string;
  name: string;
}

export interface SampleQuestion {
  text: string;
  documents: string[];
}

export interface SamplePlan {
  documents: SampleDocumentRef[];
  questions: SampleQuestion[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function questionTexts(plan: SamplePlan): string[] {
  return plan.questions.map((question) => question.text);
}

/** Reads demo/questions.json. Question text is what gets recorded; document lists say which files a question needs. */
export function parseSamplePlan(raw: unknown): SamplePlan {
  const record = asRecord(raw);
  if (!record) throw new Error("demo/questions.json must be an object");
  if (!Array.isArray(record.documents) || record.documents.length === 0) {
    throw new Error("demo/questions.json must list sample documents");
  }

  const documents: SampleDocumentRef[] = record.documents.map((item, index) => {
    const row = asRecord(item);
    if (!row || typeof row.path !== "string" || !row.path.trim()) {
      throw new Error(`Sample document ${index + 1} needs a path`);
    }
    if (typeof row.name !== "string" || !row.name.trim()) {
      throw new Error(`Sample document ${index + 1} needs a name`);
    }
    return { path: row.path.trim(), name: row.name.trim() };
  });

  const names = new Set<string>();
  for (const document of documents) {
    if (names.has(document.name)) throw new Error(`Duplicate sample document: ${document.name}`);
    names.add(document.name);
  }

  if (!Array.isArray(record.questions) || record.questions.length === 0) {
    throw new Error("demo/questions.json must list questions");
  }

  const questions: SampleQuestion[] = record.questions.map((item, index) => {
    const row = asRecord(item);
    if (!row || typeof row.text !== "string" || !row.text.trim()) {
      throw new Error(`Sample question ${index + 1} needs text`);
    }
    if (!Array.isArray(row.documents) || row.documents.length === 0) {
      throw new Error(`Sample question ${index + 1} must name the documents it needs`);
    }
    const needed = row.documents.map((name, nameIndex) => {
      if (typeof name !== "string" || !names.has(name)) {
        throw new Error(`Sample question ${index + 1} document ${nameIndex + 1} is not in the sample set`);
      }
      return name;
    });
    return { text: row.text.trim(), documents: needed };
  });

  const seen = new Set<string>();
  for (const question of questions) {
    const key = question.text.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate demo question: ${question.text}`);
    seen.add(key);
  }

  return { documents, questions };
}
