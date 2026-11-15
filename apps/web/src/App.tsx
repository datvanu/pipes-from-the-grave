import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TEMPLATES, type PipeDefinition } from './templates'
import { apiUrl } from './api'
import { clearGhostByok, loadGhostByok, saveGhostByok } from './ghostKey'
import { Modal } from './Modal'

const PALETTE = [
  { type: 'fetch-rss', label: 'Fetch RSS', color: '#55ff99' },
  { type: 'fetch-json', label: 'Fetch JSON', color: '#77ccff' },
  { type: 'filter', label: 'Filter', color: '#ffaa55' },
  { type: 'sort', label: 'Sort', color: '#ff77cc' },
  { type: 'merge', label: 'Merge', color: '#aa55ff' },
  { type: 'truncate', label: 'Truncate', color: '#ff5577' },
  { type: 'regex', label: 'Regex', color: '#ccff55' },
  { type: 'rename', label: 'Rename', color: '#55ccff' },
  { type: 'output-rss', label: 'Output RSS', color: '#ff5555' },
  { type: 'output-json', label: 'Output JSON', color: '#ffff55' },
] as const

const DEFAULT_GHOST_PROMPT =
  'Fetch RSS from https://www.rfc-editor.org/rfcrss.xml then sort and keep the top 5'

const GHOST_CHIPS = [
  DEFAULT_GHOST_PROMPT,
  'Filter an RSS feed about rust, top 10',
  'Fetch JSON, sort, keep the first 8',
]

const INSPECTOR_FIELDS: Record<string, { key: string; label: string; kind?: 'text' | 'textarea' }[]> = {
  'fetch-rss': [{ key: 'url', label: 'Feed URL' }],
  'fetch-json': [{ key: 'url', label: 'Feed URL' }],
  filter: [
    { key: 'field', label: 'Field' },
    { key: 'op', label: 'Match' },
    { key: 'value', label: 'Keep items whose value is' },
  ],
  sort: [
    { key: 'field', label: 'Field' },
    { key: 'order', label: 'Order' },
  ],
  truncate: [{ key: 'limit', label: 'Limit' }],
  regex: [
    { key: 'field', label: 'Field' },
    { key: 'pattern', label: 'Pattern' },
    { key: 'replacement', label: 'Replacement' },
  ],
  rename: [{ key: 'mapping', label: 'Field mapping (JSON)', kind: 'textarea' }],
  merge: [],
  'output-rss': [],
  'output-json': [],
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}

type PipeNodeData = {
  label: string
  nodeType: string
  config: Record<string, unknown>
  color: string
  soulCount?: number
}

type RunMeta = {
  durationMs?: number
  remaining?: number
  resetMs?: number
  error?: string
  status?: number
}

function TombstoneNode({ data, selected }: { data: PipeNodeData; selected?: boolean }) {
  return (
    <div
      style={{
        minWidth: 160,
        background: '#16161f',
        border: `2px solid ${data.color}`,
        boxShadow: selected ? `0 0 18px ${data.color}` : `0 0 10px ${data.color}55`,
        borderRadius: 10,
        padding: 10,
        color: '#e8e8f0',
        fontFamily: 'Merriweather, serif',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.color }} />
      <div style={{ fontFamily: 'Cinzel, serif', color: data.color, fontSize: 12 }}>{data.label}</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{data.nodeType}</div>
      {typeof data.soulCount === 'number' && (
        <div style={{ fontSize: 11, marginTop: 6, color: '#9dffc2' }}>{data.soulCount} souls</div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: data.color }} />
    </div>
  )
}

const rfNodeTypes = { tombstone: TombstoneNode }

function toFlow(pipe: PipeDefinition, animated = true): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = pipe.nodes.map((n, i) => {
    const meta = PALETTE.find((p) => p.type === n.type) || PALETTE[0]
    return {
      id: n.id,
      type: 'tombstone',
      position: n.position || { x: 80 + i * 220, y: 120 },
      data: {
        label: meta.label,
        nodeType: n.type,
        config: { ...n.config },
        color: meta.color,
      },
    }
  })
  const edges: Edge[] = pipe.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated,
    style: { stroke: '#55ff99', strokeWidth: 2 },
  }))
  return { nodes, edges }
}

