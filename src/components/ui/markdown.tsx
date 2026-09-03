"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export { plainTextFromMarkdown } from "@/lib/markdown-plain";

type MarkdownProps = {
  children: string;
  className?: string;
  compact?: boolean;
};

export function Markdown({ children, className, compact = false }: MarkdownProps) {
  return (
    <div
      className={cn(
        "markdown-body max-w-none text-zinc-300",
        compact ? "text-[13px] leading-relaxed" : "text-sm leading-relaxed",
        className,
      )}
    >
      <ReactMarkdown
        components={{
          h1: ({ children: c }) => (
            <h1 className="mb-2 mt-4 text-base font-semibold tracking-tight text-zinc-50 first:mt-0">
              {c}
            </h1>
          ),
          h2: ({ children: c }) => (
            <h2 className="mb-2 mt-4 text-[15px] font-semibold tracking-tight text-zinc-50 first:mt-0">
              {c}
            </h2>
          ),
          h3: ({ children: c }) => (
            <h3 className="mb-1.5 mt-3 text-sm font-semibold text-zinc-100 first:mt-0">{c}</h3>
          ),
          h4: ({ children: c }) => (
            <h4 className="mb-1 mt-3 text-sm font-medium text-zinc-100 first:mt-0">{c}</h4>
          ),
          p: ({ children: c }) => <p className="mb-2.5 last:mb-0">{c}</p>,
          strong: ({ children: c }) => <strong className="font-semibold text-zinc-100">{c}</strong>,
          em: ({ children: c }) => <em className="italic text-zinc-200">{c}</em>,
          ul: ({ children: c }) => (
            <ul className="mb-2.5 list-disc space-y-1 pl-5 last:mb-0">{c}</ul>
          ),
          ol: ({ children: c }) => (
            <ol className="mb-2.5 list-decimal space-y-1 pl-5 last:mb-0">{c}</ol>
          ),
          li: ({ children: c }) => <li className="pl-0.5">{c}</li>,
          a: ({ href, children: c }) => (
            <a
              href={href}
              className="text-indigo-300 underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {c}
            </a>
          ),
          blockquote: ({ children: c }) => (
            <blockquote className="mb-2.5 border-l-2 border-zinc-600 pl-3 text-zinc-400 last:mb-0">
              {c}
            </blockquote>
          ),
          code: ({ className: codeClass, children: c }) => {
            const inline = !codeClass;
            if (inline) {
              return (
                <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[0.9em] text-zinc-200">
                  {c}
                </code>
              );
            }
            return (
              <code className="block overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-[12px] text-zinc-300">
                {c}
              </code>
            );
          },
          pre: ({ children: c }) => <pre className="mb-2.5 overflow-x-auto last:mb-0">{c}</pre>,
          hr: () => <hr className="my-3 border-zinc-800" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
