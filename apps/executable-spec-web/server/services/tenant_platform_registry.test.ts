import assert from "node:assert/strict";
import test from "node:test";

import { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import type { SPUDefinition } from "../../src/platform/types.ts";
import {
  resolveTenantIdFromRequest,
  TenantPlatformRegistry,
} from "./tenant_platform_registry.ts";

function createRegistry(): TenantPlatformRegistry {
  const bootstrap = new PlatformService();
  const seed = bootstrap.getRegistry();
  return new TenantPlatformRegistry({
    createPlatformService: () => new PlatformService(),
    sharedCatalogSeed: seed,
    defaultTenantId: "tenant_a",
  });
}

function createDemoSpu(spuId: string): SPUDefinition {
  return {
    spuId,
    meta: {
      name: spuId,
      norm: "TEST",
      clause: "1.1.1",
      version: "v1",
      measuredItem: "demo",
      category: "demo",
    },
    data: {
      inputs: [{ name: "x", type: "number", label: "x" }],
      outputs: [{ name: "y", label: "y" }],
    },
    path: [{ step: "s1", formula: "y = x" }],
    rules: [{
      ruleId: "R1",
      field: "y",
      operator: ">=",
      threshold: 1,
      message: "y >= 1",
    }],
    proof: {
      resultField: "y",
      requiredSignatures: [],
    },
    sourceType: "compiled",
  };
}

test("TenantPlatformRegistry: isolates container/proof/spu state between tenants", () => {
  const registry = createRegistry();
  const service = registry.getScopedServiceProxy();

  registry.runWithTenant("tenant_a", () => {
    service.publishSpuVersion(createDemoSpu("tenant_a.spu@v1"));
    const slot = service.importSlot({
      station: "K1+000",
      chainage: 1000,
      x: 1,
      y: 1,
      elevation: 1,
      sourceFile: "tenant_a.csv",
    });
    const container = service.createContainer({
      geoSlotRef: slot.slotId,
      title: "tenant_a_container",
    });
    assert.ok(container.containerId);
  });

  registry.runWithTenant("tenant_b", () => {
    const hasTenantASpu = service.getRegistry().some((item) => item.spuId === "tenant_a.spu@v1");
    assert.equal(hasTenantASpu, false);
    assert.equal(service.listContainers().length, 0);
    assert.equal(service.getProof("tenant_a_container"), null);
  });
});

test("TenantPlatformRegistry: shared catalog is cross-tenant read-only", () => {
  const registry = createRegistry();
  const shared = registry.listSharedCatalog();
  assert.equal(shared.length > 0, true);
  assert.equal(shared.every((item) => item.readOnly), true);
  assert.equal(shared.every((item) => item.sourceTenantId === "shared"), true);
});

test("TenantPlatformRegistry: tenant model supports projects/users/resource scope", () => {
  const registry = createRegistry();
  const tenant = registry.upsertTenant({
    tenantId: "org_demo",
    projects: ["p2", "p1", "p2"],
    users: [
      { userId: "alice", role: "admin" },
      { userId: "bob", role: "inspector" },
    ],
  });
  assert.equal(tenant.tenantId, "org_demo");
  assert.deepEqual(tenant.projects, ["p1", "p2"]);
  assert.equal(tenant.users.length, 2);
  assert.equal(tenant.resourceScope.sharedCatalog, "read-only");
});

test("resolveTenantIdFromRequest: normalize and fallback", () => {
  assert.equal(resolveTenantIdFromRequest({
    headerTenantId: "  org-1  ",
  }), "org-1");
  assert.equal(resolveTenantIdFromRequest({
    queryTenantId: "team/2",
  }), "team_2");
  assert.equal(resolveTenantIdFromRequest({}), "default");
});
