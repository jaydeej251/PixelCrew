"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";

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
    setThread(json.thread?.length ? json.thread : json.plan ? [{ role: "assistant", content: json.plan, speaker: "Combined plan" }] : []);
    setCanPublish(Boolean(String(json.plan ?? "").trim()));
  };

  useEffect(() => {
    void load();
  }, [runId]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, busy]);

  const hasPlan = canPublish;

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Planning council</PanelTitle>
      </PanelHeader>
      <PanelContent className="space-y-3">
        <p className="text-xs text-zinc-500">
          Workspace AI staffs Product, Senior Developer, and UI/UX. They brainstorm, then you get one
          combined plan. Ask anything — they should never say “not my job.” Publish when you want the
          team to build.
        </p>

        <div
          ref={scroller}
          className="flex max-h-[420px] min-h-[220px] flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3"
        >
          {thread.length === 0 && (
            <p className="text-xs text-zinc-600">Waiting for the council’s first draft…</p>
          )}
          {thread.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-indigo-500/20 text-indigo-100"
                  : "mr-auto bg-zinc-900 text-zinc-200"
              }`}
            >
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                {m.role === "user" ? "You" : m.speaker ?? "Council"}
              </p>
              <pre className="whitespace-pre-wrap font-sans text-xs">{m.content}</pre>
            </div>
          ))}
          {busy && (
            <div className="mr-auto rounded-xl bg-zinc-900 px-3 py-2 text-xs text-zinc-500">
              Planner is thinking…
            </div>
          )}
        </div>

        <textarea
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          rows={3}
          placeholder="Ask a question or request a change…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              document.getElementById("plan-ask-btn")?.click();
            }
          }}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button
            id="plan-ask-btn"
            variant="secondary"
            disabled={busy || !question.trim()}
            onClick={async () => {
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
                setError(json.error ?? "Could not update plan");
                await load();
              } else {
                setThread(json.thread ?? []);
                setCanPublish(Boolean(String(json.plan ?? "").trim()));
              }
              setBusy(false);
            }}
          >
            {busy ? "Sending…" : "Send"}
          </Button>
          <Button
            disabled={busy || !hasPlan}
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
                setError(json.error ?? "Publish failed");
                setBusy(false);
                return;
              }
              onPublished();
            }}
          >
            Publish plan
          </Button>
        </div>
      </PanelContent>
    </Panel>
  );
}
