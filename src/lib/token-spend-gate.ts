/**
 * Soft pause — ask the CEO to confirm before burning more BYOK.
 * Multi-agent office + QA fix loops routinely burn 40–80k on a first app;
 * soft confirm should not fire mid-first-ship.
 */
export const TOKEN_SOFT_GATE = 100_000;

/**
 * Hard stop after soft confirm.
 * Pattern: Claude Code / agent CLIs warn then hard-cap spend; Cursor shows usage
 * continuously. PixelCrew is BYOK — two gates beat a silent hard fail.
 *
 * Hard cap is intentionally high (context-window scale): a Review → Eng → QA →
 * 2–4 fix rounds easily exceeds 55k. Cap protects runaway loops, not first finish.
 */
export const TOKEN_HARD_GATE = 256_000;

export const TOKEN_SOFT_GATE_TITLE = "Token spend soft gate";
export const TOKEN_SPEND_CONFIRMED_TITLE = "Token spend confirmed";

export type TokenSpendGateKind = "soft" | "hard";

export type TokenSpendDecision =
  | { action: "allow" }
  | { action: "soft_gate"; tokens: number }
  | { action: "hard_gate"; tokens: number };

export function hasConfirmedSoftTokenSpend(
  artifacts?: Array<{ title: string }> | null,
): boolean {
  return Boolean(artifacts?.some((a) => a.title === TOKEN_SPEND_CONFIRMED_TITLE));
}

export function hasOpenSoftTokenGate(
  artifacts?: Array<{ title: string }> | null,
): boolean {
  if (!artifacts?.length) return false;
  if (hasConfirmedSoftTokenSpend(artifacts)) return false;
  return artifacts.some((a) => a.title === TOKEN_SOFT_GATE_TITLE);
}

/**
 * Soft gate at TOKEN_SOFT_GATE until the CEO confirms; hard stop at TOKEN_HARD_GATE
 * even after confirm.
 */
export function decideTokenSpendGate(
  totalTokens: number,
  artifacts?: Array<{ title: string }> | null,
): TokenSpendDecision {
  if (totalTokens >= TOKEN_HARD_GATE) {
    return { action: "hard_gate", tokens: totalTokens };
  }
  if (totalTokens >= TOKEN_SOFT_GATE && !hasConfirmedSoftTokenSpend(artifacts)) {
    return { action: "soft_gate", tokens: totalTokens };
  }
  return { action: "allow" };
}

export function tokenSoftGateMessage(tokens: number): string {
  return (
    `This chat has used about ${tokens.toLocaleString()} tokens (your API keys). ` +
    `Confirm to keep going — next stop is ${TOKEN_HARD_GATE.toLocaleString()} tokens.`
  );
}

export function tokenHardGateMessage(tokens: number): string {
  return (
    `Token spend limit reached (${TOKEN_HARD_GATE.toLocaleString()}). ` +
    `Used about ${tokens.toLocaleString()} tokens. Remaining work was not started.`
  );
}

export class TokenSpendGateError extends Error {
  readonly kind: TokenSpendGateKind;
  readonly tokens: number;

  constructor(kind: TokenSpendGateKind, tokens: number) {
    super(kind === "soft" ? tokenSoftGateMessage(tokens) : tokenHardGateMessage(tokens));
    this.name = "TokenSpendGateError";
    this.kind = kind;
    this.tokens = tokens;
  }
}

export function isTokenSpendGateError(err: unknown): err is TokenSpendGateError {
  return err instanceof TokenSpendGateError;
}
