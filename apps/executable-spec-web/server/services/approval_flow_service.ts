import { randomUUID } from "node:crypto";

export type ApprovalAssetType = "spu" | "template" | "specbundle";

export type CandidateApprovalStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "published"
  | "deprecated";

export type CandidateApprovalAction =
  | "create_draft"
  | "submit"
  | "start_review"
  | "approve"
  | "reject"
  | "publish"
  | "deprecate";

export interface CandidateApprovalEvent {
  eventId: string;
  action: CandidateApprovalAction;
  actorId: string;
  note?: string;
  fromStatus: CandidateApprovalStatus | null;
  toStatus: CandidateApprovalStatus;
  at: string;
}

export interface CandidateRuleApproval {
  candidateId: string;
  title: string;
  summary: string;
  content: Record<string, unknown>;
  assetType: ApprovalAssetType;
  assetRef?: string;
  status: CandidateApprovalStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  submittedAt?: string;
  reviewStartedAt?: string;
  decidedAt?: string;
  publishedAt?: string;
  deprecatedAt?: string;
  publishedRef?: string;
  events: CandidateApprovalEvent[];
}

export class ApprovalFlowError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CANDIDATE_NOT_FOUND"
      | "APPROVAL_INVALID_STATE"
      | "APPROVAL_INVALID_DECISION"
      | "APPROVAL_INVALID_ASSET_TYPE",
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeAssetType(value: unknown): ApprovalAssetType {
  if (value === "spu" || value === "template" || value === "specbundle") {
    return value;
  }
  throw new ApprovalFlowError("assetType must be one of spu/template/specbundle", "APPROVAL_INVALID_ASSET_TYPE", 400);
}

function appendEvent(
  candidate: CandidateRuleApproval,
  params: {
    action: CandidateApprovalAction;
    actorId: string;
    note?: string;
    fromStatus: CandidateApprovalStatus | null;
    toStatus: CandidateApprovalStatus;
  },
): void {
  candidate.events.push({
    eventId: `approval_event_${randomUUID()}`,
    action: params.action,
    actorId: params.actorId,
    note: params.note,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    at: nowIso(),
  });
}

export class ApprovalFlowService {
  private readonly candidates = new Map<string, CandidateRuleApproval>();

  createCandidate(payload: {
    title: string;
    summary?: string;
    content?: Record<string, unknown>;
    assetType?: ApprovalAssetType;
    assetRef?: string;
    actorId: string;
  }): CandidateRuleApproval {
    const title = String(payload.title ?? "").trim();
    if (!title) {
      throw new Error("title is required");
    }
    const candidateId = `candidate_${randomUUID()}`;
    const createdAt = nowIso();
    const candidate: CandidateRuleApproval = {
      candidateId,
      title,
      summary: String(payload.summary ?? "").trim(),
      content: payload.content && typeof payload.content === "object" ? clone(payload.content) : {},
      assetType: normalizeAssetType(payload.assetType ?? "spu"),
      assetRef: payload.assetRef?.trim() || undefined,
      status: "draft",
      createdAt,
      updatedAt: createdAt,
      createdBy: payload.actorId,
      events: [],
    };
    appendEvent(candidate, {
      action: "create_draft",
      actorId: payload.actorId,
      fromStatus: null,
      toStatus: "draft",
    });
    this.candidates.set(candidateId, candidate);
    return clone(candidate);
  }

