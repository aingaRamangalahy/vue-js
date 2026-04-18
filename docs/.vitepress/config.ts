import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DefaultTheme, HeadConfig } from 'vitepress'
import { defineConfig } from 'vitepress'

const __dirname = dirname(fileURLToPath(import.meta.url))
const courseDir = join(__dirname, '../javascript-course')

const siteTitle = 'JavaScript via Vue Core'
const siteDescription =
  'Learn JavaScript and TypeScript through lessons grounded in the Vue.js core source code.'

/**
 * Reads the first Markdown H1 for sidebar labels (build-time only).
 */
function readFirstHeadingTitle(filePath: string): string {
  const raw = readFileSync(filePath, 'utf-8')
  const m = raw.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : basename(filePath, '.md')
}

/**
 * Sidebar items for /javascript-course/, derived from lesson files (no hand-maintained paths).
 */
function buildJavaScriptCourseSidebar(): DefaultTheme.SidebarItem[] {
  const entries = readdirSync(courseDir)
    .filter((f: string) => f.endsWith('.md') && f !== 'index.md')
    .sort()

  const overview: DefaultTheme.SidebarItem = {
    text: 'Overview',
    link: '/javascript-course/',
  }

  const lessons: DefaultTheme.SidebarItem[] = entries.map((file: string) => {
    const slug = basename(file, '.md')
    const abs = join(courseDir, file)
    return {
      text: readFirstHeadingTitle(abs),
      link: `/javascript-course/${slug}`,
    }
  })

  return [overview, ...lessons]
}

export default defineConfig({
  lang: 'en-US',
  title: siteTitle,
  description: siteDescription,
  base: '/',
  lastUpdated: true,

  head: [
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    ['meta', { name: 'theme-color', content: 'var(--vp-c-brand-1)' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: siteTitle }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],

  markdown: {
    lineNumbers: true,
  },

  themeConfig: {
    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Course', link: '/javascript-course/' },
    ],

    sidebar: {
      '/javascript-course/': buildJavaScriptCourseSidebar(),
    },

    outline: {
      label: 'On this page',
    },

    socialLinks: [],
  },

  /** Per-page OG tags; merges with static `head` above. */
  transformHead: ({ pageData }): HeadConfig[] => {
    const title = pageData.title || siteTitle
    const description =
      (typeof pageData.frontmatter.description === 'string' && pageData.frontmatter.description) ||
      siteDescription
    return [
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { name: 'description', content: description }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
    ]
  },
})
