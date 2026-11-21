import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  answerPieces,
  retrievalLine,
  RETRIEVAL_EMPTY_LINE,
  sourceCardsOpen,
  sourceElementId,
} from "./answer-view.ts";
import { FICTIONAL_SAMPLE_NOTE } from "./sample-plan.ts";

describe("retrieval copy", () => {
  it("says answers are retrieved from the sample documents", () => {
    assert.equal(RETRIEVAL_EMPTY_LINE, "Answers are retrieved from the sample documents.");
    assert.match(FICTIONAL_SAMPLE_NOTE, /Fictional sample/);
    assert.match(retrievalLine(4), /^Answered from 4 passages in your documents$/);
    assert.equal(retrievalLine(1), "Answered from 1 passage in your documents");
  });
});

describe("source cards", () => {
  it("keeps passages expanded until the reader hides them", () => {
    const collapsed = new Set<string>();
    assert.equal(sourceCardsOpen(collapsed, "answer-1", 3), true);
    collapsed.add("answer-1");
    assert.equal(sourceCardsOpen(collapsed, "answer-1", 3), false);
    assert.equal(sourceCardsOpen(collapsed, "answer-2", 3), true);
    assert.equal(sourceCardsOpen(new Set(), "answer-1", 0), false);
  });

  it("gives each citation a card id", () => {
    assert.equal(sourceElementId("msg-1", 2), "source-msg-1-2");
  });
});

describe("citation links", () => {
  it("splits bracketed source marks into links for each passage", () => {
    const pieces = answerPieces("The badge is returned [Source 1]. The check uses [Source 2, Source 3].");
    const citations = pieces.filter((piece) => piece.type === "citation");
    assert.deepEqual(
      citations.map((piece) => (piece.type === "citation" ? piece.source : 0)),
      [1, 2, 3]
    );
    assert.deepEqual(
      citations.map((piece) => (piece.type === "citation" ? piece.label : "")),
      ["Source 1", "Source 2", "Source 3"]
    );
    const visible = pieces
      .map((piece) => (piece.type === "text" ? piece.text : piece.label))
      .join("");
    assert.equal(visible, "The badge is returned [Source 1]. The check uses [Source 2, Source 3].");
  });

  it("links a bare Source n mark", () => {
    const pieces = answerPieces("See Source 4 for the receipt rule.");
    const link = pieces.find((piece) => piece.type === "citation");
    assert.ok(link && link.type === "citation");
    assert.equal(link.source, 4);
    assert.equal(link.label, "Source 4");
  });
});

describe("answer screen", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  it("uses the retrieval line, open sources, and citation targets", () => {
    assert.match(page, /RETRIEVAL_EMPTY_LINE/);
    assert.match(page, /FICTIONAL_SAMPLE_NOTE/);
    assert.match(page, /retrievalLine\(message\.sources\.length\)/);
    assert.match(page, /answerPieces\(message\.content\)/);
    assert.match(page, /sourceCardsOpen\(/);
    assert.match(page, /sourceElementId\(message\.id, piece\.source\)/);
    assert.match(page, /revealSource\(message\.id, piece\.source\)/);
    assert.match(page, /source\.document_name/);
    assert.match(page, /source\.content/);
    assert.equal(page.includes("line-clamp"), false);
    assert.match(page, /onClick=\{\(\) => handleAsk\(suggestion\)\}/);
  });

  it("keeps the phone composer full width", () => {
    assert.match(page, /text-base/);
    assert.match(page, /md:text-sm/);
    assert.match(page, /safe-area-inset-bottom/);
    assert.match(page, /overflow-x-hidden/);
    assert.match(page, /min-w-0/);
  });
});
