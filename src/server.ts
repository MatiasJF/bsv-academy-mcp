#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadKnowledgeBase, saveKnowledgeBase } from './kb.js';
import { discoverAllPages, buildKnowledgeBase } from './scraper.js';
import type { KnowledgeBase, Section } from './types.js';

let cachedKb: KnowledgeBase | null = null;

async function getKb(): Promise<KnowledgeBase | null> {
  if (!cachedKb) {
    cachedKb = await loadKnowledgeBase();
  }
  return cachedKb;
}

const server = new McpServer({
  name: 'bsv-academy-mcp',
  version: '1.0.0',
});

// ── Tool: List all courses ──
server.tool(
  'bsv_list_courses',
  'List all BSV Academy courses with chapters, section counts, and content size',
  {},
  async () => {
    const kb = await getKb();
    if (!kb) {
      return {
        content: [{
          type: 'text',
          text: 'Knowledge base not found. Run the scraper first:\n  npx bsv-academy-mcp scrape\n\nOr use the bsv_refresh_kb tool.',
        }],
      };
    }

    const summary = kb.courses.map((c) => ({
      course: c.name,
      slug: c.slug,
      description: c.description,
      chapters: c.chapters.map((ch) => ({
        name: ch.name,
        sections: ch.sections.length,
        contentSize: ch.sections.reduce((s, sec) => s + sec.bodyText.length, 0),
      })),
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalCourses: kb.courses.length,
          totalSections: kb.totalSections,
          totalConcepts: kb.totalConcepts,
          generatedAt: kb.generatedAt,
          courses: summary,
        }, null, 2),
      }],
    };
  },
);

// ── Tool: Get course detail ──
server.tool(
  'bsv_get_course',
  'Get detailed content from a specific BSV Academy course, chapter, or section',
  {
    course: z.string().describe('Course slug or name (e.g., "introduction-to-bitcoin-script" or "bitcoin script")'),
    chapter: z.string().optional().describe('Chapter name to filter by (substring match)'),
    section: z.string().optional().describe('Section title to filter by (substring match)'),
  },
  async ({ course, chapter, section }) => {
    const kb = await getKb();
    if (!kb) return { content: [{ type: 'text', text: 'Knowledge base not found. Run bsv_refresh_kb first.' }] };

    const courseData = kb.courses.find((c) =>
      c.slug === course ||
      c.slug.includes(course.toLowerCase().replace(/\s+/g, '-')) ||
      c.name.toLowerCase().includes(course.toLowerCase()),
    );

    if (!courseData) {
      const available = kb.courses.map((c) => `  - ${c.slug} (${c.name})`).join('\n');
      return { content: [{ type: 'text', text: `Course "${course}" not found.\n\nAvailable courses:\n${available}` }] };
    }

    let sections: Section[] = courseData.chapters.flatMap((ch) => ch.sections);

    if (chapter) {
      const ch = courseData.chapters.find((ch) =>
        ch.name.toLowerCase().includes(chapter.toLowerCase()),
      );
      if (ch) sections = ch.sections;
    }

    if (section) {
      sections = sections.filter((s) =>
        s.title.toLowerCase().includes(section.toLowerCase()),
      );
    }

    if (sections.length === 0) {
      return { content: [{ type: 'text', text: 'No matching sections found.' }] };
    }

    const result = sections.slice(0, 5).map((s) => ({
      title: s.title,
      url: s.url,
      keyTerms: s.keyTerms,
      concepts: s.concepts,
      bodyText: s.bodyText,
      codeExamples: s.codeExamples,
    }));

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Tool: Search knowledge base ──
server.tool(
  'bsv_search',
  'Search across all BSV Academy content for a keyword, concept, or phrase',
  {
    query: z.string().describe('Search query (keyword or phrase)'),
    limit: z.number().optional().default(10).describe('Max results'),
  },
  async ({ query, limit }) => {
    const kb = await getKb();
    if (!kb) return { content: [{ type: 'text', text: 'Knowledge base not found.' }] };

    const queryLower = query.toLowerCase();
    const escapedQuery = queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const results: { course: string; chapter: string; section: string; url: string; snippet: string; relevance: number }[] = [];

    for (const course of kb.courses) {
      for (const chapter of course.chapters) {
        for (const section of chapter.sections) {
          const text = section.bodyText.toLowerCase();
          const idx = text.indexOf(queryLower);
          if (idx === -1) continue;

          const start = Math.max(0, idx - 100);
          const end = Math.min(text.length, idx + query.length + 100);
          const snippet = section.bodyText.slice(start, end).trim();
          const occurrences = (text.match(new RegExp(escapedQuery, 'g')) || []).length;

          results.push({
            course: course.name,
            chapter: chapter.name,
            section: section.title,
            url: section.url,
            snippet: `...${snippet}...`,
            relevance: occurrences,
          });
        }
      }
    }

    results.sort((a, b) => b.relevance - a.relevance);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          totalMatches: results.length,
          results: results.slice(0, limit),
        }, null, 2),
      }],
    };
  },
);

