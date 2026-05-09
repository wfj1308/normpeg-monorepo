from __future__ import annotations

import hashlib
import math
import os
import re
from typing import Any, Dict, List

_EXPLANATION_NOTICE = "辅助说明，不作为判定依据"

_DEFAULT_PUBLISHED_CLAUSES: list[dict[str, Any]] = [
    {
        "clause_no": "4.2.1",
        "title": "路基压实度",
        "content": "路基压实度应符合表4.2.1的规定，实测项目包含压实度、抽检频率和代表值判定。",
        "normdoc_id": "JTG-F80-1-2017",
        "standard_code": "JTG-F80-1-2017",
        "version": "v1",
        "keywords": ["压实度", "路基", "实测项目"],
        "publish_status": "published",
    },
    {
        "clause_no": "4.2.2",
        "title": "路基弯沉",
        "content": "路基弯沉应符合表4.2.2的规定，代表值应按规定统计方法计算。",
        "normdoc_id": "JTG-F80-1-2017",
        "standard_code": "JTG-F80-1-2017",
        "version": "v1",
        "keywords": ["弯沉", "路基", "实测项目"],
        "publish_status": "published",
    },
    {
        "clause_no": "4.2.3",
        "title": "路基厚度",
        "content": "路基厚度应符合表4.2.3的规定，厚度偏差应控制在允许范围内。",
        "normdoc_id": "JTG-F80-1-2017",
        "standard_code": "JTG-F80-1-2017",
        "version": "v1",
        "keywords": ["厚度", "路基", "实测项目"],
        "publish_status": "published",
    },
]


def normalize_standard_code(value: str) -> str:
    text = str(value or "").strip()
    normalized = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-")
    return normalized.upper()


