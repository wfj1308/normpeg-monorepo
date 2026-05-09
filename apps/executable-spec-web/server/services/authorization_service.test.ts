import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanSignProof,
  assertRoleCan,
  AuthorizationError,
  resolveRequestActor,
  type RequestActor,
} from "./authorization_service.ts";

function mockRequest(headers: Record<string, string> = {}) {
  return { headers } as any;
}

test("resolveRequestActor: explicit role from header", () => {
  const actor = resolveRequestActor(mockRequest({
    "x-user-role": "builder",
    "x-actor-id": "u1",
  }));
  assert.equal(actor.role, "builder");
  assert.equal(actor.actorId, "u1");
  assert.equal(actor.explicitRole, true);
});

test("resolveRequestActor: fallback to default role", () => {
  const actor = resolveRequestActor(mockRequest({}), "admin");
  assert.equal(actor.role, "admin");
  assert.equal(actor.explicitRole, false);
});

test("assertRoleCan: blocks forbidden action", () => {
  const actor: RequestActor = {
    role: "builder",
    actorId: "u2",
    explicitRole: true,
  };
  assert.throws(
    () => assertRoleCan(actor, "archive"),
    (error) => {
      assert.ok(error instanceof AuthorizationError);
      assert.equal(error.code, "ROLE_FORBIDDEN");
      return true;
    },
  );
});

test("assertCanSignProof: inspector cannot sign as supervisor", () => {
  const actor: RequestActor = {
    role: "inspector",
    actorId: "ins-1",
    explicitRole: true,
  };
  assert.throws(
    () => assertCanSignProof(actor, "supervisor"),
    (error) => {
      assert.ok(error instanceof AuthorizationError);
      assert.equal(error.code, "ROLE_FORBIDDEN");
      return true;
    },
  );
});

test("assertCanSignProof: expert can sign supervisor role", () => {
  const actor: RequestActor = {
    role: "expert",
    actorId: "exp-1",
    explicitRole: true,
  };
  assert.doesNotThrow(() => assertCanSignProof(actor, "supervisor"));
});
