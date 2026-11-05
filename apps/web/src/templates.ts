export type PipeDefinition = {
  id: string
  name: string
  nodes: Array<{ id: string; type: string; config: Record<string, unknown>; position?: { x: number; y: number } }>
  edges: Array<{ id: string; source: string; target: string }>
  createdAt?: string
  updatedAt?: string
}

export const TEMPLATES: { id: string; name: string; pipe: PipeDefinition }[] = [
  {
    id: 'rss-top-10',
    name: 'RSS Top 10',
    pipe: {
      id: 'template-rss-top-10',
      name: 'RSS Top 10',
      nodes: [
        { id: 'fetch-rss-1', type: 'fetch-rss', config: { url: 'https://www.reddit.com/r/programming/.rss' }, position: { x: 80, y: 120 } },
        { id: 'truncate-1', type: 'truncate', config: { limit: 10 }, position: { x: 360, y: 120 } },
        { id: 'output-json-1', type: 'output-json', config: {}, position: { x: 640, y: 120 } },
      ],
      edges: [
        { id: 'e1', source: 'fetch-rss-1', target: 'truncate-1' },
        { id: 'e2', source: 'truncate-1', target: 'output-json-1' },
      ],
    },
  },
  {
    id: 'json-filter-sort',
    name: 'JSON Filter Sort',
    pipe: {
      id: 'template-json-filter-sort',
      name: 'JSON Filter Sort',
      nodes: [
        { id: 'fetch-json-1', type: 'fetch-json', config: { url: 'https://jsonplaceholder.typicode.com/posts' }, position: { x: 60, y: 100 } },
        { id: 'filter-1', type: 'filter', config: { field: 'title', op: 'contains', value: 'qui' }, position: { x: 320, y: 100 } },
        { id: 'sort-1', type: 'sort', config: { field: 'id', order: 'asc' }, position: { x: 560, y: 100 } },
        { id: 'output-json-1', type: 'output-json', config: {}, position: { x: 800, y: 100 } },
      ],
      edges: [
        { id: 'e1', source: 'fetch-json-1', target: 'filter-1' },
        { id: 'e2', source: 'filter-1', target: 'sort-1' },
        { id: 'e3', source: 'sort-1', target: 'output-json-1' },
      ],
    },
  },
  {
    id: 'empty-grave',
    name: 'Empty Grave',
    pipe: { id: 'empty', name: 'Untitled Pipe', nodes: [], edges: [] },
  },
]
