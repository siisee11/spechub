import { readdir } from "node:fs/promises";

import { hasCompletionSignal } from "./completion.mts";
import { buildCodingPrompt } from "./coding-loop.mts";
import type { TurnResult } from "./codex-client.mts";
import { buildPrPrompt } from "./pr-agent.mts";
import { buildSetupPrompt } from "./setup-agent.mts";
import {
  extractInitOutputFromItems,
  extractPlanFilePath,
  inferInitOutput,
  resolveRuntimeRoot,
  slugifyPrompt,
  type InitOutput,
} from "./worktree.mts";

type Session = {
  startThread(options: {
    model: string;
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
  }): Promise<string>;
  runTurn(options: {
    threadId: string;
    prompt: string;
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
  }): Promise<TurnResult>;
  compactThread(threadId: string): Promise<void>;
  close(): Promise<void>;
};

type StartSession = () => Promise<Session>;

type RalphLoopOptions = {
  task: string;
  repoRoot: string;
  model: string;
  baseBranch: string;
  maxIterations: number;
  workBranch?: string;
  approvalPolicy: string;
  sandbox: string;
  onRuntimeRoot?: (runtimeRoot: string) => Promise<void> | void;
  onProgress?: (message: string) => void;
};

type RalphLoopOutcome = {
  workBranch: string;
  worktreePath: string;
  runtimeRoot: string;
  planFilePath: string;
  prAgentOutput: string;
  iterations: number;
};

const RECOVERY_PROMPT =
  "The previous iteration failed. Check git status, review any errors, and try again. If the build is broken, fix it first.";

export async function runRalphLoop(
  options: RalphLoopOptions,
  startSession: StartSession,
): Promise<RalphLoopOutcome> {
  const workBranch = options.workBranch ?? `ralph/${slugifyPrompt(options.task)}`;
  const expectedPlanPath = `docs/exec-plans/active/${slugifyPrompt(options.task)}.md`;

  options.onProgress?.("setup phase");
  const setupSession = await startSession();
  let setupResult: {
    initOutput: InitOutput;
    planFilePath: string;
  };
  try {
    setupResult = await runSetupPhase(setupSession, {
      task: options.task,
      model: options.model,
      baseBranch: options.baseBranch,
      workBranch,
      repoRoot: options.repoRoot,
      expectedPlanPath,
      approvalPolicy: options.approvalPolicy,
      sandbox: options.sandbox,
    });
  } finally {
    await setupSession.close();
  }

  const runtimeRoot = resolveRuntimeRoot(
    setupResult.initOutput.worktree_path,
    setupResult.initOutput.runtime_root,
  );
  await options.onRuntimeRoot?.(runtimeRoot);

  options.onProgress?.("coding phase");
  const codingSession = await startSession();
  let iterations = 0;
  try {
    iterations = await runCodingPhase(codingSession, {
      task: options.task,
      model: options.model,
      worktreePath: setupResult.initOutput.worktree_path,
      planFilePath: setupResult.planFilePath,
      approvalPolicy: options.approvalPolicy,
      sandbox: options.sandbox,
      maxIterations: options.maxIterations,
    });
  } finally {
    await codingSession.close();
  }

  options.onProgress?.("pr phase");
  const prSession = await startSession();
  let prAgentOutput = "";
  try {
    prAgentOutput = await runPrPhase(prSession, {
      model: options.model,
      worktreePath: setupResult.initOutput.worktree_path,
      planFilePath: setupResult.planFilePath,
      baseBranch: options.baseBranch,
      approvalPolicy: options.approvalPolicy,
      sandbox: options.sandbox,
    });
  } finally {
    await prSession.close();
  }

  return {
    workBranch,
    worktreePath: setupResult.initOutput.worktree_path,
    runtimeRoot,
    planFilePath: setupResult.planFilePath,
    prAgentOutput,
    iterations,
  };
}

export async function runSetupPhase(
  session: Session,
  options: {
    task: string;
    model: string;
    baseBranch: string;
    workBranch: string;
    repoRoot: string;
    expectedPlanPath: string;
    approvalPolicy: string;
    sandbox: string;
  },
): Promise<{ initOutput: InitOutput; planFilePath: string }> {
  const threadId = await session.startThread({
    model: options.model,
    cwd: options.repoRoot,
    approvalPolicy: options.approvalPolicy,
    sandbox: options.sandbox,
  });
  const result = await session.runTurn({
    threadId,
    prompt: buildSetupPrompt({
      task: options.task,
      baseBranch: options.baseBranch,
      workBranch: options.workBranch,
    }),
    cwd: options.repoRoot,
    approvalPolicy: options.approvalPolicy,
    sandbox: options.sandbox,
  });
  if (result.status === "failed") {
    throw new Error(`setup phase failed: ${result.error?.message ?? "unknown error"}`);
  }
  const extractedInitOutput = extractInitOutputFromItems(result.items);
  const planFilePath = await resolvePlanFilePath(
    result.agentText,
    extractedInitOutput?.worktree_path ?? options.repoRoot,
    options.expectedPlanPath,
  );
  const initOutput =
    extractedInitOutput ??
    inferInitOutput({
      repoRoot: options.repoRoot,
      planFilePath,
      workBranch: options.workBranch,
      baseBranch: options.baseBranch,
    });
  return {
    initOutput,
    planFilePath,
  };
}

