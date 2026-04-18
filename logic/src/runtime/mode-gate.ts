import type { Mode } from "@ineedabossagent/shared-contracts";

export const isRuntimeEvaluationEnabled = (mode: Mode): boolean =>
  mode === "running";

export const runWhenModeIsRunning = <T>(
  mode: Mode,
  evaluate: () => T,
  fallback: () => T,
): T => {
  if (isRuntimeEvaluationEnabled(mode)) {
    return evaluate();
  }

  return fallback();
};
