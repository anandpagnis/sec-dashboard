import { CompanyInfo } from '../services/api'

interface Props { company: CompanyInfo }

function Card({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '14px 16px', boxShadow: 'var(--shadow)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', fontFamily: mono ? 'var(--mono)' : 'var(--sans)' }}>{value || '—'}</div>
    </div>
  )
}

export default function CompanyOverview({ company }: Props) {
  const addr = company.business_address
  const addrStr = addr ? [addr.street1, addr.city, addr.stateOrCountry, addr.zipCode].filter(Boolean).join(', ') : null

  return (
    <div style={{ animation: 'fadeUp 0.3s ease' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24,
        padding: 20, background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 8,
          background: 'var(--accent-light)', border: '2px solid var(--accent-mid)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--accent)',
          flexShrink: 0,
        }}>{company.tickers[0]?.slice(0, 2) || '??'}</div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--text)', marginBottom: 6 }}>{company.name}</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {company.tickers.map(t => (
              <span key={t} style={{ fontSize: 11, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 3, background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-mid)' }}>{t}</span>
            ))}
            {company.exchanges.map(e => (
              <span key={e} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'var(--bg3)', color: 'var(--text2)' }}>{e}</span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        <Card label="CIK" value={company.cik} mono />
        <Card label="SIC Code" value={company.sic} mono />
        <Card label="Industry" value={company.sic_description} />
        <Card label="State of Incorporation" value={company.state_of_incorporation} />
        <Card label="Fiscal Year End" value={company.fiscal_year_end} />
        <Card label="EIN" value={company.ein} mono />
        <Card label="Business Address" value={addrStr} />
        <Card label="10-K Filings on Record" value={`${company.filings_10k.length} filings`} />
      </div>
    </div>
  )
}
