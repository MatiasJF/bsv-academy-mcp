import axios from 'axios';
import * as cheerio from 'cheerio';
import type { KnowledgeBase, Course, Chapter, Section } from './types.js';

const BASE_URL = 'https://hub.bsvblockchain.org/bsv-academy/bsv-academy';
const ROOT_URL = 'https://hub.bsvblockchain.org';
const CRAWL_DELAY = 1500;
const USER_AGENT = 'BSV-Academy-MCP/1.0 (educational)';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface RawPage {
  url: string;
  courseSlug: string;
  chapter: string;
  section: string;
  title: string;
  bodyText: string;
  codeExamples: string[];
  keyTerms: string[];
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${ROOT_URL}${href}`;
    return new URL(href, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/').toString();
  } catch {
    return null;
  }
}

function slugToName(slug: string): string {
  return slug.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Known courses as fallback
const KNOWN_COURSES = [
  'bsv-basics-protocol-and-design',
  'bsv-enterprise',
  'bsv-infrastructure',
  'bsv-network-topology',
  'introduction-to-bitcoin-script',
  'bitcoin-primitives-hash-functions',
  'bitcoin-primitives-merkle-trees',
  'bitcoin-primitives-digital-signatures',
  'bitcoin-as-historical-phenomenon',
  'bitcoin-whitepaper-series',
  'hash-functions-crash-course',
  'deep-dive-in-bsv-blockchain',
  'identity-and-privacy-foundations',
  'introduction-to-blockchain-technology',
  'data-information-and-knowledge-in-the-digital-age-ict',
];

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });
    return data;
  } catch {
    return null;
  }
}

async function discoverCourses(): Promise<{ url: string; slug: string }[]> {
  const courses: { url: string; slug: string }[] = [];
  const seen = new Set<string>();

  const html = await fetchHtml(BASE_URL);
  if (html) {
    const $ = cheerio.load(html);
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const fullUrl = resolveUrl(href, BASE_URL);
      if (!fullUrl) return;
      const clean = fullUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');
      const match = clean.match(/\/bsv-academy\/bsv-academy\/([a-z0-9-]+)$/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        courses.push({ url: clean, slug: match[1] });
      }
    });
  }

  for (const slug of KNOWN_COURSES) {
    if (!seen.has(slug)) {
      seen.add(slug);
      courses.push({ url: `${BASE_URL}/${slug}`, slug });
    }
  }

  return courses;
}

async function discoverAllPages(
  onProgress?: (msg: string) => void,
): Promise<RawPage[]> {
  const log = onProgress || console.log;
  const visited = new Set<string>();
  const queue: { url: string; courseSlug: string; depth: number }[] = [];
  const pages: RawPage[] = [];

  log('Discovering courses...');
  const courses = await discoverCourses();
  log(`Found ${courses.length} courses`);

  for (const { url, slug } of courses) {
    if (!visited.has(url)) {
      visited.add(url);
      queue.push({ url, courseSlug: slug, depth: 0 });
    }
  }

  let processed = 0;
  while (queue.length > 0) {
    const item = queue.shift()!;
    processed++;

    if (processed % 20 === 0) {
      log(`Crawled ${processed}, queue: ${queue.length}, extracted: ${pages.length}`);
    }

    const html = await fetchHtml(item.url);
    if (!html) {
      await delay(CRAWL_DELAY);
      continue;
    }

    const $ = cheerio.load(html);

    // Extract page content
    const pathMatch = item.url.match(/\/bsv-academy\/bsv-academy\/(.+)/);
    const pathSegments = pathMatch ? pathMatch[1].split('/').filter(Boolean) : [];
    const chapter = pathSegments[1] || '';
    const section = pathSegments.slice(2).join('/') || '';

    const title =
      $('h1').first().text().trim() ||
      $('title').text().trim().replace(/ \|.*$/, '') ||
      pathSegments[pathSegments.length - 1] || 'Untitled';

    $('script, style, nav, header, footer').remove();
    const mainContent = $('main').length ? $('main') : $('body');

    const bodyText = mainContent
      .find('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 10)
      .join('\n\n');

    const codeExamples: string[] = [];
    $('pre code, code').each((_, el) => {
      const code = $(el).text().trim();
      if (code.length > 20) codeExamples.push(code);
    });

    const keyTerms: string[] = [];
    $('strong, b, em').each((_, el) => {
      const term = $(el).text().trim();
      if (term.length > 2 && term.length < 100 && !term.includes('\n')) {
        keyTerms.push(term);
      }
    });

    if (bodyText.length >= 50) {
      pages.push({
        url: item.url,
        courseSlug: item.courseSlug,
        chapter,
        section,
        title,
        bodyText,
        codeExamples: codeExamples.slice(0, 10),
        keyTerms: [...new Set(keyTerms)].slice(0, 30),
      });
    }

    // Discover more links
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#')) return;
      const fullUrl = resolveUrl(href, item.url);
      if (!fullUrl || !fullUrl.includes('/bsv-academy/bsv-academy/')) return;
      const cleanUrl = fullUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');
      if (!visited.has(cleanUrl)) {
        visited.add(cleanUrl);
        const courseMatch = cleanUrl.match(/\/bsv-academy\/bsv-academy\/([a-z0-9-]+)/);
        if (courseMatch) {
          queue.push({ url: cleanUrl, courseSlug: courseMatch[1], depth: item.depth + 1 });
        }
      }
    });

    await delay(CRAWL_DELAY);
  }

  log(`Crawl complete: ${processed} pages visited, ${pages.length} extracted`);
  return pages;
}

function extractConcepts(bodyText: string): string[] {
  const sentences = bodyText
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 500);

  const patterns = [
    /\bis\b/i, /\bare\b/i, /\bdefin/i, /\brefers?\s+to\b/i,
    /\bknown\s+as\b/i, /\bprocess\b/i, /\bfunction\b/i,
    /\ballows?\b/i, /\benables?\b/i, /\brequires?\b/i,
    /\bused\s+(to|for|in)\b/i, /\bensures?\b/i,
  ];

  return sentences.filter((s) => patterns.some((p) => p.test(s))).slice(0, 20);
}

function buildKnowledgeBase(pages: RawPage[]): KnowledgeBase {
  const courseMap = new Map<string, RawPage[]>();
  for (const page of pages) {
    const list = courseMap.get(page.courseSlug) || [];
    list.push(page);
    courseMap.set(page.courseSlug, list);
  }

  let totalTopics = 0;
  let totalSections = 0;
  let totalConcepts = 0;
  const courses: Course[] = [];

  for (const [slug, coursePages] of courseMap) {
    const chapterMap = new Map<string, RawPage[]>();
    for (const page of coursePages) {
      const key = page.chapter || '_root';
      const list = chapterMap.get(key) || [];
      list.push(page);
      chapterMap.set(key, list);
    }

    const chapters: Chapter[] = [];
    for (const [chName, chPages] of chapterMap) {
      const sections: Section[] = chPages.map((p) => {
        const concepts = extractConcepts(p.bodyText);
        totalConcepts += concepts.length;
        totalSections++;
        return {
          title: p.title,
          url: p.url,
          bodyText: p.bodyText,
          concepts,
          keyTerms: p.keyTerms,
          codeExamples: p.codeExamples,
        };
      });
      chapters.push({
        name: slugToName(chName === '_root' ? slug : chName),
        sections,
      });
    }

    totalTopics++;

    // Build course description from first section
    const firstSection = chapters[0]?.sections[0];
    const description = firstSection
      ? firstSection.bodyText.slice(0, 200).replace(/\n/g, ' ').trim() + '...'
      : '';

    courses.push({ slug, name: slugToName(slug), description, chapters });
  }

  return {
    courses,
    generatedAt: new Date().toISOString(),
    totalTopics,
    totalSections,
    totalConcepts,
  };
}

export { discoverAllPages, buildKnowledgeBase };
