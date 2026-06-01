import { useState, useMemo, useRef, useEffect } from 'react'

interface Props {
  title: string
  content: string
  tag: string
  sectionKey: string
  globalSearch?: string
}

function highlight(text: string, term: string): React.ReactNode[] {
  if (!term.trim()) return [text]
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase()
      ? <mark key={i}>{p}</mark>
      : p
  )
}

function countMatches(text: string, term: string): number {
  if (!term.trim()) return 0
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (text.match(new RegExp(escaped, 'gi')) || []).length
}

export default function SectionReader({ title, content, tag, sectionKey, globalSearch = '' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  const missing = !content || content.trim() === ''
  const searchTerm = localSearch || globalSearch
  const matches = useMemo(() => countMatches(content, searchTerm), [content, searchTerm])
  const wordCount = useMemo(() => content.split(/\s+/).filter(Boolean).length, [content])

  // Auto-expand if global search has matches
  useEffect(() => {
    if (globalSearch && matches > 0) setExpanded(true)
  }, [globalSearch, matches])

  useEffect(() => {
    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<{ sectionKey: string; lineStart: number }>).detail
      if (detail?.sectionKey !== sectionKey) return
      setExpanded(true)
      setTimeout(() => {
        document.getElementById(`sec-${sectionKey}-line-${detail.lineStart}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 80)
    }
    window.addEventListener('filing-citation-jump', onJump)
    return () => window.removeEventListener('filing-citation-jump', onJump)
  }, [sectionKey])

  const renderContent = () => {
    const lines = content.split('\n')
    if (!searchTerm.trim()) return lines.map((line, i) => (
      <span id={`sec-${sectionKey}-line-${i + 1}`} key={i} style={{ display: 'block', scrollMarginTop: 90 }}>
        <span style={{ display: 'inline-block', width: 42, color: 'var(--text3)', userSelect: 'none', fontFamily: 'var(--mono)', fontSize: 11 }}>
          {i + 1}
        </span>
        {line || ' '}
      </span>
    ))
    return content.split('\n').map((line, i) => (
      <span id={`sec-${sectionKey}-line-${i + 1}`} key={i} style={{ display: 'block', scrollMarginTop: 90 }}>
        <span style={{ display: 'inline-block', width: 42, color: 'var(--text3)', userSelect: 'none', fontFamily: 'var(--mono)', fontSize: 11 }}>
          {i + 1}
        </span>
        {highlight(line, searchTerm)}
      </span>
    ))
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      background: 'var(--card)',
      boxShadow: 'var(--shadow)',
      overflow: 'hidden',
      animation: 'fadeUp 0.3s ease',
    }}>
      {/* Header */}
      <div
        onClick={() => !missing && setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          cursor: missing ? 'default' : 'pointer',
          background: expanded ? 'var(--accent-light)' : 'var(--card)',
          borderBottom: expanded ? '1px solid var(--accent-mid)' : 'none',
          transition: 'background 0.15s',
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!missing && !expanded) e.currentTarget.style.background = 'var(--bg2)' }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'var(--card)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px',
            borderRadius: 3, background: 'var(--accent)', color: '#fff',
            fontFamily: 'var(--mono)', letterSpacing: '0.06em', flexShrink: 0,
          }}>{tag}</span>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{title}</span>
          {!missing && (
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              {wordCount.toLocaleString()} words
            </span>
          )}
          {matches > 0 && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: '#fde68a', color: '#92400e', fontWeight: 600,
            }}>
              {matches} match{matches !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {missing && <span style={{ fontSize: 12, color: 'var(--text3)' }}>Not found</span>}
          {!missing && (
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
              {expanded ? '▲ Collapse' : '▼ Expand'}
            </span>
          )}
        </div>
      </div>

      {/* Preview (collapsed) */}
      {!expanded && !missing && (
        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {highlight(content.slice(0, 400).trim(), searchTerm)}
            {content.length > 400 && <span style={{ color: 'var(--text3)' }}>… <button onClick={e => { e.stopPropagation(); setExpanded(true) }} style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}>Read full section ({wordCount.toLocaleString()} words)</button></span>}
          </p>
        </div>
      )}

      {/* Full content (expanded) */}
      {expanded && !missing && (
        <div>
          {/* Search bar */}
          <div style={{
            padding: '10px 18px',
            background: 'var(--bg2)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <input
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              placeholder={`Search within ${title}...`}
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, padding: '7px 12px',
                border: '1px solid var(--border2)',
                borderRadius: 'var(--radius)',
                background: 'var(--card)',
                fontSize: 13, color: 'var(--text)',
                outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 2px rgba(193,127,62,0.15)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border2)'; e.target.style.boxShadow = 'none' }}
            />
            {localSearch && (
              <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                {matches} result{matches !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={e => { e.stopPropagation(); setLocalSearch('') }}
              style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 8px' }}
            >✕</button>
          </div>

          {/* Text */}
          <div
            ref={contentRef}
            style={{
              padding: '20px 24px',
              maxHeight: 640,
              overflowY: 'auto',
            }}
          >
            <pre style={{
              fontFamily: 'var(--sans)',
              fontSize: 13.5,
              lineHeight: 1.85,
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {renderContent()}
            </pre>
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 18px',
            background: 'var(--bg2)',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              {wordCount.toLocaleString()} words · {content.length.toLocaleString()} chars
            </span>
            <button
              onClick={e => { e.stopPropagation(); setExpanded(false) }}
              style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}
            >▲ Collapse</button>
          </div>
        </div>
      )}
    </div>
  )
}
