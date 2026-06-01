import re
from bs4 import BeautifulSoup
from datetime import date


GENERIC_TABLE_TITLE_PATTERNS = [
    r"^\(in\s+(millions|thousands|billions)\)$",
    r"^in\s+(millions|thousands|billions)$",
    r"^unaudited$",
    r"^see accompanying (notes|note)\b",
    r"^\d+$",
    r"^[\W_]+$",
]
NOTE_TITLE_PREFIX_RE = re.compile(r"^note\s+\d+\s*[–—-]\s*", re.I)


def _normalize_title_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip(" \t\r\n-–—:;,.")


def _is_generic_table_title(text: str) -> bool:
    normalized = _normalize_title_text(text)
    if len(normalized) < 6 or len(normalized) > 140:
        return True
    if normalized.lower() in {"financial table", "table", "note", "notes"}:
        return True
    if "|" in normalized:
        return True
    if re.search(r"\bform\s+10-k\b", normalized, re.I) and re.search(r"\b\d{1,3}\b\s*$", normalized):
        return True
    return any(re.search(pattern, normalized, re.I) for pattern in GENERIC_TABLE_TITLE_PATTERNS)


def _statement_title_from_raw(title: str) -> str:
    lower = _normalize_title_text(title).lower()
    if "table of contents" in lower or re.search(r"^\s*index\b", lower):
        return ""
    if "statement of cash flows" in lower or "statements of cash flows" in lower or "cash flows" in lower:
        return "Cash Flow Statement"
    if "statement of operations" in lower or "statements of operations" in lower or "income statement" in lower or "results of operations" in lower:
        return "Income Statement"
    if "balance sheet" in lower or "balance sheets" in lower or "statement of financial position" in lower:
        return "Balance Sheet"
    if "comprehensive income" in lower:
        return "Comprehensive Income"
    if "shareholders" in lower and "equity" in lower:
        return "Shareholders' Equity"
    return ""


def _strip_note_prefix(title: str) -> str:
    return _normalize_title_text(NOTE_TITLE_PREFIX_RE.sub("", title or ""))


def _condense_sentence_title(title: str) -> str:
    phrase = _normalize_title_text(title)
    phrase = re.sub(r"^(?:the|our|a|an)\s+", "", phrase, flags=re.I)
    phrase = re.sub(r"\b(?:for|as of)\s+\d{4}(?:\s+(?:and|to)\s+\d{4})*.*$", "", phrase, flags=re.I)
    phrase = re.split(
        r"\b(?:were|was|are|is|been|being|consisted|consists|consist|include|includes|included|provide|provides|present|presents|show|shows|shown)\b",
        phrase,
        maxsplit=1,
        flags=re.I,
    )[0]
    phrase = re.split(r"[,;:]+|\s+[–—-]\s+", phrase, maxsplit=1)[0]
    phrase = re.sub(r"\bas of\b.*$", "", phrase, flags=re.I)
    phrase = re.sub(r"\bfor\s+\d{4}(?:\s+(?:and|to)\s+\d{4})*.*$", "", phrase, flags=re.I)
    return _normalize_title_text(phrase)