  listCandidates(options?: {
    assetType?: ApprovalAssetType;
    status?: CandidateApprovalStatus;
  }): CandidateRuleApproval[] {
    const normalizedAssetType = options?.assetType ? normalizeAssetType(options.assetType) : undefined;
    return Array.from(this.candidates.values())
      .filter((item) => (normalizedAssetType ? item.assetType === normalizedAssetType : true))
      .filter((item) => (options?.status ? item.status === options.status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => clone(item));
  }

  getCandidate(candidateId: string): CandidateRuleApproval | null {
    const candidate = this.candidates.get(candidateId.trim()) ?? null;
    return candidate ? clone(candidate) : null;
  }

  submitCandidate(candidateId: string, payload: { actorId: string; note?: string }): CandidateRuleApproval {
    const candidate = this.mustCandidate(candidateId);
    if (candidate.status !== "draft" && candidate.status !== "rejected") {
      throw new ApprovalFlowError(
        `candidate status ${candidate.status} cannot be submitted`,
        "APPROVAL_INVALID_STATE",
        409,
      );
    }
    const fromStatus = candidate.status;
    const submittedAt = nowIso();
    candidate.status = "submitted";
    candidate.submittedAt = submittedAt;
    candidate.updatedAt = submittedAt;
    appendEvent(candidate, {
      action: "submit",
      actorId: payload.actorId,
      note: payload.note,
      fromStatus,
      toStatus: "submitted",
    });
    return clone(candidate);
  }

  moveToReview(candidateId: string, payload: { actorId: string; note?: string }): CandidateRuleApproval {
    const candidate = this.mustCandidate(candidateId);
    if (candidate.status !== "submitted") {
      throw new ApprovalFlowError(
        `candidate status ${candidate.status} cannot enter review`,
        "APPROVAL_INVALID_STATE",
        409,
      );
    }
    const fromStatus = candidate.status;
    const reviewStartedAt = nowIso();
    candidate.status = "in_review";
    candidate.reviewStartedAt = reviewStartedAt;
    candidate.updatedAt = reviewStartedAt;
    appendEvent(candidate, {
      action: "start_review",
      actorId: payload.actorId,
      note: payload.note,
      fromStatus,
      toStatus: "in_review",
    });
    return clone(candidate);
  }

  decideCandidate(
    candidateId: string,
    payload: {
      actorId: string;
      decision: "approve" | "reject";
      note?: string;
    },
  ): CandidateRuleApproval {
    const candidate = this.mustCandidate(candidateId);
    if (candidate.status !== "in_review") {
      throw new ApprovalFlowError(
        `candidate status ${candidate.status} cannot be decided`,
        "APPROVAL_INVALID_STATE",
        409,
      );
    }
    if (payload.decision !== "approve" && payload.decision !== "reject") {
      throw new ApprovalFlowError("decision must be approve or reject", "APPROVAL_INVALID_DECISION", 400);
    }

    const fromStatus = candidate.status;
    const toStatus: CandidateApprovalStatus = payload.decision === "approve" ? "approved" : "rejected";
    const decidedAt = nowIso();
    candidate.status = toStatus;
    candidate.decidedAt = decidedAt;
    candidate.updatedAt = decidedAt;
    appendEvent(candidate, {
      action: payload.decision,
      actorId: payload.actorId,
      note: payload.note,
      fromStatus,
      toStatus,
    });
    return clone(candidate);
  }

  publishCandidate(
    candidateId: string,
    payload: {
      actorId: string;
      publishedRef?: string;
      note?: string;
    },
  ): CandidateRuleApproval {
    const candidate = this.mustCandidate(candidateId);
    if (candidate.status !== "approved") {
      throw new ApprovalFlowError(
        `candidate status ${candidate.status} cannot be published`,
        "APPROVAL_INVALID_STATE",
        409,
      );
    }
    const fromStatus = candidate.status;
    const publishedAt = nowIso();
    candidate.status = "published";
    candidate.publishedAt = publishedAt;
    candidate.publishedRef = payload.publishedRef?.trim() || candidate.publishedRef;
    candidate.updatedAt = publishedAt;
    appendEvent(candidate, {
      action: "publish",
      actorId: payload.actorId,
      note: payload.note,
      fromStatus,
      toStatus: "published",
    });
    return clone(candidate);
  }

  deprecateCandidate(
    candidateId: string,
    payload: {
      actorId: string;
      note?: string;
    },
  ): CandidateRuleApproval {
    const candidate = this.mustCandidate(candidateId);
    if (candidate.status !== "published") {
      throw new ApprovalFlowError(
        `candidate status ${candidate.status} cannot be deprecated`,
        "APPROVAL_INVALID_STATE",
        409,
      );
    }
    const fromStatus = candidate.status;
    const deprecatedAt = nowIso();
    candidate.status = "deprecated";
    candidate.deprecatedAt = deprecatedAt;
    candidate.updatedAt = deprecatedAt;
    appendEvent(candidate, {
      action: "deprecate",
      actorId: payload.actorId,
      note: payload.note,
      fromStatus,
      toStatus: "deprecated",
    });
    return clone(candidate);
  }

  private mustCandidate(candidateId: string): CandidateRuleApproval {
    const candidate = this.candidates.get(candidateId.trim());
    if (!candidate) {
      throw new ApprovalFlowError(`candidate not found: ${candidateId}`, "CANDIDATE_NOT_FOUND", 404);
    }
    return candidate;
  }
}
