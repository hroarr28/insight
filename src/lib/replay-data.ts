import raw from "../../demo/replay.json";
import { RECORDED_LABEL } from "./app-mode";
import { loadReplay, questionList, type ReplayFile } from "./replay";

export function currentReplay(): ReplayFile {
  return loadReplay(raw);
}

export function demoBanner(replay: ReplayFile): string {
  if (replay.recorded) return RECORDED_LABEL;
  return "Demo mode. No Gemma 4 recording is committed yet. Live mode runs locally via Ollama.";
}

export function demoCatalog(replay: ReplayFile = currentReplay()) {
  return {
    documents: replay.documents,
    demo: true,
    recorded: replay.recorded,
    label: demoBanner(replay),
    questions: questionList(replay),
  };
}