def _brief_table_title(title: str, keywords: list[str] | None = None, row_labels: list[str] | None = None) -> str:
    normalized = _normalize_title_text(title)
    lower = normalized.lower()
    keyword_set = {k.lower() for k in (keywords or [])}
    row_text = " | ".join(_normalize_title_text(label).lower() for label in (row_labels or [])[:8])
    note_body = _strip_note_prefix(normalized)
    if note_body and note_body != normalized:
        normalized = note_body
        lower = normalized.lower()

    sentence_like = lower.startswith((
        "following ",
        "the following",
        "this table",
        "table shows",
        "shows ",
        "presents ",
        "reviews ",
        "our ",
    )) or any(verb in lower for verb in (" reviews ", " shows ", " presents ", " provides ", " includes "))

    statement_title = _statement_title_from_raw(normalized)
    if statement_title:
        return statement_title

    if "table of contents" in lower or re.search(r"^\s*index\b", lower):
        return "Table of Contents"

    if "earnings per share" in lower:
        return "Earnings Per Share"
    if "cash, cash equivalents and marketable securities" in lower:
        return "Cash, Cash Equivalents and Marketable Securities"
    if "deferred tax assets and liabilities" in lower or ("deferred tax assets" in lower and "liabilities" in lower):
        return "Deferred Tax Assets and Liabilities"
    if "lease liability maturit" in lower or ("lease liabilities" in lower and "maturit" in lower):
        return "Lease Liability Maturities"
    if "foreign pretax earnings" in lower or ("foreign subsidiaries" in row_text and "valuation allowance" in row_text):
        return "Tax Rate Reconciliation"
    if "computed expected tax" in row_text or ("valuation allowance" in row_text and "research and development credit" in row_text):
        return "Tax Rate Reconciliation"
    if "provision for income taxes" in lower or ("income taxes" in lower and "provision" in lower):
        return "Provision for Income Taxes"
    if "codm" in lower and ("expense" in lower or "expenses" in lower):
        return "CODM Expense Allocation"

    if ("gross" in lower and "margin" in lower) or {"gross", "margin"} <= keyword_set:
        return "Gross Margin Percentage" if "percentage" in lower or "percent" in lower or "percentage" in row_text else "Gross Margin"
    if ("operating" in lower and "expense" in lower) or {"operating", "expense"} <= keyword_set:
        return "Operating Expenses"
    if "segment" in lower and {"expense", "expenses", "cost", "costs"} & keyword_set:
        return "Segment Expenses"
    if "segment" in lower and {"revenue", "revenues", "sales"} & keyword_set:
        return "Segment Revenue"
    if {"products", "services"} <= keyword_set and {"revenue", "sales"} & keyword_set:
        return "Products and Services Revenue"
    if "interest income" in row_text and "interest expense" in row_text:
        return "Interest Income and Expense"
    if "other income" in row_text:
        return "Other Income, Net"
    if any(term in row_text for term in ("iphone", "mac", "ipad", "wearables", "airpods", "services", "products")) and {"revenue", "revenues", "sales"} & keyword_set:
        return "Net Sales by Category"
    if "net sales" in lower or {"net", "sales"} <= keyword_set:
        if "segment" in lower or "segment" in keyword_set:
            return "Net Sales by Segment"
        if "category" in lower or "category" in row_text:
            return "Net Sales by Category"
        return "Net Sales"
    if "geographic" in lower and {"revenue", "revenues", "sales"} & keyword_set:
        return "Geographic Revenue"
    if "codm" in lower and {"expense", "expenses", "segment"} & keyword_set:
        return "CODM Expense Allocation"
    if "margin" in lower and "percentage" in lower:
        return "Gross Margin Percentage"
    if "common stock and additional paid in capital" in row_text or "retained earnings" in row_text or "total shareholders’ equity" in row_text or "total shareholders' equity" in row_text:
        return "Shareholders' Equity"
    if "net cash provided by operating activities" in row_text or "cash and cash equivalents at beginning" in row_text or "cash and cash equivalents at end" in row_text:
        return "Cash Flow Statement"
    if "liquidity and capital resources" in lower:
        return "Liquidity and Capital Resources"

    if not sentence_like and not _is_generic_table_title(normalized) and len(normalized) <= 60:
        return normalized

    clause = _condense_sentence_title(normalized)
    if clause and not _is_generic_table_title(clause):
        words = clause.split()
        if len(words) <= 8:
            return clause

    compact_words = []
    for word in re.findall(r"[A-Za-z][A-Za-z0-9&'-]+", normalized):
        lowered = word.lower()
        if lowered in {"the", "and", "of", "to", "for", "in", "on", "our", "their", "this", "that", "with", "basis", "regularly", "provided", "reviews", "review", "attributable", "each", "segment", "segments", "consolidated", "were", "was", "are", "is", "been", "being", "as", "follows", "following", "consisted", "consists", "consist", "include", "includes", "included", "provide", "provides", "present", "presents", "show", "shows", "shown", "million", "millions", "billion", "billions", "thousand", "thousands", "percent", "percentage"}:
            continue
        compact_words.append(word)
        if len(compact_words) >= 6:
            break

    if compact_words:
        short = " ".join(compact_words)
        return short[:70].strip()

    return normalized[:70]


