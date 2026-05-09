import { AsyncLocalStorage } from "node:async_hooks";

import type { SPUDefinition } from "../../src/platform/types.ts";
import type { PlatformService } from "../../src/platform/workflow/platform-service.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeTenantId(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "default";
  }
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function uniqueSorted(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(values.map((item) => String(item).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "en"));
}

export interface TenantUser {
  userId: string;
  role?: string;
}

export interface TenantResourceScope {
  spu: "tenant";
  spec: "tenant";
  proof: "tenant";
  container: "tenant";
  sharedCatalog: "read-only";
}

export interface TenantRecord {
  tenantId: string;
  projects: string[];
  users: TenantUser[];
  resourceScope: TenantResourceScope;
  createdAt: string;
  updatedAt: string;
}

export interface SharedCatalogItem {
  sourceTenantId: "shared";
  readOnly: true;
  spuId: string;
  title: string;
  norm: string;
  clause: string;
  version: string;
  category: string;
}

interface TenantEntry {
  record: TenantRecord;
  service: PlatformService;
}

function defaultResourceScope(): TenantResourceScope {
  return {
    spu: "tenant",
    spec: "tenant",
    proof: "tenant",
    container: "tenant",
    sharedCatalog: "read-only",
  };
}

function normalizeUsers(users: TenantUser[] | undefined): TenantUser[] {
  if (!Array.isArray(users)) {
    return [];
  }
  const next = new Map<string, TenantUser>();
  for (const item of users) {
    const userId = String(item?.userId ?? "").trim();
    if (!userId) {
      continue;
    }
    const role = String(item?.role ?? "").trim();
    next.set(userId, {
      userId,
      role: role || undefined,
    });
  }
  return Array.from(next.values()).sort((a, b) => a.userId.localeCompare(b.userId, "en"));
}

function toSharedCatalogItems(seed: SPUDefinition[]): SharedCatalogItem[] {
  return seed.map((item) => ({
    sourceTenantId: "shared",
    readOnly: true,
    spuId: item.spuId,
    title: item.meta.name,
    norm: item.meta.norm,
    clause: item.meta.clause,
    version: item.meta.version,
    category: item.meta.category,
  })).sort((a, b) => a.spuId.localeCompare(b.spuId, "en"));
}

export class TenantPlatformRegistry {
  private readonly tenantContext = new AsyncLocalStorage<string>();
  private readonly tenants = new Map<string, TenantEntry>();
  private readonly createPlatformService: () => PlatformService;
  private readonly sharedCatalog: SharedCatalogItem[];
  private readonly defaultTenantId: string;

  constructor(params: {
    createPlatformService: () => PlatformService;
    sharedCatalogSeed?: SPUDefinition[];
    defaultTenantId?: string;
  }) {
    this.createPlatformService = params.createPlatformService;
    this.defaultTenantId = normalizeTenantId(params.defaultTenantId);
    this.sharedCatalog = toSharedCatalogItems(params.sharedCatalogSeed ?? []);
    this.ensureTenant(this.defaultTenantId);
  }

  private ensureTenant(tenantId: string): TenantEntry {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const existing = this.tenants.get(normalizedTenantId);
    if (existing) {
      return existing;
    }
    const timestamp = nowIso();
    const created: TenantEntry = {
      record: {
        tenantId: normalizedTenantId,
        projects: [],
        users: [],
        resourceScope: defaultResourceScope(),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      service: this.createPlatformService(),
    };
    this.tenants.set(normalizedTenantId, created);
    return created;
  }

  getCurrentTenantId(): string {
    return normalizeTenantId(this.tenantContext.getStore() ?? this.defaultTenantId);
  }

  enterTenant(tenantId: string): void {
    this.ensureTenant(tenantId);
    this.tenantContext.enterWith(normalizeTenantId(tenantId));
  }

  runWithTenant<T>(tenantId: string, callback: () => T): T {
    const normalizedTenantId = normalizeTenantId(tenantId);
    this.ensureTenant(normalizedTenantId);
    return this.tenantContext.run(normalizedTenantId, callback);
  }

  getTenantService(tenantId?: string): PlatformService {
    const resolvedTenantId = normalizeTenantId(tenantId ?? this.getCurrentTenantId());
    return this.ensureTenant(resolvedTenantId).service;
  }

  getScopedServiceProxy(): PlatformService {
    return new Proxy({} as PlatformService, {
      get: (_target, property) => {
        const service = this.getTenantService();
        const value = (service as Record<string | symbol, unknown>)[property];
        if (typeof value === "function") {
          return value.bind(service);
        }
        return value;
      },
    });
  }

  upsertTenant(input: {
    tenantId: string;
    projects?: string[];
    users?: TenantUser[];
  }): TenantRecord {
    const entry = this.ensureTenant(input.tenantId);
    entry.record.projects = uniqueSorted(input.projects ?? entry.record.projects);
    entry.record.users = normalizeUsers(input.users ?? entry.record.users);
    entry.record.updatedAt = nowIso();
    return deepClone(entry.record);
  }

  getTenant(tenantId: string): TenantRecord | null {
    const entry = this.tenants.get(normalizeTenantId(tenantId));
    return entry ? deepClone(entry.record) : null;
  }

  listTenants(): TenantRecord[] {
    return Array.from(this.tenants.values())
      .map((item) => deepClone(item.record))
      .sort((a, b) => a.tenantId.localeCompare(b.tenantId, "en"));
  }

  listSharedCatalog(params?: {
    query?: string;
    category?: string;
    norm?: string;
  }): SharedCatalogItem[] {
    const query = String(params?.query ?? "").trim().toLowerCase();
    const category = String(params?.category ?? "").trim().toLowerCase();
    const norm = String(params?.norm ?? "").trim().toLowerCase();
    return this.sharedCatalog
      .filter((item) => {
        if (query) {
          const hit = item.spuId.toLowerCase().includes(query)
            || item.title.toLowerCase().includes(query)
            || item.norm.toLowerCase().includes(query);
          if (!hit) {
            return false;
          }
        }
        if (category && item.category.toLowerCase() !== category) {
          return false;
        }
        if (norm && item.norm.toLowerCase() !== norm) {
          return false;
        }
        return true;
      })
      .map((item) => deepClone(item));
  }
}

export function resolveTenantIdFromRequest(input: {
  headerTenantId?: string | null;
  queryTenantId?: string | null;
  fallbackTenantId?: string;
}): string {
  return normalizeTenantId(input.headerTenantId ?? input.queryTenantId ?? input.fallbackTenantId ?? "default");
}
