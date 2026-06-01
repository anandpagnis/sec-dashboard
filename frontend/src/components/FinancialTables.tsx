import { useEffect, useMemo, useState } from 'react'
import { FinancialTable } from '../services/api'

interface Props {
  tables: FinancialTable[]
}

function normalizeTitle(title: string) {
  return title.replace(/\s+/g, ' ').trim()
}

const MAIN_STATEMENTS = [
  {
    label: 'Income Statement',
    patterns: [
      /income statement/i,
      /statement of operations/i,
      /results of operations/i,
      /profit and loss/i,
    ],
  },
  {
    label: 'Balance Sheet',
    patterns: [
      /balance sheet/i,
      /statement of financial position/i,
    ],
  },
  {
    label: 'Cash Flow Statement',
    patterns: [
      /cash flow/i,
      /statement of cash flows/i,
    ],
  },
]

function searchText(table: FinancialTable) {
  const text = `${table.title} ${table.raw_title || ''} ${table.keywords.join(' ')}`.toLowerCase()
  return text
}

function scoreTable(table: FinancialTable) {
  const text = searchText(table)
  if (/(revenue|net sales|segment|services|product|geographic)/.test(text)) return 3
  if (/(income|operations|cash|assets|liabilities|equity)/.test(text)) return 2
  return 1
}

function isHeaderRow(row: string[]) {
  const numeric = row.filter(cell => /^\s*[\$\(]?\d[\d,.\)\s%/-]*\s*$/.test(cell)).length
  const text = row.join(' ').toLowerCase()
  const dateLike = /(years ended|year ended|months ended|quarter ended|period ended|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|change|\b20\d{2}\b)/.test(text)
  return row.length > 1 && (dateLike || numeric < Math.max(1, Math.floor(row.length / 2)))
}

function isPeriodHeaderRow(row: string[]) {
  const text = row.join(' ').toLowerCase()
  return /(years ended|year ended|months ended|quarter ended|period ended|\b20\d{2}\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|change)/.test(text)
}

function alignHeaderRow(headerRow: string[] | null, bodyRows: string[][]) {
  if (!headerRow) return null
  const bodyMaxCols = bodyRows.reduce((max, row) => Math.max(max, row.length), 0)
  if (bodyMaxCols > headerRow.length && bodyMaxCols - headerRow.length === 1 && isPeriodHeaderRow(headerRow)) {
    return ['', ...headerRow]
  }
  return headerRow
}

function findHeaderIndex(rows: string[][]) {
  let bestIndex = -1
  let bestScore = 0
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    const row = rows[i]
    const text = row.join(' ').toLowerCase()
    let score = 0
    if (isHeaderRow(row)) score += 1
    if (/(years ended|year ended|months ended|quarter ended|period ended)/.test(text)) score += 2
    if (/(change|\b20\d{2}\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(text)) score += 1
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }
  return bestScore >= 2 ? bestIndex : -1
}

function padRows(rows: string[][]) {
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0)
  return rows.map(row => [...row, ...Array(Math.max(0, maxCols - row.length)).fill('')])
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function findByCitation(tables: FinancialTable[], citationId?: string | null) {
  if (!citationId) return undefined
  return tables.find(t => t.citation_id === citationId)
}

