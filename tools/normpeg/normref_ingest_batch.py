#!/usr/bin/env python
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import requests


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REPORT_PATH = REPO_ROOT / "docs" / "normref" / "std" / "ingest-report-latest.json"
DEFAULT_RULE_ROOT = REPO_ROOT / "docs" / "normref" / "rule" / "imported"
DEFAULT_INPUT_DIRS = [
    REPO_ROOT / "standards" / "raw",
    REPO_ROOT / "docs" / "normref" / "std" / "raw",
    REPO_ROOT / "inputs" / "standards",
]


FIELD_KEYWORDS: List[Tuple[str, str]] = [
    ("压实度", "compaction_degree"),
    ("密实度", "compaction_degree"),
    ("平整度", "roughness_iri"),
    ("iri", "roughness_iri"),
    ("厚度", "thickness"),
    ("弯沉", "deflection"),
    ("孔径", "hole_diameter"),
    ("孔位偏差", "position_deviation"),
    ("倾斜度", "inclination"),
    ("含砂率", "sand_ratio"),
    ("强度", "strength"),
    ("含水率", "water_content"),
]

CATEGORY_KEYWORDS: List[Tuple[Tuple[str, ...], str]] = [
    (("桥", "涵", "桩"), "bridge/pile-hole-check"),
    (("压实", "弯沉", "平整", "厚度", "路"), "civil/general-check"),
    (("机电", "电缆", "设备"), "electromechanical/general-check"),
]

UNITS = ("mm", "cm", "m", "%", "MPa", "kPa", "g/cm3", "℃", "°C")


@dataclass
class IngestSpec:
    path: Path
    std_code: str
    level: str
    title: str


@dataclass
class ExtractionResult:
    text_pages: List[str]
    table_rows: List[Dict[str, Any]]
    warnings: List[str]
    parser: str


@dataclass
class AIPreprocessOptions:
    enabled: bool
    model: str
    base_url: str
    max_pages: int
    max_chars: int
    timeout_sec: int


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def _sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _stable_json_hash(payload: Dict[str, Any]) -> str:
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return _sha256_text(text)


def _slug(text: str) -> str:
    lowered = text.lower()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
    return lowered or "unknown"


def _normalize_std_code_from_name(path: Path) -> str:
    base = path.stem.upper().replace("_", "-")
    base = re.sub(r"\s+", "-", base)
    base = re.sub(r"[^A-Z0-9./-]", "", base)
    if not base:
        base = "UNKNOWN-STD"
    return base


def _extract_clause_id(line: str, fallback: str = "") -> str:
    patterns = [
        r"([0-9]{1,2}(?:\.[0-9]{1,3}){1,3})",
        r"(第[一二三四五六七八九十百千万0-9]+[章节条])",
    ]
    for pattern in patterns:
        hit = re.search(pattern, line)
        if hit:
            return hit.group(1)
    return fallback


def _iter_lines(pages: Sequence[str]) -> Iterable[Tuple[int, int, str]]:
    for page_no, page_text in enumerate(pages, start=1):
        for line_no, raw in enumerate((page_text or "").splitlines(), start=1):
            line = raw.strip()
            if line:
                yield page_no, line_no, line


def _infer_category(line: str) -> str:
    lower = line.lower()
    for terms, category in CATEGORY_KEYWORDS:
        if any(term in line or term in lower for term in terms):
            return category
    return "civil/general-check"


def _infer_field_key(line: str) -> str:
    lower = line.lower()
    for keyword, field_key in FIELD_KEYWORDS:
        if keyword in line or keyword in lower:
            return field_key
    return "measured_value"


def _infer_confidence(operator: str, value: str, unit: str, line: str) -> float:
    score = 0.56
    if operator in {"gte", "lte", "gt", "lt", "range", "eq"}:
        score += 0.1
    if value:
        score += 0.12
    if unit:
        score += 0.08
    if re.search(r"(搴攟蹇呴』|涓嶅緱|涓嶅簲)", line):
        score += 0.05
    if re.search(r"([0-9]{1,2}(?:\.[0-9]{1,3}){1,3})", line):
        score += 0.04
    return round(min(score, 0.95), 2)


def _parse_rules_from_lines(
    lines: Iterable[Tuple[int, int, str]],
    job_id: str,
    approve_threshold: float,
) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    seen: set[str] = set()

    # Prefer explicit threshold expressions.
    range_pattern = re.compile(
        rf"(?P<field>[\u4e00-\u9fffA-Za-z0-9_锛堬級()/%\-]+?)\s*"
        rf"(?P<min>-?\d+(?:\.\d+)?)\s*(?P<unit1>{'|'.join(re.escape(u) for u in UNITS)})?"
        rf"\s*(?:~|～|-|—|至|到)\s*"
        rf"(?P<max>-?\d+(?:\.\d+)?)\s*(?P<unit2>{'|'.join(re.escape(u) for u in UNITS)})?"
    )
    unit_group = "|".join(re.escape(u) for u in UNITS)
    gte_pattern = re.compile(
        rf"(?P<field>[\u4e00-\u9fffA-Za-z0-9_（）()/%\-]+?)\s*"
        rf"(?:>=|≥|不小于|不少于|不低于|大于等于)\s*"
        rf"(?P<value>-?\d+(?:\.\d+)?)\s*(?P<unit>{unit_group})?"
    )
    lte_pattern = re.compile(
        rf"(?P<field>[\u4e00-\u9fffA-Za-z0-9_（）()/%\-]+?)\s*"
        rf"(?:<=|≤|不大于|不高于|不超过|小于等于|不多于)\s*"
        rf"(?P<value>-?\d+(?:\.\d+)?)\s*(?P<unit>{unit_group})?"
    )
    gt_pattern = re.compile(
        rf"(?P<field>[\u4e00-\u9fffA-Za-z0-9_（）()/%\-]+?)\s*"
        rf"(?:>|大于|高于|超过)\s*"
        rf"(?P<value>-?\d+(?:\.\d+)?)\s*(?P<unit>{unit_group})?"
    )
    lt_pattern = re.compile(
        rf"(?P<field>[\u4e00-\u9fffA-Za-z0-9_（）()/%\-]+?)\s*"
        rf"(?:<|小于|低于|少于)\s*"
        rf"(?P<value>-?\d+(?:\.\d+)?)\s*(?P<unit>{unit_group})?"
    )

    for page_no, line_no, line in lines:
        parsed: Optional[Dict[str, str]] = None
        operator = ""
        threshold = ""
        unit = ""

        hit = range_pattern.search(line)
        if hit:
            operator = "range"
            threshold = f"{hit.group('min')}..{hit.group('max')}"
            unit = hit.group("unit1") or hit.group("unit2") or ""
            parsed = hit.groupdict()
        else:
            for pattern, op in (
                (gte_pattern, "gte"),
                (lte_pattern, "lte"),
                (gt_pattern, "gt"),
                (lt_pattern, "lt"),
            ):
                m = pattern.search(line)
                if m:
                    operator = op
                    threshold = m.group("value")
                    unit = m.group("unit") or ""
                    parsed = m.groupdict()
                    break

        if not parsed:
            continue

        field_raw = (parsed.get("field") or "").strip()
        field_key = _infer_field_key(field_raw or line)
        category = _infer_category(line)
        norm_ref = _extract_clause_id(line, "")
        confidence = _infer_confidence(operator, threshold, unit, line)
        status = "approved" if confidence >= approve_threshold else "pending"

        rule_base = f"{category.replace('/', '.')}.{field_key}"
        if norm_ref:
            rule_id = f"{rule_base}.{norm_ref}"
        else:
            rule_id = f"{rule_base}.rule"

        dedupe_key = f"{rule_id}|{operator}|{threshold}|{unit}|{line}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        candidate_seed = f"{job_id}:{page_no}:{line_no}:{dedupe_key}"
        candidate_id = "cand-" + hashlib.sha1(candidate_seed.encode("utf-8")).hexdigest()[:12]

        candidates.append(
            {
                "candidate_id": candidate_id,
                "job_id": job_id,
                "rule_id": rule_id,
                "category": category,
                "field_key": field_key,
                "operator": operator,
                "threshold_value": threshold,
                "unit": unit,
                "severity": "mandatory",
                "norm_ref": norm_ref,
                "source_line": line,
                "source_page": page_no,
                "source_line_no": line_no,
                "confidence": confidence,
                "status": status,
                "notes": "",
            }
        )

    return candidates


