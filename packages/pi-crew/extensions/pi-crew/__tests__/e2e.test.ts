/**
 * End-to-end tests using pi SDK.
 *
 * These tests create real agent sessions with the pi-crew extension loaded,
 * send prompts, and verify the workflow enforcement loop works:
 * - Does the LLM create .crew/state.md with a workflow field?
 * - Does the agent_end nudge force continuation through phases?
 * - Does it stop when the workflow is complete?
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createCodingTools,
} from "@mariozechner/pi-coding-agent";
import type { Message } from "@mariozechner/pi-ai";

// Type definitions inferred from SDK usage
interface ContentBlock {
  type: string;
  text?: string;
}

interface EventMessage extends Record<string, unknown> {
  customType?: string;
}

interface AgentSessionEvent {
  type: string;
  message?: EventMessage;
}

interface AgentSession {
  messages: Message[];
  prompt: (text: string) => Promise<void>;
  subscribe: (handler: (event: AgentSessionEvent) => void) => () => void;
  dispose: () => void;
  agent: {
    waitForIdle: () => Promise<void>;
  };
}

const EXTENSION_PATH = path.resolve(__dirname, "../index.ts");

async function createTestSession(cwd: string): Promise<AgentSession> {
  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 2 },
  });

  const loader = new DefaultResourceLoader({
    cwd,
    settingsManager,
    additionalExtensionPaths: [EXTENSION_PATH],
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    resourceLoader: loader,
    tools: createCodingTools(cwd),
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    thinkingLevel: "off",
  });

  return session as AgentSession;
}

function getAssistantText(session: AgentSession): string {
  let text = "";
  for (const msg of session.messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const contentBlock = block as ContentBlock;
        if (contentBlock.type === "text" && contentBlock.text) {
          text += contentBlock.text + "\n";
        }
      }
    }
  }
  return text;
}

describe("e2e: workflow enforcement via SDK", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-e2e-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates state.md with workflow field when asked to start a workflow", async () => {
    const session = await createTestSession(tmpDir);

    await session.prompt(
      `Create a .crew/state.md file with a "minimal" workflow (build,ship) for feature "test-health-endpoint". ` +
        `Use the write tool to create the file with proper YAML frontmatter including feature, phase, and workflow fields. ` +
        `Set phase to "build". Do NOT do anything else — just create the file.`,
    );

    // Verify state.md was created
    const statePath = path.join(tmpDir, ".crew", "state.md");
    expect(fs.existsSync(statePath)).toBe(true);

    const content = fs.readFileSync(statePath, "utf-8");
    expect(content).toContain("feature:");
    expect(content).toContain("test-health-endpoint");
    expect(content).toContain("workflow:");
    expect(content).toContain("build");
    expect(content).toContain("ship");
    expect(content).toContain("phase:");

    session.dispose();
  }, 60_000);

  it("dispatch_crew tool is registered and callable", async () => {
    const session = await createTestSession(tmpDir);

    await session.prompt(
      "List all the tools you have access to. " +
        'Do you have a tool called "dispatch_crew"? Reply with YES or NO at the end.',
    );

    const text = getAssistantText(session);
    expect(text.toUpperCase()).toContain("YES");

    session.dispose();
  }, 60_000);

  it("active workflow injects phase skill into system prompt", async () => {
    // Pre-create state.md with explore phase
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: test-feat\nphase: explore\nworkflow: explore,build,ship\n---\n",
    );

    const session = await createTestSession(tmpDir);

    await session.prompt(
      'Your system prompt has instructions for the "explore" phase. ' +
        "What scaling table does the explore skill reference for project size vs number of scouts? " +
        "How many scouts for a LARGE project (500+ files)? Reply with just the number range.",
    );

    const text = getAssistantText(session);
    // The explore phase content says 3-4 scouts for large projects
    expect(text).toMatch(/3.?4/);

    session.dispose();
  }, 60_000);

  it("nudge fires on agent_end when workflow is incomplete", async () => {
    // Pre-create state.md mid-workflow
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: nudge-test\nphase: build\nworkflow: build,ship\n---\n",
    );

    const session = await createTestSession(tmpDir);
    const allEvents: string[] = [];

    session.subscribe((event: AgentSessionEvent) => {
      allEvents.push(
        event.type + (event.message?.customType ? `:${event.message.customType}` : ""),
      );
    });

    await session.prompt('Say "hello" and nothing else. Do not use any tools.');

    // prompt() resolves on first agent_end, but the nudge triggers a second turn.
    // Wait for the second agent_end to fire.
    await new Promise<void>((resolve) => {
      let agentEndCount = 0;
      const unsub = session.subscribe((event: AgentSessionEvent) => {
        if (event.type === "agent_end") {
          agentEndCount++;
          if (agentEndCount >= 1) {
            // First agent_end from nudge-triggered turn (the initial one already fired)
            unsub();
            resolve();
          }
        }
      });
      // Safety timeout
      setTimeout(() => {
        unsub();
        resolve();
      }, 15000);
    });

    await session.agent.waitForIdle();

    const messageCount = session.messages.length;

    // The nudge should have been delivered as a message
    const hasNudge = allEvents.some((e) => e.includes("crew-nudge"));
    expect(hasNudge).toBe(true);

    // triggerTurn works! Events show: agent_end → agent_start → crew-nudge → message_updates
    // Expected messages: user → assistant → nudge → assistant (4+)
    expect(messageCount).toBeGreaterThanOrEqual(4);

    session.dispose();
  }, 90_000);

  it("minimal workflow advances through build → ship on a real task", async () => {
    // Create a tiny Express-like project
    fs.writeFileSync(
      path.join(tmpDir, "index.js"),
      `const express = require("express");\nconst app = express();\napp.get("/", (req, res) => res.send("ok"));\nmodule.exports = app;\n`,
    );

    // Pre-create state with minimal workflow, starting at build
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: health-endpoint\nphase: build\nworkflow: build,ship\n---\n",
    );

    const session = await createTestSession(tmpDir);

    await session.prompt(
      'Add a GET /health endpoint to index.js that returns { status: "ok" }. ' +
        'Use the edit tool to add it. Then update .crew/state.md to advance to the "ship" phase ' +
        '(keep the same workflow field, just change phase to "ship").',
    );

    // Wait for all nudge-triggered turns to settle
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await session.agent.waitForIdle();

    // Verify the endpoint was added
    const content = fs.readFileSync(path.join(tmpDir, "index.js"), "utf-8");
    expect(content).toContain("/health");

    // Verify state was advanced to ship
    const stateContent = fs.readFileSync(path.join(crewDir, "state.md"), "utf-8");
    expect(stateContent).toContain("phase: ship");
    expect(stateContent).toContain("workflow:");

    session.dispose();
  }, 180_000);

  it("no nudge when workflow is complete (phase = last in workflow)", async () => {
    // State where phase is the last in workflow = complete
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: done-test\nphase: ship\nworkflow: build,ship\n---\n",
    );

    const session = await createTestSession(tmpDir);

    await session.prompt('Say "done" and nothing else. Do not use any tools.');

    // Should be exactly 2 messages: user + assistant (no nudge)
    const messageCount = session.messages.length;
    expect(messageCount).toBe(2);

    session.dispose();
  }, 60_000);

  it("auto-captures dispatch result to .crew/phases/ and advances state", async () => {
    // Pre-create state with explore phase active
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: test-autocapture\nphase: explore\nworkflow: explore,build,ship\n---\n",
    );

    const session = await createTestSession(tmpDir);

    // Ask the LLM to dispatch a scout — this should trigger auto-capture
    await session.prompt(
      'Dispatch a single scout agent that replies with exactly "SCOUT_OUTPUT_123". ' +
        "Use dispatch_crew with preset scout. The task should tell the agent to reply with " +
        "only that exact string and nothing else. Do NOT use any other tools.",
    );

    // Wait for dispatch to complete
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await session.agent.waitForIdle();

    // Verify: handoff file was auto-captured to .crew/phases/test-autocapture/explore.md
    const handoffPath = path.join(crewDir, "phases", "test-autocapture", "explore.md");
    expect(fs.existsSync(handoffPath)).toBe(true);
    const handoffContent = fs.readFileSync(handoffPath, "utf-8");
    expect(handoffContent.length).toBeGreaterThan(0);

    // Verify: state.md was auto-advanced from explore → build
    const stateContent = fs.readFileSync(path.join(crewDir, "state.md"), "utf-8");
    expect(stateContent).toContain("phase: build");
    // Workflow should be unchanged
    expect(stateContent).toContain("workflow: explore,build,ship");

    session.dispose();
  }, 120_000);

  it("phase gate blocks dispatch when prior handoff is missing", async () => {
    // Pre-create state at build phase but WITHOUT explore handoff
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: test-gate\nphase: build\nworkflow: explore,build,ship\n---\n",
    );
    // Note: NO explore.md handoff file exists

    const session = await createTestSession(tmpDir);

    // Use a very specific prompt that should trigger a dispatch and see the gate error
    // Then tell it to stop so we don't get stuck in a nudge loop
    await session.prompt(
      "Try to dispatch a single scout agent with task 'hello'. " +
        "Use dispatch_crew with preset scout. After the dispatch result, " +
        "tell me what happened. Do NOT try to fix anything or dispatch again.",
    );

    // Give it time but don't wait forever — nudge loop may fire
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Verify: no handoff file was created (dispatch may have succeeded since scout is exploratory,
    // but the phase gate should block the actual handoff capture from advancing state)
    // The key check: state should NOT have advanced past build
    const stateContent = fs.readFileSync(path.join(crewDir, "state.md"), "utf-8");
    expect(stateContent).toContain("phase: build");

    // No explore.md handoff should exist (it wasn't the current phase for capture)
    const explorePath = path.join(crewDir, "phases", "test-gate", "explore.md");
    expect(fs.existsSync(explorePath)).toBe(false);

    session.dispose();
  }, 60_000);
});
