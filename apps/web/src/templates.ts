export type PipeDefinition = {
  id: string
  name: string
  nodes: Array<{ id: string; type: string; config: Record<string, unknown>; position?: { x: number; y: number } }>
  edges: Array<{ id: string; source: string; target: string }>
  createdAt?: string
  updatedAt?: string
}

export const TEMPLATES: { id: string; name: string; blurb: string; pipe: PipeDefinition }[] = [
  {
    id: 'frontpage-digest',
    name: 'Frontpage Digest',
    blurb: 'Fetch the public RFC Editor feed, sort by published date, keep the top 15.',
    pipe: {
      id: 'template-frontpage-digest',
      name: 'Frontpage Digest',
      nodes: [
        { id: 'fetch-rss-1', type: 'fetch-rss', config: { url: 'https://www.rfc-editor.org/rfcrss.xml' }, position: { x: 80, y: 120 } },
        { id: 'sort-1', type: 'sort', config: { field: 'published', order: 'desc' }, position: { x: 340, y: 120 } },
        { id: 'truncate-1', type: 'truncate', config: { limit: 15 }, position: { x: 600, y: 120 } },
        { id: 'output-rss-1', type: 'output-rss', config: {}, position: { x: 860, y: 120 } },
      ],
      edges: [
        { id: 'e1', source: 'fetch-rss-1', target: 'sort-1' },
        { id: 'e2', source: 'sort-1', target: 'truncate-1' },
        { id: 'e3', source: 'truncate-1', target: 'output-rss-1' },
      ],
    },
  },
  {
    id: 'rss-top-10',
    name: 'RSS Top 10',
    blurb: 'Fetch the public RFC Editor feed and keep the newest 10 items.',
    pipe: {
      id: 'template-rss-top-10',
      name: 'RSS Top 10',
      nodes: [
        { id: 'fetch-rss-1', type: 'fetch-rss', config: { url: 'https://www.rfc-editor.org/rfcrss.xml' }, position: { x: 80, y: 120 } },
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
    blurb: 'Fetch a public sample JSON list, keep titles that contain “rerum”, sort by id, emit JSON.',
    pipe: {
      id: 'template-json-filter-sort',
      name: 'JSON Filter Sort',
      nodes: [
        { id: 'fetch-json-1', type: 'fetch-json', config: { url: 'https://jsonplaceholder.typicode.com/posts' }, position: { x: 60, y: 100 } },
        { id: 'filter-1', type: 'filter', config: { field: 'title', op: 'contains', value: 'rerum' }, position: { x: 320, y: 100 } },
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
    id: 'keyword-watch',
    name: 'Keyword Watch',
    blurb: 'Watch the public RFC Editor feed for titles containing “Internet”, emit JSON.',
    pipe: {
      id: 'template-keyword-watch',
      name: 'Keyword Watch',
      nodes: [
        { id: 'fetch-rss-1', type: 'fetch-rss', config: { url: 'https://www.rfc-editor.org/rfcrss.xml' }, position: { x: 80, y: 140 } },
        { id: 'filter-1', type: 'filter', config: { field: 'title', op: 'contains', value: 'Internet' }, position: { x: 360, y: 140 } },
        { id: 'truncate-1', type: 'truncate', config: { limit: 20 }, position: { x: 620, y: 140 } },
        { id: 'output-json-1', type: 'output-json', config: {}, position: { x: 880, y: 140 } },
      ],
      edges: [
        { id: 'e1', source: 'fetch-rss-1', target: 'filter-1' },
        { id: 'e2', source: 'filter-1', target: 'truncate-1' },
        { id: 'e3', source: 'truncate-1', target: 'output-json-1' },
      ],
    },
  },
  {
    id: 'regex-cleanup',
    name: 'Regex Title Cleanup',
    blurb: 'Fetch a public sample JSON list, strip digits from titles with regex, rename a field.',
    pipe: {
      id: 'template-regex-cleanup',
      name: 'Regex Title Cleanup',
      nodes: [
        { id: 'fetch-json-1', type: 'fetch-json', config: { url: 'https://jsonplaceholder.typicode.com/posts' }, position: { x: 60, y: 100 } },
        { id: 'regex-1', type: 'regex', config: { field: 'title', pattern: '[0-9]+', replacement: '' }, position: { x: 320, y: 100 } },
        { id: 'rename-1', type: 'rename', config: { mapping: { title: 'headline' } }, position: { x: 580, y: 100 } },
        { id: 'truncate-1', type: 'truncate', config: { limit: 8 }, position: { x: 840, y: 100 } },
        { id: 'output-json-1', type: 'output-json', config: {}, position: { x: 1100, y: 100 } },
      ],
      edges: [
        { id: 'e1', source: 'fetch-json-1', target: 'regex-1' },
        { id: 'e2', source: 'regex-1', target: 'rename-1' },
        { id: 'e3', source: 'rename-1', target: 'truncate-1' },
        { id: 'e4', source: 'truncate-1', target: 'output-json-1' },
      ],
    },
  },
  {
    id: 'empty-grave',
    name: 'Empty Grave',
    blurb: 'Start from a blank canvas.',
    pipe: { id: 'empty', name: 'Untitled Pipe', nodes: [], edges: [] },
  },
]
