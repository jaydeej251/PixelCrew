"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Spinner } from "@/components/ui/spinner";
import {
  allDecisionsAnswered,
  unansweredDecisionCount,
  type PlanDecision,
} from "@/lib/plan-decisions";
import { readResponseJson } from "@/lib/http-json";

type ThreadItem = { role: "user" | "assistant"; content: string; speaker?: string };

type PlanPayload = {
  ok?: boolean;
  error?: string;
  thread?: ThreadItem[];
  plan?: string;
  decisions?: PlanDecision[];
};

type PlanReviewProps = {
  runId: string;
  onPublished: () => void;
  /** Leave this plan and start a new chat with the same brief editable. */
  onRestart?: () => void;
};

type StreamEvent =
  | { type: "delta"; content?: string }
  | { type: "done"; ok?: boolean; thread?: ThreadItem[]; plan?: string; decisions?: PlanDecision[] }
  | { type: "error"; error?: string };

async function readPlanAskStream(
  res: Response,
  onDelta: (chunk: string) => void,
): Promise<PlanPayload> {
  if (!res.body) {
    return { error: "Could not update the plan. Try again." };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: PlanPayload | null = null;

  const handleEvent = (raw: string) => {
    const dataLine = raw
      .split("\n")
      .map((line) => line.trimEnd())
      .find((line) => line.startsWith("data:"));
    if (!dataLine) return;
    const payload = dataLine.slice(5).trim();
    if (!payload) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(payload) as StreamEvent;
    } catch {
      return;
    }
    if (event.type === "delta" && event.content) {
      onDelta(event.content);
      return;
    }
    if (event.type === "done") {
      final = {
        ok: event.ok ?? true,
        thread: event.thread,
        plan: event.plan,
        decisions: event.decisions,
      };
      return;
    }
    if (event.type === "error") {
      final = { error: event.error ?? "Could not update the plan. Try again." };
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.trim()) handleEvent(part);
    }
  }
  if (buffer.trim()) handleEvent(buffer);

  return final ?? { error: "Could not update the plan. Try again." };
}