def _extract_sections(pages: Sequence[str]) -> List[Dict[str, Any]]:
    sections: List[Dict[str, Any]] = []
    cn_clause_pattern = re.compile(
        r"^\s*(\u7b2c[\u4e00-\u9fff0-9\u3007\u96f6\u4e24]+[\u7ae0\u8282\u6761\u6b3e])\s*[:\uff1a]?\s*(.*)$"
    )
    # Accept with/without spaces and with Chinese punctuation.
    dot_number_pattern = re.compile(r"^\s*([0-9]{1,3}(?:\.[0-9]{1,4}){1,8})\s*(?:[:\uff1a\u3001\u3002.]\s*)?(.+)$")
    annex_dot_pattern = re.compile(r"^\s*([\u9644]?[A-Za-z]{1,3}(?:\.[0-9]{1,3}){1,8})\s*(?:[:\uff1a\u3001\u3002.]\s*)?(.+)$")
    annex_pattern = re.compile(r"^\s*(\u9644\u5f55[A-Za-z0-9\u4e00-\u9fff]{1,8})\s*[:\uff1a]?\s*(.*)$")
    patterns = [cn_clause_pattern, dot_number_pattern, annex_dot_pattern, annex_pattern]

    def _clean_heading_line(raw: str) -> str:
        line = (raw or "").strip()
        if not line:
            return ""
        line = re.sub(r"[·•\.。…\s]{4,}\d+\s*$", "", line)
        line = re.sub(r"\s+\d+\s*$", "", line)
        return line.strip()

    seen_identity: set[str] = set()
    for page_no, line_no, raw_line in _iter_lines(pages):
        line = _clean_heading_line(raw_line)
        if not line:
            continue
        if re.search(r"(目录|目次|索引|附录|前言|总则)\s*$", line):
            continue
        for pattern in patterns:
            hit = pattern.match(line)
            if not hit:
                continue
            section_no = hit.group(1).strip()
            title = _clean_heading_line((hit.group(2) or "").strip()) or section_no
            # Drop numeric table metric rows misread as headings.
            if re.search(r"[~?]\s*\d", title):
                break
            if len(re.findall(r"\d+(?:\.\d+)?", title)) >= 4 and len(re.findall(r"[\u4e00-\u9fffA-Za-z]", title)) <= 2:
                break
            identity = f"{section_no}|{title}"
            if identity in seen_identity:
                break
            seen_identity.add(identity)
            sections.append(
                {
                    "section_no": section_no,
                    "section_title": title,
                    "page_no": page_no,
                    "line_no": line_no,
                }
            )
            break
    return sections


def _normalize_heading_line_for_scan(raw: str) -> str:
    line = str(raw or "").strip()
    if not line:
        return ""
    line = line.replace("\u3000", " ")
    line = re.sub(r"[·•\.。…\s]{4,}\d+\s*$", "", line)
    line = re.sub(r"\s+\d+\s*$", "", line)
    return line.strip()


def _looks_like_catalog_noise_line(text: str) -> bool:
    s = str(text or "").strip()
    if not s:
        return True
    if re.search(r"[~～]\s*\d", s):
        return True
    num_tokens = len(re.findall(r"\d+(?:\.\d+)?", s))
    word_tokens = len(re.findall(r"[\u4e00-\u9fffA-Za-z]", s))
    if num_tokens >= 4 and word_tokens <= 2:
        return True
    return False


