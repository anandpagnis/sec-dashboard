import asyncio
import hashlib
import math
import os
import re
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

from models import FilingAnswer, FilingDetail
from sec_client import SECClient


TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9&.\-]{1,}")

FINANCIAL_TERMS = {
    "revenue", "revenues", "growth", "margin", "margins", "sales", "profitability",
    "segment", "segments", "service", "services", "product", "products", "tariff",
    "tariffs", "risk", "risks", "hardware", "geographic", "china", "capital",
    "allocation", "litigation", "supply", "regulatory",
}

QUERY_CLASSES = {
    "Revenue": {"revenue", "revenues", "sales"},
    "Growth Drivers": {"growth", "grew", "increase", "driver", "drove", "higher", "more important"},
    "Margin Drivers": {"margin", "gross margin", "operating margin", "profitability"},
    "Risks": {"risk", "risks", "uncertainty", "cybersecurity"},
    "Supply Chain": {"supply", "supplier", "manufacturing", "component", "inventory"},
    "Regulatory": {"regulatory", "regulation", "tariff", "tax", "legal"},
    "Geographic": {"geographic", "geography", "china", "europe", "americas", "japan"},
    "Product": {"product", "hardware", "iphone", "ipad", "mac", "wearables"},
    "Segment": {"segment", "services", "service", "business unit"},
    "Capital Allocation": {"buyback", "repurchase", "dividend", "capital allocation"},
    "Litigation": {"litigation", "lawsuit", "legal proceeding"},
}

SECTION_PRIORITY = {
    "Revenue": {"MD&A", "Financial Statements"},
    "Growth Drivers": {"MD&A", "Business", "Financial Statements"},
    "Margin Drivers": {"MD&A", "Financial Statements"},
    "Risks": {"Risk Factors", "MD&A"},
    "Supply Chain": {"Risk Factors", "Business", "MD&A"},
    "Regulatory": {"Risk Factors", "MD&A"},
    "Geographic": {"MD&A", "Financial Statements", "Business"},
    "Product": {"Business", "MD&A", "Financial Statements"},
    "Segment": {"MD&A", "Financial Statements", "Business"},
    "Capital Allocation": {"MD&A", "Financial Statements"},
    "Litigation": {"Risk Factors", "Financial Statements"},
}


@dataclass
class Chunk:
    id: str
    text: str
    section: str
    subsection: str
    chunk_type: str
    index: int
    parent_id: str
    metadata: dict[str, Any]
    section_key: str
    line_start: int
    line_end: int
    citation_id: str


