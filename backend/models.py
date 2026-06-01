from pydantic import BaseModel, Field
from typing import Optional, List, Any


class FilingRecord(BaseModel):
    accession_number: str
    filing_date: str
    report_date: Optional[str] = None
    form: str
    primary_document: Optional[str] = None
    primary_doc_description: Optional[str] = None
    size: Optional[int] = None


class CompanyInfo(BaseModel):
    cik: str
    name: str
    tickers: List[str]
    exchanges: List[str]
    sic: Optional[str] = None
    sic_description: Optional[str] = None
    ein: Optional[str] = None
    state_of_incorporation: Optional[str] = None
    fiscal_year_end: Optional[str] = None
    business_address: Optional[dict] = None
    mailing_address: Optional[dict] = None
    filings_10k: List[FilingRecord] = Field(default_factory=list)


class FinancialTable(BaseModel):
    title: str
    raw_title: Optional[str] = None
    section: str
    rows: List[List[str]]
    normalized_text: str
    keywords: List[str] = Field(default_factory=list)
    citation_id: Optional[str] = None


class FilingDetail(BaseModel):
    ticker: str
    cik: str
    company_name: str
    accession_number: str
    filing_date: str
    report_date: Optional[str] = None
    business: str
    risk_factors: str
    mda: str
    financials: str
    quantitative: str
    financial_highlights: dict = Field(default_factory=dict)
    financial_tables: List[FinancialTable] = Field(default_factory=list)


class FilingQuestion(BaseModel):
    question: str
    filing: FilingDetail


class FilingAnswer(BaseModel):
    answer: str
    model: str
    sources: List[str] = Field(default_factory=list)
    used_local_llm: bool = True
    latency_ms: Optional[int] = None
    query_class: Optional[str] = None
    retrieved_chunks: List[str] = Field(default_factory=list)
    reranked_chunks: List[str] = Field(default_factory=list)
    facts: Optional[str] = None
    evidence_refs: List[dict] = Field(default_factory=list)
