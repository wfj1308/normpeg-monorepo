import { randomUUID } from "node:crypto";

import type { AuditEvent, EntityType } from "../types.ts";

export class EventStore {
  private readonly events: AuditEvent[] = [];

  append(params: {
    entityType: EntityType;
    entityId: string;
    eventType: string;
    payload: object;
    actor?: string;
  }): AuditEvent {
    const event: AuditEvent = {
      eventId: `ev_${randomUUID()}`,
      entityType: params.entityType,
      entityId: params.entityId,
      eventType: params.eventType,
      payload: params.payload,
      actor: params.actor,
      timestamp: new Date().toISOString(),
    };
    this.events.push(event);
    return event;
  }

  listByEntity(entityType: EntityType, entityId: string): AuditEvent[] {
    return this.events.filter((item) => item.entityType === entityType && item.entityId === entityId);
  }

  listByContainerWithNodes(containerId: string, nodeIds: string[]): AuditEvent[] {
    const nodeIdSet = new Set(nodeIds);
    return this.events.filter((item) => {
      if (item.entityType === "container" && item.entityId === containerId) {
        return true;
      }
      return item.entityType === "node" && nodeIdSet.has(item.entityId);
    });
  }

  listAll(): AuditEvent[] {
    return [...this.events];
  }
}
