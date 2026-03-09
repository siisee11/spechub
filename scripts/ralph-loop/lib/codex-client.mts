type JsonRpcParams = Record<string, unknown>;

export type JsonRpcRequest = {
  id: number;
  method: string;
  params: JsonRpcParams;
};

type JsonRpcResponse = {
  id: number;
  result?: Record<string, unknown>;
  error?: {
    code?: number;
    message?: string;
  };
};

type JsonRpcNotification = {
  method: string;
  params?: Record<string, unknown>;
};

type ThreadStartOptions = {
  model: string;
  cwd: string;
  approvalPolicy: string;
  sandbox: string;
};

type TurnStartOptions = {
  threadId: string;
  prompt: string;
  cwd?: string;
  approvalPolicy?: string;
  sandbox?: string;
};

export type TurnFailure = {
  message: string;
  codexErrorInfo?: string;
  additionalDetails?: unknown;
};

export type TurnResult = {
  turnId: string;
  status: string;
  agentText: string;
  items: Array<Record<string, unknown>>;
  error?: TurnFailure;
};

type PendingRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

type TurnCollector = {
  turnId?: string;
  agentMessages: string[];
  items: Array<Record<string, unknown>>;
  resolve: (value: TurnResult) => void;
  reject: (error: Error) => void;
};

type Waiter = {
  predicate: (notification: JsonRpcNotification) => boolean;
  resolve: (notification: JsonRpcNotification) => void;
  reject: (error: Error) => void;
};

export function createInitializeRequest(id = 0): JsonRpcRequest {
  return {
    id,
    method: "initialize",
    params: {
      clientInfo: {
        name: "spechub_ralph_loop",
        title: "SpecHub Ralph Loop",
        version: "0.1.0",
      },
      capabilities: {
        optOutNotificationMethods: ["item/agentMessage/delta"],
      },
    },
  };
}

export function createThreadStartRequest(
  optionsOrModel: ThreadStartOptions | string,
  cwd?: string,
): JsonRpcRequest {
  const options =
    typeof optionsOrModel === "string"
      ? {
          model: optionsOrModel,
          cwd: cwd ?? process.cwd(),
          approvalPolicy: "never",
          sandbox: "workspace-write",
        }
      : optionsOrModel;
  return {
    id: 1,
    method: "thread/start",
    params: {
      model: options.model,
      cwd: options.cwd,
      approvalPolicy: options.approvalPolicy,
      sandbox: options.sandbox,
      serviceName: "spechub_ralph_loop",
    },
  };
}

export function createTurnStartRequest(
  threadIdOrOptions: TurnStartOptions | string,
  prompt?: string,
  id = 2,
): JsonRpcRequest {
  const options =
    typeof threadIdOrOptions === "string"
      ? { threadId: threadIdOrOptions, prompt: prompt ?? "" }
      : threadIdOrOptions;
  return {
    id,
    method: "turn/start",
    params: {
      threadId: options.threadId,
      input: [{ type: "text", text: options.prompt }],
      ...(options.cwd
        ? {
            cwd: options.cwd,
            approvalPolicy: options.approvalPolicy ?? "never",
            sandboxPolicy: buildSandboxPolicy(options.sandbox ?? "workspace-write", options.cwd),
          }
        : {}),
    },
  };
}

export class CodexAppServerClient {
  #process: Bun.Subprocess<"pipe", "pipe", "inherit">;
  #pending = new Map<number, PendingRequest>();
  #waiters = new Set<Waiter>();
  #currentTurn?: TurnCollector;
  #nextId = 10;
  #stdoutLoop: Promise<void>;
  #closed = false;
  #logLine?: (line: string) => void | Promise<void>;

