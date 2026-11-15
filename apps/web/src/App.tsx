import { useCallback, useEffect, useMemo, useState } from 'react'
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

function toFlow(pipe: PipeDefinition): { nodes: Node[]; edges: Edge[] } {
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
    animated: true,
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
  const [ghostPrompt, setGhostPrompt] = useState('Fetch RSS from https://www.rfc-editor.org/rfcrss.xml, sort, top 5')
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
    const raw = localStorage.getItem('pipes-grave-draft')
    if (raw) {
      try {
        const draft = JSON.parse(raw) as { name?: string; nodes: Node[]; edges: Edge[]; savedPipeId?: string }
        setPipeName(draft.name || 'Untitled Pipe')
        setNodes(draft.nodes || [])
        setEdges(draft.edges || [])
        if (draft.savedPipeId) setSavedPipeId(draft.savedPipeId)
        setStatus('A draft rises from localStorage...')
        return
      } catch {
        /* ignore */
      }
    }
    const starter = toFlow(TEMPLATES[0].pipe)
    setPipeName(TEMPLATES[0].pipe.name)
    setNodes(starter.nodes)
    setEdges(starter.edges)
  }, [setNodes, setEdges])

  useEffect(() => {
    localStorage.setItem(
      'pipes-grave-draft',
      JSON.stringify({ name: pipeName, nodes, edges, savedPipeId }),
    )
  }, [pipeName, nodes, edges, savedPipeId])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: '#55ff99', strokeWidth: 2 },
          },
          eds,
        ),
      )
    },
    [setEdges],
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
  }

  const updateSelectedConfig = (key: string, value: string) => {
    if (!selected) return
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
    const flow = toFlow(t.pipe)
    setPipeName(t.pipe.name)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    setItemsByNode({})
    setOutputs([])
    setRunMeta({})
    setSavedPipeId(null)
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
      const flow = toFlow(pipe)
      setPipeName(pipe.name || ghostPrompt.slice(0, 40))
      setNodes(flow.nodes)
      setEdges(flow.edges)
      setSavedPipeId(null)
      const lines = Array.isArray(data.explanation) ? data.explanation : [String(data.explanation || '')]
      setGhostLines(lines)
      setLastGhostLines(lines)
      if (typeof data.fallbackReason === 'string' && data.fallbackReason) {
        setGhostFallback(data.fallbackReason)
      }
      setStatus(`The Ghost built a pipe with ${pipe.nodes.length} nodes${data.mode ? ` (${data.mode} mode)` : ''}. Review the canvas, then Run.`)
    } catch (err) {
      setGhostLines([`Something flickers... ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setBusy(false)
    }
  }

  const cfg = (selected?.data as PipeNodeData | undefined)?.config || {}
  const selectedSouls = selectedId ? itemsByNode[selectedId] || [] : []

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0b0b10', color: '#e8e8f0' }}>
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
          onChange={(e) => setPipeName(e.target.value)}
          aria-label="Pipe name"
          style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: '6px 10px' }}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setGalleryOpen(true)} disabled={busy}>Graveyard</button>
          <button onClick={() => setGhostOpen(true)} disabled={busy}>Ghost Séance</button>
          <button onClick={() => setSeanceOpen((v) => !v)} disabled={Object.keys(itemsByNode).length === 0}>
            Debug Souls
          </button>
          <button onClick={runPipe} disabled={busy || nodes.length === 0}>Run</button>
        </div>
      </header>

      {runMeta.error && (
        <div style={{ background: '#3a1518', color: '#ffb0b8', padding: '8px 16px', borderBottom: '1px solid #66222a' }}>
          <strong>Haunt:</strong> {runMeta.error}
          {runMeta.status === 429 && runMeta.resetMs != null && (
            <span> — retry in ~{Math.ceil(runMeta.resetMs / 1000)}s</span>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside style={{ width: 200, borderRight: '1px solid #2a2a35', padding: 12, background: '#111118', overflow: 'auto' }}>
          <h3 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99' }}>Node Palette</h3>
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

        <main style={{ flex: 1 }}>
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

        <aside style={{ width: 300, borderLeft: '1px solid #2a2a35', padding: 12, background: '#111118', overflow: 'auto' }}>
          <h3 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99' }}>Inspector</h3>
          {!selected && <p style={{ opacity: 0.7 }}>Select a tombstone to configure it.</p>}
          {selected && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{(selected.data as PipeNodeData).nodeType}</div>
              {['url', 'field', 'op', 'value', 'order', 'limit', 'pattern', 'replacement'].map((key) => (
                <label key={key} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  {key}
                  <input
                    value={cfg[key] == null ? '' : String(cfg[key])}
                    onChange={(e) => updateSelectedConfig(key, e.target.value)}
                    style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: 6 }}
                  />
                </label>
              ))}
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                mapping (JSON)
                <textarea
                  value={typeof cfg.mapping === 'object' ? JSON.stringify(cfg.mapping, null, 2) : String(cfg.mapping || '')}
                  onChange={(e) => updateSelectedConfig('mapping', e.target.value)}
                  rows={4}
                  style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: 6 }}
                />
              </label>
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
        <span>{status}</span>
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

      {galleryOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div style={{ width: 640, maxHeight: '80vh', overflow: 'auto', background: '#16161f', border: '1px solid #55ff99', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99' }}>Graveyard Templates</h2>
            <p style={{ opacity: 0.8 }}>Pick a resting pipe to awaken. No third-party brand marks — just public feeds.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadTemplate(t.id)}
                  style={{ textAlign: 'left', background: '#1a1a22', border: '1px solid #333', borderRadius: 8, padding: 12 }}
                >
                  <div style={{ fontFamily: 'Cinzel, serif', color: '#55ff99' }}>{t.name}</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>{t.blurb}</div>
                </button>
              ))}
            </div>
            <button style={{ marginTop: 12 }} onClick={() => setGalleryOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {ghostOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 50,
          }}
        >
          <div style={{ width: 560, background: '#16161f', border: '1px solid #55ff99', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99' }}>Ghost Séance</h2>
            <p style={{ opacity: 0.8 }}>
              Speak a sentence. The Ghost shapes a pipe with built-in demo rules — free, no key required.
              Optionally paste your own key for an allowlisted OpenAI-compatible provider. The key stays in
              this browser (session storage, or local storage only if you opt in). It is sent only with each
              Summon request and is never stored on the server.
            </p>
            <textarea
              value={ghostPrompt}
              onChange={(e) => setGhostPrompt(e.target.value)}
              rows={4}
              style={{ width: '100%', background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: 8 }}
            />
            <fieldset style={{ marginTop: 12, border: '1px solid #2a2a35', borderRadius: 8, padding: 10 }}>
              <legend style={{ fontFamily: 'Cinzel, serif', color: '#9dffc2', padding: '0 6px' }}>Optional BYOK</legend>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, marginBottom: 8 }}>
                Provider
                <select
                  value={ghostProvider}
                  onChange={(e) => setGhostProvider(e.target.value)}
                  style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: 6 }}
                >
                  <option value="openai">OpenAI (api.openai.com)</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, marginBottom: 8 }}>
                Model (optional)
                <input
                  value={ghostModel}
                  onChange={(e) => setGhostModel(e.target.value)}
                  placeholder="Default: gpt-4o-mini"
                  autoComplete="off"
                  style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: 6 }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, marginBottom: 8 }}>
                Your API key
                <input
                  type="password"
                  value={ghostKey}
                  onChange={(e) => setGhostKey(e.target.value)}
                  placeholder="Leaves this box only as a request header"
                  autoComplete="off"
                  style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: 6 }}
                />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={ghostPersist}
                  onChange={(e) => setGhostPersist(e.target.checked)}
                />
                Remember this key in this browser (local storage)
              </label>
              <button
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => {
                  clearGhostByok()
                  setGhostKey('')
                  setGhostPersist(false)
                  setGhostModel('')
                }}
              >
                Clear key
              </button>
            </fieldset>
            {ghostFallback && (
              <p style={{ color: '#ffb0b8', fontSize: 12, marginTop: 8 }}>Fell back to demo: {ghostFallback}</p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={callGhost} disabled={busy}>Summon</button>
              <button onClick={() => setGhostOpen(false)}>Close</button>
            </div>
            <ul>
              {ghostLines.map((line, i) => (
                <li key={i} style={{ color: '#9dffc2' }}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
        .react-flow__edge-path { filter: drop-shadow(0 0 4px #55ff99); }
      `}</style>
    </div>
  )
}