export function PlanReview({ runId, onPublished, onRestart }: PlanReviewProps) {
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [decisions, setDecisions] = useState<PlanDecision[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [canPublish, setCanPublish] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const applyPayload = (json: PlanPayload) => {
    if (json.thread?.length) setThread(json.thread);
    if (json.decisions) setDecisions(json.decisions);
    const items = json.decisions ?? decisions;
    setCanPublish(Boolean(String(json.plan ?? "").trim()) && allDecisionsAnswered(items));
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/runs/${runId}/plan`, { signal: controller.signal })
      .then((res) => readResponseJson<PlanPayload>(res))
      .then((json) => {
        setThread(
          json.thread?.length
            ? json.thread
            : json.plan
              ? [{ role: "assistant", content: json.plan, speaker: "Plan" }]
              : [],
        );
        const items = (json.decisions ?? []) as PlanDecision[];
        setDecisions(items);
        setCanPublish(Boolean(String(json.plan ?? "").trim()) && allDecisionsAnswered(items));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setError("Could not load the plan");
      });
    return () => controller.abort();
  }, [runId]);

  const load = async () => {
    const res = await fetch(`/api/runs/${runId}/plan`);
    const json = await readResponseJson<PlanPayload>(res);
    setThread(
      json.thread?.length
        ? json.thread
        : json.plan
          ? [{ role: "assistant", content: json.plan, speaker: "Plan" }]
          : [],
    );
    const items = (json.decisions ?? []) as PlanDecision[];
    setDecisions(items);
    setCanPublish(Boolean(String(json.plan ?? "").trim()) && allDecisionsAnswered(items));
  };

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, busy, draft, decisions]);

  const send = async () => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setDraft("");
    setError("");
    const pending = question;
    setQuestion("");
    setThread((prev) => [...prev, { role: "user", content: pending }]);
    try {
      const res = await fetch(`/api/runs/${runId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask", message: pending }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        const payload = await readPlanAskStream(res, (chunk) => {
          setDraft((prev) => prev + chunk);
        });
        if (payload.error || !res.ok) {
          setError(payload.error ?? "Could not update the plan. Try again.");
          setDraft("");
          await load();
        } else {
          setDraft("");
          applyPayload(payload);
        }
      } else {
        const json = await readResponseJson<PlanPayload>(res);
        if (!res.ok) {
          setError(json.error ?? "Could not update the plan. Try again.");
          setDraft("");
          await load();
        } else {
          setDraft("");
          applyPayload(json);
        }
      }
    } catch {
      setError("Could not update the plan. Try again.");
      setDraft("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const decide = async (payload: { decisionId?: string; optionId?: string; useRecommended?: boolean }) => {
    if (busy) return;
    setBusy(true);
    setDraft("");
    setError("");
    try {
      const res = await fetch(`/api/runs/${runId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", ...payload }),
      });
      const json = await readResponseJson<PlanPayload>(res);
      if (!res.ok) {
        setError(json.error ?? "Could not save that choice.");
        await load();
      } else {
        applyPayload(json);
      }
    } catch {
      setError("Could not save that choice.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remaining = unansweredDecisionCount(decisions);
  const hasDecisions = decisions.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 shrink-0">
        <h2 id="plan-review-title" className="text-lg font-semibold tracking-tight text-zinc-50">
          Review the plan
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          {hasDecisions
            ? "The team drafted a plan using the recommended answers. Confirm anything that would steer the whole product, then start building."
            : "Read it, ask for changes, then start building when it looks right."}
        </p>
      </div>

      <div
        ref={scroller}
        className="min-h-[220px] flex-1 space-y-3 overflow-y-auto pr-1"
      >
        {hasDecisions && (
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Direction {remaining === 0 ? "confirmed" : `${decisions.length - remaining} of ${decisions.length} chosen`}
            </p>
            {decisions.map((decision) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                disabled={busy}
                onPick={(optionId) => void decide({ decisionId: decision.id, optionId })}
              />
            ))}
            {remaining > 0 && (
              <Button
                variant="ghost"
                className="w-full text-xs"
                disabled={busy}
                onClick={() => void decide({ useRecommended: true })}
              >
                Use recommended for {remaining === decisions.length ? "all" : "the rest"}
              </Button>
            )}
          </div>
        )}
        {thread.length === 0 && !busy && (
          <p className="py-8 text-center text-sm text-zinc-500">
            The team is writing the first draft…
          </p>
        )}
        {thread.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-indigo-500/15 text-indigo-50"
                : "mr-auto bg-zinc-900 text-zinc-200"
            }`}
          >
            <p className="mb-1 text-[11px] font-medium text-zinc-500">
              {m.role === "user" ? "You" : m.speaker ?? "Team"}
            </p>
            {m.role === "user" ? (
              <p className="whitespace-pre-wrap text-[13px]">{m.content}</p>
            ) : (
              <Markdown compact>{m.content}</Markdown>
            )}
          </div>
        ))}
        {busy && draft && (
          <div className="mr-auto max-w-[92%] rounded-2xl bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-200">
            <p className="mb-1 text-[11px] font-medium text-zinc-500">Workspace AI</p>
            <Markdown compact>{draft}</Markdown>
            <span
              aria-hidden
              className="mt-1 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-zinc-500 align-middle"
            />
          </div>
        )}
        {busy && !draft && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-zinc-500">
            <Spinner className="size-3.5" />
            Thinking…
          </div>
        )}
      </div>

      <div className="mt-4 shrink-0 space-y-3 border-t border-zinc-800/80 pt-4">
        <textarea
          className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/40 focus:outline-none"
          rows={2}
          placeholder="Ask a question or request a change…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={busy || !question.trim()} onClick={() => void send()}>
              Send
            </Button>
            {onRestart && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                className="text-zinc-400"
                onClick={onRestart}
              >
                Wrong direction — start over
              </Button>
            )}
          </div>
          <Button
            disabled={busy || !canPublish}
            onClick={async () => {
              setBusy(true);
              setDraft("");
              setError("");
              try {
                const res = await fetch(`/api/runs/${runId}/plan`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "publish" }),
                });
                const json = await readResponseJson<PlanPayload>(res);
                if (!res.ok) {
                  setError(json.error ?? "Could not start building. Try again.");
                  if (json.decisions) setDecisions(json.decisions);
                  return;
                }
                onPublished();
              } catch {
                setError("Could not start building. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Looks good — start building
          </Button>
        </div>
        {onRestart && (
          <p className="text-[11px] text-zinc-600">
            Start over opens a new chat with your brief so you can rewrite it (uses a monthly run
            when you Start).
          </p>
        )}
      </div>
    </div>
  );
}

function DecisionCard({
  decision,
  disabled,
  onPick,
}: {
  decision: PlanDecision;
  disabled: boolean;
  onPick: (optionId: string) => void;
}) {
  const ordered = [...decision.options].sort(
    (a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)),
  );
  return (
    <fieldset className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
      <legend className="px-1 text-sm font-medium text-zinc-100">{decision.prompt}</legend>
      {decision.why ? (
        <p className="mb-2 text-[12px] leading-relaxed text-zinc-500">{decision.why}</p>
      ) : null}
      <div className="space-y-1.5">
        {ordered.map((option) => {
          const selected = decision.selectedId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(option.id)}
              className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-50 ${
                selected
                  ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-50"
                  : "border-zinc-800 bg-zinc-950/50 text-zinc-200 hover:border-zinc-600"
              }`}
            >
              <span
                className={`mt-0.5 inline-flex size-3.5 shrink-0 rounded-full border ${
                  selected ? "border-indigo-300 bg-indigo-400" : "border-zinc-500"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  {option.label}
                  {option.recommended ? (
                    <span className="rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-200">
                      Recommended
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
