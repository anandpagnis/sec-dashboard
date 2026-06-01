from fastapi import APIRouter, HTTPException, Query
from sec_client import SECClient
from parser import FilingParser
from models import CompanyInfo, FilingRecord, FilingDetail, FilingQuestion, FilingAnswer
from rag import FilingRAG
import httpx

router = APIRouter()
sec = SECClient()
parser = FilingParser()
rag = FilingRAG(sec)

# In-memory ticker->CIK cache
_ticker_map: dict = {}


async def _load_ticker_map():
    global _ticker_map
    if not _ticker_map:
        data = await sec.get_ticker_mapping()
        _ticker_map = {v["ticker"].upper(): v for v in data.values()}
    return _ticker_map


def _records_from_recent(recent: dict) -> list[FilingRecord]:
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    report_dates = recent.get("reportDate", [])
    accessions = recent.get("accessionNumber", [])
    primary_docs = recent.get("primaryDocument", [])
    primary_descs = recent.get("primaryDocDescription", [])
    sizes = recent.get("size", [])

    filings = []
    for i, form in enumerate(forms):
        if form in ("10-K", "10-K/A"):
            filings.append(FilingRecord(
                accession_number=accessions[i] if i < len(accessions) else "",
                filing_date=dates[i] if i < len(dates) else "",
                report_date=report_dates[i] if i < len(report_dates) else None,
                form=form,
                primary_document=primary_docs[i] if i < len(primary_docs) else None,
                primary_doc_description=primary_descs[i] if i < len(primary_descs) else None,
                size=sizes[i] if i < len(sizes) else None,
            ))
    return filings


async def _all_10k_records(submissions: dict, include_archived: bool = True) -> list[FilingRecord]:
    filings = _records_from_recent(submissions.get("filings", {}).get("recent", {}))

    if include_archived:
        for file_info in submissions.get("filings", {}).get("files", []):
            filename = file_info.get("name")
            if not filename:
                continue
            try:
                archived = await sec.get_company_submission_file(filename)
                filings.extend(_records_from_recent(archived))
            except Exception:
                continue

    deduped: dict[str, FilingRecord] = {}
    for filing in filings:
        if filing.accession_number:
            deduped[filing.accession_number] = filing
    return sorted(deduped.values(), key=lambda f: f.filing_date or "", reverse=True)


async def _find_filing_record(cik: str, submissions: dict, accession_number: str) -> FilingRecord | None:
    matched: FilingRecord | None = None
    for filing in await _all_10k_records(submissions, include_archived=True):
        if filing.accession_number == accession_number:
            matched = filing
            if filing.primary_document:
                return filing
            break

    index = await sec.get_filing_index(cik, accession_number)
    for doc in index.get("directory", {}).get("item", []):
        name = doc.get("name", "")
        lower_name = name.lower()
        is_document = lower_name.endswith((".htm", ".html", ".txt"))
        is_index_page = "index" in lower_name or "filingsummary" in lower_name
        if is_document and not is_index_page:
            raw_size = doc.get("size")
            try:
                size = int(raw_size) if raw_size not in (None, "") else matched.size if matched else None
            except (TypeError, ValueError):
                size = matched.size if matched else None
            return FilingRecord(
                accession_number=accession_number,
                filing_date=matched.filing_date if matched else "",
                report_date=matched.report_date if matched else None,
                form=matched.form if matched else "10-K",
                primary_document=name,
                primary_doc_description=matched.primary_doc_description if matched else doc.get("type"),
                size=size,
            )
    if matched:
        matched.primary_document = matched.primary_document or f"{accession_number}.txt"
    return matched


@router.get("/search/{ticker}", response_model=CompanyInfo)
async def search_company(ticker: str):
    """Resolve ticker to company info and return filing history."""
    mapping = await _load_ticker_map()
    key = ticker.upper().strip()

    if key not in mapping:
        raise HTTPException(status_code=404, detail=f"Ticker '{ticker}' not found")

    company = mapping[key]
    cik = str(company["cik_str"])

    try:
        data = await sec.get_company_submissions(cik)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"SEC API error: {e}")

    filings_10k = await _all_10k_records(data, include_archived=True)

    addresses = data.get("addresses", {})

    return CompanyInfo(
        cik=cik,
        name=data.get("name", company.get("title", "")),
        tickers=data.get("tickers", [key]),
        exchanges=data.get("exchanges", []),
        sic=data.get("sic", None),
        sic_description=data.get("sicDescription", None),
        ein=data.get("ein", None),
        state_of_incorporation=data.get("stateOfIncorporation", None),
        fiscal_year_end=data.get("fiscalYearEnd", None),
        business_address=addresses.get("business"),
        mailing_address=addresses.get("mailing"),
        filings_10k=filings_10k,
    )


@router.get("/filing/{cik}/{accession_number}", response_model=FilingDetail)
async def get_filing_detail(cik: str, accession_number: str, ticker: str = Query("")):
    """Fetch and parse a specific 10-K filing."""
    # Get company submissions to find primary document
    try:
        data = await sec.get_company_submissions(cik)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"SEC error: {e}")

    filing = await _find_filing_record(cik, data, accession_number)

    if not filing or not filing.primary_document:
        raise HTTPException(status_code=404, detail="Filing document not found")

    try:
        html = await sec.get_filing_document(cik, accession_number, filing.primary_document)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch document: {e}")

    sections = parser.parse_10k(html)
    financial_tables = parser.extract_financial_tables(html)

    # Try to get financial highlights
    financial_highlights = {}
    try:
        facts = await sec.get_company_facts(cik)
        financial_highlights = parser.extract_financial_highlights(facts, filing.report_date)
    except Exception:
        pass

    return FilingDetail(
        ticker=ticker.upper() or data.get("tickers", [""])[0],
        cik=cik,
        company_name=data.get("name", ""),
        accession_number=accession_number,
        filing_date=filing.filing_date,
        report_date=filing.report_date,
        financial_highlights=financial_highlights,
        financial_tables=financial_tables,
        **sections,
    )


@router.get("/financials/{cik}")
async def get_financials(cik: str):
    """Get XBRL financial facts for a company."""
    try:
        facts = await sec.get_company_facts(cik)
        highlights = parser.extract_financial_highlights(facts)
        return {"cik": cik, "highlights": highlights}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"SEC error: {e}")


@router.get("/autocomplete")
async def autocomplete(q: str = Query(..., min_length=1)):
    """Autocomplete ticker/company names."""
    mapping = await _load_ticker_map()
    q_up = q.upper()
    results = []
    for ticker_key, info in mapping.items():
        if ticker_key.startswith(q_up) or q_up in info.get("title", "").upper():
            results.append({
                "ticker": ticker_key,
                "name": info.get("title", ""),
                "cik": info.get("cik_str", ""),
            })
        if len(results) >= 10:
            break
    return results


@router.post("/ask", response_model=FilingAnswer)
async def ask_filing(payload: FilingQuestion):
    """Ask the filing-aware hybrid RAG pipeline a question."""
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    return await rag.answer(question, payload.filing)
