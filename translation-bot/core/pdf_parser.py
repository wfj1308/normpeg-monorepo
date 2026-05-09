from __future__ import annotations

import re
from pathlib import Path
from statistics import mean
from typing import Dict, List, Optional, Sequence, Tuple

from .models import ClauseTree, DocumentStructure, Formula, PageStructure


_HEADING_RE = re.compile(r"^(?P<id>\d+(?:\s*[.\u3002]\s*\d+){0,4})\s*(?P<title>.+)$")
_TIGHT_HEADING_RE = re.compile(r"^(?P<id>[1-9]\d?)(?P<title>[\u4e00-\u9fffA-Za-z].+)$")
_FORMULA_RE = re.compile(r"([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s*=\s*([^\n]{2,160})")
_MOJIBAKE_FRAGMENTS = (
    "\u6d93\u64b3\u79f4",
    "\u95b8\u6a3a\ue0c5",
    "\u6f2e\u52ee\ue6c8",
    "\u7023\u52ec\u5076",
    "\u9428\u5ea8\ue6b2",
    "\u9428\u52ee\u6e36",
)


class PDFParser:
    """Stage 1: document understanding with text/table/OCR fallback."""

    def __init__(self, ocr_max_pages: int = 20):
        self.ocr_max_pages = ocr_max_pages

    def parse(self, pdf_path: str, standard_code: str) -> DocumentStructure:
        source = Path(pdf_path).resolve()
        if not source.exists():
            raise FileNotFoundError(f"pdf not found: {source}")

        pages: List[PageStructure] = []
        warnings: List[str] = []

        text_pages, table_pages, parser_name = self._extract_with_pdfplumber(source)
        quality = self._assess_document_text_quality(text_pages)
        if not quality["usable"]:
            warnings.append(f"fallback_from_pdfplumber:{quality['reason']}")
            text_pages, table_pages, parser_name = self._extract_with_pypdf(source)
            quality = self._assess_document_text_quality(text_pages)

        if not quality["usable"] and self.ocr_max_pages != 0:
            warnings.append(f"fallback_from_pypdf:{quality['reason']}")
            text_pages, table_pages, parser_name = self._extract_with_rapidocr(source, self.ocr_max_pages)
            warnings.append("ocr_selected")
            ocr_quality = self._assess_document_text_quality(text_pages)
            if not ocr_quality["usable"]:
                warnings.append(f"ocr_low_quality:{ocr_quality['reason']}")

        for idx, page_text in enumerate(text_pages, start=1):
            formulas = self.extract_formulas(page_text, source_page=idx)
            page_tables = table_pages[idx - 1] if idx - 1 < len(table_pages) else []
            text_blocks = [line.strip() for line in page_text.splitlines() if line.strip()]
            pages.append(
                PageStructure(
                    page_no=idx,
                    text=page_text,
                    text_blocks=text_blocks,
                    tables=page_tables,
                    formulas=formulas,
                )
            )

        structure = DocumentStructure(
            standard_code=standard_code,
            pdf_path=str(source),
            pages=pages,
            warnings=warnings + ([f"parser:{parser_name}"] if parser_name else []),
        )
        structure.clause_tree = self.build_chapter_tree(structure.pages)
        return structure

    def extract_formulas(self, text: str, source_page: int = 0) -> List[Formula]:
        formulas: List[Formula] = []
        seen: set[str] = set()
        for line_no, raw_line in enumerate((text or "").splitlines(), start=1):
            line = raw_line.strip()
            if not line:
                continue
            for hit in _FORMULA_RE.finditer(line):
                expression = f"{hit.group(1)} = {hit.group(2).strip()}"
                if expression in seen:
                    continue
                seen.add(expression)
                formulas.append(
                    Formula(
                        expression=expression,
                        latex=self._formula_to_latex(expression),
                        formula_code=self._formula_to_python(expression),
                        output_variable=hit.group(1).strip(),
                        source_page=source_page,
                        source_line_no=line_no,
                    )
                )
        return formulas

    def build_chapter_tree(self, pages: Sequence[PageStructure]) -> ClauseTree:
        indexed_lines: List[Tuple[int, int, str]] = []
        page_text_map: Dict[int, str] = {}
        for page in pages:
            page_text_map[page.page_no] = page.text
            for line_no, raw in enumerate(page.text.splitlines(), start=1):
                text = raw.strip()
                if text:
                    indexed_lines.append((page.page_no, line_no, text))

        noise_pages = {page_no for page_no, text in page_text_map.items() if self._is_structural_noise_page(text, page_no)}

        heading_indices: List[int] = []
        headings: List[Dict[str, object]] = []
        seen_clause_ids: set[str] = set()
        for idx, (page_no, line_no, line) in enumerate(indexed_lines):
            if page_no in noise_pages:
                continue

            matched = self._match_heading_line(line)
            if matched is None:
                continue
            clause_id, title = matched

            if not self._is_plausible_clause_id(clause_id):
                continue
            if self._is_noisy_heading_title(title):
                continue
            if self._is_likely_list_item_heading(clause_id, title, headings, page_no, line_no):
                continue
            if clause_id in seen_clause_ids:
                continue
            seen_clause_ids.add(clause_id)

            heading_indices.append(idx)
            headings.append(
                {
                    "clause_id": clause_id,
                    "title": title,
                    "page_no": page_no,
                    "line_no": line_no,
                    "depth": clause_id.count(".") + 1,
                }
            )

        if not headings:
            fallback_nodes: List[Dict[str, object]] = []
            for page in pages:
                page_lines = [line.strip() for line in page.text.splitlines() if line.strip()]
                title = page_lines[0] if page_lines else f"Page {page.page_no}"
                fallback_nodes.append(
                    {
                        "clause_id": f"page.{page.page_no}",
                        "title": title[:80],
                        "text": "\n".join(page_lines[:60]),
                        "page_no": page.page_no,
                        "line_no": 1,
                        "depth": 1,
                        "parent_id": None,
                        "children": [],
                    }
                )
            return ClauseTree(
                roots=fallback_nodes,
                nodes=fallback_nodes,
                stats={"node_count": len(fallback_nodes), "root_count": len(fallback_nodes), "max_depth": 1},
            )

        nodes: List[Dict[str, object]] = []
        for i, heading in enumerate(headings):
            start = heading_indices[i] + 1
            end = heading_indices[i + 1] if i + 1 < len(heading_indices) else len(indexed_lines)
            body_lines = [indexed_lines[j][2] for j in range(start, end)]
            node: Dict[str, object] = dict(heading)
            node["text"] = "\n".join(body_lines[:120]).strip()
            node["parent_id"] = self._find_parent_id(str(node["clause_id"]))
            node["children"] = []
            nodes.append(node)

        node_by_id = {str(item["clause_id"]): item for item in nodes}
        roots: List[Dict[str, object]] = []
        for node in nodes:
            parent_id = node.get("parent_id")
            if isinstance(parent_id, str) and parent_id in node_by_id:
                node_by_id[parent_id]["children"].append(node)  # type: ignore[index]
            else:
                roots.append(node)

        max_depth = max(int(item.get("depth", 1) or 1) for item in nodes) if nodes else 1
        return ClauseTree(
            roots=roots,
            nodes=nodes,
            stats={"node_count": len(nodes), "root_count": len(roots), "max_depth": max_depth},
        )

    def _match_heading_line(self, line: str) -> Optional[Tuple[str, str]]:
        text = line.strip()
        hit = _HEADING_RE.match(text)
        if hit:
            clause_id = self._normalize_clause_id(hit.group("id"))
            title = hit.group("title").strip()
            if clause_id and title:
                return clause_id, title

        tight_hit = _TIGHT_HEADING_RE.match(text)
        if tight_hit:
            clause_id = tight_hit.group("id")
            title = tight_hit.group("title").strip()
            return clause_id, title
        return None

    def _normalize_clause_id(self, raw_clause_id: str) -> str:
        normalized = raw_clause_id.replace("\u3002", ".")
        normalized = re.sub(r"\s+", "", normalized)
        normalized = normalized.strip(".")
        return normalized

    def _is_plausible_clause_id(self, clause_id: str) -> bool:
        if not clause_id:
            return False
        if not re.fullmatch(r"\d+(?:\.\d+){0,4}", clause_id):
            return False
        parts = [int(part) for part in clause_id.split(".")]
        if not parts:
            return False
        if parts[0] == 0:
            return False
        if len(parts) == 1 and parts[0] > 20:
            return False
        if any(part > 300 for part in parts[1:]):
            return False
        return True

    def _is_likely_list_item_heading(
        self,
        clause_id: str,
        title: str,
        accepted_headings: Sequence[Dict[str, object]],
        page_no: int,
        line_no: int,
    ) -> bool:
        if "." in clause_id:
            return False

        compact_title = re.sub(r"\s+", "", title)
        if len(compact_title) >= 10:
            return True
        if len(compact_title) >= 12 and re.search(r"[，,。；;]", compact_title):
            return True
        if len(compact_title) >= 6 and re.search(r"(应|不得|采用|进行|符合|规定|应当|每|至少|按|为|与)", compact_title):
            return True

        if clause_id.isdigit():
            major = int(clause_id)
            if major >= 10 and re.fullmatch(r"[A-Za-z0-9_-]{2,6}", compact_title):
                return True

        if not accepted_headings:
            return False

        prev = accepted_headings[-1]
        prev_page = int(prev.get("page_no", 0) or 0)
        prev_line = int(prev.get("line_no", 0) or 0)
        prev_depth = int(prev.get("depth", 1) or 1)
        if prev_page == page_no and prev_depth >= 2 and (line_no - prev_line) <= 6:
            return True
        return False

    def _is_noisy_heading_title(self, title: str) -> bool:
        compact = re.sub(r"\s+", "", title)
        if not compact:
            return True

        lower = compact.lower()
        if "www." in lower or "http" in lower or lower.endswith(".pdf"):
            return True
        if len(compact) < 2:
            return True

        cjk_letters = len(re.findall(r"[A-Za-z\u4e00-\u9fff]", compact))
        digits = len(re.findall(r"\d", compact))
        total = len(compact)
        alpha_ratio = cjk_letters / total
        digit_ratio = digits / total
        if alpha_ratio < 0.25 and digit_ratio > 0.35:
            return True

        if re.search(r"\d{4}[-/]\d{1,2}[-/]\d{1,2}", compact):
            return True
        return False

    def _is_structural_noise_page(self, page_text: str, page_no: int) -> bool:
        text = re.sub(r"\s+", "", page_text or "").lower()
        if not text:
            return False

        if "\u76ee\u6b21" in text or "contents" in text:
            return True

        front_keywords = (
            "\u524d\u8a00",
            "\u516c\u544a",
            "\u53d1\u5e03",
            "\u5b9e\u65bd",
            "\u4e3b\u7f16\u5355\u4f4d",
            "\u6279\u51c6\u90e8\u95e8",
            "\u4ea4\u901a\u8fd0\u8f93\u90e8",
            "\u8d77\u8349",
        )
        if page_no <= 8 and any(key in text for key in front_keywords):
            return True

        if "www.biao-zhun" in text and page_no <= 8:
            return True

        toc_line_hits = len(re.findall(r"\d+(?:\.\d+)*[^\n]{0,50}\d{1,4}", page_text))
        if toc_line_hits >= 8 and page_no <= 12:
            return True

        return False

    def _find_parent_id(self, clause_id: str) -> Optional[str]:
        if "." not in clause_id:
            return None
        parts = clause_id.split(".")
        for i in range(len(parts) - 1, 0, -1):
            candidate = ".".join(parts[:i])
            if candidate:
                return candidate
        return None

    def _extract_with_pdfplumber(self, pdf_path: Path) -> Tuple[List[str], List[List[Dict[str, object]]], str]:
        text_pages: List[str] = []
        table_pages: List[List[Dict[str, object]]] = []
        try:
            import pdfplumber  # type: ignore

            with pdfplumber.open(str(pdf_path)) as pdf:
                for page_no, page in enumerate(pdf.pages, start=1):
                    text_pages.append(page.extract_text() or "")
                    page_tables: List[Dict[str, object]] = []
                    for table_index, table in enumerate(page.extract_tables() or [], start=1):
                        rows: List[List[str]] = []
                        for row in table:
                            if not isinstance(row, list):
                                continue
                            normalized = [str(cell or "").strip() for cell in row]
                            if any(normalized):
                                rows.append(normalized)
                        if rows:
                            page_tables.append({"table_index": table_index, "page_no": page_no, "rows": rows})
                    table_pages.append(page_tables)
            return text_pages, table_pages, "pdfplumber"
        except Exception:
            return [], [], ""

    def _extract_with_pypdf(self, pdf_path: Path) -> Tuple[List[str], List[List[Dict[str, object]]], str]:
        try:
            from pypdf import PdfReader  # type: ignore

            reader = PdfReader(str(pdf_path))
            text_pages = [(page.extract_text() or "") for page in reader.pages]
            table_pages: List[List[Dict[str, object]]] = [[] for _ in text_pages]
            return text_pages, table_pages, "pypdf"
        except Exception:
            return [], [], ""

    def _extract_with_rapidocr(self, pdf_path: Path, ocr_max_pages: int) -> Tuple[List[str], List[List[Dict[str, object]]], str]:
        try:
            import pypdfium2 as pdfium  # type: ignore
            from rapidocr_onnxruntime import RapidOCR  # type: ignore

            engine = RapidOCR()
            doc = pdfium.PdfDocument(str(pdf_path))
            total_pages = len(doc)
            limit = total_pages if ocr_max_pages <= 0 else min(total_pages, ocr_max_pages)
            text_pages: List[str] = []
            for index in range(limit):
                page = doc[index]
                image = page.render(scale=2).to_pil()
                ocr_result, _ = engine(image)
                lines: List[str] = []
                if isinstance(ocr_result, list):
                    for item in ocr_result:
                        if isinstance(item, (list, tuple)) and len(item) >= 2:
                            lines.append(str(item[1]).strip())
                text_pages.append("\n".join([line for line in lines if line]))
            table_pages: List[List[Dict[str, object]]] = [[] for _ in text_pages]
            return text_pages, table_pages, "rapidocr"
        except Exception:
            return [], [], ""

    def _assess_document_text_quality(self, text_pages: Sequence[str]) -> Dict[str, str | bool]:
        non_empty = [page for page in text_pages if page and page.strip()]
        if not non_empty:
            return {"usable": False, "reason": "no_text", "has_text": False}

        sample = non_empty[: min(12, len(non_empty))]
        compact_pages = ["".join(ch for ch in page if not ch.isspace()) for page in sample]
        avg_len = mean(len(page) for page in compact_pages) if compact_pages else 0.0
        short_pages = sum(1 for page in compact_pages if len(page) < 40)
        short_ratio = short_pages / len(compact_pages)
        if avg_len < 90 or short_ratio > 0.65:
            return {
                "usable": False,
                "reason": f"insufficient_text(avg_len={avg_len:.1f},short={short_pages}/{len(compact_pages)})",
                "has_text": True,
            }

        normalized = [re.sub(r"\s+", " ", page).strip().lower()[:120] for page in sample]
        freq: Dict[str, int] = {}
        for line in normalized:
            if not line:
                continue
            freq[line] = freq.get(line, 0) + 1
        if freq:
            max_repeat = max(freq.values())
            repeat_ratio = max_repeat / len(sample)
            if repeat_ratio >= 0.75:
                return {
                    "usable": False,
                    "reason": f"repetitive_text(max_repeat={max_repeat}/{len(sample)})",
                    "has_text": True,
                }

        scores = [self._score_page_text(item) for item in sample]
        avg_score = sum(scores) / len(scores)
        weak_pages = sum(1 for score in scores if score < 0.45)
        weak_ratio = weak_pages / len(scores)
        if avg_score < 0.52 or weak_ratio > 0.55:
            return {
                "usable": False,
                "reason": f"low_quality_text(avg={avg_score:.2f},weak={weak_pages}/{len(scores)})",
                "has_text": True,
            }
        return {"usable": True, "reason": "ok", "has_text": True}

    def _score_page_text(self, text: str) -> float:
        compact = "".join(ch for ch in (text or "") if not ch.isspace())
        if not compact:
            return 0.0

        useful_chars = len(re.findall(r"[A-Za-z0-9\u4e00-\u9fff]", compact))
        useful_ratio = useful_chars / len(compact)

        replacement_hits = compact.count("\ufffd")
        replacement_penalty = min(0.35, replacement_hits * 0.02)

        mojibake_hits = sum(compact.count(token) for token in _MOJIBAKE_FRAGMENTS)
        mojibake_penalty = min(0.4, mojibake_hits * 0.03)

        unique_ratio = len(set(compact)) / len(compact)
        uniqueness_penalty = 0.0
        if len(compact) >= 180 and unique_ratio < 0.08:
            uniqueness_penalty = 0.2

        short_text_penalty = 0.1 if len(compact) < 60 else 0.0
        score = useful_ratio - replacement_penalty - mojibake_penalty - uniqueness_penalty - short_text_penalty
        return max(0.0, min(1.0, score))

    def _formula_to_latex(self, expression: str) -> str:
        return (
            expression.replace("<=", r"\leq ")
            .replace(">=", r"\geq ")
            .replace("*", r"\times ")
            .replace("/", r"\div ")
        )

    def _formula_to_python(self, expression: str) -> str:
        return expression