function fromFlow(name: string, nodes: Node[], edges: Edge[]): PipeDefinition {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-') || 'draft',
    name,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: String((n.data as PipeNodeData).nodeType),
      config: { ...(n.data as PipeNodeData).config },
      position: n.position,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }
}

async function readApiError(res: Response): Promise<{ message: string; status: number; retryAfterMs?: number }> {
  const status = res.status
  let message = res.statusText || `HTTP ${status}`
  let retryAfterMs: number | undefined
  try {
    const body = await res.json()
    message = body.message || body.error || message
    if (typeof body.retryAfterMs === 'number') retryAfterMs = body.retryAfterMs
  } catch {
    try {
      message = await res.text()
    } catch {
      /* keep statusText */
    }
  }
  if (status === 429) {
    message = `Rate limit — ${message}`
  }
  return { message, status, retryAfterMs }
}

export default function App() {
  const [pipeName, setPipeName] = useState('Untitled Pipe')
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ghostOpen, setGhostOpen] = useState(false)
  const [ghostPrompt, setGhostPrompt] = useState(DEFAULT_GHOST_PROMPT)
  const [ghostLines, setGhostLines] = useState<string[]>([])
  const [lastGhostLines, setLastGhostLines] = useState<string[]>([])
  const [outputOpen, setOutputOpen] = useState(false)
  const [seanceOpen, setSeanceOpen] = useState(false)
  const [outputs, setOutputs] = useState<Array<Record<string, unknown>>>([])
  const [itemsByNode, setItemsByNode] = useState<Record<string, Array<Record<string, unknown>>>>({})
  const [runMeta, setRunMeta] = useState<RunMeta>({})
  const [status, setStatus] = useState('The graveyard is quiet.')
  const [busy, setBusy] = useState(false)
  const [savedPipeId, setSavedPipeId] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [ghostKey, setGhostKey] = useState('')
  const [ghostPersist, setGhostPersist] = useState(false)
  const [ghostProvider, setGhostProvider] = useState('openai')
  const [ghostModel, setGhostModel] = useState('')
  const [ghostFallback, setGhostFallback] = useState('')
  const [ghostByokReady, setGhostByokReady] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [draftTouched, setDraftTouched] = useState(false)
  const [pauseMotion, setPauseMotion] = useState(false)
  const [hostWait, setHostWait] = useState(false)
  const [actionWait, setActionWait] = useState(false)
  const slowWait = hostWait || actionWait
  const [unrecognizedDemo, setUnrecognizedDemo] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const allowMotion = !prefersReducedMotion && !pauseMotion
  const ghostPromptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const saved = loadGhostByok()
    setGhostKey(saved.key)
    setGhostPersist(saved.persist)
    setGhostProvider(saved.provider)
    setGhostModel(saved.model)
    setGhostByokReady(true)
  }, [])

  useEffect(() => {
    if (!ghostByokReady) return
    saveGhostByok({
      key: ghostKey,
      persist: ghostPersist,
      provider: ghostProvider,
      model: ghostModel,
    })
  }, [ghostByokReady, ghostKey, ghostPersist, ghostProvider, ghostModel])

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId])

  useEffect(() => {
    let restored = false
    try {
      const raw = localStorage.getItem('pipes-grave-draft')
      if (raw) {
        const draft = JSON.parse(raw) as { name?: string; nodes?: Node[]; edges?: Edge[]; savedPipeId?: string }
        if (Array.isArray(draft.nodes) && draft.nodes.length > 0) {
          setPipeName(draft.name || 'Untitled Pipe')
          setNodes(draft.nodes)
          setEdges(draft.edges || [])
          if (draft.savedPipeId) setSavedPipeId(draft.savedPipeId)
          setStatus('Restored your last draft from this browser.')
          restored = true
        }
      }
    } catch {
      /* ignore broken drafts */
    }
    if (!restored) {
      const starter = TEMPLATES.find((item) => item.id === 'frontpage-digest') || TEMPLATES[0]
      const flow = toFlow(starter.pipe, allowMotion)
      setPipeName(starter.pipe.name)
      setNodes(flow.nodes)
      setEdges(flow.edges)
      setStatus('The graveyard is quiet. Open Graveyard or summon the Ghost to begin.')
    }
    setDraftReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first-load hydrate only
  }, [setNodes, setEdges])

  useEffect(() => {
    if (!draftReady || !draftTouched) return
    localStorage.setItem(
      'pipes-grave-draft',
      JSON.stringify({ name: pipeName, nodes, edges, savedPipeId }),
    )
  }, [draftReady, draftTouched, pipeName, nodes, edges, savedPipeId])

  useEffect(() => {
    setEdges((current) => current.map((edge) => ({ ...edge, animated: allowMotion })))
  }, [allowMotion, setEdges])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) setHostWait(true)
    }, 2500)
    fetch(apiUrl('/api/health')).finally(() => {
      window.clearTimeout(timer)
      if (!cancelled) setHostWait(false)
    })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!busy) {
      setActionWait(false)
      return
    }
    const timer = window.setTimeout(() => setActionWait(true), 2500)
    return () => window.clearTimeout(timer)
  }, [busy])

  const onConnect = useCallback(
    (connection: Connection) => {
      setDraftTouched(true)
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: allowMotion,
            style: { stroke: '#55ff99', strokeWidth: 2 },
          },
          eds,
        ),
      )
    },
    [setEdges, allowMotion],
  )

  const addNode = (type: string) => {
    const meta = PALETTE.find((p) => p.type === type) || PALETTE[0]
    const id = `${type}-${Date.now()}`
    const node: Node = {
      id,
      type: 'tombstone',
      position: { x: 120 + nodes.length * 40, y: 80 + (nodes.length % 5) * 40 },
      data: {
        label: meta.label,
        nodeType: type,
        config: type.startsWith('fetch') ? { url: '' } : {},
        color: meta.color,
      },
    }
    setNodes((ns) => [...ns, node])
    setSelectedId(id)
    setDraftTouched(true)
  }

  const updateSelectedConfig = (key: string, value: string) => {
    if (!selected) return
    setDraftTouched(true)
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== selected.id) return n
        const data = n.data as PipeNodeData
        let parsed: unknown = value
        if (key === 'limit') parsed = Number(value) || 0
        if (key === 'mapping') {
          try {
            parsed = JSON.parse(value)
          } catch {
            parsed = value
          }
        }
        return {
          ...n,
          data: { ...data, config: { ...data.config, [key]: parsed } },
        }
      }),
    )
  }

  const applySoulCounts = (byNode: Record<string, Array<Record<string, unknown>>>) => {
    setNodes((ns) =>
      ns.map((n) => {
        const count = byNode[n.id]?.length
        const data = n.data as PipeNodeData
        return { ...n, data: { ...data, soulCount: typeof count === 'number' ? count : undefined } }
      }),
    )
  }

  const loadTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t) return
    const flow = toFlow(t.pipe, allowMotion)
    setPipeName(t.pipe.name)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    setItemsByNode({})
    setOutputs([])
    setRunMeta({})
    setSavedPipeId(null)
    setDraftTouched(true)
    setStatus(`Template "${t.name}" awakens.`)
    setGalleryOpen(false)
  }

  const runPipe = async () => {
    setBusy(true)
    setStatus('Spirits are running the pipe...')
    setRunMeta({})
    try {
      const pipe = fromFlow(pipeName, nodes, edges)
      const saveRes = await fetch(apiUrl('/api/pipes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipe),
      })
      if (!saveRes.ok) {
        const err = await readApiError(saveRes)
        throw Object.assign(new Error(err.message), { status: err.status })
      }
      const saved = await saveRes.json()
      setSavedPipeId(saved.id)
      const runRes = await fetch(apiUrl(`/api/pipes/${saved.id}/run`), { method: 'POST' })
      if (!runRes.ok) {
        const err = await readApiError(runRes)
        setRunMeta({ error: err.message, status: err.status, resetMs: err.retryAfterMs })
        throw Object.assign(new Error(err.message), { status: err.status })
      }
      const result = await runRes.json()
      const byNode = (result.itemsByNode || {}) as Record<string, Array<Record<string, unknown>>>
      setOutputs(result.output || [])
      setItemsByNode(byNode)
      applySoulCounts(byNode)
      setOutputOpen(true)
      setSeanceOpen(true)
      setRunMeta({
        durationMs: result.durationMs,
        remaining: result.rateLimit?.remaining,
        resetMs: result.rateLimit?.resetMs,
      })
      const n = (result.output || []).length
      setStatus(`Returned ${n} souls in ${result.durationMs ?? '?'} ms. Graveyard exports: ${apiUrl(`/p/${saved.id}.json`)}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus(`The séance failed: ${msg}`)
      if (!runMeta.error) setRunMeta((m) => ({ ...m, error: msg }))
    } finally {
      setBusy(false)
    }
  }

  const callGhost = async () => {
    setBusy(true)
    setGhostLines(['The Ghost listens...'])
    setGhostFallback('')
    setUnrecognizedDemo(false)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const key = ghostKey.trim()
      if (key) headers['X-Ghost-LLM-Key'] = key
      const res = await fetch(apiUrl('/api/ghost'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: ghostPrompt,
          provider: ghostProvider,
          model: ghostModel.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await readApiError(res)
        throw new Error(err.message)
      }
      const data = await res.json()
      const pipe = data.pipe as PipeDefinition
      const flow = toFlow(pipe, allowMotion)
      setPipeName(pipe.name || ghostPrompt.slice(0, 40))
      setNodes(flow.nodes)
      setEdges(flow.edges)
      setSavedPipeId(null)
      setDraftTouched(true)
      const lines = Array.isArray(data.explanation) ? data.explanation : [String(data.explanation || '')]
      setGhostLines(lines)
      setLastGhostLines(lines)
      setUnrecognizedDemo(data.mode === 'demo' && data.recognized === false)
      if (typeof data.fallbackReason === 'string' && data.fallbackReason) {
        setGhostFallback(data.fallbackReason)
      }
      if (data.mode === 'demo' && data.recognized === false) {
        setStatus('Demo mode did not recognize that sentence. Try a chip in Ghost Séance, or review the fallback pipe.')
      } else {
        setStatus(`The Ghost built a pipe with ${pipe.nodes.length} nodes${data.mode ? ` (${data.mode} mode)` : ''}. Review the canvas, then Run.`)
      }
    } catch (err) {
      setGhostLines([`Something flickers... ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setBusy(false)
    }
  }

  const cfg = (selected?.data as PipeNodeData | undefined)?.config || {}
  const selectedSouls = selectedId ? itemsByNode[selectedId] || [] : []

  return (
    <div className={allowMotion ? undefined : (prefersReducedMotion ? "reduced-motion" : "motion-paused")} style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0b0b10', color: '#e8e8f0' }}>
      <a className="skip-link" href="#pipe-canvas">Skip to canvas</a>
      <header
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid #2a2a35',
          background: '#111118',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ fontFamily: 'Creepster, Cinzel, serif', color: '#55ff99', fontSize: 28, margin: 0 }}>
          Pipes from the Grave
        </h1>
        <input
          value={pipeName}
          onChange={(e) => {
            setPipeName(e.target.value)
            setDraftTouched(true)
          }}
          aria-label="Pipe name"
          style={{
            background: '#1a1a22',
            color: '#fff',
            border: '1px solid #333',
            borderRadius: 6,
            padding: '6px 10px',
            maxWidth: 240,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setGalleryOpen(true)} disabled={busy}>Graveyard</button>
          <button onClick={() => setGhostOpen(true)} disabled={busy}>Ghost Séance</button>
          <button onClick={() => setSeanceOpen((v) => !v)} disabled={Object.keys(itemsByNode).length === 0}>
            Debug Souls
          </button>
          <button onClick={runPipe} disabled={busy || nodes.length === 0}>Run</button>
          {!prefersReducedMotion && (
            <button
              type="button"
              aria-pressed={!allowMotion}
              onClick={() => setPauseMotion((value) => !value)}
            >
              {pauseMotion ? 'Resume motion' : 'Pause motion'}
            </button>
          )}
        </div>
      </header>

      {slowWait && (
        <div role="status" aria-live="polite" style={{ background: '#152418', color: '#d7ffe8', padding: '8px 16px', borderBottom: '1px solid #2a5a3a' }}>
          Waking the demo host can take about a minute. Please wait…
        </div>
      )}

      {runMeta.error && (
        <div role="alert" style={{ background: '#3a1518', color: '#ffb0b8', padding: '8px 16px', borderBottom: '1px solid #66222a' }}>
          <strong>Haunt:</strong> {runMeta.error}
          {runMeta.status === 429 && runMeta.resetMs != null && (
            <span> — retry in ~{Math.ceil(runMeta.resetMs / 1000)}s</span>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside aria-label="Node palette" style={{ width: 200, borderRight: '1px solid #2a2a35', padding: 12, background: '#111118', overflow: 'auto' }}>
          <h2 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99', fontSize: 18 }}>Node Palette</h2>
          {PALETTE.map((p) => (
            <button
              key={p.type}
              onClick={() => addNode(p.type)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginBottom: 8,
                background: '#1a1a22',
                color: '#e8e8f0',
                border: `1px solid #333`,
                borderLeft: `3px solid ${p.color}`,
                borderRadius: 6,
                padding: '8px 10px',
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </aside>

        <main id="pipe-canvas" style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={rfNodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            fitView
          >
            <Background color="#2a2a35" gap={22} />
            <Controls />
            <MiniMap style={{ background: '#111118' }} />
          </ReactFlow>
        </main>

        <aside aria-label="Inspector" style={{ width: 300, borderLeft: '1px solid #2a2a35', padding: 12, background: '#111118', overflow: 'auto' }}>
          <h2 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99', fontSize: 18 }}>Inspector</h2>
          {!selected && <p style={{ opacity: 0.7 }}>Select a tombstone to configure it.</p>}
          {selected && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{(selected.data as PipeNodeData).nodeType}</div>
              {(INSPECTOR_FIELDS[(selected.data as PipeNodeData).nodeType] || []).map((field) => (
                <label key={field.key} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  {field.label}
                  {field.kind === 'textarea' ? (
                    <textarea
                      value={typeof cfg[field.key] === 'object' ? JSON.stringify(cfg[field.key], null, 2) : String(cfg[field.key] || '')}
                      onChange={(e) => updateSelectedConfig(field.key, e.target.value)}
                      rows={4}
                      style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: 6 }}
                    />
                  ) : (
                    <input
                      value={cfg[field.key] == null ? '' : String(cfg[field.key])}
                      onChange={(e) => updateSelectedConfig(field.key, e.target.value)}
                      style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: 6 }}
                    />
                  )}
                </label>
              ))}
              {selectedSouls.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontFamily: 'Cinzel, serif', color: '#9dffc2', fontSize: 13 }}>
                    Souls at this node ({selectedSouls.length})
                  </div>
                  <ul style={{ paddingLeft: 16, fontSize: 12, maxHeight: 160, overflow: 'auto' }}>
                    {selectedSouls.slice(0, 8).map((item, idx) => (
                      <li key={String(item.id || idx)}>{String(item.title || item.id || 'item')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {lastGhostLines.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid #2a2a35', paddingTop: 12 }}>
              <h4 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99', margin: '0 0 8px' }}>Last Ghost Words</h4>
              <ul style={{ paddingLeft: 16, fontSize: 12, color: '#9dffc2' }}>
                {lastGhostLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <footer style={{ padding: '8px 16px', borderTop: '1px solid #2a2a35', background: '#111118', fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span role="status" aria-live="polite">{status}</span>
        {typeof runMeta.remaining === 'number' && (
          <span style={{ opacity: 0.8 }}>Rate limit remaining: {runMeta.remaining}</span>
        )}
        {outputOpen && (
          <button style={{ marginLeft: 'auto' }} onClick={() => setOutputOpen((v) => !v)}>
            {outputOpen ? 'Hide output' : 'Show output'}
          </button>
        )}
      </footer>

      {outputOpen && (
        <div style={{ maxHeight: 200, overflow: 'auto', borderTop: '1px solid #2a2a35', background: '#0f0f16', padding: 12 }}>
          <h3 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99', marginTop: 0 }}>Séance Output</h3>
          {outputs.length === 0 && <p>No items returned.</p>}
          {outputs.map((item, idx) => (
            <div key={String(item.id || idx)} style={{ borderBottom: '1px solid #222', padding: '6px 0' }}>
              <strong>{String(item.title || item.id || 'item')}</strong>
              {item.link ? (
                <div>
                  <a href={String(item.link)} target="_blank" rel="noreferrer" style={{ color: '#77ccff' }}>
                    {String(item.link)}
                  </a>
                </div>
              ) : null}
              {item.summary ? <div style={{ opacity: 0.75 }}>{String(item.summary)}</div> : null}
            </div>
          ))}
        </div>
      )}

      {seanceOpen && Object.keys(itemsByNode).length > 0 && (
        <div style={{ maxHeight: 180, overflow: 'auto', borderTop: '1px solid #2a2a35', background: '#101018', padding: 12 }}>
          <h3 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99', marginTop: 0 }}>Séance Debug — souls per node</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(itemsByNode).map(([nodeId, items]) => (
              <button
                key={nodeId}
                onClick={() => setSelectedId(nodeId)}
                style={{ background: '#1a1a22', border: '1px solid #333', borderRadius: 8, padding: '8px 10px' }}
              >
                <div style={{ fontFamily: 'Cinzel, serif', color: '#9dffc2' }}>{nodeId}</div>
                <div style={{ fontSize: 12 }}>{items.length} items</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={galleryOpen}
        titleId="graveyard-title"
        title="Graveyard Templates"
        width={640}
        onClose={() => setGalleryOpen(false)}
      >
        <p style={{ opacity: 0.8 }}>
          Pick a resting pipe to awaken. This replaces the canvas. No third-party brand marks — just public feeds.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {TEMPLATES.map((item) => (
            <button
              key={item.id}
              onClick={() => loadTemplate(item.id)}
              style={{ textAlign: 'left', background: '#1a1a22', border: '1px solid #333', borderRadius: 8, padding: 12 }}
            >
              <div style={{ fontFamily: 'Cinzel, serif', color: '#55ff99' }}>{item.name}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{item.blurb}</div>
            </button>
          ))}
        </div>
        <button style={{ marginTop: 12 }} onClick={() => setGalleryOpen(false)}>Close</button>
      </Modal>

            <Modal
        open={ghostOpen}
        titleId="ghost-title"
        title="Ghost Séance"
        width={560}
        onClose={() => setGhostOpen(false)}
        initialFocusRef={ghostPromptRef}
      >
        <p style={{ opacity: 0.8 }}>
          Type a short sentence. With no key, the Ghost uses free built-in rules (words such as “rss”, “sort”, “top 5”).
          It does not understand free-form language.
        </p>
        <p style={{ opacity: 0.8 }}>
          Optional: paste your own API key for the provider below if you want a live model that can follow a fuller
          sentence. The key stays in this browser until you close the tab — or until you click Clear key. If you tick
          “Remember”, it is saved in this browser only. When you click Summon, the key is sent to that provider (the
          host shown in the list), not stored on our server.
        </p>
        <label htmlFor="ghost-prompt" style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
          Your sentence
        </label>
        <textarea
          id="ghost-prompt"
          ref={ghostPromptRef}
          value={ghostPrompt}
          onChange={(e) => setGhostPrompt(e.target.value)}
          rows={4}
          style={{ width: "100%", background: "#1a1a22", color: "#fff", border: "1px solid #333", borderRadius: 8, padding: 8 }}
        />
        {unrecognizedDemo && (
          <p role="status" style={{ color: "#ffd7a8", fontSize: 13, marginTop: 8 }}>
            I only follow simple keywords in demo mode (rss, json, filter, sort, top…). Try a chip below, or add your
            own key for a live model.
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {GHOST_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setGhostPrompt(chip)}
              style={{ fontSize: 12, padding: "6px 8px", textAlign: "left", maxWidth: "100%" }}
            >
              {chip}
            </button>
          ))}
        </div>
        <fieldset style={{ marginTop: 12, border: "1px solid #2a2a35", borderRadius: 8, padding: 10 }}>
          <legend style={{ fontFamily: "Cinzel, serif", color: "#9dffc2", padding: "0 6px" }}>Optional: your own API key</legend>
          <label style={{ display: "grid", gap: 4, fontSize: 12, marginBottom: 8 }}>
            Provider
            <select
              value={ghostProvider}
              onChange={(e) => setGhostProvider(e.target.value)}
              style={{ background: "#1a1a22", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: 6 }}
            >
              <option value="openai">api.openai.com</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, marginBottom: 8 }}>
            Model (optional)
            <input
              value={ghostModel}
              onChange={(e) => setGhostModel(e.target.value)}
              placeholder="Default model for the selected provider"
              autoComplete="off"
              style={{ background: "#1a1a22", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: 6 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, marginBottom: 8 }}>
            Your API key
            <input
              type="password"
              value={ghostKey}
              onChange={(e) => setGhostKey(e.target.value)}
              placeholder="Sent only to the selected provider when you Summon"
              autoComplete="off"
              style={{ background: "#1a1a22", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: 6 }}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={ghostPersist}
              onChange={(e) => setGhostPersist(e.target.checked)}
            />
            Remember this key on this device until I click Clear key
          </label>
          <button
            type="button"
            style={{ marginTop: 8 }}
            disabled={!ghostKey && !ghostPersist}
            onClick={() => {
              clearGhostByok()
              setGhostKey("")
              setGhostPersist(false)
              setGhostModel("")
            }}
          >
            Clear saved key
          </button>
        </fieldset>
        {ghostFallback && (
          <p style={{ color: "#ffb0b8", fontSize: 12, marginTop: 8 }}>Fell back to demo: {ghostFallback}</p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={callGhost} disabled={busy}>Summon</button>
          <button onClick={() => setGhostOpen(false)}>Close</button>
        </div>
        <ul>
          {ghostLines.map((line, i) => (
            <li key={i} style={{ color: "#9dffc2" }}>{line}</li>
          ))}
        </ul>
      </Modal>

      <style>{`
        button {
          background: #1d3b2c;
          color: #d7ffe8;
          border: 1px solid #55ff99;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-family: Cinzel, serif;
        }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        button:focus-visible,
        input:focus-visible,
        textarea:focus-visible,
        select:focus-visible,
        a:focus-visible {
          outline: 2px solid #5EEAD4;
          outline-offset: 2px;
        }
        .react-flow__edge-path { filter: drop-shadow(0 0 4px #55ff99); }
        .motion-paused .react-flow__edge-path,
        .reduced-motion .react-flow__edge-path {
          filter: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .react-flow__edge-path { filter: none; }
        }
        .skip-link {
          position: absolute;
          left: 8px;
          top: -48px;
          z-index: 100;
          background: #1d3b2c;
          color: #d7ffe8;
          padding: 8px 12px;
          border-radius: 8px;
        }
        .skip-link:focus {
          top: 8px;
        }
      `}</style>
    </div>
  )
}
