export const COMPLETION_SIGNAL = "<promise>COMPLETE</promise>";

export function hasCompletionSignal(text: string): boolean {
  return text.includes(COMPLETION_SIGNAL);
}

export function completionStatus(text: string): "complete" | "incomplete" {
  return hasCompletionSignal(text) ? "complete" : "incomplete";
}
