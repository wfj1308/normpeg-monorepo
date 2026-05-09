export const SPACE_STATE_DRAFT = "DRAFT" as const;
export const SPACE_STATE_RUNNING = "RUNNING" as const;
export const SPACE_STATE_VALIDATED = "VALIDATED" as const;
export const SPACE_STATE_REJECTED = "REJECTED" as const;
export const SPACE_STATE_ARCHIVED = "ARCHIVED" as const;

export const SPACE_CONTAINER_LIFECYCLE_STATES = [
  SPACE_STATE_DRAFT,
  SPACE_STATE_RUNNING,
  SPACE_STATE_VALIDATED,
  SPACE_STATE_REJECTED,
  SPACE_STATE_ARCHIVED,
] as const;
export type SpaceContainerLifecycleState = (typeof SPACE_CONTAINER_LIFECYCLE_STATES)[number];

export const SPACE_SPEC_STATUS_DRAFT = "DRAFT" as const;
export const SPACE_SPEC_STATUS_RUNNING = "RUNNING" as const;
export const SPACE_SPEC_STATUS_PASS = "PASS" as const;
export const SPACE_SPEC_STATUS_FAIL = "FAIL" as const;

export const SPACE_SPEC_BINDING_STATES = [
  SPACE_SPEC_STATUS_DRAFT,
  SPACE_SPEC_STATUS_RUNNING,
  SPACE_SPEC_STATUS_PASS,
  SPACE_SPEC_STATUS_FAIL,
] as const;
export type SpaceSpecBindingState = (typeof SPACE_SPEC_BINDING_STATES)[number];

export const SPACE_NODE_RESULT_STATES = [SPACE_SPEC_STATUS_PASS, SPACE_SPEC_STATUS_FAIL] as const;
export type SpaceNodeResultStatus = (typeof SPACE_NODE_RESULT_STATES)[number];

export const SPACE_PENDING_ACTION_IDLE = "" as const;
export const SPACE_PENDING_ACTION_EXECUTE_NODE = "EXECUTE_NODE" as const;
export const SPACE_PENDING_ACTION_RETEST = "RETEST" as const;
export const SPACE_PENDING_ACTION_READY_TO_ARCHIVE = "READY_TO_ARCHIVE" as const;
export const SPACE_PENDING_ACTION_MANUAL_REVIEW = "MANUAL_REVIEW" as const;
export const SPACE_PENDING_ACTION_LOCKED = "LOCKED" as const;

export const SPACE_PENDING_ACTIONS = [
  SPACE_PENDING_ACTION_IDLE,
  SPACE_PENDING_ACTION_EXECUTE_NODE,
  SPACE_PENDING_ACTION_RETEST,
  SPACE_PENDING_ACTION_READY_TO_ARCHIVE,
  SPACE_PENDING_ACTION_MANUAL_REVIEW,
  SPACE_PENDING_ACTION_LOCKED,
] as const;
export type SpacePendingAction = (typeof SPACE_PENDING_ACTIONS)[number];

const STATUS_TEXT_MAP: Record<string, string> = {
  PASS: "通过",
  FINAL_PASS: "通过",
  FAIL: "不通过",
  FINAL_FAIL: "不通过",
  BLOCKED: "已阻断",
  DRAFT: "草稿",
  FILLED: "已填报",
  SIGNING: "签名中",
  LOCKED: "已锁定",
  UNLOCKED: "已解锁",
  READY: "就绪",
  IN_PROGRESS: "进行中",
  PENDING: "待处理",
  ARCHIVED: "已归档",
  VALIDATED: "已验证",
  REJECTED: "已驳回",
  RUNNING: "执行中",
  COMPUTED: "已计算",
  GATED: "已裁决",
};

export function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export function formatStatusText(value: string | null | undefined): string {
  const normalized = normalizeStatus(value);
  if (!normalized) {
    return "-";
  }
  return STATUS_TEXT_MAP[normalized] ?? (value ?? "-");
}

export function isNodeResultStatus(value: string | null | undefined): value is (typeof SPACE_NODE_RESULT_STATES)[number] {
  const normalized = normalizeStatus(value);
  return SPACE_NODE_RESULT_STATES.includes(normalized as (typeof SPACE_NODE_RESULT_STATES)[number]);
}

export function isSpecStatusPass(value: string | null | undefined): boolean {
  return normalizeStatus(value) === SPACE_SPEC_STATUS_PASS;
}
