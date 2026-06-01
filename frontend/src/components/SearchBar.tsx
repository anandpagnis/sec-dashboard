import { useState, useEffect, useRef } from 'react'
import { autocomplete, AutocompleteResult } from '../services/api'

interface Props {
  onSearch: (ticker: string) => void
  loading: boolean
}

export default function SearchBar({ onSearch, loading }: Props) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AutocompleteResult[]>([])
  const [show, setShow] = useState(false)
  const [focused, setFocused] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (query.length < 1) { setSuggestions([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await autocomplete(query)
        setSuggestions(r)
        setShow(true)
      } catch { setSuggestions([]) }
    }, 200)
  }, [query])

  const submit = () => {
    if (query.trim()) { setShow(false); onSearch(query.trim().toUpperCase()) }
  }

  const select = (ticker: string) => {
    setQuery(ticker); setShow(false); onSearch(ticker)
  }

  return (
    <div style={{ position: 'relative', maxWidth: 520, width: '100%' }}>
      <div style={{
        display: 'flex',
        border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        background: 'var(--card)',
        boxShadow: focused ? '0 0 0 3px rgba(193,127,62,0.12)' : 'var(--shadow)',
        transition: 'all 0.15s',
        overflow: 'hidden',
      }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value.toUpperCase())}
          onFocus={() => { setFocused(true); if (suggestions.length) setShow(true) }}
          onBlur={() => { setFocused(false); setTimeout(() => setShow(false), 160) }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Ticker symbol — AAPL, MSFT, GOOGL..."
          style={{
            flex: 1, border: 'none', outline: 'none',
            padding: '13px 16px',
            background: 'transparent',
            fontSize: 15, fontWeight: 500,
            color: 'var(--text)',
            fontFamily: 'var(--mono)',
            letterSpacing: '0.03em',
          }}
        />
        <button
          onClick={submit}
          disabled={loading || !query.trim()}
          style={{
            padding: '0 22px',
            background: query.trim() ? 'var(--accent)' : 'var(--bg3)',
            color: query.trim() ? '#fff' : 'var(--text3)',
            fontWeight: 600, fontSize: 13,
            letterSpacing: '0.04em',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--sans)',
          }}
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {show && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-md)',
          zIndex: 200, maxHeight: 260, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <div key={i} onMouseDown={() => select(s.ticker)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, fontSize: 13, color: 'var(--accent)', minWidth: 56 }}>{s.ticker}</span>
              <span style={{ color: 'var(--text2)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
