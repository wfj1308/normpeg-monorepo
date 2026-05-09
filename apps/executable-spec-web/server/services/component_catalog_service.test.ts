import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../../src/platform/types.ts";
import {
  browseCatalogItems,
  catalogItemIdFromSpuId,
  deprecateCatalogItem,
  getComponentCatalogDetail,
  importCatalogItem,
  listMarketplaceItems,
  listCatalogComponents,
  listComponentCatalogs,
  listComponentMarketplaceListings,
  publishCatalogItem,
  rateCatalogItem,
  registerMarketplaceDownload,
  registerMarketplaceReference,
  resetCatalogAssetStoreForTest,
  runWithCatalogNamespace,
  searchCatalogItems,
  updateCatalogItemCompatibility,
} from "./component_catalog_service.ts";

function createSpu(spuId: string, version: string, sourceType: SPUDefinition["sourceType"] = "compiled"): SPUDefinition {
  return {
    spuId,
    meta: {
      name: "Subgrade Compaction",
      norm: "JTG F80/1-2017",
      clause: "4.2.1",
      version,
      category: "subgrade",
      measuredItem: "compaction",
    },
    data: {
      inputs: [{ name: "inputValue", type: "number", label: "inputValue", unit: "-" }],
      outputs: [{ name: "resultValue", label: "resultValue", unit: "-" }],
    },
    path: [{ step: "calc", formula: "resultValue = inputValue" }],
    rules: [{ field: "resultValue", operator: ">=", threshold: 0, message: "ok" }],
    proof: {
      resultField: "resultValue",
      requiredSignatures: ["lab"],
    },
    sourceType,
  };
}

test("asset layer: registered SPU should be formal catalog asset object", () => {
  resetCatalogAssetStoreForTest();
  const registry = [createSpu("highway.subgrade.compaction.4.2.1@v1", "v1")];
  const assets = browseCatalogItems(registry, { scope: "all", types: ["spu"] });
  assert.equal(assets.length, 1);
  assert.equal(assets[0]?.itemId, catalogItemIdFromSpuId("highway.subgrade.compaction.4.2.1@v1"));
  assert.equal(assets[0]?.type, "spu");
  assert.equal(assets[0]?.status, "published");
  assert.equal(assets[0]?.visibility, "internal");
  assert.equal(assets[0]?.marketplace.accessScope, "enterprise_private");
});

test("asset layer: should support browse and search", () => {
  resetCatalogAssetStoreForTest();
  const registry = [
    createSpu("highway.subgrade.compaction.4.2.1@v1", "v1"),
    createSpu("highway.subgrade.compaction.4.2.1@v2", "v2"),
  ];
  const allItems = browseCatalogItems(registry, { scope: "all", types: ["spu"] });
  assert.equal(allItems.length, 2);
  const searchItems = searchCatalogItems(registry, { query: "compaction", scope: "all", types: ["spu"] });
  assert.equal(searchItems.length, 2);
});

test("asset layer: should support publish to public market and deprecate", () => {
  resetCatalogAssetStoreForTest();
  const registry = [createSpu("highway.subgrade.compaction.4.2.1@v1", "v1", "imported")];
  const itemId = catalogItemIdFromSpuId("highway.subgrade.compaction.4.2.1@v1");

  const beforePublish = browseCatalogItems(registry, { scope: "public", types: ["spu"] });
  assert.equal(beforePublish.length, 0);

  const published = publishCatalogItem(registry, itemId, { owner: "qa.team", visibility: "public" });
  assert.equal(published.status, "published");
  assert.equal(published.visibility, "public");
  assert.equal(published.marketplace.accessScope, "public");

  const publicItems = browseCatalogItems(registry, { scope: "public", types: ["spu"] });
  assert.equal(publicItems.length, 1);
  assert.equal(publicItems[0]?.owner, "qa.team");

  const listings = listComponentMarketplaceListings(registry);
  assert.equal(listings.length, 1);

  const deprecated = deprecateCatalogItem(registry, itemId);
  assert.equal(deprecated.status, "deprecated");
  const publicItemsAfterDeprecate = browseCatalogItems(registry, { scope: "public", types: ["spu"] });
  assert.equal(publicItemsAfterDeprecate.length, 0);
});

