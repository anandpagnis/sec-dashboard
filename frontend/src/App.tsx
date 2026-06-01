import { useState, useMemo } from 'react'
import SearchBar from './components/SearchBar'
import CompanyOverview from './components/CompanyOverview'
import FilingsTable from './components/FilingsTable'
import FinancialHighlights from './components/FinancialHighlights'
import FinancialTables from './components/FinancialTables'
import LocalQueryPanel from './components/LocalQueryPanel'
import SectionReader from './components/SectionReader'
import { searchCompany, getFilingDetail, CompanyInfo, FilingDetail } from './services/api'

type Tab = 'overview' | 'filings' | 'detail'

const SECTIONS = [
  { key: 'business' as const,      tag: 'ITEM 1',   title: 'Business Overview' },
  { key: 'risk_factors' as const,  tag: 'ITEM 1A',  title: 'Risk Factors' },
  { key: 'mda' as const,           tag: 'ITEM 7',   title: "Management's Discussion & Analysis" },
  { key: 'quantitative' as const,  tag: 'ITEM 7A',  title: 'Quantitative & Qualitative Disclosures' },
  { key: 'financials' as const,    tag: 'ITEM 8',   title: 'Financial Statements & Supplementary Data' },
]

export default function App() {
  const [loading, setLoading] = useState(false)
  const [loadingFiling, setLoadingFiling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [detail, setDetail] = useState<FilingDetail | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [selectedAcc, setSelectedAcc] = useState<string | null>(null)
  const [globalSearch, setGlobalSearch] = useState('')

  const handleSearch = async (ticker: string) => {
    setLoading(true); setError(null); setCompany(null); setDetail(null)
    setSelectedAcc(null); setActiveTab('overview'); setGlobalSearch('')
    try {
      setCompany(await searchCompany(ticker))
    } catch (e: any) {
      setError(e?.response?.data?.detail || `"${ticker}" not found. Check the symbol.`)
    } finally { setLoading(false) }
  }

  const handleSelectFiling = async (acc: string) => {
    if (!company) return
    setSelectedAcc(acc); setLoadingFiling(true)
    setDetail(null); setActiveTab('detail'); setGlobalSearch('')
    try {
      setDetail(await getFilingDetail(company.cik, acc, company.tickers[0]))
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load filing.'); setActiveTab('filings')
    } finally { setLoadingFiling(false) }
  }

  // Global search match counts per section
  const matchCounts = useMemo(() => {
    if (!detail || !globalSearch.trim()) return {}
    const term = globalSearch.toLowerCase()
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const count = (text: string) => (text.match(new RegExp(esc, 'gi')) || []).length
    return {
      business: count(detail.business),
      risk_factors: count(detail.risk_factors),
      mda: count(detail.mda),
      quantitative: count(detail.quantitative),
      financials: count(detail.financials),
    }
  }, [detail, globalSearch])

  const totalMatches = Object.values(matchCounts).reduce((a, b) => a + b, 0)

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', disabled: !company },
    { id: 'filings' as Tab, label: `10-K History${company ? ` (${company.filings_10k.length})` : ''}`, disabled: !company },
    { id: 'detail' as Tab, label: 'Filing Analysis', disabled: !detail && !loadingFiling },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Top nav */}
      <header style={{
        background: 'var(--card)', borderBottom: '1px solid var(--border)',
        padding: '0 32px', height: 56, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>§</span>
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font)' }}>
            SEC 10-K Research
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 10 }}>
            EDGAR Live
          </span>
        </div>
        {detail && (
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            <strong>{detail.ticker}</strong> · {detail.company_name} · Filed {detail.filing_date}
          </span>
        )}
      </header>

      {/* Search hero */}
      <div style={{
        background: 'var(--card)', borderBottom: '1px solid var(--border)',
        padding: '28px 32px',
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          Search public company
        </p>
        <SearchBar onSearch={handleSearch} loading={loading} />

        {error && (
          <div style={{
            marginTop: 10, padding: '10px 14px', maxWidth: 520,
            background: 'var(--red-bg)', border: '1px solid #f5c6c2',
            borderRadius: 'var(--radius)', color: 'var(--red)', fontSize: 13,
          }}>⚠ {error}</div>
        )}

        {!company && !loading && (
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM'].map(t => (
              <button key={t} onClick={() => handleSearch(t)} style={{
                fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 500,
                padding: '5px 12px', borderRadius: 'var(--radius)',
                border: '1px solid var(--border2)', color: 'var(--text2)',
                background: 'var(--bg2)', transition: 'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text2)' }}
              >{t}</button>
            ))}
          </div>
        )}
      </div>

      {company && (
        <>
          {/* Tabs */}
          <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 32px', display: 'flex', gap: 0 }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => !tab.disabled && setActiveTab(tab.id)} disabled={tab.disabled}
                style={{
                  padding: '14px 18px', fontWeight: 600, fontSize: 13,
                  color: activeTab === tab.id ? 'var(--accent)' : tab.disabled ? 'var(--text3)' : 'var(--text2)',
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  background: 'transparent', transition: 'color 0.15s',
                  cursor: tab.disabled ? 'not-allowed' : 'pointer',
                  marginBottom: -1,
                }}
              >{tab.label}</button>
            ))}
          </div>

          {/* Main content */}
          <main style={{ padding: '28px 32px', maxWidth: 1200 }}>

            {activeTab === 'overview' && <CompanyOverview company={company} />}

            {activeTab === 'filings' && (
              <div style={{ animation: 'fadeUp 0.25s ease' }}>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                  Select a filing to analyze its full text content.
                </p>
                <FilingsTable
                  filings={company.filings_10k}
                  cik={company.cik}
                  ticker={company.tickers[0]}
                  onSelect={handleSelectFiling}
                  selectedAccession={selectedAcc}
                  loading={loadingFiling}
                />
              </div>
            )}

            {activeTab === 'detail' && (
              <div style={{ animation: 'fadeUp 0.25s ease' }}>

                {loadingFiling && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '80px 0' }}>
                    <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    <p style={{ color: 'var(--text3)', fontSize: 13 }}>Fetching 10-K from SEC EDGAR — this may take a moment for large filings…</p>
                  </div>
                )}

                {detail && !loadingFiling && (
                  <>
                    {/* Filing banner */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      flexWrap: 'wrap', gap: 12, marginBottom: 24,
                      padding: '16px 20px', background: 'var(--card)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
                    }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Annual Report · Form 10-K</div>
                        <div style={{ fontWeight: 600, fontSize: 17, fontFamily: 'var(--font)' }}>{detail.company_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <span>Filed: <strong>{detail.filing_date}</strong></span>
                          {detail.report_date && <span>Period: <strong>{detail.report_date}</strong></span>}
                          <span>Accession: <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{detail.accession_number}</code></span>
                        </div>
                      </div>
                      <button onClick={() => setActiveTab('filings')}
                        style={{ fontSize: 13, padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>
                        ← Back to history
                      </button>
                    </div>

                    {/* Financial highlights */}
                    <section style={{ marginBottom: 28 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                        Financial Highlights (XBRL)
                      </h3>
                      <FinancialHighlights highlights={detail.financial_highlights} />
                    </section>

                    <section style={{ marginBottom: 28 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                        Financial Statements Tables
                      </h3>
                      <FinancialTables tables={detail.financial_tables} />
                    </section>

                    <section style={{ marginBottom: 28 }}>
                      <LocalQueryPanel filing={detail} />
                    </section>

                    {/* Global search across all sections */}
                    <section style={{ marginBottom: 20 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        Search Across All Sections
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 520 }}>
                        <input
                          value={globalSearch}
                          onChange={e => setGlobalSearch(e.target.value)}
                          placeholder='e.g. "artificial intelligence", "revenue", "risk"…'
                          style={{
                            flex: 1, padding: '10px 14px',
                            border: '1.5px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            background: 'var(--card)', fontSize: 13,
                            outline: 'none', color: 'var(--text)',
                          }}
                          onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px rgba(193,127,62,0.12)' }}
                          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
                        />
                        {globalSearch && (
                          <>
                            <span style={{ fontSize: 13, color: totalMatches > 0 ? 'var(--green)' : 'var(--text3)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              {totalMatches} total match{totalMatches !== 1 ? 'es' : ''}
                            </span>
                            <button onClick={() => setGlobalSearch('')} style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 8px' }}>✕ Clear</button>
                          </>
                        )}
                      </div>
                    </section>

                    {/* All sections */}
                    <section>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                        Filing Sections
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {SECTIONS.map(s => (
                          <SectionReader
                            key={s.key}
                            tag={s.tag}
                            title={s.title}
                            content={detail[s.key]}
                            sectionKey={s.key}
                            globalSearch={globalSearch}
                          />
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}
          </main>
        </>
      )}

      {/* Empty state */}
      {!company && !loading && (
        <div style={{ padding: '80px 32px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.15 }}>§</div>
          <h2 style={{ fontFamily: 'var(--font)', fontSize: 22, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
            SEC 10-K Research Terminal
          </h2>
          <p style={{ color: 'var(--text2)', lineHeight: 1.7, fontSize: 14 }}>
            Search any public company by ticker symbol to access its full annual filings, parsed section-by-section, with cross-document search.
          </p>
        </div>
      )}
    </div>
  )
}
