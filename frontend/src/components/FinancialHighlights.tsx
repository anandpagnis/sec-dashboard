interface Highlight { value: number; end: string; unit: string; taxonomy?: string }
interface Props { highlights: Record<string, Highlight> }

function fmt(val: number, unit: string): string {
  if (unit === 'USD') {
    const abs = Math.abs(val)
    const sign = val < 0 ? '-' : ''
    if (abs >= 1e12) return `${sign}$${(abs/1e12).toFixed(2)}T`
    if (abs >= 1e9)  return `${sign}$${(abs/1e9).toFixed(2)}B`
    if (abs >= 1e6)  return `${sign}$${(abs/1e6).toFixed(1)}M`
    if (abs >= 1e3)  return `${sign}$${(abs/1e3).toFixed(1)}K`
    return `${sign}$${val.toFixed(2)}`
  }
  if (unit === 'USD/shares') return `$${val.toFixed(2)}`
  return val.toLocaleString()
}

const META: Record<string, { label: string; desc: string }> = {
  revenue:          { label: 'Revenue',            desc: 'Total revenue' },
  net_income:       { label: 'Net Income',          desc: 'Bottom line profit/loss' },
  gross_profit:     { label: 'Gross Profit',        desc: 'Revenue minus COGS' },
  operating_income: { label: 'Operating Income',    desc: 'EBIT' },
  total_assets:     { label: 'Total Assets',        desc: 'Balance sheet total' },
  total_liabilities:{ label: 'Total Liabilities',   desc: 'All obligations' },
  stockholders_equity:{ label: "Shareholders' Equity", desc: 'Book value' },
  eps_basic:        { label: 'EPS (Basic)',          desc: 'Earnings per share' },
  eps_diluted:      { label: 'EPS (Diluted)',        desc: 'Diluted EPS' },
  cash:             { label: 'Cash & Equivalents',  desc: 'Liquid assets' },
  rd_expense:       { label: 'R&D Expense',         desc: 'Research & development' },
  operating_cashflow:{ label: 'Operating Cash Flow', desc: 'Cash from operations' },
}

export default function FinancialHighlights({ highlights }: Props) {
  const entries = Object.entries(highlights).filter(([,v]) => v?.value !== undefined)
  if (!entries.length) return (
    <p style={{ color: 'var(--text3)', fontSize: 13, padding: '16px 0' }}>No XBRL financial data available for this company.</p>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(196px, 1fr))', gap: 10 }}>
      {entries.map(([key, data]) => {
        const isNeg = data.value < 0
        const isIncome = ['net_income','operating_income','gross_profit','operating_cashflow'].includes(key)
        const color = isIncome ? (isNeg ? 'var(--red)' : 'var(--green)') : 'var(--text)'
        const meta = META[key] || { label: key, desc: '' }
        return (
          <div key={key} style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 18px',
            boxShadow: 'var(--shadow)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {meta.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color, fontFamily: 'var(--mono)', letterSpacing: '-0.02em' }}>
              {fmt(data.value, data.unit)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              FY ending {data.end}
            </div>
            {data.taxonomy && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {data.taxonomy}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