def extract_table_title(table):
    candidates = []

    caption = table.find("caption")
    if caption:
        title = _normalize_title_text(caption.get_text(" ", strip=True))
        if not _is_generic_table_title(title):
            candidates.append(title)

    current = table
    for _ in range(10):
        current = current.find_previous_sibling()
        if not current:
            break
        if getattr(current, "name", None) in {"table", "tr"}:
            continue
        text = _normalize_title_text(current.get_text(" ", strip=True))
        if not _is_generic_table_title(text):
            candidates.append(text)

    current = table
    for _ in range(16):
        current = current.find_previous()
        if not current:
            break
        text = _normalize_title_text(current.get_text(" ", strip=True))
        if not _is_generic_table_title(text):
            candidates.append(text)

    strong_patterns = [
        r"statement[s]?\s+of",
        r"balance\s+sheet",
        r"income\s+statement",
        r"operations",
        r"cash\s+flows?",
        r"stockholders",
        r"shareholders",
        r"equity",
        r"financial\s+statements",
        r"consolidated",
        r"statement\s+of\s+operations",
        r"statement\s+of\s+cash\s+flows",
        r"statement\s+of\s+stockholders'?s?\s+equity",
    ]

    for candidate in candidates:
        if any(re.search(p, candidate, re.I) for p in strong_patterns):
            return candidate[:120]

    for candidate in candidates:
        if not _is_generic_table_title(candidate):
            return candidate[:120]

    header = table.find_previous(["h1", "h2", "h3", "h4"])
    if header:
        header_text = _normalize_title_text(header.get_text(" ", strip=True))
        if not _is_generic_table_title(header_text):
            return header_text[:120]

    return "Financial Table"