// ── Tool: Get key concepts ──
server.tool(
  'bsv_get_concepts',
  'Get extracted concepts and key terms for a course or topic — useful for quiz generation',
  {
    course: z.string().describe('Course slug or name'),
    chapter: z.string().optional().describe('Chapter name to filter'),
  },
  async ({ course, chapter }) => {
    const kb = await getKb();
    if (!kb) return { content: [{ type: 'text', text: 'Knowledge base not found.' }] };

    const courseData = kb.courses.find((c) =>
      c.slug === course ||
      c.slug.includes(course.toLowerCase().replace(/\s+/g, '-')) ||
      c.name.toLowerCase().includes(course.toLowerCase()),
    );

    if (!courseData) {
      return { content: [{ type: 'text', text: `Course "${course}" not found.` }] };
    }

    let chapters = courseData.chapters;
    if (chapter) {
      chapters = chapters.filter((ch) =>
        ch.name.toLowerCase().includes(chapter.toLowerCase()),
      );
    }

    const conceptsBySection = chapters.flatMap((ch) =>
      ch.sections.map((s) => ({
        chapter: ch.name,
        section: s.title,
        keyTerms: s.keyTerms,
        concepts: s.concepts,
        contentLength: s.bodyText.length,
      })),
    );

    const allTerms = [...new Set(conceptsBySection.flatMap((s) => s.keyTerms))];
    const allConcepts = conceptsBySection.flatMap((s) => s.concepts);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          course: courseData.name,
          totalKeyTerms: allTerms.length,
          totalConcepts: allConcepts.length,
          keyTerms: allTerms,
          sections: conceptsBySection,
        }, null, 2),
      }],
    };
  },
);

// ── Tool: KB stats ──
server.tool(
  'bsv_stats',
  'Get statistics about the BSV Academy knowledge base',
  {},
  async () => {
    const kb = await getKb();
    if (!kb) return { content: [{ type: 'text', text: 'Knowledge base not found.' }] };

    const stats = {
      generatedAt: kb.generatedAt,
      totalCourses: kb.courses.length,
      totalSections: kb.totalSections,
      totalConcepts: kb.totalConcepts,
      courses: kb.courses.map((c) => ({
        name: c.name,
        slug: c.slug,
        chapters: c.chapters.length,
        sections: c.chapters.reduce((s, ch) => s + ch.sections.length, 0),
        totalText: c.chapters.reduce((s, ch) =>
          s + ch.sections.reduce((s2, sec) => s2 + sec.bodyText.length, 0), 0),
        keyTerms: c.chapters.reduce((s, ch) =>
          s + ch.sections.reduce((s2, sec) => s2 + sec.keyTerms.length, 0), 0),
      })),
    };

    return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
  },
);

// ── Tool: Refresh / rebuild knowledge base ──
server.tool(
  'bsv_refresh_kb',
  'Scrape BSV Academy and rebuild the knowledge base from scratch (takes several minutes)',
  {},
  async () => {
    try {
      const logs: string[] = [];
      const pages = await discoverAllPages((msg) => logs.push(msg));

      if (pages.length === 0) {
        return { content: [{ type: 'text', text: 'Scraping failed: no pages extracted.' }] };
      }

      const kb = buildKnowledgeBase(pages);
      const path = await saveKnowledgeBase(kb);
      cachedKb = kb;

      return {
        content: [{
          type: 'text',
          text: [
            `Knowledge base rebuilt successfully!`,
            `  Courses: ${kb.totalTopics}`,
            `  Sections: ${kb.totalSections}`,
            `  Concepts: ${kb.totalConcepts}`,
            `  Saved to: ${path}`,
            '',
            'Crawl log:',
            ...logs.map((l) => `  ${l}`),
          ].join('\n'),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err}` }] };
    }
  },
);

// ── Tool: Get section by URL ──
server.tool(
  'bsv_get_page',
  'Get content of a specific BSV Academy page by its URL',
  {
    url: z.string().describe('Full URL of the BSV Academy page'),
  },
  async ({ url }) => {
    const kb = await getKb();
    if (!kb) return { content: [{ type: 'text', text: 'Knowledge base not found.' }] };

    for (const course of kb.courses) {
      for (const chapter of course.chapters) {
        for (const section of chapter.sections) {
          if (section.url === url || section.url.includes(url)) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  course: course.name,
                  chapter: chapter.name,
                  ...section,
                }, null, 2),
              }],
            };
          }
        }
      }
    }

    return { content: [{ type: 'text', text: `Page "${url}" not found in knowledge base.` }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
