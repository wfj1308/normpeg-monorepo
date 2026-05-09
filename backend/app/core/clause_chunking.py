from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Sequence


_CLAUSE_ID_PATTERN = r"\d+(?:\.\d+){1,4}"
_MARKDOWN_HEADING_PATTERN = re.compile(r"^\s{0,3}#{1,6}\s+(?P<text>.+?)\s*$")
_CN_CLAUSE_HEAD_PATTERN = re.compile(rf"^\s*第(?P<id>{_CLAUSE_ID_PATTERN})条(?:\s*[:：、.\)\-]?\s*(?P<title>.*))?\s*$")
_DIRECT_CLAUSE_PREFIX_PATTERN = re.compile(rf"^\s*(?P<id>{_CLAUSE_ID_PATTERN})(?P<rest>.*)$")

_DOMAIN_KEYWORDS = [
    "压实度",
    "路基",
    "实测项目",
    "弯沉",
    "厚度",
    "含水量",
    "压实",
    "检测",
    "质量",
    "检验",
    "评定",
    "允许偏差",
    "施工",
    "试验",
    "规范",
    "条款",
]


def normalize_normdoc_id(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError("normdoc_id is required")
    if "@@" in text:
        return text
    normalized = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-")
    return normalized.upper() or text


def chunk_markdown_clauses(markdown_text: str, *, normdoc_id: str) -> List[Dict[str, Any]]:
    return _chunk_clauses(
        pages=[(1, str(markdown_text or ""))],
        normdoc_id=normdoc_id,
        source="markdown",
    )


def chunk_pdf_text_clauses(
    raw_text: str,
    *,
    normdoc_id: str,
    page_texts: Sequence[str] | None = None,
) -> List[Dict[str, Any]]:
    pages: list[tuple[int, str]] = []
    if page_texts:
        for page_no, text in enumerate(page_texts, start=1):
            pages.append((page_no, str(text or "")))
    else:
        pages.append((1, str(raw_text or "")))
    return _chunk_clauses(pages=pages, normdoc_id=normdoc_id, source="pdf")


def _chunk_clauses(
    *,
    pages: Iterable[tuple[int, str]],
    normdoc_id: str,
    source: str,
) -> List[Dict[str, Any]]:
    resolved_normdoc_id = normalize_normdoc_id(normdoc_id)
    chunks: list[Dict[str, Any]] = []
    current: Dict[str, Any] | None = None

    for page_no, page_text in pages:
        lines = str(page_text or "").splitlines()
        for line in lines:
            clause_head = _detect_clause_head(line, source=source)
            if clause_head is not None:
                if current is not None:
                    chunks.append(_finalize_chunk(current, normdoc_id=resolved_normdoc_id))
                current = {
                    "clause": clause_head["clause"],
                    "title": clause_head["title"] or clause_head["clause"],
                    "page": int(page_no),
                    "lines": [line],
                }
                continue
            if current is not None:
                current["lines"].append(line)

    if current is not None:
        chunks.append(_finalize_chunk(current, normdoc_id=resolved_normdoc_id))
    return chunks


def _detect_clause_head(line: str, *, source: str) -> Dict[str, str] | None:
    stripped = str(line or "").strip()
    if not stripped:
        return None

    candidates = [stripped]
    if source == "markdown":
        heading_match = _MARKDOWN_HEADING_PATTERN.match(line)
        if heading_match:
            heading_text = str(heading_match.group("text") or "").strip()
            if heading_text:
                candidates.insert(0, heading_text)

    for candidate in candidates:
        parsed = _parse_clause_head_text(candidate)
        if parsed is not None:
            return parsed
    return None


def _parse_clause_head_text(text: str) -> Dict[str, str] | None:
    cn_matched = _CN_CLAUSE_HEAD_PATTERN.match(text)
    if cn_matched:
        clause = str(cn_matched.group("id") or "").strip()
        if clause:
            title = str(cn_matched.group("title") or "").strip()
            title = re.sub(r"^[：:、.\)\-(\s]+", "", title).strip()
            return {"clause": clause, "title": title}

    direct_matched = _DIRECT_CLAUSE_PREFIX_PATTERN.match(text)
    if direct_matched:
        clause = str(direct_matched.group("id") or "").strip()
        rest = str(direct_matched.group("rest") or "")
        if clause and (not rest or rest[:1].isspace() or rest[:1] in ":：、.)-"):
            title = rest.strip()
            title = re.sub(r"^[：:、.\)\-(\s]+", "", title).strip()
            return {"clause": clause, "title": title}
    return None


def _finalize_chunk(chunk_state: Dict[str, Any], *, normdoc_id: str) -> Dict[str, Any]:
    content_lines = chunk_state.get("lines")
    content = "\n".join(content_lines) if isinstance(content_lines, list) else ""
    title = str(chunk_state.get("title") or "").strip()
    clause = str(chunk_state.get("clause") or "").strip()
    keywords = _extract_keywords(title=title, content=content)
    return {
        "clause": clause,
        "title": title or clause,
        "content": content,
        "normdoc_id": normdoc_id,
        "page": int(chunk_state.get("page") or 1),
        "keywords": keywords,
    }


def _extract_keywords(*, title: str, content: str, max_keywords: int = 8) -> list[str]:
    merged = f"{title}\n{content}"
    seen: set[str] = set()
    keywords: list[str] = []

    if title:
        clean_title = re.sub(rf"^{_CLAUSE_ID_PATTERN}\s*", "", title).strip()
        if clean_title:
            keywords.append(clean_title)
            seen.add(clean_title)

    for term in _DOMAIN_KEYWORDS:
        if term in merged and term not in seen:
            keywords.append(term)
            seen.add(term)
        if len(keywords) >= max_keywords:
            return keywords[:max_keywords]

    for token in re.findall(r"[A-Za-z]{3,}", merged):
        normalized = token.lower()
        if normalized in seen:
            continue
        keywords.append(normalized)
        seen.add(normalized)
        if len(keywords) >= max_keywords:
            break

    return keywords[:max_keywords]