def _extract_sections_loose(pages: Sequence[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    patterns: List[Tuple[str, re.Pattern[str]]] = [
        ("chapter", re.compile(r"^\s*第?\s*(\d{1,2})\s*章(?:\s*|[:：、.。]\s*)(.*)$")),
        ("clause", re.compile(r"^\s*(\d{1,2}\.\d{1,2}\.\d{1,3})(?:\s*|[:：、.。]\s*)(.*)$")),
        ("section", re.compile(r"^\s*(\d{1,2}\.\d{1,2})(?:\s*|[:：、.。]\s*)(.*)$")),
        ("table", re.compile(r"^\s*表\s*(\d+(?:\.\d+)*(?:-\d+)?)(?:\s*|[:：、.。]\s*)(.*)$")),
    ]
    for page_no, line_no, raw_line in _iter_lines(pages):
        line = _normalize_heading_line_for_scan(raw_line)
        if not line:
            continue
        if re.search(r"(前言|目\s*录|发布|实施|批准|主编单位)$", line):
            continue
        for _, pat in patterns:
            m = pat.match(line)
            if not m:
                continue
            no = m.group(1).strip()
            title = _normalize_heading_line_for_scan((m.group(2) or "").strip()) or no
            if _looks_like_catalog_noise_line(title):
                break
            key = f"{no}|{title}"
            if key in seen:
                break
            seen.add(key)
            out.append(
                {
                    "section_no": no,
                    "section_title": title,
                    "page_no": page_no,
                    "line_no": line_no,
                }
            )
            break
    return out


def _extract_sections_from_toc_pages(pages: Sequence[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    max_page_scan = min(len(pages), 40)
    toc_pages: List[Tuple[int, str]] = []
    for idx in range(max_page_scan):
        page_no = idx + 1
        page_text = str(pages[idx] or "")
        if not page_text.strip():
            continue
        if re.search(r"目\s*录", page_text):
            toc_pages.append((page_no, page_text))
    if not toc_pages:
        return out

    patterns: List[re.Pattern[str]] = [
        re.compile(r"^\s*第?\s*(\d{1,2})\s*章(?:\s*|[:：、.。]\s*)(.+)$"),
        re.compile(r"^\s*(\d{1,2}\.\d{1,2}\.\d{1,3})(?:\s*|[:：、.。]\s*)(.+)$"),
        re.compile(r"^\s*(\d{1,2}\.\d{1,2})(?:\s*|[:：、.。]\s*)(.+)$"),
        re.compile(r"^\s*表\s*(\d+(?:\.\d+)*(?:-\d+)?)(?:\s*|[:：、.。]\s*)(.+)$"),
    ]

    for page_no, page_text in toc_pages:
        for line_no, raw in enumerate(page_text.splitlines(), start=1):
            line = _normalize_heading_line_for_scan(raw)
            if not line:
                continue
            if re.search(r"(前言|目\s*录|发布|实施|批准|主编单位)$", line):
                continue
            matched = False
            for pat in patterns:
                m = pat.match(line)
                if not m:
                    continue
                no = m.group(1).strip()
                title = _normalize_heading_line_for_scan((m.group(2) or "").strip()) or no
                if _looks_like_catalog_noise_line(title):
                    matched = True
                    break
                key = f"{no}|{title}"
                if key in seen:
                    matched = True
                    break
                seen.add(key)
                out.append(
                    {
                        "section_no": no,
                        "section_title": title,
                        "page_no": page_no,
                        "line_no": line_no,
                    }
                )
                matched = True
                break
            if matched:
                continue
    return out


def _merge_sections(primary: Sequence[Dict[str, Any]], secondary: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    seen: set[str] = set()

    def _push(item: Dict[str, Any]) -> None:
        no = str(item.get("section_no", "")).strip()
        ttl = str(item.get("section_title", "")).strip()
        if not no:
            return
        k = f"{no}|{ttl}"
        if k in seen:
            return
        seen.add(k)
        merged.append(item)

    for it in primary:
        if isinstance(it, dict):
            _push(it)
    for it in secondary:
        if isinstance(it, dict):
            _push(it)
    return merged


def _sections_quality(sections: Sequence[Dict[str, Any]]) -> Dict[str, int]:
    chapter = 0
    section = 0
    clause = 0
    appendix = 0
    for item in sections:
        if not isinstance(item, dict):
            continue
        no = str(item.get("section_no", "")).strip()
        if not no:
            continue
        if no.startswith("附录"):
            appendix += 1
        elif re.fullmatch(r"\d{1,2}", no):
            chapter += 1
        elif re.fullmatch(r"\d{1,2}\.\d{1,2}", no):
            section += 1
        elif re.fullmatch(r"\d{1,2}\.\d{1,2}\.\d{1,3}", no):
            clause += 1
    return {
        "chapter": chapter,
        "section": section,
        "clause": clause,
        "appendix": appendix,
        "total": int(len([x for x in sections if isinstance(x, dict)])),
    }


def _normalize_clause_id(section_no: Any, fallback_idx: int) -> str:
    text = str(section_no or "").strip()
    if not text:
        return f"auto.{fallback_idx}"
    fullwidth_map = str.maketrans(
        {
            "\uff1a": ":",
            "\uff0e": ".",
            "\u3002": ".",
            "\uff0f": "/",
            "\uff0d": "-",
            "\uff08": "(",
            "\uff09": ")",
            "\u3000": " ",
        }
    )
    text = text.translate(fullwidth_map)
    text = re.sub(r"[:\uff1a]\s*$", "", text)
    text = re.sub(r"\s+", "", text)
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)*", text):
        return text
    if re.fullmatch(r"[\u9644]?[A-Za-z]{1,3}(?:\.[0-9]+)+", text):
        return text
    if re.fullmatch(r"\u7b2c[\u4e00-\u9fff0-9\u3007\u96f6\u4e24]+[\u7ae0\u8282\u6761\u6b3e]", text):
        return text
    if re.fullmatch(r"\u9644\u5f55[A-Za-z0-9\u4e00-\u9fff]{1,8}", text):
        return text
    return f"id.{_slug(text)}.{fallback_idx}"


def _parse_cn_clause(section_no: str) -> Optional[Dict[str, Any]]:
    hit = re.fullmatch(r"\u7b2c([\u4e00-\u9fff0-9\u3007\u96f6\u4e24]+)([\u7ae0\u8282\u6761\u6b3e])", section_no)
    if not hit:
        return None
    unit = hit.group(2)
    depth_map = {
        "\u7ae0": 1,  # 绔?
        "\u8282": 2,  # 鑺?
        "\u6761": 3,  # 鏉?
        "\u6b3e": 4,  # 娆?
    }
    return {
        "unit": unit,
        "serial": hit.group(1),
        "depth": depth_map.get(unit, 1),
    }


def _infer_clause_depth(clause_id: str) -> int:
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)*", clause_id):
        return clause_id.count(".") + 1
    if re.fullmatch(r"[\u9644]?[A-Za-z]{1,3}(?:\.[0-9]+)+", clause_id):
        return clause_id.count(".") + 1
    if re.fullmatch(r"\u9644\u5f55[A-Za-z0-9\u4e00-\u9fff]{1,8}", clause_id):
        return 1
    parsed = _parse_cn_clause(clause_id)
    if parsed:
        return int(parsed.get("depth", 1))
    return 1


def _find_numeric_parent(clause_id: str, existing: Dict[str, Dict[str, Any]]) -> Optional[str]:
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)+", clause_id) or re.fullmatch(r"[\u9644]?[A-Za-z]{1,3}(?:\.[0-9]+){2,}", clause_id):
        parts = clause_id.split(".")
        for idx in range(len(parts) - 1, 0, -1):
            parent = ".".join(parts[:idx])
            if parent in existing:
                return parent
    return None


def _build_clause_tree(sections: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    ordered = [s for s in sections if isinstance(s, dict)]
    ordered = sorted(
        ordered,
        key=lambda item: (
            int(item.get("page_no", 0) or 0),
            int(item.get("line_no", 0) or 0),
            str(item.get("section_no", "")),
        ),
    )

    nodes_by_id: Dict[str, Dict[str, Any]] = {}
    sequence: List[str] = []
    last_cn: Dict[str, str] = {}
    stack_by_depth: Dict[int, str] = {}

    for idx, item in enumerate(ordered, start=1):
        raw_no = str(item.get("section_no", "")).strip()
        clause_id = _normalize_clause_id(raw_no, idx)
        if clause_id in nodes_by_id:
            continue

        title = str(item.get("section_title", "")).strip() or clause_id
        depth = _infer_clause_depth(clause_id)
        node = {
            "clause_id": clause_id,
            "title": title,
            "depth": depth,
            "parent_id": None,
            "page_no": int(item.get("page_no", 0) or 0),
            "line_no": int(item.get("line_no", 0) or 0),
            "children": [],
        }

        parent_id = _find_numeric_parent(clause_id, nodes_by_id)
        parsed_cn = _parse_cn_clause(clause_id)
        if not parent_id and parsed_cn:
            unit = str(parsed_cn.get("unit", ""))
            if unit == "\u8282":
                parent_id = last_cn.get("\u7ae0")
            elif unit == "\u6761":
                parent_id = last_cn.get("\u8282") or last_cn.get("\u7ae0")
            elif unit == "\u6b3e":
                parent_id = last_cn.get("\u6761") or last_cn.get("\u8282") or last_cn.get("\u7ae0")
            elif unit == "\u7ae0":
                parent_id = None

        if not parent_id and depth > 1:
            for probe in range(depth - 1, 0, -1):
                if probe in stack_by_depth:
                    parent_id = stack_by_depth[probe]
                    break

        node["parent_id"] = parent_id
        nodes_by_id[clause_id] = node
        sequence.append(clause_id)
        stack_by_depth[depth] = clause_id
        stale = [key for key in stack_by_depth.keys() if key > depth]
        for key in stale:
            stack_by_depth.pop(key, None)
        if parsed_cn:
            last_cn[str(parsed_cn.get("unit", ""))] = clause_id

    roots: List[Dict[str, Any]] = []
    for clause_id in sequence:
        node = nodes_by_id[clause_id]
        parent_id = node.get("parent_id")
        if isinstance(parent_id, str) and parent_id in nodes_by_id:
            nodes_by_id[parent_id]["children"].append(node)
        else:
            roots.append(node)

    flat_nodes: List[Dict[str, Any]] = []
    for clause_id in sequence:
        node = nodes_by_id[clause_id]
        flat_nodes.append(
            {
                "clause_id": node.get("clause_id"),
                "title": node.get("title"),
                "depth": node.get("depth"),
                "parent_id": node.get("parent_id"),
                "page_no": node.get("page_no"),
                "line_no": node.get("line_no"),
            }
        )

    max_depth = max([int(node.get("depth", 1) or 1) for node in flat_nodes], default=0)
    orphan_count = len([item for item in flat_nodes if not item.get("parent_id")])
    return {
        "roots": roots,
        "nodes": flat_nodes,
        "stats": {
            "node_count": len(flat_nodes),
            "root_count": len(roots),
            "max_depth": max_depth,
            "orphan_count": orphan_count,
        },
    }


def _formula_to_latex(formula: str) -> str:
    result = formula
    result = result.replace("≤", r"\leq ")
    result = result.replace("≥", r"\geq ")
    result = result.replace("脳", r"\times ")
    result = result.replace("梅", r"\div ")
    result = result.replace("卤", r"\pm ")
    return result


def _extract_formulas(pages: Sequence[str]) -> List[Dict[str, Any]]:
    formulas: List[Dict[str, Any]] = []
    seen: set[str] = set()
    pattern = re.compile(r"([A-Za-z\u4e00-\u9fff0-9_]+)\s*=\s*([^\n]{2,120})")
    for page_no, line_no, line in _iter_lines(pages):
        for hit in pattern.finditer(line):
            expr = f"{hit.group(1)} = {hit.group(2)}".strip()
            if expr in seen:
                continue
            seen.add(expr)
            formulas.append(
                {
                    "expression": expr,
                    "latex": _formula_to_latex(expr),
                    "source_page": page_no,
                    "source_line_no": line_no,
                }
            )
    return formulas


def _extract_terms(pages: Sequence[str]) -> List[Dict[str, Any]]:
    terms: List[Dict[str, Any]] = []
    seen: set[str] = set()
    pattern = re.compile(r"^\s*(?P<term>[\u4e00-\u9fffA-Za-z0-9_（）()]{2,40})\s*(?:是指|系指|指的是)\s*(?P<def>.+)$")
    for page_no, line_no, line in _iter_lines(pages):
        hit = pattern.match(line)
        if not hit:
            continue
        term = hit.group("term").strip()
        definition = hit.group("def").strip()
        if term in seen:
            continue
        seen.add(term)
        terms.append(
            {
                "term": term,
                "definition": definition,
                "source_page": page_no,
                "source_line_no": line_no,
            }
        )
    return terms


def _extract_with_pdfplumber(pdf_path: Path) -> ExtractionResult:
    text_pages: List[str] = []
    table_rows: List[Dict[str, Any]] = []
    warnings: List[str] = []

    import pdfplumber  # type: ignore

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            text_pages.append(text)
            for table_idx, table in enumerate(page.extract_tables() or [], start=1):
                rows = []
                for row in table:
                    if not isinstance(row, list):
                        continue
                    cleaned = [str(cell or "").strip() for cell in row]
                    if any(cleaned):
                        rows.append(cleaned)
                if rows:
                    table_rows.append(
                        {
                            "page_no": page_no,
                            "table_index": table_idx,
                            "rows": rows,
                        }
                    )

    if not any((page or "").strip() for page in text_pages):
        warnings.append("no_text_from_pdfplumber")

    return ExtractionResult(
        text_pages=text_pages,
        table_rows=table_rows,
        warnings=warnings,
        parser="pdfplumber",
    )


def _extract_with_pypdf(pdf_path: Path) -> ExtractionResult:
    text_pages: List[str] = []
    warnings: List[str] = []
    table_rows: List[Dict[str, Any]] = []

    from pypdf import PdfReader  # type: ignore

    reader = PdfReader(str(pdf_path))
    for page in reader.pages:
        text_pages.append(page.extract_text() or "")

    if not any((page or "").strip() for page in text_pages):
        warnings.append("no_text_from_pypdf")

    return ExtractionResult(
        text_pages=text_pages,
        table_rows=table_rows,
        warnings=warnings,
        parser="pypdf",
    )


def _extract_with_rapidocr(pdf_path: Path, ocr_max_pages: int, scale: float = 2.0) -> ExtractionResult:
    warnings: List[str] = ["ocr_selected"]
    table_rows: List[Dict[str, Any]] = []
    text_pages: List[str] = []

    import pypdfium2 as pdfium  # type: ignore
    from rapidocr_onnxruntime import RapidOCR  # type: ignore

    engine = RapidOCR()
    pdf = pdfium.PdfDocument(str(pdf_path))
    total = len(pdf)
    limit = total if ocr_max_pages <= 0 else min(total, ocr_max_pages)
    for index in range(limit):
        page = pdf[index]
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil()
        result, _ = engine(image)
        if not result:
            text_pages.append("")
            continue
        lines = [str(item[1]).strip() for item in result if isinstance(item, (list, tuple)) and len(item) >= 2]
        text_pages.append("\n".join([line for line in lines if line]))

    if not any((page or "").strip() for page in text_pages):
        warnings.append("no_text_from_ocr")

    return ExtractionResult(
        text_pages=text_pages,
        table_rows=table_rows,
        warnings=warnings,
        parser="rapidocr",
    )


def _extraction_text_stats(pages: Sequence[str]) -> Dict[str, Any]:
    non_empty_pages = [str(page or "") for page in pages if str(page or "").strip()]
    lines: List[str] = []
    for page in non_empty_pages:
        for raw in page.splitlines():
            line = raw.strip()
            if line:
                lines.append(line)
    unique_lines = set(lines)
    total_chars = sum(len(page) for page in non_empty_pages)
    watermark_like = sum(1 for line in unique_lines if re.search(r"(www\.|biao-zhun\.cn|鏍囧噯鍑虹増绀?)", line, re.IGNORECASE))
    replacement_char_count = sum(page.count("\ufffd") for page in non_empty_pages)
    garbled_char_count = sum(len(re.findall(r"[锟介埄閸熼崰閸ч崹閸╅崻閸崿閸嵂]", page)) for page in non_empty_pages)
    return {
        "non_empty_pages": len(non_empty_pages),
        "line_count": len(lines),
        "unique_line_count": len(unique_lines),
        "total_chars": total_chars,
        "watermark_like_unique_lines": watermark_like,
        "replacement_char_count": replacement_char_count,
        "garbled_char_count": garbled_char_count,
    }


def _looks_like_low_quality_text(pages: Sequence[str]) -> bool:
    stats = _extraction_text_stats(pages)
    if stats["non_empty_pages"] == 0:
        return True
    if stats["total_chars"] < 400:
        return True
    if stats["unique_line_count"] <= 4:
        return True
    if stats["watermark_like_unique_lines"] > 0 and stats["unique_line_count"] <= 8:
        return True
    if stats["replacement_char_count"] > 0:
        return True
    if stats["total_chars"] > 0 and (stats["garbled_char_count"] / max(stats["total_chars"], 1)) > 0.08:
        return True
    return False


def _extraction_score(result: ExtractionResult) -> int:
    stats = _extraction_text_stats(result.text_pages)
    score = int(stats["total_chars"]) + int(stats["unique_line_count"]) * 20
    # Penalize watermark-only style text.
    score -= int(stats["watermark_like_unique_lines"]) * 100
    return score


def _extract_pdf(pdf_path: Path, ocr_max_pages: int) -> ExtractionResult:
    errors: List[str] = []
    candidates: List[ExtractionResult] = []

    try:
        result = _extract_with_pdfplumber(pdf_path)
        if not _looks_like_low_quality_text(result.text_pages):
            return result
        result.warnings.append("pdfplumber_low_text_quality_fallback")
        candidates.append(result)
    except Exception as exc:
        errors.append(f"pdfplumber_failed:{exc.__class__.__name__}")

    try:
        result = _extract_with_pypdf(pdf_path)
        result.warnings.extend(errors)
        if not _looks_like_low_quality_text(result.text_pages):
            return result
        result.warnings.append("pypdf_low_text_quality_fallback")
        candidates.append(result)
    except Exception as exc:
        errors.append(f"pypdf_failed:{exc.__class__.__name__}")

    effective_ocr_max_pages = int(ocr_max_pages or 0)
    # Performance guard: full-document OCR on large specs is very slow.
    # Keep accuracy by running one broad pass first, then a second pass only
    # when document is relatively small.
    try:
        import pypdfium2 as pdfium  # type: ignore
        total_pages = len(pdfium.PdfDocument(str(pdf_path)))
    except Exception:
        total_pages = 0
    if effective_ocr_max_pages <= 0 and total_pages > 0:
        effective_ocr_max_pages = min(total_pages, 80)

    ocr_passes: List[Tuple[float, str]] = [(2.0, "rapidocr_pass1")]
    if total_pages <= 80:
        ocr_passes.append((2.6, "rapidocr_pass2"))

    for scale, marker in ocr_passes:
        try:
            result = _extract_with_rapidocr(pdf_path, effective_ocr_max_pages, scale=scale)
            result.warnings.extend(errors)
            result.warnings.append(marker)
            if effective_ocr_max_pages > 0 and total_pages > effective_ocr_max_pages:
                result.warnings.append(f"ocr_page_capped:{effective_ocr_max_pages}/{total_pages}")
            if not _looks_like_low_quality_text(result.text_pages):
                return result
            result.warnings.append("rapidocr_low_text_quality")
            candidates.append(result)
        except Exception as exc:
            errors.append(f"rapidocr_failed:{exc.__class__.__name__}:{marker}")

    if candidates:
        best = max(candidates, key=_extraction_score)
        best.warnings.extend(errors)
        best.warnings.append("fallback_best_effort_selected")
        return best

    return ExtractionResult(
        text_pages=[],
        table_rows=[],
        warnings=errors + ["extract_failed"],
        parser="none",
    )


def _table_rows_to_lines(table_rows: Sequence[Dict[str, Any]]) -> List[Tuple[int, int, str]]:
    lines: List[Tuple[int, int, str]] = []
    for table in table_rows:
        page_no = int(table.get("page_no", 0) or 0)
        rows = table.get("rows", [])
        if not isinstance(rows, list):
            continue
        for idx, row in enumerate(rows, start=1):
            if not isinstance(row, list):
                continue
            text = " ".join([str(cell).strip() for cell in row if str(cell).strip()])
            if text:
                lines.append((page_no, idx, text))
    return lines


def _extract_json_object(text: str) -> Dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {}

    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()

    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        snippet = raw[start : end + 1]
        try:
            data = json.loads(snippet)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return {}


def _prepare_ai_source_text(text_pages: Sequence[str], table_rows: Sequence[Dict[str, Any]], max_pages: int, max_chars: int) -> str:
    selected_pages = list(text_pages[: max_pages if max_pages > 0 else len(text_pages)])
    segments: List[str] = []
    for index, page_text in enumerate(selected_pages, start=1):
        cleaned = (page_text or "").strip()
        if not cleaned:
            continue
        segments.append(f"[PAGE {index}]\n{cleaned}")

    for item in table_rows[:20]:
        page_no = int(item.get("page_no", 0) or 0)
        rows = item.get("rows", [])
        if not isinstance(rows, list):
            continue
        rows_text = []
        for row in rows[:20]:
            if isinstance(row, list):
                row_text = " | ".join([str(cell).strip() for cell in row if str(cell).strip()])
                if row_text:
                    rows_text.append(row_text)
        if rows_text:
            segments.append(f"[TABLE PAGE {page_no}]\n" + "\n".join(rows_text))

    combined = "\n\n".join(segments)
    if max_chars > 0 and len(combined) > max_chars:
        return combined[:max_chars]
    return combined


def _is_ollama_base_url(base_url: str) -> bool:
    normalized = str(base_url or "").strip().lower()
    return (
        "11434" in normalized
        or "ollama" in normalized
        or "host.docker.internal" in normalized
    )


def _call_openai_chat_json(
    model: str,
    base_url: str,
    api_key: str,
    prompt_text: str,
    timeout_sec: int,
) -> Dict[str, Any]:
    normalized_base_url = str(base_url or "").strip().rstrip("/")
    if _is_ollama_base_url(normalized_base_url) and not normalized_base_url.endswith("/v1"):
        normalized_base_url = normalized_base_url + "/v1"
    endpoint = normalized_base_url + "/chat/completions"
    system_prompt = (
        "You are a standards parsing engine. Extract structured information from engineering standards text. "
        "Return JSON only with keys: sections, clause_tree, tables, measurement_items, formulas, terms."
    )
    user_prompt = (
        "Extract the following from the source text:\n"
        "1) sections: [{section_no, section_title, page_no, line_no}]\n"
        "2) clause_tree: {nodes:[{clause_id,title,depth,parent_id,page_no,line_no}], stats:{node_count,root_count,max_depth}}\n"
        "3) tables: [{table_title, page_no, measured_items:[{check_item, required_value, tolerance, unit, method, severity, norm_ref}]}]\n"
        "4) measurement_items: [{item_name, field_key, operator, threshold_value, unit, norm_ref, category, source_quote, confidence}]\n"
        "5) formulas: [{expression, latex, source_quote}]\n"
        "6) terms: [{source_term, standard_term, definition, confidence}]\n"
        "Rules: output JSON only; use empty arrays when unknown; confidence 0~1.\n\n"
        f"Source text:\n{prompt_text}"
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.0,
    }
    headers = {"Content-Type": "application/json"}
    if api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"

    def _request(use_response_format: bool) -> Dict[str, Any]:
        req_payload = dict(payload)
        if use_response_format:
            req_payload["response_format"] = {"type": "json_object"}
        resp = requests.post(endpoint, headers=headers, json=req_payload, timeout=timeout_sec)
        resp.raise_for_status()
        body = resp.json()
        return body if isinstance(body, dict) else {}

    try:
        body = _request(use_response_format=True)
    except requests.HTTPError as exc:
        response = getattr(exc, "response", None)
        status_code = int(getattr(response, "status_code", 0) or 0)
        response_text = ""
        if response is not None:
            try:
                response_text = str(response.text or "").lower()
            except Exception:
                response_text = ""
        should_retry_without_response_format = (
            status_code in {400, 404, 422}
            and ("response_format" in response_text or "json_object" in response_text or "unsupported" in response_text)
        )
        if not should_retry_without_response_format:
            raise
        body = _request(use_response_format=False)

    choices = body.get("choices", [])
    if not isinstance(choices, list) or not choices:
        return {}
    message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
    content = message.get("content", "") if isinstance(message, dict) else ""
    if isinstance(content, list):
        # Some providers return segmented content list
        merged = []
        for part in content:
            if isinstance(part, dict):
                text = part.get("text") or part.get("content") or ""
                if text:
                    merged.append(str(text))
        content = "\n".join(merged)
    return _extract_json_object(str(content))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _normalize_ai_operator(raw_operator: str, required_value: Any, tolerance: Any) -> Tuple[str, str]:
    op = (raw_operator or "").strip().lower()
    mapping = {
        ">=": "gte",
        "≥": "gte",
        "gte": "gte",
        "<=": "lte",
        "≤": "lte",
        "lte": "lte",
        ">": "gt",
        "gt": "gt",
        "<": "lt",
        "lt": "lt",
        "=": "eq",
        "eq": "eq",
        "range": "range",
    }
    if op in mapping:
        return mapping[op], str(required_value or "")

    # Infer from required_value + tolerance when operator missing.
    rv = str(required_value or "").strip()
    tv = str(tolerance or "").strip()
    if rv and tv:
        try:
            center = float(rv)
            tol = abs(float(tv))
            return "range", f"{center - tol}..{center + tol}"
        except Exception:
            pass
    if rv:
        return "eq", rv
    return "eq", ""


def _build_candidates_from_ai_items(
    measurement_items: Sequence[Dict[str, Any]],
    job_id: str,
    approve_threshold: float,
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for idx, item in enumerate(measurement_items, start=1):
        if not isinstance(item, dict):
            continue
        field_key = str(item.get("field_key", "")).strip() or _infer_field_key(str(item.get("item_name", "")))
        category = str(item.get("category", "")).strip() or "civil/general-check"
        norm_ref = str(item.get("norm_ref", "")).strip()
        operator, threshold = _normalize_ai_operator(
            str(item.get("operator", "")),
            item.get("threshold_value") or item.get("required_value"),
            item.get("tolerance"),
        )
        unit = str(item.get("unit", "")).strip()
        confidence = _safe_float(item.get("confidence"), 0.82)
        confidence = max(0.0, min(confidence, 1.0))
        status = "approved" if confidence >= approve_threshold else "pending"
        source_line = str(item.get("source_quote", "")).strip() or str(item.get("item_name", "")).strip()
        rule_base = f"{category.replace('/', '.')}.{field_key}"
        rule_id = f"{rule_base}.{norm_ref}" if norm_ref else f"{rule_base}.rule"
        dedupe_key = f"{rule_id}|{operator}|{threshold}|{unit}|{source_line}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        candidate_id = "cand-ai-" + hashlib.sha1(f"{job_id}:{idx}:{dedupe_key}".encode("utf-8")).hexdigest()[:10]
        results.append(
            {
                "candidate_id": candidate_id,
                "job_id": job_id,
                "rule_id": rule_id,
                "category": category,
                "field_key": field_key,
                "operator": operator,
                "threshold_value": threshold,
                "unit": unit,
                "severity": str(item.get("severity", "mandatory")).strip() or "mandatory",
                "norm_ref": norm_ref,
                "source_line": source_line,
                "source_page": int(item.get("page_no", 0) or 0),
                "source_line_no": int(item.get("line_no", 0) or 0),
                "confidence": round(confidence, 4),
                "status": status,
                "notes": "ai_preprocess",
            }
        )
    return results


def _merge_candidates(primary: Sequence[Dict[str, Any]], secondary: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for source in (primary, secondary):
        for item in source:
            if not isinstance(item, dict):
                continue
            key = "|".join(
                [
                    str(item.get("rule_id", "")),
                    str(item.get("operator", "")),
                    str(item.get("threshold_value", "")),
                    str(item.get("unit", "")),
                    str(item.get("norm_ref", "")),
                ]
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
    return merged


def _normalize_ai_clause_tree(raw_tree: Any) -> Dict[str, Any]:
    if not isinstance(raw_tree, dict):
        return {}
    nodes = raw_tree.get("nodes", [])
    if not isinstance(nodes, list):
        return {}

    normalized_nodes: List[Dict[str, Any]] = []
    for idx, node in enumerate(nodes, start=1):
        if not isinstance(node, dict):
            continue
        clause_id = _normalize_clause_id(node.get("clause_id", ""), idx)
        title = str(node.get("title", "")).strip() or clause_id
        parent_id = str(node.get("parent_id", "")).strip() or None
        depth = int(node.get("depth", 0) or 0)
        if depth <= 0:
            depth = _infer_clause_depth(clause_id)
        normalized_nodes.append(
            {
                "clause_id": clause_id,
                "title": title,
                "depth": depth,
                "parent_id": parent_id,
                "page_no": int(node.get("page_no", 0) or 0),
                "line_no": int(node.get("line_no", 0) or 0),
            }
        )

    if not normalized_nodes:
        return {}

    node_map: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for node in normalized_nodes:
        cid = str(node["clause_id"])
        if cid in node_map:
            continue
        node_map[cid] = {**node, "children": []}
        order.append(cid)

    roots: List[Dict[str, Any]] = []
    for cid in order:
        node = node_map[cid]
        parent_id = node.get("parent_id")
        if isinstance(parent_id, str) and parent_id in node_map:
            node_map[parent_id]["children"].append(node)
        else:
            roots.append(node)

    flat_nodes = [node_map[cid] for cid in order]
    max_depth = max([int(item.get("depth", 1) or 1) for item in flat_nodes], default=0)
    return {
        "roots": roots,
        "nodes": [
            {
                "clause_id": item.get("clause_id"),
                "title": item.get("title"),
                "depth": item.get("depth"),
                "parent_id": item.get("parent_id"),
                "page_no": item.get("page_no"),
                "line_no": item.get("line_no"),
            }
            for item in flat_nodes
        ],
        "stats": {
            "node_count": len(flat_nodes),
            "root_count": len(roots),
            "max_depth": max_depth,
            "orphan_count": len(roots),
        },
    }


def _run_ai_preprocess(
    extraction: ExtractionResult,
    options: AIPreprocessOptions,
) -> Dict[str, Any]:
    if not options.enabled:
        return {"enabled": False, "used": False, "warnings": []}

    base_url = str(options.base_url or "").strip()
    api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("NORMPEG_AI_API_KEY", "").strip()
    if not api_key and not _is_ollama_base_url(base_url):
        return {
            "enabled": True,
            "used": False,
            "model": options.model,
            "warnings": ["ai_preprocess_enabled_but_missing_api_key"],
        }

    prompt_text = _prepare_ai_source_text(
        extraction.text_pages,
        extraction.table_rows,
        max_pages=options.max_pages,
        max_chars=options.max_chars,
    )
    if not prompt_text.strip():
        return {
            "enabled": True,
            "used": False,
            "model": options.model,
            "warnings": ["empty_text_for_ai_preprocess"],
        }

    started = time.time()
    try:
        ai_raw = _call_openai_chat_json(
            model=options.model,
            base_url=base_url,
            api_key=api_key,
            prompt_text=prompt_text,
            timeout_sec=options.timeout_sec,
        )
        elapsed_ms = int((time.time() - started) * 1000)
        if not ai_raw:
            return {
                "enabled": True,
                "used": False,
                "model": options.model,
                "duration_ms": elapsed_ms,
                "warnings": ["ai_preprocess_empty_result"],
            }

        sections = ai_raw.get("sections", [])
        clause_tree = _normalize_ai_clause_tree(ai_raw.get("clause_tree", {}))
        tables = ai_raw.get("tables", [])
        formulas = ai_raw.get("formulas", [])
        terms = ai_raw.get("terms", [])
        measurement_items = ai_raw.get("measurement_items", [])

        # Flatten measured_items from tables if model emits table-scoped items.
        if isinstance(tables, list):
            for table in tables:
                if not isinstance(table, dict):
                    continue
                measured = table.get("measured_items", [])
                if isinstance(measured, list):
                    for row in measured:
                        if not isinstance(row, dict):
                            continue
                        merged = dict(row)
                        merged.setdefault("source_quote", table.get("table_title", ""))
                        measurement_items.append(merged)

        return {
            "enabled": True,
            "used": True,
            "model": options.model,
            "duration_ms": elapsed_ms,
            "warnings": [],
            "sections": sections if isinstance(sections, list) else [],
            "clause_tree": clause_tree,
            "tables": tables if isinstance(tables, list) else [],
            "measurement_items": measurement_items if isinstance(measurement_items, list) else [],
            "formulas": formulas if isinstance(formulas, list) else [],
            "terms": terms if isinstance(terms, list) else [],
            "raw": ai_raw,
        }
    except Exception as exc:
        warning = f"ai_preprocess_failed:{exc.__class__.__name__}"
        http_status = 0
        http_body = ""
        if isinstance(exc, requests.HTTPError):
            response = getattr(exc, "response", None)
            if response is not None:
                try:
                    http_status = int(response.status_code or 0)
                except Exception:
                    http_status = 0
                if http_status > 0:
                    warning = f"{warning}:{http_status}"
                try:
                    http_body = (response.text or "").strip()[:500]
                except Exception:
                    http_body = ""
        return {
            "enabled": True,
            "used": False,
            "model": options.model,
            "warnings": [warning],
            "error": str(exc),
            "http_status": http_status,
            "http_body": http_body,
        }


def _publish_rules(
    job: Dict[str, Any],
    version_tag: str,
    write_to_docs: bool,
    rule_root: Path,
) -> Dict[str, Any]:
    candidates = job.get("candidates", [])
    if not isinstance(candidates, list):
        candidates = []

    published_rules: List[Dict[str, Any]] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        if candidate.get("status") != "approved":
            continue

        category = str(candidate.get("category", "civil/general-check"))
        field_key = str(candidate.get("field_key", "measured_value"))
        rule_id = str(candidate.get("rule_id", "unknown.rule"))
        record: Dict[str, Any] = {
            "rule_id": rule_id,
            "version": version_tag,
            "uri": f"v://normref.com/rule/{category}/{field_key}@{version_tag}",
            "category": category,
            "field_key": field_key,
            "operator": candidate.get("operator", ""),
            "threshold_value": candidate.get("threshold_value", ""),
            "unit": candidate.get("unit", ""),
            "severity": candidate.get("severity", "mandatory"),
            "norm_ref": candidate.get("norm_ref", ""),
            "source_line": candidate.get("source_line", ""),
            "confidence": candidate.get("confidence", 0.0),
            "ingest_job_id": job.get("job_id", ""),
            "candidate_id": candidate.get("candidate_id", ""),
            "source_std_code": job.get("std_code", ""),
            "source_level": job.get("level", ""),
            "scope": job.get("level", ""),
        }
        record["hash"] = _stable_json_hash(record)
        published_rules.append(record)

        if write_to_docs:
            short_hash = str(record["hash"]).split(":")[-1][:10]
            relative_dir = Path(*category.split("/"))
            out_dir = rule_root / relative_dir
            out_dir.mkdir(parents=True, exist_ok=True)
            file_name = f"{rule_id}@{version_tag}-{short_hash}.json"
            out_path = out_dir / file_name
            out_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    snapshot_seed = "".join(sorted([str(r.get("hash", "")) for r in published_rules]))
    snapshot_hash = _sha256_text(snapshot_seed or f"{job.get('job_id', '')}:{version_tag}")
    return {
        "ok": True,
        "job_id": job.get("job_id", ""),
        "version_tag": version_tag,
        "published_count": len(published_rules),
        "snapshot_hash": snapshot_hash,
        "rules": published_rules,
        "write_to_docs": write_to_docs,
    }


def _build_job(
    spec: IngestSpec,
    approve_threshold: float,
    ocr_max_pages: int,
    ai_options: AIPreprocessOptions,
) -> Dict[str, Any]:
    job_id = "ingest-" + uuid.uuid4().hex[:16]
    start_at = _now_iso()
    raw = spec.path.read_bytes()

    extraction = _extract_pdf(spec.path, ocr_max_pages=ocr_max_pages)
    extraction_stats = _extraction_text_stats(extraction.text_pages)
    page_lines = list(_iter_lines(extraction.text_pages))
    table_lines = _table_rows_to_lines(extraction.table_rows)

    regex_candidates = _parse_rules_from_lines(
        list(page_lines) + list(table_lines),
        job_id=job_id,
        approve_threshold=approve_threshold,
    )
    sections = _extract_sections(extraction.text_pages)
    toc_sections = _extract_sections_from_toc_pages(extraction.text_pages)
    if toc_sections:
        sections = _merge_sections(toc_sections, sections)
    quality = _sections_quality(sections)
    # Fallback: when primary extraction returns appendix-dominant or near-empty headings,
    # run a looser heading scan to recover chapter/section structure.
    if quality["chapter"] == 0 and quality["section"] == 0:
        loose_sections = _extract_sections_loose(extraction.text_pages)
        if toc_sections:
            loose_sections = _merge_sections(toc_sections, loose_sections)
        loose_quality = _sections_quality(loose_sections)
        if loose_quality["chapter"] > 0 or loose_quality["section"] > 0 or loose_quality["clause"] > quality["clause"]:
            sections = loose_sections
            quality = loose_quality
    formulas = _extract_formulas(extraction.text_pages)
    terms = _extract_terms(extraction.text_pages)
    table_structured: List[Dict[str, Any]] = []

    ai_preprocess = _run_ai_preprocess(extraction, ai_options)
    ai_candidates: List[Dict[str, Any]] = []
    ai_clause_tree: Dict[str, Any] = {}
    if ai_preprocess.get("used"):
        ai_sections = ai_preprocess.get("sections", [])
        ai_clause_tree = ai_preprocess.get("clause_tree", {}) if isinstance(ai_preprocess.get("clause_tree", {}), dict) else {}
        ai_tables = ai_preprocess.get("tables", [])
        ai_formulas = ai_preprocess.get("formulas", [])
        ai_terms = ai_preprocess.get("terms", [])
        ai_items = ai_preprocess.get("measurement_items", [])

        if isinstance(ai_sections, list) and ai_sections:
            sections = [item for item in ai_sections if isinstance(item, dict)]
        if isinstance(ai_formulas, list) and ai_formulas:
            formulas = [item for item in ai_formulas if isinstance(item, dict)]
        if isinstance(ai_terms, list) and ai_terms:
            normalized_terms: List[Dict[str, Any]] = []
            for term in ai_terms:
                if not isinstance(term, dict):
                    continue
                normalized_terms.append(
                    {
                        "term": str(term.get("source_term", term.get("term", ""))).strip(),
                        "standard_term": str(term.get("standard_term", "")).strip(),
                        "definition": str(term.get("definition", "")).strip(),
                        "confidence": _safe_float(term.get("confidence"), 0.8),
                    }
                )
            terms = normalized_terms
        if isinstance(ai_tables, list):
            table_structured = [item for item in ai_tables if isinstance(item, dict)]
        if isinstance(ai_items, list) and ai_items:
            ai_candidates = _build_candidates_from_ai_items(ai_items, job_id=job_id, approve_threshold=approve_threshold)

    clause_tree = ai_clause_tree if ai_clause_tree.get("nodes") else _build_clause_tree(sections)
    candidates = _merge_candidates(ai_candidates, regex_candidates) if ai_candidates else regex_candidates

    summary: Dict[str, int] = {"pending": 0, "approved": 0, "rejected": 0}
    for cand in candidates:
        status = str(cand.get("status", "pending"))
        summary[status] = summary.get(status, 0) + 1

    parse_failure_reasons: List[str] = []
    if not extraction.text_pages:
        status = "failed"
        parse_failure_reasons.append("extract_no_text")
    elif candidates:
        status = "completed" if summary.get("pending", 0) == 0 else "review_required"
    else:
        status = "review_required"
    if _looks_like_low_quality_text(extraction.text_pages):
        parse_failure_reasons.append("extract_low_quality")
    if quality["chapter"] == 0 and quality["section"] == 0:
        parse_failure_reasons.append("sections_missing_structure")
    if not candidates:
        parse_failure_reasons.append("no_candidate_rules")

    return {
        "job_id": job_id,
        "std_code": spec.std_code,
        "title": spec.title,
        "level": spec.level,
        "file_name": spec.path.name,
        "file_hash": _sha256_bytes(raw),
        "status": status,
        "created_at": start_at,
        "updated_at": _now_iso(),
        "completed_at": _now_iso(),
        "warnings": extraction.warnings,
        "parser": extraction.parser,
        "extraction_stats": extraction_stats,
        "parse_failure_reasons": parse_failure_reasons,
        "sections": sections,
        "sections_quality": quality,
        "toc_sections_count": len(toc_sections),
        "clause_tree": clause_tree,
        "clause_tree_stats": clause_tree.get("stats", {}),
        "table_count": len(extraction.table_rows),
        "table_structured_count": len(table_structured),
        "table_structured": table_structured,
        "formula_count": len(formulas),
        "term_count": len(terms),
        "formulas": formulas,
        "terms": terms,
        "candidates": candidates,
        "source_text_preview": "\n".join(extraction.text_pages[:2])[:2000],
        "status_summary": summary,
        "auto_approved_count": summary.get("approved", 0),
        "ai_preprocess": {
            "enabled": bool(ai_preprocess.get("enabled")),
            "used": bool(ai_preprocess.get("used")),
            "model": ai_preprocess.get("model", ""),
            "duration_ms": ai_preprocess.get("duration_ms", 0),
            "warnings": ai_preprocess.get("warnings", []),
            "ai_candidate_count": len(ai_candidates),
            "ai_clause_node_count": len(ai_clause_tree.get("nodes", [])) if isinstance(ai_clause_tree, dict) else 0,
            "http_status": int(ai_preprocess.get("http_status", 0) or 0),
            "error": str(ai_preprocess.get("error", "")),
        },
    }


def _parse_spec_arg(raw: str) -> IngestSpec:
    # spec format: path|std_code|level|title
    parts = raw.split("|")
    if len(parts) < 2:
        raise ValueError("spec 闇€瑕佹牸寮忥細path|std_code|level|title")
    path = Path(parts[0]).expanduser().resolve()
    std_code = parts[1].strip() or _normalize_std_code_from_name(path)
    level = parts[2].strip() if len(parts) > 2 and parts[2].strip() else "industry"
    title = parts[3].strip() if len(parts) > 3 else ""
    return IngestSpec(path=path, std_code=std_code, level=level, title=title)


def _collect_default_specs() -> List[IngestSpec]:
    specs: List[IngestSpec] = []
    for directory in DEFAULT_INPUT_DIRS:
        if not directory.exists():
            continue
        for pdf in sorted(directory.rglob("*.pdf")):
            specs.append(
                IngestSpec(
                    path=pdf.resolve(),
                    std_code=_normalize_std_code_from_name(pdf),
                    level="industry",
                    title="",
                )
            )
    return specs


def _collect_specs(inputs: Sequence[str], specs_raw: Sequence[str]) -> List[IngestSpec]:
    collected: List[IngestSpec] = []
    for value in specs_raw:
        parsed = _parse_spec_arg(value)
        collected.append(parsed)

    for item in inputs:
        path = Path(item).expanduser().resolve()
        collected.append(
            IngestSpec(
                path=path,
                std_code=_normalize_std_code_from_name(path),
                level="industry",
                title="",
            )
        )

    if not collected:
        collected.extend(_collect_default_specs())

    # Stable dedupe by absolute path.
    deduped: Dict[str, IngestSpec] = {}
    for spec in collected:
        deduped[str(spec.path)] = spec
    return list(deduped.values())


def _write_report(path: Path, report: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NormRef PDF ingest batch parser (minimal)")
    parser.add_argument(
        "--input",
        action="append",
        default=[],
        help="PDF path, can be repeated. Example: --input /path/to/JTG-F80-1-2017.pdf",
    )
    parser.add_argument(
        "--spec",
        action="append",
        default=[],
        help="Custom spec entry: path|std_code|level|title",
    )
    parser.add_argument("--publish", action="store_true", help="Publish approved candidates as versioned rule records")
    parser.add_argument("--write-to-docs", action="store_true", help="Write published rules to docs/normref/rule/imported")
    parser.add_argument("--version-tag", default=datetime.now().strftime("%Y-%m"), help="Rule version tag, e.g. 2026-04")
    parser.add_argument("--approve-threshold", type=float, default=0.75, help="Auto-approve confidence threshold")
    parser.add_argument(
        "--ocr-max-pages",
        type=int,
        default=0,
        help="Max pages for OCR fallback. Set 0 to process full PDF.",
    )
    parser.add_argument("--output", default=str(DEFAULT_REPORT_PATH), help="Path to ingest report json output")
    parser.add_argument("--rule-root", default=str(DEFAULT_RULE_ROOT), help="Output root for published rule JSON files")
    parser.add_argument("--ai-preprocess", action="store_true", help="Enable LLM preprocessing for sections/tables/formulas/terms")
    parser.add_argument(
        "--ai-model",
        default=os.getenv("NORMPEG_AI_MODEL", "deepseek-chat"),
        help="LLM model name for ai preprocess",
    )
    parser.add_argument(
        "--ai-base-url",
        default=os.getenv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1"),
        help="OpenAI-compatible base URL (Ollama local default: http://127.0.0.1:11434/v1)",
    )
    parser.add_argument("--ai-max-pages", type=int, default=20, help="Max pages passed to ai preprocess")
    parser.add_argument("--ai-max-chars", type=int, default=25000, help="Max chars passed to ai preprocess prompt")
    parser.add_argument("--ai-timeout-sec", type=int, default=90, help="Timeout seconds for ai preprocess request")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    specs = _collect_specs(args.input, args.spec)
    missing = [spec for spec in specs if not spec.path.exists()]
    specs = [spec for spec in specs if spec.path.exists()]

    if not specs:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "no_input_pdf_found",
                    "hint": "璇风敤 --input 鎸囧畾 PDF锛屾垨灏?PDF 鏀惧埌 standards/raw銆乨ocs/normref/std/raw銆乮nputs/standards",
                    "missing_specs": [str(item.path) for item in missing],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 2

    ai_options = AIPreprocessOptions(
        enabled=bool(args.ai_preprocess),
        model=str(args.ai_model),
        base_url=str(args.ai_base_url),
        max_pages=int(args.ai_max_pages),
        max_chars=int(args.ai_max_chars),
        timeout_sec=int(args.ai_timeout_sec),
    )

    jobs: List[Dict[str, Any]] = []
    for spec in specs:
        jobs.append(
            _build_job(
                spec,
                approve_threshold=args.approve_threshold,
                ocr_max_pages=args.ocr_max_pages,
                ai_options=ai_options,
            )
        )

    published: List[Dict[str, Any]] = []
    if args.publish:
        rule_root = Path(args.rule_root).resolve()
        for job in jobs:
            published.append(
                _publish_rules(
                    job,
                    version_tag=args.version_tag,
                    write_to_docs=bool(args.write_to_docs),
                    rule_root=rule_root,
                )
            )

    report_jobs: List[Dict[str, Any]] = []
    for spec, job in zip(specs, jobs):
        row: Dict[str, Any] = {
            "input_file": str(spec.path),
            "job": job,
            "approved_count": int(job.get("status_summary", {}).get("approved", 0)),
            "publish": {},
        }
        if args.publish:
            pub = next((p for p in published if p.get("job_id") == job.get("job_id")), None)
            row["publish"] = pub or {}
        report_jobs.append(row)

    ok = all(str(job.get("status", "")) in {"completed", "review_required"} for job in jobs)
    report: Dict[str, Any] = {
        "ok": ok,
        "generated_at": _now_iso(),
        "input_count": len(specs),
        "publish_enabled": bool(args.publish),
        "write_to_docs": bool(args.write_to_docs),
        "ai_preprocess_enabled": bool(args.ai_preprocess),
        "ai_model": str(args.ai_model),
        "jobs": report_jobs,
    }
    if missing:
        report["missing_inputs"] = [str(item.path) for item in missing]

    output_path = Path(args.output).expanduser().resolve()
    _write_report(output_path, report)
    output_text = json.dumps(report, ensure_ascii=False, indent=2)
    try:
        print(output_text)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((output_text + "\n").encode("utf-8", errors="replace"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