test("marketplace: should support rating, download/reference and compatibility metadata", () => {
  resetCatalogAssetStoreForTest();
  const registry = [createSpu("highway.subgrade.compaction.4.2.1@v1", "v1", "imported")];
  const itemId = catalogItemIdFromSpuId("highway.subgrade.compaction.4.2.1@v1");
  publishCatalogItem(registry, itemId, {
    owner: "market.owner",
    visibility: "public",
    runtimeVersionRange: ">=1.0.0 <2.0.0",
    compatibleAssetVersions: ["v1", "v1.1"],
    compatibilityNotes: "compatible with runtime 1.x",
  });

  rateCatalogItem(registry, itemId, {
    reviewerId: "u1",
    score: 5,
    comment: "great",
  });
  rateCatalogItem(registry, itemId, {
    reviewerId: "u2",
    score: 3,
  });
  registerMarketplaceDownload(registry, itemId);
  registerMarketplaceDownload(registry, itemId);
  registerMarketplaceReference(registry, itemId, {
    referenceId: "template:road-core@v1",
  });
  const next = updateCatalogItemCompatibility(registry, itemId, {
    runtimeVersionRange: ">=1.1.0 <2.0.0",
    compatibleAssetVersions: ["v1", "v1.1", "v1.2"],
    notes: "updated compatibility",
  });

  assert.equal(next.marketplace.rating.totalRatings, 2);
  assert.equal(next.marketplace.rating.averageScore, 4);
  assert.equal(next.marketplace.usage.downloadCount, 2);
  assert.equal(next.marketplace.usage.referenceCount, 1);
  assert.equal(next.marketplace.compatibility.runtimeVersionRange, ">=1.1.0 <2.0.0");
  assert.equal(next.marketplace.compatibility.compatibleAssetVersions.length, 3);
  assert.equal(next.marketplace.compatibility.notes, "updated compatibility");
});

test("marketplace: should support public and enterprise-private assets", () => {
  resetCatalogAssetStoreForTest();
  const registry = [createSpu("highway.subgrade.compaction.4.2.1@v1", "v1", "imported")];
  const itemId = catalogItemIdFromSpuId("highway.subgrade.compaction.4.2.1@v1");

  publishCatalogItem(registry, itemId, {
    owner: "public.owner",
    visibility: "public",
  });
  importCatalogItem(registry, {
    type: "template",
    itemId: "template:enterprise.private@v1",
    title: "Enterprise Private Template",
    normSource: "ENT-STD",
    version: "v1",
    owner: "tenant.alpha",
    visibility: "internal",
    status: "published",
  });

  const publicItems = listMarketplaceItems(registry, { scope: "public" });
  const privateItems = listMarketplaceItems(registry, { scope: "internal" });
  assert.equal(publicItems.some((item) => item.itemId === itemId), true);
  assert.equal(privateItems.some((item) => item.itemId === "template:enterprise.private@v1"), true);
  assert.equal(privateItems.find((item) => item.itemId === "template:enterprise.private@v1")?.marketplace.accessScope, "enterprise_private");
});

test("marketplace: namespace isolation should avoid tenant cross-contamination", () => {
  resetCatalogAssetStoreForTest();
  const registry = [createSpu("highway.subgrade.compaction.4.2.1@v1", "v1", "imported")];
  const itemId = catalogItemIdFromSpuId("highway.subgrade.compaction.4.2.1@v1");

  runWithCatalogNamespace("tenant_alpha", () => {
    publishCatalogItem(registry, itemId, { visibility: "public" });
    registerMarketplaceDownload(registry, itemId);
  });

  runWithCatalogNamespace("tenant_beta", () => {
    const before = browseCatalogItems(registry, { scope: "all", types: ["spu"] });
    assert.equal(before[0]?.marketplace.usage.downloadCount ?? 0, 0);
  });
});

test("asset layer: should support manual import for non-spu assets", () => {
  resetCatalogAssetStoreForTest();
  const registry: SPUDefinition[] = [];
  const imported = importCatalogItem(registry, {
    type: "specbundle",
    title: "Subgrade Bundle Pack",
    normSource: "JTG F80/1-2017",
    version: "v1",
    owner: "asset.admin",
    visibility: "internal",
    tags: ["subgrade", "bundle"],
    dependencies: ["template:subgrade-core@v1"],
    status: "draft",
  });
  assert.equal(imported.type, "specbundle");
  assert.equal(imported.visibility, "internal");
  const browseResult = browseCatalogItems(registry, { scope: "all", types: ["specbundle"] });
  assert.equal(browseResult.length, 1);
});

test("catalog compatibility: listComponentCatalogs and components should still work", () => {
  resetCatalogAssetStoreForTest();
  const registry = [
    createSpu("highway.subgrade.compaction.4.2.1@v1", "v1"),
    createSpu("highway.subgrade.compaction.4.2.1@v2", "v2"),
  ];
  const catalogs = listComponentCatalogs(registry);
  assert.equal(catalogs.length, 1);
  const detail = getComponentCatalogDetail(registry, catalogs[0]!.catalogId);
  assert.ok(detail);
  const components = listCatalogComponents(registry, catalogs[0]!.catalogId);
  assert.equal(components.length, 2);
  assert.equal(components.some((item) => item.spuId.endsWith("@v2") && item.isLatest), true);
  assert.equal(components.every((item) => item.itemId.startsWith("spu:")), true);
});