class FilingRAG:
    def __init__(self, sec: SECClient):
        self.sec = sec
        self.embedding_cache: dict[str, list[float]] = {}
        self.retrieval_cache: dict[str, tuple[float, list[Chunk], dict[str, Any]]] = {}
        self.answer_cache: dict[str, FilingAnswer] = {}

    async def answer(self, question: str, filing: FilingDetail) -> FilingAnswer:
        started = time.perf_counter()
        answer_key = self._hash(f"{filing.accession_number}:{question.lower().strip()}")
        if answer_key in self.answer_cache:
            cached = self.answer_cache[answer_key]
            cached.latency_ms = int((time.perf_counter() - started) * 1000)
            return cached

        chunks = self.ingest(filing)
        query_class = self.classify(question)
        selected, trace = await self.retrieve(question, filing, chunks, query_class)
        evidence = self._format_evidence(selected)
        sources = [self._source_label(c) for c in selected]
        model = os.getenv("LOCAL_LLM_MODEL", "llama3.2")

        try:
            facts = await self._extract_facts(question, evidence, model)
            final = await self._generate_answer(question, facts, model)
            used_llm = True
        except Exception:
            facts = self._extractive_facts(question, selected)
            final = self._fallback_answer(facts)
            used_llm = False
            model = "hybrid-rag-fallback"

        answer = FilingAnswer(
            answer=final,
            model=model,
            sources=sorted(set(sources)),
            used_local_llm=used_llm,
            latency_ms=int((time.perf_counter() - started) * 1000),
            query_class=query_class,
            retrieved_chunks=trace.get("retrieved_chunks", []),
            reranked_chunks=[self._source_label(c) for c in selected],
            facts=facts,
            evidence_refs=self._evidence_refs(selected),
        )
        self.answer_cache[answer_key] = answer
        return answer

    def ingest(self, filing: FilingDetail) -> list[Chunk]:
        sections = {
            "business": ("Business", filing.business),
            "risk_factors": ("Risk Factors", filing.risk_factors),
            "mda": ("MD&A", filing.mda),
            "quantitative": ("Market Risk", filing.quantitative),
            "financials": ("Financial Statements", filing.financials),
        }
        chunks: list[Chunk] = []
        parent_ix = 0

        for section_key, (section, text) in sections.items():
            if not text:
                continue
            parent_id = f"{section.lower().replace(' ', '-')}-{parent_ix}"
            for idx, (part, line_start, line_end) in enumerate(self._structural_parts(text)):
                chunk_type = self._chunk_type(section, part)
                subsection = self._subsection(part) or section
                citation_id = f"{section_key}:L{line_start}-L{line_end}"
                chunks.append(Chunk(
                    id=f"{parent_id}-{idx}",
                    text=part,
                    section=section,
                    subsection=subsection,
                    chunk_type=chunk_type,
                    index=len(chunks),
                    parent_id=parent_id,
                    section_key=section_key,
                    line_start=line_start,
                    line_end=line_end,
                    citation_id=citation_id,
                    metadata={
                        "company": filing.company_name,
                        "filing_type": "10-K",
                        "fiscal_year": self._fiscal_year(filing.report_date),
                        "section": section,
                        "subsection": subsection,
                        "document_id": filing.accession_number,
                        "chunk_type": chunk_type,
                        "section_key": section_key,
                        "line_start": line_start,
                        "line_end": line_end,
                        "citation_id": citation_id,
                    },
                ))
            parent_ix += 1

        for table_ix, table in enumerate(filing.financial_tables):
            text = table.normalized_text
            if not text:
                continue
            citation_id = table.citation_id or f"financial_tables:T{table_ix + 1}"
            chunks.append(Chunk(
                id=f"financial-table-{table_ix}",
                text=text,
                section="Financial Statements",
                subsection=table.title or f"Financial Table {table_ix + 1}",
                chunk_type="table",
                index=len(chunks),
                parent_id=f"financial-table-{table_ix}",
                section_key="financial_tables",
                line_start=table_ix + 1,
                line_end=table_ix + 1,
                citation_id=citation_id,
                metadata={
                    "company": filing.company_name,
                    "filing_type": "10-K",
                    "fiscal_year": self._fiscal_year(filing.report_date),
                    "section": "Financial Statements",
                    "subsection": table.title,
                    "document_id": filing.accession_number,
                    "chunk_type": "table",
                    "section_key": "financial_tables",
                    "line_start": table_ix + 1,
                    "line_end": table_ix + 1,
                    "citation_id": citation_id,
                },
            ))

        if filing.financial_highlights:
            rows = [
                f"{key}: {value.get('value')} {value.get('unit')} for FY ending {value.get('end')} ({value.get('taxonomy', 'XBRL')})"
                for key, value in filing.financial_highlights.items()
            ]
            chunks.append(Chunk(
                id="financial-highlights",
                text="\n".join(rows),
                section="Financial Statements",
                subsection="XBRL Financial Highlights",
                chunk_type="financial_statement",
                index=len(chunks),
                parent_id="financial-highlights",
                section_key="financial_tables",
                line_start=1,
                line_end=1,
                citation_id="financial_tables:highlights",
                metadata={
                    "company": filing.company_name,
                    "filing_type": "10-K",
                    "fiscal_year": self._fiscal_year(filing.report_date),
                    "section": "Financial Statements",
                    "subsection": "XBRL Financial Highlights",
                    "document_id": filing.accession_number,
                    "chunk_type": "financial_statement",
                    "section_key": "financial_tables",
                    "line_start": 1,
                    "line_end": 1,
                    "citation_id": "financial_tables:highlights",
                },
            ))
        return chunks

    async def retrieve(self, question: str, filing: FilingDetail, chunks: list[Chunk], query_class: str) -> tuple[list[Chunk], dict[str, Any]]:
        cache_key = self._hash(f"{filing.accession_number}:{question.lower()}:{len(chunks)}")
        cached = self.retrieval_cache.get(cache_key)
        if cached and time.time() - cached[0] < 900:
            return cached[1], cached[2]

        filtered = self._metadata_filter(chunks, query_class)
        bm25_task = asyncio.to_thread(self._bm25, question, filtered, 24)
        dense_task = self._dense(question, filtered, 24)
        bm25_ranked, dense_ranked = await asyncio.gather(bm25_task, dense_task)

        candidates = self._rrf(bm25_ranked, dense_ranked, question)[:40]
        reranked = self._rerank(question, candidates, query_class)[:8]
        expanded = self._small_to_big(reranked, chunks)[:8]
        trace = {
            "retrieved_chunks": [self._source_label(c) for c in candidates[:12]],
            "bm25_count": len(bm25_ranked),
            "dense_count": len(dense_ranked),
        }
        self.retrieval_cache[cache_key] = (time.time(), expanded, trace)
        return expanded, trace

    def classify(self, question: str) -> str:
        q = question.lower()
        scores = {
            label: sum(1 for term in terms if term in q)
            for label, terms in QUERY_CLASSES.items()
        }
        best, score = max(scores.items(), key=lambda item: item[1])
        return best if score else "Growth Drivers"

    def _metadata_filter(self, chunks: list[Chunk], query_class: str) -> list[Chunk]:
        preferred = SECTION_PRIORITY.get(query_class, set())
        if not preferred:
            return chunks
        focused = [c for c in chunks if c.section in preferred]
        if len(focused) >= 6:
            return focused
        return chunks

    def _bm25(self, question: str, chunks: list[Chunk], limit: int) -> list[tuple[Chunk, float]]:
        query_terms = self._tokens(question)
        docs = [self._tokens(c.text) for c in chunks]
        avg_len = sum(len(d) for d in docs) / max(len(docs), 1)
        df = Counter(term for doc in docs for term in set(doc))
        scores = []
        for chunk, doc in zip(chunks, docs):
            tf = Counter(doc)
            score = 0.0
            for term in query_terms:
                if not tf[term]:
                    continue
                idf = math.log(1 + (len(docs) - df[term] + 0.5) / (df[term] + 0.5))
                denom = tf[term] + 1.2 * (1 - 0.75 + 0.75 * len(doc) / max(avg_len, 1))
                score += idf * (tf[term] * 2.2) / denom
            scores.append((chunk, score))
        return [item for item in sorted(scores, key=lambda x: x[1], reverse=True)[:limit] if item[1] > 0]

    async def _dense(self, question: str, chunks: list[Chunk], limit: int) -> list[tuple[Chunk, float]]:
        embed_model = os.getenv("LOCAL_EMBED_MODEL", "nomic-embed-text")
        try:
            q_vec = await self._embed(question, embed_model)
            if not q_vec:
                raise ValueError("empty query embedding")
            tasks = [self._embed(c.text[:3500], embed_model) for c in chunks]
            vectors = await asyncio.gather(*tasks)
            scored = [(c, self._cosine(q_vec, v)) for c, v in zip(chunks, vectors) if v]
            return sorted(scored, key=lambda x: x[1], reverse=True)[:limit]
        except Exception:
            q_terms = set(self._tokens(question))
            scored = []
            for chunk in chunks:
                terms = set(self._tokens(chunk.text))
                score = len(q_terms & terms) / max(math.sqrt(len(terms)), 1)
                scored.append((chunk, score))
            return sorted(scored, key=lambda x: x[1], reverse=True)[:limit]

    async def _embed(self, text: str, model: str) -> list[float]:
        key = self._hash(f"{model}:{text[:3500]}")
        if key not in self.embedding_cache:
            self.embedding_cache[key] = await self.sec.embed_ollama(text[:3500], model)
        return self.embedding_cache[key]

    def _rrf(self, bm25: list[tuple[Chunk, float]], dense: list[tuple[Chunk, float]], question: str) -> list[Chunk]:
        bm25_weight = 1.7 if any(term in question.lower() for term in FINANCIAL_TERMS) else 1.0
        dense_weight = 1.0
        scores: dict[str, float] = defaultdict(float)
        lookup: dict[str, Chunk] = {}
        for weight, ranking in ((bm25_weight, bm25), (dense_weight, dense)):
            for rank, (chunk, _) in enumerate(ranking, start=1):
                lookup[chunk.id] = chunk
                scores[chunk.id] += weight / (60 + rank)
        return [lookup[cid] for cid, _ in sorted(scores.items(), key=lambda x: x[1], reverse=True)]

    def _rerank(self, question: str, chunks: list[Chunk], query_class: str) -> list[Chunk]:
        q_terms = set(self._tokens(question))
        preferred = SECTION_PRIORITY.get(query_class, set())

        def score(chunk: Chunk) -> float:
            terms = self._tokens(chunk.text)
            counts = Counter(terms)
            exact = sum(counts[t] for t in q_terms)
            phrase = sum(2 for t in FINANCIAL_TERMS if t in question.lower() and t in chunk.text.lower())
            section_boost = 3 if chunk.section in preferred else 0
            table_boost = 2 if chunk.chunk_type in {"table", "financial_statement"} and query_class in {"Revenue", "Segment", "Geographic", "Growth Drivers"} else 0
            return exact + phrase + section_boost + table_boost

        return sorted(chunks, key=score, reverse=True)

    def _small_to_big(self, selected: list[Chunk], all_chunks: list[Chunk]) -> list[Chunk]:
        by_index = {c.index: c for c in all_chunks}
        out: list[Chunk] = []
        seen = set()
        for chunk in selected:
            for ix in (chunk.index, chunk.index - 1, chunk.index + 1):
                neighbor = by_index.get(ix)
                if neighbor and neighbor.parent_id == chunk.parent_id and neighbor.id not in seen:
                    out.append(neighbor)
                    seen.add(neighbor.id)
            if chunk.id not in seen:
                out.append(chunk)
                seen.add(chunk.id)
        return out

    async def _extract_facts(self, question: str, evidence: str, model: str) -> str:
        prompt = f"""Extract all facts relevant to the user question from the filing evidence.
Return only concise facts with section citations. Preserve citation IDs like [business:L10-L14] or [financial_tables:T2]. Do not speculate.

Question:
{question}

Evidence:
{evidence}

Facts:"""
        return (await self.sec.ask_ollama(prompt, model=model)).get("response", "").strip()

    async def _generate_answer(self, question: str, facts: str, model: str) -> str:
        prompt = f"""You are a financial analyst specializing in SEC filings.

Use ONLY the supplied facts.

Rules:
1. Answer the question directly.
2. Quote or cite the supporting evidence using the supplied citation IDs.
3. Explain your reasoning.
4. If multiple sections support the answer, synthesize them.
5. Never speculate.
6. Never infer from missing information.
7. If evidence is insufficient, explicitly say:
"The provided filing does not contain sufficient evidence."

Output format:
Conclusion:
...

Evidence:
* ...
* ...

Reasoning:
...

Confidence:
High | Medium | Low

Question:
{question}

Facts:
{facts}

Final answer:"""
        return (await self.sec.ask_ollama(prompt, model=model)).get("response", "").strip()

    def _format_evidence(self, chunks: list[Chunk]) -> str:
        blocks = []
        for i, chunk in enumerate(chunks, start=1):
            label = self._source_label(chunk)
            blocks.append(f"[{i}] {label} [{chunk.citation_id}]\n{chunk.text[:1800]}")
        return "\n\n".join(blocks)

    def _extractive_facts(self, question: str, chunks: list[Chunk]) -> str:
        q_terms = set(self._tokens(question))
        facts = []
        for chunk in chunks:
            sentences = re.split(r"(?<=[.!?])\s+", chunk.text.replace("\n", " "))
            ranked = sorted(
                sentences,
                key=lambda s: sum(1 for t in q_terms if t in s.lower()),
                reverse=True,
            )
            for sentence in ranked[:2]:
                if len(sentence) > 40:
                    facts.append(f"- {sentence[:320]} ({self._source_label(chunk)} [{chunk.citation_id}])")
        return "\n".join(facts[:10])

    def _fallback_answer(self, facts: str) -> str:
        if not facts.strip():
            return "Conclusion:\nThe provided filing does not contain sufficient evidence.\n\nEvidence:\n* None found in retrieved filing chunks.\n\nReasoning:\nThe retrieval stage did not surface relevant facts.\n\nConfidence:\nLow"
        return f"Conclusion:\nThe retrieved filing evidence is summarized below.\n\nEvidence:\n{facts}\n\nReasoning:\nThese facts were selected by hybrid retrieval and lexical reranking from the parsed filing. No unsupported information was added.\n\nConfidence:\nMedium"

    def _evidence_refs(self, chunks: list[Chunk]) -> list[dict[str, Any]]:
        refs = []
        seen = set()
        for chunk in chunks:
            if chunk.citation_id in seen:
                continue
            seen.add(chunk.citation_id)
            refs.append({
                "id": chunk.citation_id,
                "label": self._source_label(chunk),
                "section_key": chunk.section_key,
                "line_start": chunk.line_start,
                "line_end": chunk.line_end,
            })
        return refs

    def _structural_parts(self, text: str) -> list[tuple[str, int, int]]:
        matches = list(re.finditer(r"\S(?:.*(?:\n(?!\n).*)*)", text))
        raw_parts = []
        line_starts = [0]
        for match in re.finditer(r"\n", text):
            line_starts.append(match.end())

        def line_no(pos: int) -> int:
            lo, hi = 0, len(line_starts)
            while lo + 1 < hi:
                mid = (lo + hi) // 2
                if line_starts[mid] <= pos:
                    lo = mid
                else:
                    hi = mid
            return lo + 1

        for match in matches:
            part = match.group(0).strip()
            if len(part) > 80:
                raw_parts.append((part, line_no(match.start()), line_no(match.end())))

        parts: list[tuple[str, int, int]] = []
        buffer: list[str] = []
        buffer_start = 1
        buffer_end = 1
        for part, start, end in raw_parts:
            looks_like_table = self._looks_like_table(part)
            current_len = sum(len(p) for p in buffer)
            if looks_like_table:
                if buffer:
                    parts.append(("\n\n".join(buffer), buffer_start, buffer_end))
                    buffer = []
                parts.append((self._normalize_table(part), start, end))
            elif current_len + len(part) > 2200 and buffer:
                parts.append(("\n\n".join(buffer), buffer_start, buffer_end))
                buffer = [part]
                buffer_start = start
                buffer_end = end
            else:
                if not buffer:
                    buffer_start = start
                buffer.append(part)
                buffer_end = end
        if buffer:
            parts.append(("\n\n".join(buffer), buffer_start, buffer_end))
        return parts

    def _looks_like_table(self, text: str) -> bool:
        lines = [line for line in text.splitlines() if line.strip()]
        numeric_lines = sum(1 for line in lines if len(re.findall(r"\$?\(?\d[\d,.\)]*", line)) >= 3)
        return numeric_lines >= 2 or ("revenue" in text.lower() and len(re.findall(r"\d", text)) > 20)

    def _normalize_table(self, text: str) -> str:
        lines = [re.sub(r"\s{2,}", " | ", line.strip()) for line in text.splitlines() if line.strip()]
        return "\n".join(lines)

    def _chunk_type(self, section: str, text: str) -> str:
        lower = text.lower()
        if self._looks_like_table(text):
            if any(term in lower for term in ("revenue", "net sales", "segment", "geographic")):
                return "table"
            return "financial_statement"
        if section == "Risk Factors":
            return "risk_factor"
        if section == "Financial Statements":
            return "financial_statement"
        return "text"

    def _subsection(self, text: str) -> str:
        first = text.splitlines()[0].strip()
        if len(first) <= 90 and not first.endswith("."):
            return first.title()
        return ""

    def _tokens(self, text: str) -> list[str]:
        return [t.lower() for t in TOKEN_RE.findall(text)]

    def _cosine(self, a: list[float], b: list[float]) -> float:
        if not a or not b or len(a) != len(b):
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        return dot / max(math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)), 1e-9)

    def _source_label(self, chunk: Chunk) -> str:
        return f"{chunk.section}: {chunk.subsection} [{chunk.chunk_type}]"

    def _fiscal_year(self, report_date: str | None) -> int | None:
        if not report_date:
            return None
        match = re.match(r"(\d{4})-", report_date)
        return int(match.group(1)) if match else None

    def _hash(self, value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()