def _normalize_normdoc_token(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def _extract_clause_code(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    matched = re.search(r"\d+(?:\.\d+)+", text)
    if matched:
        return matched.group(0)
    return text


def _clause_no_sort_key(value: str) -> tuple[int, tuple[int, ...], str]:
    clause_no = _extract_clause_code(value)
    numeric_parts = [int(item) for item in re.findall(r"\d+", clause_no)]
    if numeric_parts:
        return (0, tuple(numeric_parts), clause_no.lower())
    return (1, tuple(), clause_no.lower())


def _same_clause_identity(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_id = str(left.get("clause_id") or "").strip()
    right_id = str(right.get("clause_id") or "").strip()
    if left_id and right_id and left_id == right_id:
        return True
    left_no = _extract_clause_code(left.get("clause_no"))
    right_no = _extract_clause_code(right.get("clause_no"))
    return bool(left_no and right_no and left_no == right_no)


def _tokenize_text(value: str) -> list[str]:
    text = str(value or "").strip().lower()
    if not text:
        return []
    tokens = re.findall(r"[A-Za-z0-9\u4e00-\u9fff]+", text)
    if tokens:
        return tokens
    return [text]


def _bm25_like_score(
    *,
    term: str,
    tf: int,
    doc_len: int,
    avg_doc_len: float,
    doc_freq: int,
    total_docs: int,
    k1: float = 1.2,
    b: float = 0.75,
) -> float:
    if tf <= 0 or total_docs <= 0:
        return 0.0
    idf = math.log(1.0 + (total_docs - doc_freq + 0.5) / (doc_freq + 0.5))
    norm = tf * (k1 + 1.0)
    denom = tf + k1 * (1.0 - b + b * (doc_len / max(avg_doc_len, 1e-6)))
    return float(idf * (norm / max(denom, 1e-6)))


class ClauseSearchService:
    def __init__(
        self,
        default_clauses: List[Dict[str, Any]] | None = None,
        *,
        vector_backend: str | None = None,
        embedding_dim: int = 256,
    ) -> None:
        self._default_clauses = [dict(item) for item in (default_clauses or _DEFAULT_PUBLISHED_CLAUSES)]
        self._runtime_clauses: list[dict[str, Any]] = []
        requested_backend = str(vector_backend or os.getenv("CLAUSE_VECTOR_BACKEND", "memory")).strip().lower()
        self._vector_backend = requested_backend if requested_backend in {"memory"} else "memory"
        self._embedding_dim = max(32, int(embedding_dim or 256))
        self._semantic_index_signature = ""
        self._semantic_vectors: dict[str, tuple[list[float], dict[str, Any]]] = {}

    def clear_runtime_clauses(self) -> None:
        self._runtime_clauses = []
        self._semantic_index_signature = ""
        self._semantic_vectors = {}

    def add_runtime_clause(self, clause: Dict[str, Any]) -> None:
        if isinstance(clause, dict):
            self._runtime_clauses.append(dict(clause))
            self._semantic_index_signature = ""

    @property
    def vector_backend(self) -> str:
        return self._vector_backend

    def search(
        self,
        *,
        query: str,
        standard_code: str | None = None,
        version: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        query_text = str(query or "").strip()
        if not query_text:
            return []

        normalized_standard_filter = normalize_standard_code(standard_code or "") if standard_code else ""
        normalized_version_filter = str(version or "").strip().lower()
        query_terms = self._build_query_terms(query_text)
        if not query_terms:
            return []

        corpus = [self._normalize_clause(item) for item in self._all_clauses()]
        searchable_docs: list[dict[str, Any]] = []
        for item in corpus:
            if str(item.get("publish_status", "")).strip().lower() != "published":
                continue
            if normalized_standard_filter and normalize_standard_code(str(item.get("standard_code") or "")) != normalized_standard_filter:
                continue
            if normalized_version_filter and str(item.get("version") or "").strip().lower() != normalized_version_filter:
                continue
            searchable_docs.append(item)

        if not searchable_docs:
            return []

        doc_lengths = [len(_tokenize_text(self._composed_text(item))) for item in searchable_docs]
        avg_doc_len = sum(doc_lengths) / max(len(doc_lengths), 1)
        term_doc_freq: dict[str, int] = {}
        for term in query_terms:
            term_low = term.lower()
            term_doc_freq[term_low] = sum(1 for item in searchable_docs if term_low in self._composed_text(item).lower())

        results: list[dict[str, Any]] = []
        for index, item in enumerate(searchable_docs):
            raw_score = self._score_clause(
                query_text=query_text,
                query_terms=query_terms,
                clause=item,
                doc_len=doc_lengths[index] if index < len(doc_lengths) else 1,
                avg_doc_len=avg_doc_len,
                total_docs=len(searchable_docs),
                term_doc_freq=term_doc_freq,
            )
            if raw_score <= 0:
                continue
            score = round(raw_score / (raw_score + 3.0), 4)
            results.append(
                {
                    "clause_id": str(item.get("clause_id") or item.get("clause_no") or ""),
                    "clause_no": str(item.get("clause_no") or ""),
                    "title": str(item.get("title") or ""),
                    "content": str(item.get("content") or ""),
                    "explanation": str(item.get("explanation") or "").strip() or None,
                    "risk_note": str(item.get("risk_note") or "").strip() or None,
                    "related_terms": [str(entry) for entry in item.get("related_terms", []) if isinstance(entry, str) and str(entry).strip()],
                    "generated_by_ai": bool(item.get("generated_by_ai")),
                    "marked_reviewed": bool(item.get("marked_reviewed")),
                    "explanation_notice": _EXPLANATION_NOTICE,
                    "standard_code": str(item.get("standard_code") or ""),
                    "normdoc_id": str(item.get("normdoc_id") or ""),
                    "version": str(item.get("version") or ""),
                    "score": score,
                }
            )

        ranked = sorted(
            results,
            key=lambda row: (
                float(row.get("score") or 0.0),
                str(row.get("clause_no") or ""),
            ),
            reverse=True,
        )
        return ranked[: max(1, int(limit or 20))]

    def semantic_search(
        self,
        *,
        query: str,
        standard_code: str | None = None,
        version: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        query_text = str(query or "").strip()
        if not query_text:
            return []

        normalized_standard_filter = normalize_standard_code(standard_code or "") if standard_code else ""
        normalized_version_filter = str(version or "").strip().lower()

        corpus = [self._normalize_clause(item) for item in self._all_clauses()]
        published_docs = [
            item
            for item in corpus
            if str(item.get("publish_status", "")).strip().lower() == "published"
        ]
        if not published_docs:
            return []

        self._ensure_semantic_index(published_docs)
        query_vector = self._embed_text(query_text)
        if not query_vector:
            return []

        semantic_rows: list[dict[str, Any]] = []
        for _, (doc_vector, clause) in self._semantic_vectors.items():
            if normalized_standard_filter and normalize_standard_code(str(clause.get("standard_code") or "")) != normalized_standard_filter:
                continue
            if normalized_version_filter and str(clause.get("version") or "").strip().lower() != normalized_version_filter:
                continue
            cosine_score = self._cosine_similarity(query_vector, doc_vector)
            if cosine_score <= 0:
                continue
            semantic_rows.append(
                {
                    "clause_id": str(clause.get("clause_id") or clause.get("clause_no") or ""),
                    "clause_no": str(clause.get("clause_no") or ""),
                    "title": str(clause.get("title") or ""),
                    "content": str(clause.get("content") or ""),
                    "explanation": str(clause.get("explanation") or "").strip() or None,
                    "risk_note": str(clause.get("risk_note") or "").strip() or None,
                    "related_terms": [str(entry) for entry in clause.get("related_terms", []) if isinstance(entry, str) and str(entry).strip()],
                    "generated_by_ai": bool(clause.get("generated_by_ai")),
                    "marked_reviewed": bool(clause.get("marked_reviewed")),
                    "explanation_notice": _EXPLANATION_NOTICE,
                    "standard_code": str(clause.get("standard_code") or ""),
                    "normdoc_id": str(clause.get("normdoc_id") or ""),
                    "version": str(clause.get("version") or ""),
                    "score": round(min(1.0, cosine_score), 4),
                }
            )
        ranked = sorted(
            semantic_rows,
            key=lambda row: (
                float(row.get("score") or 0.0),
                str(row.get("clause_no") or ""),
            ),
            reverse=True,
        )
        return ranked[: max(1, int(limit or 20))]

    def get_clause(
        self,
        *,
        clause_id: str,
        normdoc_id: str | None = None,
        version: str | None = None,
        standard_code: str | None = None,
    ) -> dict[str, Any] | None:
        target_clause_id = str(clause_id or "").strip()
        if not target_clause_id:
            return None

        corpus = [self._normalize_clause(item) for item in self._all_clauses()]
        published_docs = [
            item
            for item in corpus
            if str(item.get("publish_status", "")).strip().lower() == "published"
        ]
        if not published_docs:
            return None

        normalized_normdoc_filter = _normalize_normdoc_token(normdoc_id)
        normalized_standard_filter = normalize_standard_code(standard_code or "") if standard_code else ""
        normalized_version_filter = str(version or "").strip().lower()
        filtered_docs = []
        for item in published_docs:
            if normalized_normdoc_filter and _normalize_normdoc_token(item.get("normdoc_id")) != normalized_normdoc_filter:
                continue
            if normalized_standard_filter and normalize_standard_code(str(item.get("standard_code") or "")) != normalized_standard_filter:
                continue
            if normalized_version_filter and str(item.get("version") or "").strip().lower() != normalized_version_filter:
                continue
            filtered_docs.append(item)
        if not filtered_docs:
            return None

        target = self._find_target_clause(filtered_docs, target_clause_id)
        if target is None:
            return None
        return self._build_clause_row(target)

    def get_neighbors(
        self,
        *,
        clause_id: str,
        normdoc_id: str | None = None,
        version: str | None = None,
    ) -> dict[str, dict[str, Any] | None] | None:
        target_clause_id = str(clause_id or "").strip()
        if not target_clause_id:
            return None

        corpus = [self._normalize_clause(item) for item in self._all_clauses()]
        published_docs = [
            item
            for item in corpus
            if str(item.get("publish_status", "")).strip().lower() == "published"
        ]
        if not published_docs:
            return None

        normalized_normdoc_filter = _normalize_normdoc_token(normdoc_id)
        normalized_version_filter = str(version or "").strip().lower()
        filtered_docs = [
            item
            for item in published_docs
            if (
                (not normalized_normdoc_filter or _normalize_normdoc_token(item.get("normdoc_id")) == normalized_normdoc_filter)
                and (not normalized_version_filter or str(item.get("version") or "").strip().lower() == normalized_version_filter)
            )
        ]
        if not filtered_docs:
            return None

        target = self._find_target_clause(filtered_docs, target_clause_id)
        if target is None:
            return None

        resolved_normdoc = _normalize_normdoc_token(target.get("normdoc_id"))
        resolved_version = str(target.get("version") or "").strip().lower()
        sibling_docs = [
            item
            for item in filtered_docs
            if (
                _normalize_normdoc_token(item.get("normdoc_id")) == resolved_normdoc
                and str(item.get("version") or "").strip().lower() == resolved_version
            )
        ]
        if not sibling_docs:
            sibling_docs = [target]

        ordered_docs = sorted(
            sibling_docs,
            key=lambda item: (
                _clause_no_sort_key(str(item.get("clause_no") or item.get("clause_id") or "")),
                str(item.get("clause_id") or ""),
            ),
        )
        target_index = next(
            (
                index
                for index, item in enumerate(ordered_docs)
                if _same_clause_identity(item, target)
            ),
            -1,
        )
        if target_index < 0:
            return None

        previous_item = ordered_docs[target_index - 1] if target_index > 0 else None
        next_item = ordered_docs[target_index + 1] if target_index < len(ordered_docs) - 1 else None
        return {
            "current": self._build_clause_row(ordered_docs[target_index]),
            "previous": self._build_clause_row(previous_item) if isinstance(previous_item, dict) else None,
            "next": self._build_clause_row(next_item) if isinstance(next_item, dict) else None,
        }

    def _all_clauses(self) -> list[dict[str, Any]]:
        return [*self._default_clauses, *self._runtime_clauses]

    def _ensure_semantic_index(self, clauses: list[dict[str, Any]]) -> None:
        signature = self._build_semantic_signature(clauses)
        if signature and signature == self._semantic_index_signature:
            return
        next_vectors: dict[str, tuple[list[float], dict[str, Any]]] = {}
        for clause in clauses:
            clause_id = str(clause.get("clause_id") or clause.get("clause_no") or "").strip()
            if not clause_id:
                continue
            semantic_id = self._build_semantic_doc_id(clause)
            vector = self._embed_text(self._semantic_document_text(clause))
            if not vector:
                continue
            next_vectors[semantic_id] = (vector, dict(clause))
        self._semantic_vectors = next_vectors
        self._semantic_index_signature = signature

    @staticmethod
    def _build_semantic_doc_id(clause: dict[str, Any]) -> str:
        normdoc = str(clause.get("normdoc_id") or "").strip()
        version = str(clause.get("version") or "").strip()
        clause_id = str(clause.get("clause_id") or clause.get("clause_no") or "").strip()
        return f"{normdoc}::{version}::{clause_id}"

    def _build_semantic_signature(self, clauses: list[dict[str, Any]]) -> str:
        if not clauses:
            return ""
        digest = hashlib.sha256()
        ordered = sorted(
            clauses,
            key=lambda row: (
                str(row.get("normdoc_id") or ""),
                str(row.get("version") or ""),
                str(row.get("clause_id") or row.get("clause_no") or ""),
            ),
        )
        for clause in ordered:
            digest.update(str(clause.get("normdoc_id") or "").encode("utf-8", errors="ignore"))
            digest.update(b"\x1f")
            digest.update(str(clause.get("version") or "").encode("utf-8", errors="ignore"))
            digest.update(b"\x1f")
            digest.update(str(clause.get("clause_id") or clause.get("clause_no") or "").encode("utf-8", errors="ignore"))
            digest.update(b"\x1f")
            digest.update(str(clause.get("title") or "").encode("utf-8", errors="ignore"))
            digest.update(b"\x1f")
            digest.update(str(clause.get("content") or "").encode("utf-8", errors="ignore"))
            digest.update(b"\x1f")
            keywords = clause.get("keywords")
            if isinstance(keywords, list):
                for entry in keywords:
                    digest.update(str(entry or "").encode("utf-8", errors="ignore"))
                    digest.update(b"\x1e")
            digest.update(b"\x1d")
        return digest.hexdigest()

    @staticmethod
    def _semantic_document_text(item: Dict[str, Any]) -> str:
        keyword_text = " ".join(item.get("keywords", [])) if isinstance(item.get("keywords"), list) else ""
        related_terms = " ".join(item.get("related_terms", [])) if isinstance(item.get("related_terms"), list) else ""
        return (
            f"{item.get('clause_no', '')}\n"
            f"{item.get('title', '')}\n"
            f"{keyword_text}\n"
            f"{related_terms}\n"
            f"{item.get('content', '')}"
        ).strip()

    def _embed_text(self, text: str) -> list[float]:
        cleaned = str(text or "").strip().lower()
        if not cleaned:
            return []
        vector = [0.0 for _ in range(self._embedding_dim)]
        tokens = self._tokenize_for_semantic_embedding(cleaned)
        if not tokens:
            return []
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8", errors="ignore")).digest()
            index = int.from_bytes(digest[:4], byteorder="big", signed=False) % self._embedding_dim
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign
        norm = math.sqrt(sum(value * value for value in vector))
        if norm <= 1e-9:
            return []
        return [value / norm for value in vector]

    @staticmethod
    def _tokenize_for_semantic_embedding(value: str) -> list[str]:
        base_tokens = _tokenize_text(value)
        if not base_tokens:
            return []
        expanded: list[str] = []
        for token in base_tokens:
            normalized = str(token or "").strip().lower()
            if not normalized:
                continue
            expanded.append(normalized)
            if re.search(r"[\u4e00-\u9fff]", normalized):
                chars = [char for char in normalized if re.match(r"[\u4e00-\u9fff]", char)]
                for size in (2, 3):
                    if len(chars) < size:
                        continue
                    for index in range(0, len(chars) - size + 1):
                        expanded.append("".join(chars[index:index + size]))
        return expanded

    @staticmethod
    def _cosine_similarity(left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return 0.0
        dot = sum(a * b for a, b in zip(left, right))
        if dot <= 0:
            return 0.0
        return float(max(0.0, min(1.0, dot)))

    @staticmethod
    def _find_target_clause(clauses: list[dict[str, Any]], clause_id: str) -> dict[str, Any] | None:
        normalized_id = str(clause_id or "").strip().lower()
        normalized_code = _extract_clause_code(clause_id).lower()
        for item in clauses:
            item_clause_id = str(item.get("clause_id") or "").strip().lower()
            item_clause_no = str(item.get("clause_no") or "").strip().lower()
            item_code = _extract_clause_code(item_clause_no).lower()
            if normalized_id and (normalized_id == item_clause_id or normalized_id == item_clause_no):
                return item
            if normalized_code and (normalized_code == item_code or normalized_code == item_clause_no):
                return item
        return None

    @staticmethod
    def _build_clause_row(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "clause_id": str(item.get("clause_id") or item.get("clause_no") or ""),
            "clause_no": str(item.get("clause_no") or item.get("clause_id") or ""),
            "title": str(item.get("title") or ""),
            "content": str(item.get("content") or ""),
            "explanation": str(item.get("explanation") or "").strip() or None,
            "risk_note": str(item.get("risk_note") or "").strip() or None,
            "related_terms": [str(entry) for entry in item.get("related_terms", []) if isinstance(entry, str) and str(entry).strip()],
            "generated_by_ai": bool(item.get("generated_by_ai")),
            "marked_reviewed": bool(item.get("marked_reviewed")),
            "explanation_notice": _EXPLANATION_NOTICE,
            "standard_code": str(item.get("standard_code") or ""),
            "normdoc_id": str(item.get("normdoc_id") or ""),
            "version": str(item.get("version") or ""),
            "page": int(item.get("page") or 1) if isinstance(item.get("page"), int) else 1,
            "keywords": [str(entry) for entry in item.get("keywords", []) if isinstance(entry, str)],
        }

    @staticmethod
    def _normalize_clause(raw: Dict[str, Any]) -> dict[str, Any]:
        keywords_raw = raw.get("keywords")
        keywords = [str(item).strip() for item in keywords_raw if str(item).strip()] if isinstance(keywords_raw, list) else []
        clause_id = str(raw.get("clause_id") or raw.get("id") or raw.get("clause") or raw.get("clause_no") or "").strip()
        clause_no = str(raw.get("clause_no") or raw.get("clause") or raw.get("id") or "").strip()
        standard_code = str(raw.get("standard_code") or "").strip()
        normdoc_id = str(raw.get("normdoc_id") or raw.get("normdocId") or "").strip() or standard_code
        page_raw = raw.get("page")
        page = int(page_raw) if isinstance(page_raw, int) and page_raw > 0 else 1
        return {
            "clause_id": clause_id or clause_no,
            "clause_no": clause_no or clause_id,
            "title": str(raw.get("title") or "").strip(),
            "content": str(raw.get("content") or raw.get("text") or "").strip(),
            "explanation": str(raw.get("explanation") or "").strip() or None,
            "risk_note": str(raw.get("risk_note") or "").strip() or None,
            "related_terms": [
                str(entry).strip()
                for entry in raw.get("related_terms", [])
                if isinstance(entry, str) and str(entry).strip()
            ]
            if isinstance(raw.get("related_terms"), list)
            else [],
            "generated_by_ai": bool(raw.get("generated_by_ai")),
            "marked_reviewed": bool(raw.get("marked_reviewed")),
            "standard_code": standard_code,
            "normdoc_id": normdoc_id,
            "version": str(raw.get("version") or "").strip(),
            "page": page,
            "keywords": keywords,
            "publish_status": str(raw.get("publish_status") or raw.get("status") or "draft").strip().lower(),
        }

    @staticmethod
    def _composed_text(item: Dict[str, Any]) -> str:
        keyword_text = " ".join(item.get("keywords", [])) if isinstance(item.get("keywords"), list) else ""
        return (
            f"{item.get('clause_id', '')}\n"
            f"{item.get('clause_no', '')}\n"
            f"{item.get('title', '')}\n"
            f"{keyword_text}\n"
            f"{item.get('content', '')}"
        ).strip()

    @staticmethod
    def _build_query_terms(query: str) -> list[str]:
        seen: set[str] = set()
        terms: list[str] = []
        for candidate in [query, *re.split(r"\s+", query), *re.findall(r"[A-Za-z0-9\u4e00-\u9fff]+", query)]:
            term = str(candidate or "").strip().lower()
            if not term or term in seen:
                continue
            seen.add(term)
            terms.append(term)
        return terms

    def _score_clause(
        self,
        *,
        query_text: str,
        query_terms: list[str],
        clause: Dict[str, Any],
        doc_len: int,
        avg_doc_len: float,
        total_docs: int,
        term_doc_freq: dict[str, int],
    ) -> float:
        title = str(clause.get("title") or "")
        content = str(clause.get("content") or "")
        keywords = clause.get("keywords")
        keyword_list = [str(item) for item in keywords if isinstance(item, str)] if isinstance(keywords, list) else []
        combined = self._composed_text(clause).lower()
        clause_no = str(clause.get("clause_no") or "").strip().lower()
        clause_id = str(clause.get("clause_id") or "").strip().lower()

        score = 0.0
        query_low = query_text.lower()
        if query_low and (query_low == clause_no or query_low == clause_id):
            score += 2.2
        elif query_low and (query_low in clause_no or query_low in clause_id):
            score += 1.6
        if query_low and query_low in title.lower():
            score += 1.8
        if query_low and any(query_low in kw.lower() for kw in keyword_list):
            score += 1.5
        if query_low and query_low in content.lower():
            score += 1.2

        for term in query_terms:
            tf = combined.count(term)
            if tf <= 0:
                continue
            if term in title.lower():
                score += 1.2
            if any(term in kw.lower() for kw in keyword_list):
                score += 1.0
            if term in content.lower():
                score += 0.7
            score += _bm25_like_score(
                term=term,
                tf=tf,
                doc_len=max(doc_len, 1),
                avg_doc_len=max(avg_doc_len, 1.0),
                doc_freq=max(term_doc_freq.get(term, 1), 1),
                total_docs=max(total_docs, 1),
            )
        return float(score)
