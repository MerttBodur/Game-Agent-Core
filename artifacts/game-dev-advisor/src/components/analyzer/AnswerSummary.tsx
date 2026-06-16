import { Badge } from "@/components/ui/badge";
import { QUESTIONS, isAnswered, optionLabel, type Answers } from "./questions";

const MAX_CHIP_LENGTH = 60;

function displayValue(questionId: (typeof QUESTIONS)[number]["id"], value: string | string[]): string {
  const text = Array.isArray(value)
    ? value.map((v) => optionLabel(questionId, v)).join(" / ")
    : optionLabel(questionId, value);
  return text.length > MAX_CHIP_LENGTH ? `${text.slice(0, MAX_CHIP_LENGTH - 3)}...` : text;
}

export function AnswerSummary({
  answers,
  upTo,
  compact = false,
}: {
  answers: Answers;
  /** Only show answers for the first `upTo` questions (the ones already passed). */
  upTo?: number;
  compact?: boolean;
}) {
  const visible = (upTo != null ? QUESTIONS.slice(0, upTo) : QUESTIONS).filter((q) =>
    isAnswered(q, answers[q.id]),
  );
  if (visible.length === 0) return null;

  return (
    <div
      className={
        compact
          ? "px-1"
          : "rounded-xl border border-border bg-card p-5 space-y-2"
      }
    >
      {!compact && (
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Your answers
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {visible.map((q) => (
          <Badge key={q.id} variant="outline" className="font-medium">
            <span className="mr-1.5 text-muted-foreground">{q.title.replace(/[?]/g, "")}:</span>
            <span className="text-foreground">{displayValue(q.id, answers[q.id])}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
