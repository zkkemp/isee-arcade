import type { Progress } from './progress';
import { questionById } from './questions';
import type { QuestionKind, Subject } from './questions/types';

export type SmartFocus = {
  subject: Subject;
  kind: QuestionKind | null;
  topic: string | null;
  accuracy: number;
  attempts: number;
};

/**
 * Finds one meaningful weak lane from recent work. It requires enough evidence
 * to avoid reacting to a single miss and never labels an 80%+ lane as weak.
 */
export function smartFocusForProgress(progress: Progress): SmartFocus | null {
  const recent = progress.history.slice(-60);
  const lanes = new Map<
    string,
    {
      subject: Subject;
      kind: QuestionKind | null;
      topic: string | null;
      seen: number;
      correct: number;
    }
  >();
  for (const attempt of recent) {
    const question = questionById(attempt.id);
    const kind = question?.kind ?? null;
    const topic = question?.topic ?? null;
    const key = `${attempt.subject}:${topic ?? kind ?? 'unknown'}`;
    const lane = lanes.get(key) ?? {
      subject: attempt.subject,
      kind,
      topic,
      seen: 0,
      correct: 0,
    };
    lane.seen += 1;
    if (attempt.correct) lane.correct += 1;
    lanes.set(key, lane);
  }
  const eligible = [...lanes.values()]
    .filter((lane) => lane.seen >= 4)
    .map((lane) => ({ ...lane, accuracy: lane.correct / lane.seen }))
    .filter((lane) => lane.accuracy < 0.8)
    .sort((a, b) => a.accuracy - b.accuracy || b.seen - a.seen);
  const weakest = eligible[0];
  return weakest
    ? {
        subject: weakest.subject,
        kind: weakest.kind,
        topic: weakest.topic,
        accuracy: weakest.accuracy,
        attempts: weakest.seen,
      }
    : null;
}
