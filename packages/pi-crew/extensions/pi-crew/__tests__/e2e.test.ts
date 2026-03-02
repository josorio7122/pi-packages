/**
 * End-to-end tests using pi SDK.
 *
 * These tests create real agent sessions with the pi-crew extension loaded,
 * send prompts, and verify:
 * - Coordinator prompt is injected (3 modes, .crew/ workspace)
 * - tool_call hook blocks write/edit outside .crew/
 * - tool_call hook allows write/edit inside .crew/
 * - dispatch_crew tool is registered
 * - Nudge fires on agent_end when workflow is incomplete
 * - Auto-capture writes to .crew/phases/ and advances state
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

describe("e2e: coordinator enforcement via SDK", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-e2e-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

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

  it("coordinator prompt includes 3 modes and .crew/ workspace", async () => {
    const session = await createTestSession(tmpDir);

    await session.prompt(
      "Your system prompt mentions you are a Coordinator with 3 modes. " +
        'What are the 3 modes? List them as "Mode 1: ..., Mode 2: ..., Mode 3: ..."',
    );

    const text = getAssistantText(session);
    expect(text.toLowerCase()).toContain("answer");
    expect(text.toLowerCase()).toContain("understand");
    expect(text.toLowerCase()).toContain("implement");

    session.dispose();
  }, 60_000);

  it("allows write to .crew/ paths", async () => {
    const session = await createTestSession(tmpDir);

    await session.prompt(
      'Use the write tool to create a file at .crew/findings/test.md with content "# Test Finding". ' +
        "Do nothing else.",
    );

    await session.agent.waitForIdle();

    // Verify the file was created (write to .crew/ should be allowed)
    const findingPath = path.join(tmpDir, ".crew", "findings", "test.md");
    expect(fs.existsSync(findingPath)).toBe(true);
    const content = fs.readFileSync(findingPath, "utf-8");
    expect(content).toContain("Test Finding");

    session.dispose();
  }, 60_000);

  it("blocks write to source files outside .crew/", async () => {
    const session = await createTestSession(tmpDir);

    await session.prompt(
      "Try to use the write tool to create a file at src/blocked.ts with content " +
        '"console.log(1)". Then tell me what happened — did it succeed or was it blocked?',
    );

    await session.agent.waitForIdle();

    // Verify file was NOT created
    const blockedPath = path.join(tmpDir, "src", "blocked.ts");
    expect(fs.existsSync(blockedPath)).toBe(false);

    // Verify assistant mentioned it was blocked
    const text = getAssistantText(session);
    expect(text.toLowerCase()).toMatch(/block|cannot|denied|coordinator/);

    session.dispose();
  }, 60_000);

  it("blocks edit to source files outside .crew/", async () => {
    // Create a file to edit
    fs.writeFileSync(path.join(tmpDir, "app.js"), 'console.log("original");\n');

    const session = await createTestSession(tmpDir);

    await session.prompt(
      'Try to use the edit tool on app.js to replace "original" with "modified". ' +
        "Then tell me what happened — did it succeed or was it blocked?",
    );

    await session.agent.waitForIdle();

    // Verify file was NOT modified
    const content = fs.readFileSync(path.join(tmpDir, "app.js"), "utf-8");
    expect(content).toContain("original");
    expect(content).not.toContain("modified");

    // Verify assistant mentioned it was blocked
    const text = getAssistantText(session);
    expect(text.toLowerCase()).toMatch(/block|cannot|denied|coordinator/);

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

    // Wait for nudge-triggered turn to settle
    await new Promise<void>((resolve) => {
      let agentEndCount = 0;
      const unsub = session.subscribe((event: AgentSessionEvent) => {
        if (event.type === "agent_end") {
          agentEndCount++;
          if (agentEndCount >= 1) {
            unsub();
            resolve();
          }
        }
      });
      setTimeout(() => { unsub(); resolve(); }, 15000);
    });

    await session.agent.waitForIdle();

    // The nudge should have been delivered
    const hasNudge = allEvents.some((e) => e.includes("crew-nudge"));
    expect(hasNudge).toBe(true);

    // triggerTurn causes extra messages: user → assistant → nudge → assistant (4+)
    expect(session.messages.length).toBeGreaterThanOrEqual(4);

    session.dispose();
  }, 90_000);

  it("no nudge when workflow is complete (phase = last in workflow)", async () => {
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: done-test\nphase: ship\nworkflow: build,ship\n---\n",
    );

    const session = await createTestSession(tmpDir);

    await session.prompt('Say "done" and nothing else. Do not use any tools.');

    // Should be exactly 2 messages: user + assistant (no nudge)
    expect(session.messages.length).toBe(2);

    session.dispose();
  }, 60_000);

  it("phase gate blocks dispatch when prior handoff is missing", async () => {
    // State at build phase but NO explore handoff exists
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: test-gate\nphase: build\nworkflow: explore,build,ship\n---\n",
    );

    const session = await createTestSession(tmpDir);

    await session.prompt(
      "Dispatch a single executor agent with task 'implement health endpoint'. " +
        "Use dispatch_crew with preset executor. After the result, tell me exactly what error message you got.",
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));
    await session.agent.waitForIdle();

    // The assistant should report the phase gate error
    const text = getAssistantText(session);
    expect(text.toLowerCase()).toMatch(/phase|gate|handoff|missing|explore/);

    // No handoff file should have been created for build
    const buildHandoff = path.join(crewDir, "phases", "test-gate", "build.md");
    expect(fs.existsSync(buildHandoff)).toBe(false);

    session.dispose();
  }, 90_000);

  it("auto-captures dispatch result and advances state", async () => {
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: test-autocapture\nphase: explore\nworkflow: explore,build,ship\n---\n",
    );

    const session = await createTestSession(tmpDir);

    await session.prompt(
      'Dispatch a single scout agent that replies with exactly "SCOUT_OUTPUT_123". ' +
        "Use dispatch_crew with preset scout. The task should tell the agent to reply with " +
        "only that exact string and nothing else. Do NOT use any other tools.",
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));
    await session.agent.waitForIdle();

    // Handoff file auto-captured
    const handoffPath = path.join(crewDir, "phases", "test-autocapture", "explore.md");
    expect(fs.existsSync(handoffPath)).toBe(true);
    const handoffContent = fs.readFileSync(handoffPath, "utf-8");
    expect(handoffContent.length).toBeGreaterThan(0);

    // State auto-advanced from explore → build
    const stateContent = fs.readFileSync(path.join(crewDir, "state.md"), "utf-8");
    expect(stateContent).toContain("phase: build");
    expect(stateContent).toContain("workflow: explore,build,ship");

    session.dispose();
  }, 120_000);
});