export default function FinancialTables({ tables }: Props) {
  const ranked = useMemo(
    () => [...tables]
      .sort((a, b) => scoreTable(b) - scoreTable(a))
      .slice(0, 18),
    [tables],
  )

  const mainTables = useMemo(() => {
    return MAIN_STATEMENTS.map(def => {
      const table = ranked.find(item => def.patterns.some(pattern => pattern.test(searchText(item))))
      return { ...def, table }
    })
  }, [ranked])

  const coreTables = useMemo(
    () => mainTables.flatMap(item => (item.table ? [item.table] : [])),
    [mainTables],
  )

  const fallbackSelected = coreTables[0] || ranked[0]
  const [selectedId, setSelectedId] = useState<string | null>(fallbackSelected?.citation_id || null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setSelectedId(prev => prev && findByCitation(ranked, prev) ? prev : (fallbackSelected?.citation_id || ranked[0]?.citation_id || null))
  }, [fallbackSelected?.citation_id, ranked])

  const selected = useMemo(
    () => findByCitation(ranked, selectedId) || fallbackSelected || ranked[0],
    [fallbackSelected, ranked, selectedId],
  )

  const otherTables = useMemo(
    () => ranked.filter(t => !coreTables.some(core => core.citation_id === t.citation_id)),
    [coreTables, ranked],
  )

  if (!ranked.length || !selected) {
    return <p style={{ color: 'var(--text3)', fontSize: 13, padding: '16px 0' }}>No financial tables were extracted from this filing.</p>
  }

  const normalizedRows = padRows(selected.rows)
  const columnCount = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0)
  const headerIndex = findHeaderIndex(normalizedRows)
  const headerRow = headerIndex >= 0 ? normalizedRows[headerIndex] : null
  const preHeaderRows = headerIndex > 0 ? normalizedRows.slice(0, headerIndex) : []
  const bodyRows = headerIndex >= 0 ? normalizedRows.slice(headerIndex + 1) : normalizedRows
  const displayHeaderRow = alignHeaderRow(headerRow, bodyRows)
  const displayColumnCount = Math.max(columnCount, displayHeaderRow?.length || 0)
  const firstColWidth = displayColumnCount <= 2 ? 48 : displayColumnCount === 3 ? 42 : displayColumnCount === 4 ? 38 : 34
  const remainingWidth = clamp((100 - firstColWidth) / Math.max(1, displayColumnCount - 1), 10, 28)

  return (
    <div id="sec-financial_tables-line-1" style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      background: 'var(--card)',
      boxShadow: 'var(--shadow)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Financial Statements Tables</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
            {ranked.length} extracted tables
          </div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 10px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border2)',
            background: 'var(--card)',
            color: 'var(--text2)',
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Main statements
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mainTables.map(item => {
            const table = item.table
            const active = table?.citation_id === selected.citation_id
            return (
              <button
                key={item.label}
                onClick={() => table && setSelectedId(table.citation_id || null)}
                disabled={!table}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '7px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border2)'}`,
                  background: active ? 'var(--accent-light)' : table ? 'var(--bg2)' : 'var(--bg3)',
                  color: active ? 'var(--accent)' : table ? 'var(--text2)' : 'var(--text3)',
                  opacity: table ? 1 : 0.7,
                }}
                title={table ? (table.raw_title || table.title) : `${item.label} not available`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: expanded ? 'minmax(220px, 300px) 1fr' : '1fr',
        gap: expanded ? 14 : 0,
        padding: 14,
      }}>
        {expanded && (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--card)',
            overflow: 'hidden',
            maxHeight: 560,
            overflowY: 'auto',
          }}>
            <div style={{ padding: '10px 12px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                More tables
              </div>
            </div>
            {otherTables.map((table, idx) => {
              const active = table.citation_id === selected.citation_id
              return (
                <button
                  key={table.citation_id || `${table.title}-${idx}`}
                  onClick={() => setSelectedId(table.citation_id || null)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderBottom: idx < otherTables.length - 1 ? '1px solid var(--border)' : 'none',
                    background: active ? 'var(--accent-light)' : 'var(--card)',
                    color: active ? 'var(--accent)' : 'var(--text2)',
                  }}
                  title={table.raw_title || table.title}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {normalizeTitle(table.title)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                    {table.rows.length} rows · {table.keywords.slice(0, 3).join(', ')}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
          minWidth: 0,
        }}>
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg2)',
          }}>
            <div
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}
              title={selected.raw_title || selected.title}
            >
              {normalizeTitle(selected.title)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              Evidence ref: {selected.citation_id || 'financial_tables:unknown'}
            </div>
          </div>

          <div style={{ overflow: 'auto', maxHeight: 560 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 720 }}>
              <colgroup>
                {Array.from({ length: displayColumnCount }, (_, i) => (
                  <col
                    key={i}
                    style={{ width: i === 0 ? `${firstColWidth}%` : `${remainingWidth}%` }}
                  />
                ))}
              </colgroup>
              {displayHeaderRow && (
                <thead>
                  <tr>
                    {displayHeaderRow.map((cell, i) => (
                      <th key={i} style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                        padding: '8px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--text2)',
                        background: 'var(--bg2)',
                        borderBottom: '1px solid var(--border)',
                        textAlign: i === 0 ? 'left' : 'right',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        verticalAlign: 'bottom',
                      }}>
                        {cell || ' '}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {preHeaderRows.map((row, rowIndex) => (
                  <tr key={`pre-${rowIndex}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td
                      colSpan={displayColumnCount || 1}
                      style={{
                        padding: '8px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--text2)',
                        background: 'var(--bg2)',
                        fontStyle: 'italic',
                        letterSpacing: '0.01em',
                        wordBreak: 'break-word',
                      }}
                    >
                      {row.join(' ')}
                    </td>
                  </tr>
                ))}
                {(displayHeaderRow ? bodyRows : normalizedRows).map((row, rowIndex) => (
                  <tr key={rowIndex} style={{ borderBottom: '1px solid var(--border)' }}>
                    {row.length === 1 ? (
                      <td
                        colSpan={displayColumnCount || 1}
                        style={{
                          padding: '8px 10px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text2)',
                          background: 'var(--bg2)',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          verticalAlign: 'top',
                        }}
                      >
                        {row[0] || ' '}
                      </td>
                    ) : (
                      row.map((cell, cellIndex) => (
                        <td key={cellIndex} style={{
                          padding: '8px 10px',
                          fontSize: 12,
                          fontWeight: cellIndex === 0 ? 500 : 400,
                          color: 'var(--text)',
                          fontFamily: cellIndex === 0 ? 'var(--sans)' : 'var(--mono)',
                          textAlign: cellIndex === 0 ? 'left' : 'right',
                          whiteSpace: cellIndex === 0 ? 'normal' : 'nowrap',
                          wordBreak: 'break-word',
                          verticalAlign: 'top',
                          lineHeight: 1.4,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {cell || ' '}
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