export async function runCodingPhase(
  session: Session,
  options: {
    task: string;
    model: string;
    worktreePath: string;
    planFilePath: string;
    approvalPolicy: string;
    sandbox: string;
    maxIterations: number;
  },
): Promise<number> {
  const threadId = await session.startThread({
    model: options.model,
    cwd: options.worktreePath,
    approvalPolicy: options.approvalPolicy,
    sandbox: options.sandbox,
  });

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const result = await session.runTurn({
      threadId,
      prompt: buildCodingPrompt(options.task, options.planFilePath),
      cwd: options.worktreePath,
      approvalPolicy: options.approvalPolicy,
      sandbox: options.sandbox,
    });
    const recovery = await recoverOrCompact(
      session,
      threadId,
      result,
      iteration,
      options.maxIterations,
      options.worktreePath,
      options.approvalPolicy,
      options.sandbox,
    );
    if (recovery === "continue") {
      continue;
    }
    if (recovery === "complete") {
      return iteration;
    }
    if (
      hasCompletionSignal(result.agentText) ||
      (await planShowsCompletion(options.planFilePath))
    ) {
      return iteration;
    }
  }

  throw new Error("coding loop reached max iterations without completion");
}

export async function runPrPhase(
  session: Session,
  options: {
    model: string;
    worktreePath: string;
    planFilePath: string;
    baseBranch: string;
    approvalPolicy: string;
    sandbox: string;
  },
): Promise<string> {
  const threadId = await session.startThread({
    model: options.model,
    cwd: options.worktreePath,
    approvalPolicy: options.approvalPolicy,
    sandbox: options.sandbox,
  });
  const result = await session.runTurn({
    threadId,
    prompt: buildPrPrompt(options.planFilePath, options.baseBranch),
    cwd: options.worktreePath,
    approvalPolicy: options.approvalPolicy,
    sandbox: options.sandbox,
  });
  if (result.status === "failed") {
    throw new Error(`pr phase failed: ${result.error?.message ?? "unknown error"}`);
  }
  if (!hasCompletionSignal(result.agentText) && !containsPullRequestUrl(result.agentText)) {
    throw new Error("pr agent finished without completion signal or PR URL");
  }
  return result.agentText;
}

async function recoverOrCompact(
  session: Session,
  threadId: string,
  result: TurnResult,
  iteration: number,
  maxIterations: number,
  cwd: string,
  approvalPolicy: string,
  sandbox: string,
): Promise<"none" | "continue" | "complete"> {
  if (result.status !== "failed") {
    return "none";
  }
  if (result.error?.codexErrorInfo === "ContextWindowExceeded") {
    await session.compactThread(threadId);
    return "continue";
  }
  if (iteration >= maxIterations) {
    throw new Error(result.error?.message ?? "coding turn failed");
  }
  const recovery = await session.runTurn({
    threadId,
    prompt: RECOVERY_PROMPT,
    cwd,
    approvalPolicy,
    sandbox,
  });
  if (recovery.status === "failed") {
    throw new Error(recovery.error?.message ?? "recovery turn failed");
  }
  return hasCompletionSignal(recovery.agentText) ? "complete" : "continue";
}

async function planShowsCompletion(planFilePath: string): Promise<boolean> {
  const file = Bun.file(planFilePath);
  if (!(await file.exists())) {
    return false;
  }
  const text = await file.text();
  return !text.includes("- [ ]") && /- \[[xX]\]/.test(text);
}

function containsPullRequestUrl(text: string): boolean {
  return /https:\/\/github\.com\/\S+\/pull\/\d+/.test(text);
}

async function resolvePlanFilePath(
  agentText: string,
  worktreePath: string,
  expectedPlanPath: string,
): Promise<string> {
  const extracted = extractPlanFilePath(agentText, worktreePath);
  if (extracted && (await Bun.file(extracted).exists())) {
    return extracted;
  }
  const discovered = await discoverPlanFilePath(worktreePath);
  if (discovered) {
    return discovered;
  }
  return `${worktreePath}/${expectedPlanPath}`;
}

async function discoverPlanFilePath(worktreePath: string): Promise<string | undefined> {
  const planDir = `${worktreePath}/docs/exec-plans/active`;
  try {
    const entries = (await readdir(planDir)).filter((entry) => entry.endsWith(".md")).sort();
    if (entries.length === 0) {
      return undefined;
    }
    return `${planDir}/${entries[entries.length - 1]}`;
  } catch {
    return undefined;
  }
}
