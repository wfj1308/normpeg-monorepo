from __future__ import annotations

from backend.app.core import chunk_markdown_clauses, chunk_pdf_text_clauses


def test_chunk_markdown_clauses_supports_heading_and_body_split() -> None:
    markdown_text = """# 4 路基工程
### 4.2.1 路基压实度
条款原文：路基压实度应符合规定。
实测项目包括压实度。

### 4.2.1.1 填土段压实度
条款原文：填土段应逐层检测。
"""
    chunks = chunk_markdown_clauses(markdown_text, normdoc_id="JTG-F80-1-2017")

    assert len(chunks) == 2
    assert chunks[0]["clause"] == "4.2.1"
    assert chunks[0]["title"] == "路基压实度"
    assert chunks[0]["normdoc_id"] == "JTG-F80-1-2017"
    assert chunks[0]["page"] == 1
    assert chunks[0]["content"].startswith("### 4.2.1 路基压实度\n条款原文：路基压实度应符合规定。")
    assert "压实度" in chunks[0]["keywords"]

    assert chunks[1]["clause"] == "4.2.1.1"
    assert chunks[1]["title"] == "填土段压实度"
    assert chunks[1]["content"].startswith("### 4.2.1.1 填土段压实度")


def test_chunk_pdf_text_clauses_supports_numbering_variants_and_pages() -> None:
    page_texts = [
        "\n".join(
            [
                "4.2.1 路基压实度",
                "路基压实度应符合表4.2.1的规定。",
                "实测项目包含压实度和检测频率。",
            ]
        ),
        "\n".join(
            [
                "续页内容",
                "第4.2.2条 弯沉",
                "弯沉检测应符合规范要求。",
            ]
        ),
    ]

    chunks = chunk_pdf_text_clauses(
        "\n".join(page_texts),
        normdoc_id="JTG F80/1-2017",
        page_texts=page_texts,
    )

    assert len(chunks) == 2
    assert chunks[0]["clause"] == "4.2.1"
    assert chunks[0]["page"] == 1
    assert "续页内容" in chunks[0]["content"]
    assert chunks[0]["normdoc_id"] == "JTG-F80-1-2017"
    assert "路基" in chunks[0]["keywords"]

    assert chunks[1]["clause"] == "4.2.2"
    assert chunks[1]["title"] == "弯沉"
    assert chunks[1]["page"] == 2
    assert chunks[1]["content"].startswith("第4.2.2条 弯沉")
