from __future__ import annotations

from datetime import datetime, timezone
from graphlib import TopologicalSorter, CycleError
from typing import Any, Literal

from pydantic import BaseModel, Field


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class NormSpecEntry(BaseModel):
    spuId: str
    workItem: str
    measuredItem: str
    required: bool
    priority: int


class OrderRule(BaseModel):
    before: str
    after: str
    reason: str


class ResourceConstraint(BaseModel):
    resourceType: Literal["personnel", "equipment", "material"]
    resourceCode: str | None = None
    maxUsage: int | None = None
    note: str | None = None


class TimeWindowConstraint(BaseModel):
    type: Literal["weather", "season", "environmental", "work_hour"]
    expression: str
    note: str | None = None


class SpaceConflictRule(BaseModel):
    ruleId: str
    appliesTo: list[str] = Field(default_factory=list)
    condition: str
    note: str | None = None


class NormRefOptimizationTargets(BaseModel):
    duration: Literal["min"] = "min"
    cost: Literal["min"] = "min"
    quality: Literal["max"] = "max"
    risk: Literal["min"] = "min"


class NormRefConstraints(BaseModel):
    orderRules: list[OrderRule] = Field(default_factory=list)
    resourceConstraints: list[ResourceConstraint] = Field(default_factory=list)
    timeWindowConstraints: list[TimeWindowConstraint] = Field(default_factory=list)
    spaceConflictRules: list[SpaceConflictRule] = Field(default_factory=list)


class NormRefMetadata(BaseModel):
    source: str
    createdAt: str
    updatedAt: str


class NormRefModel(BaseModel):
    normRefId: str
    name: str
    domain: str
    category: str
    version: str
    specCatalog: list[NormSpecEntry] = Field(default_factory=list)
    optimizationTargets: NormRefOptimizationTargets
    constraints: NormRefConstraints
    metadata: NormRefMetadata


class ApplicableSpec(BaseModel):
    spuId: str
    status: Literal["pending", "blocked", "running", "pass", "fail"]
    attempts: int = 0
    latestNode: str | None = None
    dependsOn: list[str] = Field(default_factory=list)


class SpaceContainerGeoCoords(BaseModel):
    X: float
    Y: float
    Z: float | None = None


class SpaceContainerGPS(BaseModel):
    lat: float
    lng: float


class SpaceContainerGeoReference(BaseModel):
    station: str
    chainage: float | None = None
    coordSystem: str
    coords: SpaceContainerGeoCoords
    gps: SpaceContainerGPS | None = None
    alignment: str | None = None


class SpaceContainerNormExecution(BaseModel):
    applicableSpecs: list[ApplicableSpec] = Field(default_factory=list)
    currentState: str
    gateStatus: str
    executionOrder: list[str] = Field(default_factory=list)


class SpaceContainerRuntime(BaseModel):
    activeSpec: str | None = None
    activeForm: str | None = None
    pendingActions: list[str] = Field(default_factory=list)
    pendingSignatures: list[str] = Field(default_factory=list)
    lastAction: str | None = None


class SpaceContainerLifecycle(BaseModel):
    state: Literal["DRAFT", "ACTIVE", "VALIDATED", "ARCHIVED"]
    createdAt: str
    updatedAt: str


class SpaceContainerModel(BaseModel):
    vAddress: str
    containerType: Literal["space"] = "space"
    geoReference: SpaceContainerGeoReference
    normExecution: SpaceContainerNormExecution
    runtime: SpaceContainerRuntime
    lifecycle: SpaceContainerLifecycle


class ResourceItem(BaseModel):
    id: str
    type: str
    available: bool
    quantity: float | None = None


class NeighborContainer(BaseModel):
    containerId: str
    activeTask: str | None = None


class CSDTaskConstraint(BaseModel):
    mustBefore: list[str] = Field(default_factory=list)
    mustAfter: list[str] = Field(default_factory=list)


class CSDTask(BaseModel):
    spuId: str
    status: Literal["pending", "blocked", "running", "pass", "fail"]
    priority: int
    durationEstimate: float | None = None
    constraints: CSDTaskConstraint


class CSDSchedulerLocationCoords(BaseModel):
    X: float
    Y: float
    Z: float | None = None


class CSDSchedulerLocation(BaseModel):
    station: str
    coords: CSDSchedulerLocationCoords


class CSDSchedulerResources(BaseModel):
    personnel: list[ResourceItem] = Field(default_factory=list)
    equipment: list[ResourceItem] = Field(default_factory=list)
    materials: list[ResourceItem] | None = None


