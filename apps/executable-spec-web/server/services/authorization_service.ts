import type { IncomingMessage } from "node:http";

export type MinimalRole = "admin" | "builder" | "expert" | "inspector" | "supervisor";

export type PermissionAction =
  | "compile"
  | "register"
  | "approve_candidate_rule"
  | "execute"
  | "sign_proof"
  | "archive";

export interface RequestActor {
  role: MinimalRole;
  actorId: string;
  explicitRole: boolean;
}

const PERMISSION_MATRIX: Record<PermissionAction, MinimalRole[]> = {
  compile: ["admin", "builder"],
  register: ["admin"],
  approve_candidate_rule: ["admin", "expert"],
  execute: ["admin", "inspector", "supervisor"],
  sign_proof: ["admin", "expert", "inspector", "supervisor"],
  archive: ["admin", "supervisor"],
};

const ROLES: MinimalRole[] = ["admin", "builder", "expert", "inspector", "supervisor"];

function normalizeRole(input: unknown): MinimalRole | null {
  const role = String(input ?? "").trim().toLowerCase();
  if (!role) {
    return null;
  }
  return ROLES.includes(role as MinimalRole) ? (role as MinimalRole) : null;
}

function readRoleFromRequest(req: IncomingMessage): string {
  const direct = req.headers["x-user-role"] ?? req.headers["x-role"] ?? req.headers["x-actor-role"];
  return Array.isArray(direct) ? String(direct[0] ?? "") : String(direct ?? "");
}

function readActorIdFromRequest(req: IncomingMessage): string {
  const direct = req.headers["x-actor-id"] ?? req.headers["x-user-id"];
  const normalized = Array.isArray(direct) ? String(direct[0] ?? "") : String(direct ?? "");
  return normalized.trim() || "anonymous";
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly code: "ROLE_INVALID" | "ROLE_FORBIDDEN",
    public readonly statusCode = 403,
  ) {
    super(message);
  }
}

export function resolveRequestActor(req: IncomingMessage, defaultRole: MinimalRole = "admin"): RequestActor {
  const roleFromHeader = readRoleFromRequest(req);
  if (!roleFromHeader.trim()) {
    return {
      role: defaultRole,
      actorId: readActorIdFromRequest(req),
      explicitRole: false,
    };
  }
  const role = normalizeRole(roleFromHeader);
  if (!role) {
    throw new AuthorizationError(`invalid role: ${roleFromHeader}`, "ROLE_INVALID", 400);
  }
  return {
    role,
    actorId: readActorIdFromRequest(req),
    explicitRole: true,
  };
}

export function assertRoleCan(actor: RequestActor, action: PermissionAction): void {
  const allowedRoles = PERMISSION_MATRIX[action];
  if (allowedRoles.includes(actor.role)) {
    return;
  }
  throw new AuthorizationError(
    `role ${actor.role} cannot perform action ${action}`,
    "ROLE_FORBIDDEN",
    403,
  );
}

export function assertCanSignProof(actor: RequestActor, signatureRole: string): void {
  assertRoleCan(actor, "sign_proof");
  const normalizedSignatureRole = normalizeRole(signatureRole);
  if (!normalizedSignatureRole) {
    return;
  }
  if (actor.role === "admin" || actor.role === "expert") {
    return;
  }
  if (actor.role !== normalizedSignatureRole) {
    throw new AuthorizationError(
      `role ${actor.role} cannot sign as ${normalizedSignatureRole}`,
      "ROLE_FORBIDDEN",
      403,
    );
  }
}
