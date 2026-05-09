export type RunningLifecycleState = "draft" | "active" | "validated" | "archived";
export type RunningSpecStatus = "blocked" | "ready" | "running" | "pass" | "fail";

export interface RunningContainerApplicableSpec {
  spuId: string;
  status: RunningSpecStatus;
  latestNode?: string | null;
}

export interface RunningContainer {
  containerId: string;
  lifecycleState: RunningLifecycleState;
  normExecution: {
    applicableSpecs: RunningContainerApplicableSpec[];
  };
}

export interface RunningContainerUsingSpu {
  container: RunningContainer;
  spec: RunningContainerApplicableSpec;
}

export function findContainersUsingSpu(containers: RunningContainer[], oldSpuId: string): RunningContainerUsingSpu[] {
  const matched: RunningContainerUsingSpu[] = [];
  for (const container of containers) {
    const spec = container.normExecution.applicableSpecs.find((item) => item.spuId === oldSpuId);
    if (!spec) {
      continue;
    }
    matched.push({
      container,
      spec,
    });
  }
  return matched;
}