class CSDSchedulerTimeConstraints(BaseModel):
    weather: str | None = None
    season: str | None = None
    currentTime: str | None = None
    workHours: list[str] | None = None


class CSDSchedulerSpaceConstraints(BaseModel):
    neighborContainers: list[NeighborContainer] = Field(default_factory=list)


class CSDSchedulerNormConstraints(BaseModel):
    resourceConstraints: list[ResourceConstraint] = Field(default_factory=list)
    timeWindowConstraints: list[TimeWindowConstraint] = Field(default_factory=list)
    spaceConflictRules: list[SpaceConflictRule] = Field(default_factory=list)


class CSDSchedulerInputModel(BaseModel):
    containerId: str
    location: CSDSchedulerLocation
    tasks: list[CSDTask] = Field(default_factory=list)
    resources: CSDSchedulerResources
    timeConstraints: CSDSchedulerTimeConstraints
    spaceConstraints: CSDSchedulerSpaceConstraints
    optimizationTargets: NormRefOptimizationTargets
    normConstraints: CSDSchedulerNormConstraints | None = None


class ResourcePoolModel(BaseModel):
    personnel: list[ResourceItem] = Field(default_factory=list)
    equipment: list[ResourceItem] = Field(default_factory=list)
    materials: list[ResourceItem] | None = None


class TimeContextModel(BaseModel):
    weather: str | None = None
    season: str | None = None
    currentTime: str | None = None
    workHours: list[str] | None = None


class SpaceContextModel(BaseModel):
    neighborContainers: list[NeighborContainer] = Field(default_factory=list)


