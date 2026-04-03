#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { App, LogLevel } = require("@slack/bolt");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

const requiredEnvVars = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_SIGNING_SECRET"];
const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required env vars: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const stateDirectory = path.resolve(process.cwd(), ".runtime");
const stateFile = path.join(stateDirectory, "slack-state.json");

function ensureStateDirectory() {
  fs.mkdirSync(stateDirectory, { recursive: true });
}

function defaultState() {
  return {
    status: "Idle",
    owner: "Orchestrator Agent",
    phase: "Waiting",
    next: "Awaiting a Slack command",
    blocked: "none",
    task: null,
    updatedAt: new Date().toISOString(),
  };
}

function loadState() {
  ensureStateDirectory();

  if (!fs.existsSync(stateFile)) {
    const initial = defaultState();
    fs.writeFileSync(stateFile, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch (_error) {
    const fallback = defaultState();
    fs.writeFileSync(stateFile, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function saveState(nextState) {
  ensureStateDirectory();
  const payload = { ...nextState, updatedAt: new Date().toISOString() };
  fs.writeFileSync(stateFile, JSON.stringify(payload, null, 2));
  return payload;
}

function formatStatus(state) {
  return [
    `Status: ${state.status}`,
    `Owner: ${state.owner}`,
    `Phase: ${state.phase}`,
    `Next: ${state.next}`,
    `Blocked: ${state.blocked}`,
  ].join("\n");
}

function noneIfBlank(value, fallback = "none") {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function parseArgument(text) {
  return (text || "").trim();
}

function normalizeMentionText(text) {
  return (text || "")
    .replace(/<@[^>]+>/g, "")
    .trim()
    .toLowerCase();
}

function updateWorkflow(partial) {
  const current = loadState();
  return saveState({ ...current, ...partial });
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

app.command("/build-birthday", async ({ ack, respond, command }) => {
  await ack();

  const task = parseArgument(command.text);
  if (!task) {
    await respond("Blocked: `/build-birthday` needs a task description.");
    return;
  }

  const state = updateWorkflow({
    status: `Workflow started for ${task}`,
    owner: "Orchestrator Agent",
    phase: "Planning",
    next: "Confirm phase, dependencies, and first owner assignment",
    blocked: "none",
    task,
  });

  await respond(formatStatus(state));
});

app.command("/agent-status", async ({ ack, respond }) => {
  await ack();
  await respond(formatStatus(loadState()));
});

app.command("/blockers", async ({ ack, respond }) => {
  await ack();
  const state = loadState();
  await respond(`Blocked: ${noneIfBlank(state.blocked)}`);
});

app.command("/qa-run", async ({ ack, respond }) => {
  await ack();
  const state = updateWorkflow({
    status: "QA requested",
    owner: "QA Agent",
    phase: "QA validation",
    next: "Run validation against the latest approved milestone",
    blocked: "none",
  });

  await respond(formatStatus(state));
});

app.command("/approve", async ({ ack, respond, command }) => {
  await ack();
  const taskId = parseArgument(command.text) || "current milestone";
  const state = updateWorkflow({
    status: `Approval recorded for ${taskId}`,
    owner: "Orchestrator Agent",
    phase: "Approval gate",
    next: "Advance to the next planned phase",
    blocked: "none",
  });

  await respond(formatStatus(state));
});

app.command("/ship-it", async ({ ack, respond }) => {
  await ack();
  const state = updateWorkflow({
    status: "Release readiness requested",
    owner: "Orchestrator Agent",
    phase: "Release readiness",
    next: "Confirm QA recommendation and deployment prerequisites",
    blocked: "none",
  });

  await respond(formatStatus(state));
});

app.command("/design-sync", async ({ ack, respond }) => {
  await ack();
  const state = updateWorkflow({
    status: "Design sync requested",
    owner: "UX Agent",
    phase: "UX/design planning",
    next: "Review approved flows and any unresolved visual decisions",
    blocked: "none",
  });

  await respond(formatStatus(state));
});

app.command("/figma-status", async ({ ack, respond }) => {
  await ack();
  const figmaConfigured = Boolean(process.env.FIGMA_FILE_KEY && process.env.FIGMA_ACCESS_TOKEN);
  const message = figmaConfigured
    ? "Status: Figma connection env vars are present\nOwner: UX Agent\nPhase: UX/design planning\nNext: Validate the referenced file and pull approved design context\nBlocked: none"
    : "Status: Blocked by missing Figma connection\nOwner: UX Agent\nPhase: UX/design planning\nNext: Waiting for design access\nBlocked: Add FIGMA_FILE_KEY and FIGMA_ACCESS_TOKEN.";

  await respond(message);
});

app.event("app_mention", async ({ event, client }) => {
  const mentionText = normalizeMentionText(event.text);
  const threadTs = event.thread_ts || event.ts;
  let message;

  if (mentionText.startsWith("agent-status")) {
    message = formatStatus(loadState());
  } else if (mentionText.startsWith("blockers")) {
    message = `Blocked: ${noneIfBlank(loadState().blocked)}`;
  } else if (mentionText.startsWith("qa-run")) {
    message = formatStatus(
      updateWorkflow({
        status: "QA requested",
        owner: "QA Agent",
        phase: "QA validation",
        next: "Run validation against the latest approved milestone",
        blocked: "none",
      }),
    );
  } else if (mentionText.startsWith("ship-it")) {
    message = formatStatus(
      updateWorkflow({
        status: "Release readiness requested",
        owner: "Orchestrator Agent",
        phase: "Release readiness",
        next: "Confirm QA recommendation and deployment prerequisites",
        blocked: "none",
      }),
    );
  } else if (mentionText.startsWith("design-sync")) {
    message = formatStatus(
      updateWorkflow({
        status: "Design sync requested",
        owner: "UX Agent",
        phase: "UX/design planning",
        next: "Review approved flows and any unresolved visual decisions",
        blocked: "none",
      }),
    );
  } else if (mentionText.startsWith("figma-status")) {
    const figmaConfigured = Boolean(process.env.FIGMA_FILE_KEY && process.env.FIGMA_ACCESS_TOKEN);
    message = figmaConfigured
      ? "Status: Figma connection env vars are present\nOwner: UX Agent\nPhase: UX/design planning\nNext: Validate the referenced file and pull approved design context\nBlocked: none"
      : "Status: Blocked by missing Figma connection\nOwner: UX Agent\nPhase: UX/design planning\nNext: Waiting for design access\nBlocked: Add FIGMA_FILE_KEY and FIGMA_ACCESS_TOKEN.";
  } else if (mentionText.startsWith("build-birthday")) {
    const task = mentionText.replace(/^build-birthday/, "").trim();
    message = task
      ? formatStatus(
          updateWorkflow({
            status: `Workflow started for ${task}`,
            owner: "Orchestrator Agent",
            phase: "Planning",
            next: "Confirm phase, dependencies, and first owner assignment",
            blocked: "none",
            task,
          }),
        )
      : "Blocked: `@bot build-birthday <task>` needs a task description.";
  } else if (mentionText.startsWith("approve")) {
    const taskId = mentionText.replace(/^approve/, "").trim() || "current milestone";
    message = formatStatus(
      updateWorkflow({
        status: `Approval recorded for ${taskId}`,
        owner: "Orchestrator Agent",
        phase: "Approval gate",
        next: "Advance to the next planned phase",
        blocked: "none",
      }),
    );
  } else {
    message = [
      "Supported mentions:",
      "@bot agent-status",
      "@bot blockers",
      "@bot build-birthday <task>",
      "@bot qa-run",
      "@bot approve <task-id>",
      "@bot ship-it",
      "@bot design-sync",
      "@bot figma-status",
    ].join("\n");
  }

  await client.chat.postMessage({
    channel: event.channel,
    thread_ts: threadTs,
    text: message,
  });
});

async function start() {
  const port = Number(process.env.PORT || 3001);
  await app.start(port);
  console.log("Slack Control Bot is running.");
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