class FilingParser:

    @staticmethod
    def clean_html(html: str) -> str:
        soup = BeautifulSoup(html, "lxml")
        for tag in soup(["script", "style", "meta", "link", "ix:header", "ix:hidden"]):
            tag.decompose()
        for tag in soup.find_all(["ix:nonnumeric", "ix:nonfraction"]):
            tag.unwrap()
        for br in soup.find_all("br"):
            br.replace_with("\n")
        for p in soup.find_all(["p", "div", "tr", "table", "h1", "h2", "h3", "h4"]):
            p.insert_after("\n")
        text = soup.get_text(separator="\n", strip=True)
        text = re.sub(r'[ \t\r\f\v]+', ' ', text)
        text = re.sub(r' *\n *', '\n', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text

    @staticmethod
    def find_section(
        text: str,
        start_patterns: list[str],
        end_patterns: list[str],
        min_content_length: int = 500,
        max_chars: int = 50000
    ) -> str:
        starts: list[re.Match] = []
        for pattern in start_patterns:
            starts.extend(re.finditer(pattern, text, flags=re.IGNORECASE | re.MULTILINE))

        for match in sorted(starts, key=lambda m: m.start()):
            search_start = match.end()
            end_pos = len(text)
            for end_pattern in end_patterns:
                end_match = re.search(end_pattern, text[search_start:], flags=re.IGNORECASE | re.MULTILINE)
                if end_match:
                    end_pos = min(end_pos, search_start + end_match.start())

            content = text[search_start:end_pos].strip()
            content = re.sub(r'\n{3,}', '\n\n', content)
            page_refs = len(re.findall(r'\bpage[s]?\s+\d+\b', content, re.IGNORECASE))
            words = re.findall(r'\b[A-Za-z][A-Za-z\-]{2,}\b', content)
            numeric_share = len(re.findall(r'\d', content)) / max(len(content), 1)

            if len(content) >= min_content_length and len(words) > 80 and page_refs < 15 and numeric_share < 0.45:
                return content[:max_chars]

        return ""

    @classmethod
    def parse_10k(cls, html: str) -> dict:
        text = cls.clean_html(html)
        item = r'(?:^|\n)\s*item\s+{}\s*[\.\-:]*\s*(?=\n|[A-Z])'

        sections = {
            "business": cls.find_section(
                text,
                [item.format(r'1(?!\s*A)'), r'(?:^|\n)\s*business\s*(?:\n|$)'],
                [item.format(r'1A'), item.format(r'1B'), item.format(r'2')],
                min_content_length=500,
                max_chars=80000
            ),
            "risk_factors": cls.find_section(
                text,
                [item.format(r'1A'), r'(?:^|\n)\s*risk factors\s*(?:\n|$)'],
                [item.format(r'1B'), item.format(r'1C'), item.format(r'2'), r'(?:^|\n)\s*unresolved staff comments\s*(?:\n|$)'],
                min_content_length=500,
                max_chars=80000
            ),
            "mda": cls.find_section(
                text,
                [item.format(r'7(?!\s*A)'), r"management['’]s discussion and analysis"],
                [item.format(r'7A'), item.format(r'8')],
                min_content_length=500,
                max_chars=80000
            ),
            "quantitative": cls.find_section(
                text,
                [item.format(r'7A'), r'quantitative and qualitative disclosures about market risk'],
                [item.format(r'8'), r'(?:^|\n)\s*financial statements'],
                min_content_length=200,
                max_chars=30000
            ),
            "financials": cls.find_section(
                text,
                [item.format(r'8'), r'financial statements and supplementary data'],
                [item.format(r'9'), item.format(r'9A')],
                min_content_length=500,
                max_chars=80000
            ),
        }

        for key, val in sections.items():
            if not val:
                sections[key] = ""

        return sections


    @staticmethod
    def extract_financial_tables(html: str, max_tables: int = 30) -> list[dict]:
        soup = BeautifulSoup(html, "lxml")
        for tag in soup(["script", "style", "meta", "link", "ix:header", "ix:hidden"]):
            tag.decompose()
        for tag in soup.find_all(["ix:nonnumeric", "ix:nonfraction"]):
            tag.unwrap()

        keywords = {
            "revenue", "revenues", "net sales", "sales", "income", "operations",
            "assets", "liabilities", "equity", "cash", "segment", "geographic",
            "product", "services", "margin", "statement", "consolidated",
        }
        tables = []
        for table in soup.find_all("table"):
            rows = []
            for tr in table.find_all("tr"):
                cells = []
                for cell in tr.find_all(["th", "td"]):
                    text = cell.get_text(" ", strip=True)
                    text = re.sub(r"\s+", " ", text)
                    if text:
                        cells.append(text)
                if cells:
                    rows.append(cells)
            if len(rows) < 2:
                continue

            normalized_rows = []
            for row in rows:
                merged = []
                i = 0
                while i < len(row):
                    raw_cell = re.sub(r"\s+", " ", row[i]).strip()
                    cell = _normalize_title_text(raw_cell)
                    if not raw_cell:
                        i += 1
                        continue

                    if raw_cell in {"$", "€", "£"} and i + 1 < len(row):
                        next_cell = _normalize_title_text(re.sub(r"\s+", " ", row[i + 1]).strip())
                        if re.search(r"\d", next_cell):
                            merged.append(f"{cell}{next_cell}")
                            i += 2
                            continue

                    if raw_cell == "%":
                        if merged:
                            prev = merged[-1]
                            if re.fullmatch(r"[-—–]?", prev) or re.fullmatch(r"[+\-]?\d[\d,.\)]*", prev):
                                merged[-1] = f"{prev}%"
                            else:
                                merged.append(cell)
                        else:
                            merged.append(cell)
                        i += 1
                        continue

                    if raw_cell in {"-", "—", "–"}:
                        if i + 1 < len(row) and re.sub(r"\s+", " ", row[i + 1]).strip() == "%":
                            merged.append(f"{raw_cell}%")
                            i += 2
                            continue
                        merged.append(raw_cell)
                        i += 1
                        continue

                    merged.append(cell)
                    i += 1

                if merged:
                    normalized_rows.append(merged)

            rows = normalized_rows
            normalized_lines = [" | ".join(row) for row in rows]
            normalized = "\n".join(normalized_lines)
            lower = normalized.lower()
            raw_title = extract_table_title(table)
            raw_title_lower = _normalize_title_text(raw_title).lower()
            if (
                "table of contents" in raw_title_lower
                or "index to consolidated financial statements" in raw_title_lower
                or raw_title_lower.startswith("item 8. financial statements and supplementary data")
                or raw_title_lower.startswith("index to")
            ):
                continue
            numeric_cells = len(re.findall(r"\$?\(?\d[\d,.\)]*", normalized))
            matched = sorted(k for k in keywords if k in lower)
            if numeric_cells < 6 or not matched:
                continue

            row_labels = []
            for row in rows:
                if not row:
                    continue
                label = _normalize_title_text(row[0])
                if not label or label.lower() in {"year ended", "years ended", "months ended", "periods ended"}:
                    continue
                if re.fullmatch(r"[\d\W]+", label):
                    continue
                row_labels.append(label)

            title = _brief_table_title(raw_title, matched, row_labels)
            if not title or _is_generic_table_title(title):
                title = _brief_table_title(" ".join(row_labels[:3]), matched, row_labels)
            if not title or _is_generic_table_title(title):
                title = _normalize_title_text(raw_title)[:70] or "Financial Table"
            citation_id = f"financial_tables:T{len(tables) + 1}"

            tables.append({
                "title": title,
                "raw_title": raw_title,
                "section": "Financial Statements",
                "rows": rows[:80],
                "normalized_text": normalized[:12000],
                "keywords": matched[:8],
                "citation_id": citation_id,
            })
            if len(tables) >= max_tables:
                break
        return tables

    @staticmethod
    def extract_financial_highlights(facts: dict, report_date: str | None = None) -> dict:
        highlights = {}
        try:
            us_gaap = facts.get("facts", {}).get("us-gaap", {})
            metrics = {
                "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"],
                "net_income": ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
                "total_assets": ["Assets"],
                "total_liabilities": ["Liabilities"],
                "stockholders_equity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
                "operating_income": ["OperatingIncomeLoss"],
                "eps_basic": ["EarningsPerShareBasic"],
                "eps_diluted": ["EarningsPerShareDiluted"],
                "cash": ["CashAndCashEquivalentsAtCarryingValue", "Cash", "CashCashEquivalentsAndShortTermInvestments"],
                "gross_profit": ["GrossProfit"],
                "rd_expense": ["ResearchAndDevelopmentExpense"],
                "operating_cashflow": ["NetCashProvidedByUsedInOperatingActivities"],
            }

            def date_distance(value: str | None) -> int:
                if not value or not report_date:
                    return 0
                try:
                    return abs((date.fromisoformat(value) - date.fromisoformat(report_date)).days)
                except ValueError:
                    return 0

            def is_annual(v: dict) -> bool:
                start = v.get("start")
                end = v.get("end")
                if v.get("fp") == "FY":
                    return True
                if start and end:
                    try:
                        days = (date.fromisoformat(end) - date.fromisoformat(start)).days
                        return 300 <= days <= 380
                    except ValueError:
                        return False
                return False

            for label, keys in metrics.items():
                for key in keys:
                    if key in us_gaap:
                        units = us_gaap[key].get("units", {})
                        unit_key = "USD" if "USD" in units else ("USD/shares" if "USD/shares" in units else "shares" if "shares" in units else None)
                        if not unit_key:
                            continue
                        vals = units[unit_key]
                        annual = [
                            v for v in vals
                            if v.get("form") in ("10-K", "10-K/A")
                            and v.get("val") is not None
                            and (is_annual(v) or label in {"total_assets", "total_liabilities", "stockholders_equity", "cash"})
                        ]
                        if annual:
                            if report_date:
                                annual = [v for v in annual if date_distance(v.get("end")) <= 548]
                                if not annual:
                                    continue
                                latest = sorted(annual, key=lambda x: (date_distance(x.get("end")), x.get("end", "")))[0]
                            else:
                                latest = sorted(annual, key=lambda x: x.get("end", ""))[-1]
                            highlights[label] = {
                                "value": latest.get("val"),
                                "end": latest.get("end"),
                                "unit": unit_key,
                                "taxonomy": key,
                            }
                            break
        except Exception:
            pass
        return highlights
