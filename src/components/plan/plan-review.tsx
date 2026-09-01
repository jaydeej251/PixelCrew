"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ThreadItem = { role: "user" | "assistant"; content: string; speaker?: string };

type PlanReviewProps = {
  runId: string;
  onPublished: () => void;
};

export function PlanReview({ runId, onPublished }: PlanReviewProps) {
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canPublish, setCanPublish] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await fetch(`/api/runs/${runId}/plan`);
    const json = await res.json();
    setThread(
      json.thread?.length
        ? json.thread
        : json.plan
          ? [{ role: "assistant", content: json.plan, speaker: "Plan" }]
          : [],
    );
    setCanPublish(Boolean(String(json.plan ?? "").trim()));
  };

  useEffect(() => {
    void load();
  }, [runId]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, busy]);

  const send = async () => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError("");
    const pending = question;
    setQuestion("");
    setThread((prev) => [...prev, { role: "user", content: pending }]);
    const res = await fetch(`/api/runs/${runId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ask", message: pending }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not update the plan. Try again.");
      await load();
    } else {
      setThread(json.thread ?? []);
      setCanPublish(Boolean(String(json.plan ?? "").trim()));
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Review the plan</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Read it, ask for changes, then start building when it looks right.
        </p>
      </div>

      <div
        ref={scroller}
        className="min-h-[220px] flex-1 space-y-3 overflow-y-auto pr-1"
      >
        {thread.length === 0 && (
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
            <pre className="whitespace-pre-wrap font-sans text-[13px]">{m.content}</pre>
          </div>
        ))}
        {busy && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-zinc-500">
            <Spinner className="size-3.5" />
            Thinking…
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3 border-t border-zinc-800/80 pt-4">
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
          <Button variant="secondary" disabled={busy || !question.trim()} onClick={() => void send()}>
            Send
          </Button>
          <Button
            disabled={busy || !canPublish}
            onClick={async () => {
              setBusy(true);
              setError("");
              const res = await fetch(`/api/runs/${runId}/plan`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "publish" }),
              });
              if (!res.ok) {
                const json = await res.json();
                setError(json.error ?? "Could not start building. Try again.");
                setBusy(false);
                return;
              }
              onPublished();
            }}
          >
            Looks good — start building
          </Button>
        </div>
      </div>
    </div>
  );
}
