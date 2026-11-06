import { describe, it, expect } from 'vitest'
import { parseRssFeed } from '../src/nodes/fetch-rss.js'

describe('parseRssFeed CDATA / plain strings', () => {
  it('reads CDATA titles from RSS 2.0', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item>
        <title><![CDATA[Hello World]]></title>
        <link>https://example.com/a</link>
        <guid>https://example.com/a</guid>
        <description><![CDATA[Summary text]]></description>
        <pubDate>Fri, 06 Nov 2026 12:00:00 +0000</pubDate>
      </item>
    </channel></rss>`
    const items = parseRssFeed(xml)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Hello World')
    expect(items[0].link).toBe('https://example.com/a')
    expect(items[0].summary).toContain('Summary')
  })

  it('reads Atom entry titles', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>urn:1</id>
        <title>Atom Title</title>
        <link href="https://example.com/b" rel="alternate"/>
        <summary>Atom summary</summary>
        <updated>2026-11-06T12:00:00Z</updated>
        <author><name>Ada</name></author>
      </entry>
    </feed>`
    const items = parseRssFeed(xml)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Atom Title')
    expect(items[0].link).toBe('https://example.com/b')
    expect(items[0].author).toBe('Ada')
  })
})