  private constructor(
    proc: Bun.Subprocess<"pipe", "pipe", "inherit">,
    logLine?: (line: string) => void | Promise<void>,
  ) {
    this.#process = proc;
    this.#logLine = logLine;
    this.#stdoutLoop = this.#consumeStdout();
    void this.#process.exited.then(() => {
      this.#failOutstanding(new Error("codex app-server exited unexpectedly"));
    });
  }

  static async connect(options?: {
    command?: string[];
    logLine?: (line: string) => void | Promise<void>;
  }): Promise<CodexAppServerClient> {
    const cmd = options?.command ?? ["codex", "app-server"];
    const proc = Bun.spawn(cmd, {
      cwd: process.cwd(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });
    const client = new CodexAppServerClient(proc, options?.logLine);
    await client.initialize();
    return client;
  }

  async initialize(): Promise<void> {
    await this.#request(createInitializeRequest(this.#nextRequestId()));
    this.#notify("initialized", {});
  }

  async startThread(options: ThreadStartOptions): Promise<string> {
    const request = createThreadStartRequest(options);
    request.id = this.#nextRequestId();
    const response = await this.#request(request);
    const thread = response.thread as { id?: string } | undefined;
    if (!thread?.id) {
      throw new Error("thread/start did not return a thread id");
    }
    return thread.id;
  }

  async runTurn(optionsOrThreadId: TurnStartOptions | string, prompt?: string): Promise<TurnResult> {
    if (this.#currentTurn) {
      throw new Error("a turn is already in progress");
    }
    const result = new Promise<TurnResult>((resolve, reject) => {
      this.#currentTurn = {
        agentMessages: [],
        items: [],
        resolve,
        reject,
      };
    });
    const request = createTurnStartRequest(
      typeof optionsOrThreadId === "string"
        ? { threadId: optionsOrThreadId, prompt: prompt ?? "" }
        : optionsOrThreadId,
      undefined,
      this.#nextRequestId(),
    );
    const response = await this.#request(request);
    const turn = response.turn as { id?: string } | undefined;
    if (!turn?.id) {
      this.#currentTurn?.reject(new Error("turn/start did not return a turn id"));
      this.#currentTurn = undefined;
      throw new Error("turn/start did not return a turn id");
    }
    if (this.#currentTurn) {
      this.#currentTurn.turnId = turn.id;
    }
    return result;
  }

  async compactThread(threadId: string): Promise<void> {
    const waitForCompaction = this.waitForNotification(
      (notification) =>
        notification.method === "item/completed" &&
        (notification.params?.item as { type?: string } | undefined)?.type === "contextCompaction",
    );
    await this.#request({
      id: this.#nextRequestId(),
      method: "thread/compact/start",
      params: { threadId },
    });
    await waitForCompaction;
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#process.kill();
    await this.#stdoutLoop.catch(() => undefined);
  }

  waitForNotification(predicate: (notification: JsonRpcNotification) => boolean): Promise<JsonRpcNotification> {
    return new Promise((resolve, reject) => {
      this.#waiters.add({ predicate, resolve, reject });
    });
  }

  async #consumeStdout(): Promise<void> {
    const stdout = this.#process.stdout;
    if (!stdout) {
      return;
    }
    const reader = stdout.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += value;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          await this.#handleLine(line);
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }
    const trailing = buffer.trim();
    if (trailing) {
      await this.#handleLine(trailing);
    }
  }

  async #handleLine(line: string): Promise<void> {
    await this.#logLine?.(line);
    const message = JSON.parse(line) as JsonRpcResponse & JsonRpcNotification;
    if (typeof message.id === "number") {
      const pending = this.#pending.get(message.id);
      if (!pending) {
        return;
      }
      this.#pending.delete(message.id);
      if (message.error?.message) {
        pending.reject(new Error(message.error.message));
        return;
      }
      pending.resolve(message.result ?? {});
      return;
    }
    this.#handleNotification(message);
  }

  #handleNotification(notification: JsonRpcNotification): void {
    for (const waiter of [...this.#waiters]) {
      if (!waiter.predicate(notification)) {
        continue;
      }
      this.#waiters.delete(waiter);
      waiter.resolve(notification);
    }

    const collector = this.#currentTurn;
    if (!collector) {
      return;
    }

    if (notification.method === "item/completed") {
      const item = notification.params?.item as Record<string, unknown> | undefined;
      if (!item) {
        return;
      }
      collector.items.push(item);
      if (item.type === "agentMessage" && typeof item.text === "string") {
        collector.agentMessages.push(item.text);
      }
      return;
    }

    if (notification.method !== "turn/completed") {
      return;
    }

    const turn = notification.params?.turn as
      | {
          id?: string;
          status?: string;
          error?: {
            message?: string;
            codexErrorInfo?: string;
            additionalDetails?: unknown;
          };
        }
      | undefined;
    if (!turn?.id) {
      collector.reject(new Error("turn/completed was missing a turn id"));
      this.#currentTurn = undefined;
      return;
    }
    if (collector.turnId && collector.turnId !== turn.id) {
      return;
    }
    this.#currentTurn = undefined;
    collector.resolve({
      turnId: turn.id,
      status: turn.status ?? "unknown",
      agentText: collector.agentMessages.join("\n"),
      items: collector.items,
      error: turn.error?.message
        ? {
            message: turn.error.message,
            codexErrorInfo: turn.error.codexErrorInfo,
            additionalDetails: turn.error.additionalDetails,
          }
        : undefined,
    });
  }

  #request(request: JsonRpcRequest): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      this.#pending.set(request.id, { resolve, reject });
      this.#send(request);
    });
  }

  #notify(method: string, params: JsonRpcParams): void {
    this.#send({ method, params });
  }

  #send(message: { method: string; params: JsonRpcParams; id?: number }): void {
    if (!this.#process.stdin) {
      throw new Error("codex app-server stdin is not available");
    }
    this.#process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #nextRequestId(): number {
    const id = this.#nextId;
    this.#nextId += 1;
    return id;
  }

  #failOutstanding(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
    for (const waiter of this.#waiters) {
      waiter.reject(error);
    }
    this.#waiters.clear();
    if (this.#currentTurn) {
      this.#currentTurn.reject(error);
      this.#currentTurn = undefined;
    }
  }
}

function buildSandboxPolicy(sandbox: string, cwd: string): Record<string, unknown> {
  if (sandbox === "danger-full-access") {
    return {
      type: "dangerFullAccess",
      networkAccess: true,
    };
  }
  if (sandbox === "read-only") {
    return {
      type: "readOnly",
      access: { type: "fullAccess" },
      networkAccess: true,
    };
  }
  return {
    type: "workspaceWrite",
    writableRoots: [cwd],
    networkAccess: true,
  };
}
