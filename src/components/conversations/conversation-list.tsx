"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

export type ConversationSummary = {
  id: string;
  title: string;
  ceoGoal: string;
  status: string;
  createdAt: string;
};

const ACTIVE_RUN_KEY = "pixelcrew.activeRunId";

export function getStoredActiveRunId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_RUN_KEY);
}

export function setStoredActiveRunId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_RUN_KEY, id);
  else localStorage.removeItem(ACTIVE_RUN_KEY);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isLive(status: string): boolean {
  return status === "running" || status === "pending";
}

type ConversationListProps = {
  conversations: ConversationSummary[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
};

export function ConversationList({
  conversations,
  activeId,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpenId) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpenId]);

  const startEdit = (c: ConversationSummary) => {
    setMenuOpenId(null);
    setEditingId(c.id);
    setEditTitle(c.title || c.ceoGoal.slice(0, 60));
  };

  const commitEdit = (id: string) => {
    const title = editTitle.trim();
    if (title) onRename(id, title);
    setEditingId(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="p-3">
          <button
            type="button"
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
          >
            <Plus size={16} />
            New chat
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-zinc-600">
              Nothing here yet. Describe what you want to build.
            </li>
          )}
          {conversations.map((c) => (
            <li key={c.id}>
              {editingId === c.id ? (
                <div className="px-1 py-1">
                  <input
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => commitEdit(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                  />
                </div>
              ) : (
                <div
                  className={`group flex items-center gap-0.5 rounded-lg ${
                    activeId === c.id ? "bg-zinc-800/80" : "hover:bg-zinc-900"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                    onClick={() => onSelect(c.id)}
                  >
                    <span className="flex items-center gap-2">
                      {isLive(c.status) && (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-indigo-400 animate-pulse"
                          aria-label="In progress"
                        />
                      )}
                      <span className="truncate text-sm text-zinc-200">
                        {c.title || c.ceoGoal || "Untitled"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-600">
                      {relativeTime(c.createdAt)}
                    </span>
                  </button>
                  <div className="relative shrink-0 pr-1" ref={menuOpenId === c.id ? menuRef : undefined}>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-zinc-500 opacity-100 hover:bg-zinc-800 hover:text-zinc-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      aria-label="Chat options"
                      onClick={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {menuOpenId === c.id && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-zinc-800 bg-zinc-950 py-1">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                          onClick={() => startEdit(c)}
                        >
                          <Pencil size={12} />
                          Rename
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-300 hover:bg-red-950/40"
                          onClick={() => {
                            setMenuOpenId(null);
                            setDeleteTarget(c);
                          }}
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this chat?"
        description={
          deleteTarget
            ? `"${deleteTarget.title || deleteTarget.ceoGoal.slice(0, 40) || "Untitled"}" will be removed. This cannot be undone.`
            : undefined
        }
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </>
  );
}
