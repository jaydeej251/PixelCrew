import { Inngest } from "inngest";
import { runOrchestrator } from "./orchestrator";

export const inngest = new Inngest({ id: "pixelcrew" });

export const runAgentTeam = inngest.createFunction(
  { id: "run-agent-team", retries: 2, triggers: [{ event: "run/started" }] },
  async ({ event }: { event: { data: { runId: string } } }) => {
    const { runId } = event.data;
    await runOrchestrator(runId);
    return { runId };
  },
);

export const functions = [runAgentTeam];
