import { useState } from 'react'
import { askFiling, FilingAnswer, FilingDetail } from '../services/api'

interface Props {
  filing: FilingDetail
}

const EXAMPLES = [
  'What drove revenue and margin changes?',
  'Summarize the biggest risk factors.',
  'What evidence suggests Services is becoming more important than hardware?',
]

export default function LocalQueryPanel({ filing }: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<FilingAnswer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (q = question) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setQuestion(trimmed)
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      setAnswer(await askFiling(trimmed, filing))
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not query the local model.')
    } finally {
      setLoading(false)
    }
  }

  const jumpToEvidence = (sectionKey: string, lineStart: number) => {
    if (sectionKey === 'financial_tables') {
      document.getElementById('sec-financial_tables-line-1')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    window.dispatchEvent(new CustomEvent('filing-citation-jump', {
      detail: { sectionKey, lineStart },
    }))
  }

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Local Filing Q&A
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text3)' }}>
            Hybrid SEC RAG with structural retrieval, reranking, and local Ollama generation.
          </p>
        </div>
        {answer && (
          <span style={{
            fontSize: 11,
            color: answer.used_local_llm ? 'var(--green)' : 'var(--text3)',
            background: answer.used_local_llm ? 'var(--green-bg)' : 'var(--bg2)',
            borderRadius: 10,
            padding: '3px 8px',
            whiteSpace: 'nowrap',
          }}>
            {answer.used_local_llm ? `Local LLM: ${answer.model}` : 'Fallback search'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask about this filing..."
          rows={2}
          style={{
            flex: 1,
            resize: 'vertical',
            minHeight: 46,
            maxHeight: 120,
            padding: '10px 12px',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: 13,
            outline: 'none',
            lineHeight: 1.5,
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px rgba(193,127,62,0.12)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
        />
        <button
          onClick={() => submit()}
          disabled={loading || !question.trim()}
          style={{
            alignSelf: 'stretch',
            minWidth: 96,
            padding: '0 16px',
            borderRadius: 'var(--radius)',
            background: question.trim() ? 'var(--accent)' : 'var(--bg3)',
            color: question.trim() ? '#fff' : 'var(--text3)',
            fontWeight: 700,
            fontSize: 13,
            opacity: loading ? 0.65 : 1,
          }}
        >
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: answer || error ? 12 : 0 }}>
        {EXAMPLES.map(example => (
          <button
            key={example}
            onClick={() => submit(example)}
            disabled={loading}
            style={{
              fontSize: 12,
              color: 'var(--text2)',
              border: '1px solid var(--border2)',
              borderRadius: 'var(--radius)',
              padding: '5px 9px',
              background: 'var(--bg2)',
            }}
          >
            {example}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}

      {answer && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {answer.query_class && (
              <span style={{ fontSize: 11, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 10, padding: '3px 8px' }}>
                {answer.query_class}
              </span>
            )}
            {answer.latency_ms !== null && answer.latency_ms !== undefined && (
              <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 10, padding: '3px 8px' }}>
                {(answer.latency_ms / 1000).toFixed(2)}s
              </span>
            )}
          {answer.reranked_chunks.slice(0, 3).map(source => (
              <span key={source} style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 10, padding: '3px 8px' }}>
                {source}
              </span>
            ))}
          </div>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', fontSize: 13.5, lineHeight: 1.75 }}>
            {answer.answer}
          </p>
          {answer.evidence_refs.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Cross-check Evidence
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {answer.evidence_refs.slice(0, 8).map(ref => (
                  <button
                    key={ref.id}
                    onClick={() => jumpToEvidence(ref.section_key, ref.line_start)}
                    style={{
                      border: '1px solid var(--border2)',
                      borderRadius: 'var(--radius)',
                      padding: '5px 8px',
                      background: 'var(--bg2)',
                      color: 'var(--accent)',
                      fontSize: 11,
                      fontFamily: 'var(--mono)',
                    }}
                    title={ref.label}
                  >
                    {ref.id}
                  </button>
                ))}
              </div>
            </div>
          )}
          {answer.sources.length > 0 && (
            <p style={{ color: 'var(--text3)', fontSize: 11, marginTop: 10 }}>
              Sources: {answer.sources.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
