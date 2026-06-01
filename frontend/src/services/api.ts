import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export interface FilingRecord {
  accession_number: string
  filing_date: string
  report_date: string | null
  form: string
  primary_document: string | null
  primary_doc_description: string | null
  size: number | null
}

export interface CompanyInfo {
  cik: string
  name: string
  tickers: string[]
  exchanges: string[]
  sic: string | null
  sic_description: string | null
  ein: string | null
  state_of_incorporation: string | null
  fiscal_year_end: string | null
  business_address: Record<string, string> | null
  mailing_address: Record<string, string> | null
  filings_10k: FilingRecord[]
}

export interface FilingDetail {
  ticker: string
  cik: string
  company_name: string
  accession_number: string
  filing_date: string
  report_date: string | null
  business: string
  risk_factors: string
  mda: string
  financials: string
  quantitative: string
  financial_highlights: Record<string, { value: number; end: string; unit: string; taxonomy?: string }>
  financial_tables: FinancialTable[]
}

export interface FinancialTable {
  title: string
  raw_title: string | null
  section: string
  rows: string[][]
  normalized_text: string
  keywords: string[]
  citation_id: string | null
}

export interface EvidenceRef {
  id: string
  label: string
  section_key: string
  line_start: number
  line_end: number
}

export interface FilingAnswer {
  answer: string
  model: string
  sources: string[]
  used_local_llm: boolean
  latency_ms: number | null
  query_class: string | null
  retrieved_chunks: string[]
  reranked_chunks: string[]
  facts: string | null
  evidence_refs: EvidenceRef[]
}

export interface AutocompleteResult {
  ticker: string
  name: string
  cik: string
}

export const searchCompany = (ticker: string) =>
  api.get<CompanyInfo>(`/search/${ticker}`).then(r => r.data)

export const getFilingDetail = (cik: string, accession: string, ticker: string) =>
  api.get<FilingDetail>(`/filing/${cik}/${accession}?ticker=${ticker}`).then(r => r.data)

export const askFiling = (question: string, filing: FilingDetail) =>
  api.post<FilingAnswer>('/ask', { question, filing }, { timeout: 130000 }).then(r => r.data)

export const autocomplete = (q: string) =>
  api.get<AutocompleteResult[]>(`/autocomplete?q=${encodeURIComponent(q)}`).then(r => r.data)

export default api