def _unique(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        item = str(raw or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _lookup_priority(norm_ref: NormRefModel, spu_id: str) -> int:
    for item in norm_ref.specCatalog:
        if item.spuId == spu_id:
            return item.priority
    return 0


def _infer_duration(norm_ref: NormRefModel, spu_id: str) -> float | None:
    target = next((item for item in norm_ref.specCatalog if item.spuId == spu_id), None)
    if target is None:
        return None
    key = f"{target.workItem}-{target.measuredItem}".lower()
    if "压实" in key or "compaction" in key:
        return 2.5
    if "弯沉" in key or "deflection" in key:
        return 1.5
    if "厚度" in key or "thickness" in key:
        return 1.2
    return 2.0


def derive_execution_order(norm_ref: NormRefModel) -> list[str]:
    catalog_order = _unique([item.spuId for item in norm_ref.specCatalog])
    from_rules = _unique([x for rule in norm_ref.constraints.orderRules for x in [rule.before, rule.after]])
    all_nodes = _unique(catalog_order + from_rules)
    if not all_nodes:
        return []

    topo = TopologicalSorter()
    dependencies: dict[str, set[str]] = {node: set() for node in all_nodes}
    for rule in norm_ref.constraints.orderRules:
        before = str(rule.before or "").strip()
        after = str(rule.after or "").strip()
        if not before or not after or before == after:
            continue
        if before not in dependencies or after not in dependencies:
            continue
        dependencies[after].add(before)
    for node, depends in dependencies.items():
        topo.add(node, *depends)

    try:
        ordered = list(topo.static_order())
    except CycleError:
        ordered = all_nodes

    return sorted(
        ordered,
        key=lambda spu_id: (-_lookup_priority(norm_ref, spu_id), ordered.index(spu_id)),
    )


def _map_legacy_status(value: Any) -> Literal["pending", "blocked", "running", "pass", "fail"]:
    status = str(value or "").strip().upper()
    if status == "BLOCKED":
        return "blocked"
    if status in {"RUNNING", "SIGNING"}:
        return "running"
    if status in {"PASS", "FINAL_PASS", "COMPLETED"}:
        return "pass"
    if status in {"FAIL", "FINAL_FAIL"}:
        return "fail"
    return "pending"


def _map_legacy_lifecycle(value: Any) -> Literal["DRAFT", "ACTIVE", "VALIDATED", "ARCHIVED"]:
    state = str(value or "").strip().upper()
    if state == "ARCHIVED":
        return "ARCHIVED"
    if state in {"VALIDATED", "VERIFIED"}:
        return "VALIDATED"
    if state in {"RUNNING", "ACTIVE"}:
        return "ACTIVE"
    return "DRAFT"


def migrate_legacy_container(old_data: Any) -> SpaceContainerModel:
    old = old_data if isinstance(old_data, dict) else {}
    old_geo = old.get("geoReference") if isinstance(old.get("geoReference"), dict) else {}
    old_geo_slot = old.get("geo_slot") if isinstance(old.get("geo_slot"), dict) else {}
    old_geo_slot_geo = old_geo_slot.get("geo") if isinstance(old_geo_slot.get("geo"), dict) else {}
    old_runtime = old.get("runtime") if isinstance(old.get("runtime"), dict) else {}
    old_lifecycle = old.get("lifecycle") if isinstance(old.get("lifecycle"), dict) else {}

    station = str(old_geo.get("station") or old_geo_slot_geo.get("station") or "").strip() or "K19+070"

    legacy_spec_bindings = old.get("specBindings")
    if not isinstance(legacy_spec_bindings, list):
        legacy_spec_bindings = old.get("spec_bindings")
    if not isinstance(legacy_spec_bindings, list):
        legacy_spec_bindings = []

    norm_execution = old.get("normExecution") if isinstance(old.get("normExecution"), dict) else {}
    norm_execution_snake = old.get("norm_execution") if isinstance(old.get("norm_execution"), dict) else {}
    raw_execution_order = norm_execution.get("executionOrder")
    if not isinstance(raw_execution_order, list):
        raw_execution_order = norm_execution_snake.get("specs_bound")
    if not isinstance(raw_execution_order, list):
        raw_execution_order = []

    execution_order = _unique(
        [str(item.get("spuId") or item.get("spu_id") or "").strip() for item in legacy_spec_bindings]
        + [str(item or "").strip() for item in raw_execution_order]
    )

    applicable_specs: list[ApplicableSpec] = []
    for spu_id in execution_order:
        binding = next(
            (
                item
                for item in legacy_spec_bindings
                if isinstance(item, dict)
                and str(item.get("spuId") or item.get("spu_id") or "").strip() == spu_id
            ),
            {},
        )
        history_ids = binding.get("historyNodeIds")
        if not isinstance(history_ids, list):
            history_ids = binding.get("history_node_ids")
        if not isinstance(history_ids, list):
            history_ids = []
        depends_on = binding.get("dependsOn")
        if not isinstance(depends_on, list):
            depends_on = binding.get("depends_on")
        if not isinstance(depends_on, list):
            depends_on = []
        applicable_specs.append(
            ApplicableSpec(
                spuId=spu_id,
                status=_map_legacy_status(binding.get("status")),
                attempts=int(binding.get("attempts") or len(history_ids)),
                latestNode=str(binding.get("latestNodeId") or binding.get("latest_node") or "").strip() or None,
                dependsOn=_unique([str(item or "").strip() for item in depends_on]),
            )
        )

    return SpaceContainerModel(
        vAddress=str(old.get("vAddress") or old.get("v_address") or "").strip()
        or f"v:/cn.highway/default/subgrade/default/container/{station}",
        containerType="space",
        geoReference=SpaceContainerGeoReference(
            station=station,
            chainage=float(old_geo.get("chainage") or old_geo_slot_geo.get("chainage") or 0.0) or None,
            coordSystem=str(old_geo.get("coordSystem") or old_geo.get("coord_system") or "CGCS2000"),
            coords=SpaceContainerGeoCoords(
                X=float((old_geo.get("coords") or {}).get("X") if isinstance(old_geo.get("coords"), dict) else 0.0)
                or float(old_geo_slot_geo.get("x") or 0.0),
                Y=float((old_geo.get("coords") or {}).get("Y") if isinstance(old_geo.get("coords"), dict) else 0.0)
                or float(old_geo_slot_geo.get("y") or 0.0),
                Z=float((old_geo.get("coords") or {}).get("Z") if isinstance(old_geo.get("coords"), dict) else 0.0)
                or float(old_geo_slot_geo.get("elevation") or 0.0)
                or None,
            ),
            gps=SpaceContainerGPS(
                lat=float((old_geo.get("gps") or {}).get("lat") if isinstance(old_geo.get("gps"), dict) else 0.0),
                lng=float((old_geo.get("gps") or {}).get("lng") if isinstance(old_geo.get("gps"), dict) else 0.0),
            )
            if isinstance(old_geo.get("gps"), dict)
            else None,
            alignment=str(old_geo.get("alignment") or old_geo_slot_geo.get("alignment") or "").strip() or None,
        ),
        normExecution=SpaceContainerNormExecution(
            applicableSpecs=applicable_specs,
            currentState=str(
                norm_execution.get("currentState")
                or norm_execution.get("current_state")
                or norm_execution_snake.get("current_state")
                or old.get("lifecycleState")
                or old.get("lifecycle_state")
                or "draft"
            ),
            gateStatus=str(
                norm_execution.get("gateStatus")
                or norm_execution.get("gate_status")
                or old_runtime.get("pending_action")
                or "awaiting_lab"
            ),
            executionOrder=execution_order,
        ),
        runtime=SpaceContainerRuntime(
            activeSpec=str(old_runtime.get("activeSpec") or old_runtime.get("active_spec") or "").strip() or None,
            activeForm=str(old_runtime.get("activeForm") or old_runtime.get("active_form") or "").strip() or None,
            pendingActions=[
                str(item or "").strip()
                for item in (
                    old_runtime.get("pendingActions")
                    if isinstance(old_runtime.get("pendingActions"), list)
                    else [old_runtime.get("pending_action")] if old_runtime.get("pending_action") else []
                )
                if str(item or "").strip()
            ],
            pendingSignatures=[
                str(item or "").strip()
                for item in (old_runtime.get("pendingSignatures") if isinstance(old_runtime.get("pendingSignatures"), list) else [])
                if str(item or "").strip()
            ],
            lastAction=str(old_runtime.get("lastAction") or old_runtime.get("last_input") or "").strip() or None,
        ),
        lifecycle=SpaceContainerLifecycle(
            state=_map_legacy_lifecycle(old_lifecycle.get("state") or old.get("lifecycleState") or old.get("lifecycle_state")),
            createdAt=str(old_lifecycle.get("createdAt") or old.get("createdAt") or _utc_now()),
            updatedAt=str(old_lifecycle.get("updatedAt") or old.get("updatedAt") or _utc_now()),
        ),
    )


def build_csd_scheduler_input(
    container: SpaceContainerModel,
    norm_ref: NormRefModel,
    resources: ResourcePoolModel,
    time_context: TimeContextModel,
    space_context: SpaceContextModel,
) -> CSDSchedulerInputModel:
    order = derive_execution_order(norm_ref)
    in_container = {item.spuId: item for item in container.normExecution.applicableSpecs}
    additional = [item.spuId for item in container.normExecution.applicableSpecs if item.spuId not in order]
    ordered_spu_ids = order + additional

    tasks: list[CSDTask] = []
    for spu_id in ordered_spu_ids:
        spec = in_container.get(spu_id)
        must_before = _unique([item.after for item in norm_ref.constraints.orderRules if item.before == spu_id])
        must_after = _unique([item.before for item in norm_ref.constraints.orderRules if item.after == spu_id] + (spec.dependsOn if spec else []))
        tasks.append(
            CSDTask(
                spuId=spu_id,
                status=(spec.status if spec is not None else "pending"),
                priority=_lookup_priority(norm_ref, spu_id),
                durationEstimate=_infer_duration(norm_ref, spu_id),
                constraints=CSDTaskConstraint(mustBefore=must_before, mustAfter=must_after),
            )
        )

    return CSDSchedulerInputModel(
        containerId=container.vAddress,
        location=CSDSchedulerLocation(
            station=container.geoReference.station,
            coords=CSDSchedulerLocationCoords(
                X=container.geoReference.coords.X,
                Y=container.geoReference.coords.Y,
                Z=container.geoReference.coords.Z,
            ),
        ),
        tasks=tasks,
        resources=CSDSchedulerResources(
            personnel=resources.personnel,
            equipment=resources.equipment,
            materials=resources.materials,
        ),
        timeConstraints=CSDSchedulerTimeConstraints(
            weather=time_context.weather,
            season=time_context.season,
            currentTime=time_context.currentTime,
            workHours=time_context.workHours,
        ),
        spaceConstraints=CSDSchedulerSpaceConstraints(
            neighborContainers=space_context.neighborContainers,
        ),
        optimizationTargets=norm_ref.optimizationTargets,
        normConstraints=CSDSchedulerNormConstraints(
            resourceConstraints=norm_ref.constraints.resourceConstraints,
            timeWindowConstraints=norm_ref.constraints.timeWindowConstraints,
            spaceConflictRules=norm_ref.constraints.spaceConflictRules,
        ),
    )


def build_model_json_schemas() -> dict[str, dict[str, Any]]:
    return {
        "NormRef": NormRefModel.model_json_schema(),
        "SpaceContainer": SpaceContainerModel.model_json_schema(),
        "CSDSchedulerInput": CSDSchedulerInputModel.model_json_schema(),
    }
