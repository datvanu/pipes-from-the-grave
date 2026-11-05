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

export default function App() {
  const [pipeName, setPipeName] = useState('Untitled Pipe')
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ghostOpen, setGhostOpen] = useState(false)
  const [ghostPrompt, setGhostPrompt] = useState('Fetch an RSS feed about rust, sort it, top 5')
  const [ghostLines, setGhostLines] = useState<string[]>([])
  const [outputOpen, setOutputOpen] = useState(false)
  const [outputs, setOutputs] = useState<Array<Record<string, unknown>>>([])
  const [status, setStatus] = useState('The graveyard is quiet.')
  const [busy, setBusy] = useState(false)

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId])

  useEffect(() => {
    const raw = localStorage.getItem('pipes-grave-draft')
    if (raw) {
      try {
        const draft = JSON.parse(raw) as { name?: string; nodes: Node[]; edges: Edge[] }
        setPipeName(draft.name || 'Untitled Pipe')
        setNodes(draft.nodes || [])
        setEdges(draft.edges || [])
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
      JSON.stringify({ name: pipeName, nodes, edges }),
    )
  }, [pipeName, nodes, edges])

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

  const loadTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t) return
    const flow = toFlow(t.pipe)
    setPipeName(t.pipe.name)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    setStatus(`Template "${t.name}" awakens.`)
  }

  const runPipe = async () => {
    setBusy(true)
    setStatus('Spirits are running the pipe...')
    try {
      const pipe = fromFlow(pipeName, nodes, edges)
      const saveRes = await fetch('/api/pipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipe),
      })
      if (!saveRes.ok) throw new Error(await saveRes.text())
      const saved = await saveRes.json()
      const runRes = await fetch(`/api/pipes/${saved.id}/run`, { method: 'POST' })
      if (!runRes.ok) throw new Error(await runRes.text())
      const result = await runRes.json()
      setOutputs(result.output || [])
      setOutputOpen(true)
      setStatus(`Returned ${ (result.output || []).length } souls.`)
    } catch (err) {
      setStatus(`The séance failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const callGhost = async () => {
    setBusy(true)
    setGhostLines(['The Ghost listens...'])
    try {
      const res = await fetch('/api/ghost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: ghostPrompt }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const pipe = data.pipe as PipeDefinition
      const flow = toFlow(pipe)
      setPipeName(pipe.name || ghostPrompt.slice(0, 40))
      setNodes(flow.nodes)
      setEdges(flow.edges)
      setGhostLines(Array.isArray(data.explanation) ? data.explanation : [String(data.explanation || '')])
      setStatus('The Ghost built a pipe from your words.')
      setGhostOpen(false)
    } catch (err) {
      setGhostLines([`Something flickers... ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setBusy(false)
    }
  }

  const cfg = (selected?.data as PipeNodeData | undefined)?.config || {}

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
        }}
      >
        <h1 style={{ fontFamily: 'Creepster, Cinzel, serif', color: '#55ff99', fontSize: 28, margin: 0 }}>
          Pipes from the Grave
        </h1>
        <input
          value={pipeName}
          onChange={(e) => setPipeName(e.target.value)}
          style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: '6px 10px' }}
        />
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) loadTemplate(e.target.value)
            e.target.value = ''
          }}
          style={{ background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: 6 }}
        >
          <option value="">Graveyard templates...</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setGhostOpen(true)} disabled={busy}>Ghost Séance</button>
          <button onClick={runPipe} disabled={busy || nodes.length === 0}>Run</button>
        </div>
      </header>

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

        <aside style={{ width: 280, borderLeft: '1px solid #2a2a35', padding: 12, background: '#111118', overflow: 'auto' }}>
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
            </div>
          )}
        </aside>
      </div>

      <footer style={{ padding: '8px 16px', borderTop: '1px solid #2a2a35', background: '#111118', fontSize: 13 }}>
        {status}
        {outputOpen && (
          <button style={{ marginLeft: 12 }} onClick={() => setOutputOpen((v) => !v)}>
            {outputOpen ? 'Hide output' : 'Show output'}
          </button>
        )}
      </footer>

      {outputOpen && (
        <div style={{ maxHeight: 220, overflow: 'auto', borderTop: '1px solid #2a2a35', background: '#0f0f16', padding: 12 }}>
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
          <div style={{ width: 520, background: '#16161f', border: '1px solid #55ff99', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontFamily: 'Cinzel, serif', color: '#55ff99' }}>Ghost Séance</h2>
            <p style={{ opacity: 0.8 }}>Speak a sentence. The Ghost shapes a pipe.</p>
            <textarea
              value={ghostPrompt}
              onChange={(e) => setGhostPrompt(e.target.value)}
              rows={4}
              style={{ width: '100%', background: '#1a1a22', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: 8 }}
            />
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
