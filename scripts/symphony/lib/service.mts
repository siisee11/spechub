import type { SymphonyConfig } from "./config.mts";
import { buildSymphonyConfig } from "./config.mts";
import { createLinearTracker } from "./linear.mts";
import { SymphonyOrchestrator } from "./orchestrator.mts";
import { createRalphWorker } from "./ralph-worker.mts";
import { loadWorkflowDefinition, watchWorkflow, type WorkflowDefinition } from "./workflow.mts";
import { WorkspaceManager } from "./workspace.mts";

export class SymphonyService {
  #repoRoot: string;
  #workflowPath?: string;
  #model: string;
  #baseBranch: string;
  #currentWorkflow!: WorkflowDefinition;
  #currentConfig!: SymphonyConfig;
  #watcher?: { close: () => void };
  #stopped = false;
  #tickHandle?: ReturnType<typeof setTimeout>;
  #logger: (line: string) => void;
  #loadWorkflow: typeof loadWorkflowDefinition;
  #watchWorkflowFactory: typeof watchWorkflow;
  #createOrchestrator: (config: SymphonyConfig) => SymphonyOrchestrator;
  orchestrator?: SymphonyOrchestrator;

  constructor(options: {
    repoRoot: string;
    workflowPath?: string;
    model: string;
    baseBranch: string;
    logger?: (line: string) => void;
    loadWorkflow?: typeof loadWorkflowDefinition;
    watchWorkflowFactory?: typeof watchWorkflow;
    createOrchestrator?: (config: SymphonyConfig) => SymphonyOrchestrator;
  }) {
    this.#repoRoot = options.repoRoot;
    this.#workflowPath = options.workflowPath;
    this.#model = options.model;
    this.#baseBranch = options.baseBranch;
    this.#logger = options.logger ?? ((line) => console.error(line));
    this.#loadWorkflow = options.loadWorkflow ?? loadWorkflowDefinition;
    this.#watchWorkflowFactory = options.watchWorkflowFactory ?? watchWorkflow;
    this.#createOrchestrator =
      options.createOrchestrator ??
      ((config) => {
        const getWorkspaceManager = (currentConfig: SymphonyConfig) =>
          new WorkspaceManager({
            repoRoot: this.#repoRoot,
            workspaceRoot: currentConfig.workspace.root,
            hooks: currentConfig.hooks,
          });
        const tracker = {
          fetchCandidateIssues: async () =>
            createLinearTracker({
              endpoint: this.#currentConfig.tracker.endpoint,
              apiKey: this.#currentConfig.tracker.apiKey,
              projectSlug: this.#currentConfig.tracker.projectSlug,
              activeStates: this.#currentConfig.tracker.activeStates,
              terminalStates: this.#currentConfig.tracker.terminalStates,
            }).fetchCandidateIssues(),
          fetchIssuesByStates: async (states: string[]) =>
            createLinearTracker({
              endpoint: this.#currentConfig.tracker.endpoint,
              apiKey: this.#currentConfig.tracker.apiKey,
              projectSlug: this.#currentConfig.tracker.projectSlug,
              activeStates: this.#currentConfig.tracker.activeStates,
              terminalStates: this.#currentConfig.tracker.terminalStates,
            }).fetchIssuesByStates(states),
          fetchIssueStatesByIds: async (ids: string[]) =>
            createLinearTracker({
              endpoint: this.#currentConfig.tracker.endpoint,
              apiKey: this.#currentConfig.tracker.apiKey,
              projectSlug: this.#currentConfig.tracker.projectSlug,
              activeStates: this.#currentConfig.tracker.activeStates,
              terminalStates: this.#currentConfig.tracker.terminalStates,
            }).fetchIssueStatesByIds(ids),
        };
        return new SymphonyOrchestrator({
          getConfig: () => this.#currentConfig,
          tracker,
          workerFactory: createRalphWorker({
            getWorkspaceManager,
            model: this.#model,
            baseBranch: this.#baseBranch,
          }),
          workspaceRemover: (issueIdentifier) =>
            getWorkspaceManager(this.#currentConfig).removeWorkspace(issueIdentifier),
          log: this.#logger,
        });
      });
  }

  async start(): Promise<void> {
    await this.#reloadWorkflow(true);
    this.#info(
      `action=service_start outcome=begin workflow_path=${quote(this.#currentWorkflow.path)} project_slug=${quote(this.#currentConfig.tracker.projectSlug)} workspace_root=${quote(this.#currentConfig.workspace.root)}`,
    );
    this.orchestrator = this.#createOrchestrator(this.#currentConfig);
    await this.orchestrator.startup();

    this.#watcher = this.#watchWorkflowFactory(this.#currentWorkflow.path, () => {
      void this.#reloadWorkflow(false);
    });
    this.#info("action=workflow_watch outcome=started");
    this.#scheduleTick(0);
    this.#info("action=service_start outcome=completed");
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    this.#info("action=service_stop outcome=begin");
    if (this.#tickHandle) {
      clearTimeout(this.#tickHandle);
      this.#tickHandle = undefined;
    }
    this.#watcher?.close();
    await this.orchestrator?.stop();
    this.#info("action=service_stop outcome=completed");
  }

  async refresh(): Promise<void> {
    await this.orchestrator?.tick();
  }

  async #reloadWorkflow(fatal: boolean): Promise<void> {
    try {
      this.#currentWorkflow = await this.#loadWorkflow({
        workflowPath: this.#workflowPath,
        cwd: this.#repoRoot,
      });
      this.#currentConfig = buildSymphonyConfig(this.#currentWorkflow);
      this.#info(
        `action=reload_workflow outcome=completed workflow_path=${quote(this.#currentWorkflow.path)} poll_interval_ms=${this.#currentConfig.polling.intervalMs} max_concurrent_agents=${this.#currentConfig.agent.maxConcurrentAgents}`,
      );
    } catch (error) {
      this.#error(`action=reload_workflow outcome=failed error=${quote(formatError(error))}`);
      if (fatal || !this.#currentConfig) {
        throw error;
      }
    }
  }

  #scheduleTick(delayMs: number): void {
    this.#info(`action=schedule_tick outcome=queued delay_ms=${delayMs}`);
    this.#tickHandle = setTimeout(async () => {
      if (this.#stopped || !this.orchestrator) {
        return;
      }
      await this.orchestrator.tick();
      this.#scheduleTick(this.orchestrator.state.pollIntervalMs);
    }, delayMs);
  }

  #info(fields: string): void {
    this.#logger(`level=info ${fields}`);
  }

  #error(fields: string): void {
    this.#logger(`level=error ${fields}`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function quote(value: string): string {
  return JSON.stringify(value);
}
