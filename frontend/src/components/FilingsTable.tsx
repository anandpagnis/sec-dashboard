import { FilingRecord } from '../services/api'

interface Props {
  filings: FilingRecord[]
  cik: string
  ticker: string
  onSelect: (accession: string) => void
  selectedAccession: string | null
  loading: boolean
}

function fmtSize(b: number | null) {
  if (!b) return '—'
  if (b > 1e6) return `${(b/1e6).toFixed(1)} MB`
  if (b > 1e3) return `${(b/1e3).toFixed(0)} KB`
  return `${b} B`
}

export default function FilingsTable({ filings, cik, ticker, onSelect, selectedAccession, loading }: Props) {
  if (!filings.length) return <p style={{ color: 'var(--text3)', padding: '24px 0' }}>No 10-K filings on record.</p>

  return (
    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
            {['Form', 'Filed', 'Period', 'Document', 'Size', ''].map(h => (
              <th key={h} style={{
                padding: '10px 16px', textAlign: 'left',
                fontSize: 11, fontWeight: 600, color: 'var(--text2)',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filings.map((f, i) => {
            const sel = f.accession_number === selectedAccession
            const isLoading = sel && loading
            const cleanAcc = f.accession_number.replace(/-/g, '')
            const edgarUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAcc}/${f.primary_document}`
            return (
              <tr key={i}
                style={{
                  borderBottom: i < filings.length - 1 ? '1px solid var(--border)' : 'none',
                  background: sel ? 'var(--accent-light)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg2)' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ padding: '11px 16px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 3,
                    background: f.form === '10-K' ? 'var(--green-bg)' : 'var(--blue-bg)',
                    color: f.form === '10-K' ? 'var(--green)' : 'var(--blue)',
                    fontFamily: 'var(--mono)',
                  }}>{f.form}</span>
                </td>
                <td style={{ padding: '11px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{f.filing_date}</td>
                <td style={{ padding: '11px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>{f.report_date || '—'}</td>
                <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.primary_document || '—'}</td>
                <td style={{ padding: '11px 16px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{fmtSize(f.size)}</td>
                <td style={{ padding: '11px 16px' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      onClick={() => onSelect(f.accession_number)}
                      disabled={isLoading}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '6px 14px',
                        borderRadius: 'var(--radius)',
                        background: sel ? 'var(--accent)' : 'transparent',
                        color: sel ? '#fff' : 'var(--accent)',
                        border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--accent)'}`,
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                        opacity: isLoading ? 0.6 : 1,
                      }}
                    >
                      {isLoading ? 'Loading...' : sel ? '✓ Loaded' : 'Analyze'}
                    </button>
                    {f.primary_document && (
                      <a href={edgarUrl} target="_blank" rel="noopener noreferrer"
                        style={{
                          fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius)',
                          border: '1.5px solid var(--border2)', color: 'var(--text2)',
                          transition: 'all 0.15s', whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text2)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)' }}
                      >EDGAR ↗</a>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
