import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { canAdvance, type Question } from "./questions";

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-sm transition-all duration-300 ${
            i === current ? "w-6" : "w-3"
          } ${i <= current ? "bg-primary" : "bg-border"}`}
        />
      ))}
    </div>
  );
}

function OptionChip({
  active,
  multi,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  multi?: boolean;
  label: string;
  desc?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground"
      }`}
    >
      {multi && (
        <span
          className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
            active ? "border-primary bg-primary" : "border-muted-foreground bg-transparent"
          }`}
        >
          {active && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="hsl(var(--primary-foreground))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
      )}
      <span className="font-medium">{label}</span>
      {desc && <span className="text-xs font-normal opacity-70">/ {desc}</span>}
    </button>
  );
}

export function QuestionCard({
  question,
  value,
  onChange,
  onNext,
  onBack,
  isFirst,
  isLast,
  current,
  total,
}: {
  question: Question;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  onNext: () => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
  current: number;
  total: number;
}) {
  const { kind, title, subtitle, options, placeholder, optional } = question;
  const advanceEnabled = canAdvance(question, value);

  const skip = () => {
    onChange(kind === "multi" ? [] : "");
    onNext();
  };

  const toggleMulti = (optionValue: string) => {
    const selected = value as string[];
    onChange(
      selected.includes(optionValue)
        ? selected.filter((v) => v !== optionValue)
        : [...selected, optionValue],
    );
  };

  return (
    <Card className="p-8 border-border bg-card animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Question {current + 1} of {total}
        </span>
        <ProgressDots total={total} current={current} />
      </div>

      <h2 className="mb-1.5 text-2xl font-black tracking-tight text-foreground">
        {title}
        {optional && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">(optional)</span>
        )}
      </h2>
      {subtitle && (
        <p className="mb-6 max-w-xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      )}

      <div className="mb-8">
        {kind === "text" && (
          <Textarea
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className="min-h-[100px] bg-transparent border-border text-foreground placeholder:text-muted-foreground resize-none"
          />
        )}
        {kind === "single" && (
          <div className="flex flex-wrap gap-2">
            {(options ?? []).map((o) => (
              <OptionChip
                key={o.value}
                active={value === o.value}
                label={o.label}
                desc={o.desc}
                onClick={() => onChange(o.value)}
              />
            ))}
          </div>
        )}
        {kind === "multi" && (
          <div className="flex flex-wrap gap-2">
            {(options ?? []).map((o) => (
              <OptionChip
                key={o.value}
                multi
                active={(value as string[]).includes(o.value)}
                label={o.label}
                desc={o.desc}
                onClick={() => toggleMulti(o.value)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isFirst}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {optional && (
            <Button type="button" variant="outline" onClick={skip}>
              Skip
            </Button>
          )}
          <Button
            type="button"
            onClick={onNext}
            disabled={!advanceEnabled}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            {isLast ? "Analyze Project" : "Continue"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
