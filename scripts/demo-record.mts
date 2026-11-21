import { recordFromOllama } from "../src/lib/record-demo.ts";

const root = process.cwd();

recordFromOllama(root)
  .then((replay) => {
    console.log(
      `Wrote demo/replay.json (${replay.questions.length} answers, ${replay.chat_model}, ${replay.embed_model}).`
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Recording failed";
    console.error(message);
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      console.error("Start Ollama, then: ollama pull gemma4:31b && ollama pull embeddinggemma");
    }
    process.exit(1);
  });
