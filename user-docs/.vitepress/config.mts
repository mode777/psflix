import { defineConfig } from 'vitepress'

const base = (process.env.DOCS_BASE_PATH ?? '/psflix/docs/').replace(/\/?$/, '/')

export default defineConfig({
  lang: 'en',
  title: 'PSflix',
  titleTemplate: ':title · PSflix Docs',
  description:
    'User documentation for PSflix — the Netflix-style catalog for PlayStation 1 games. Learn how to browse, play in your browser, and keep your saves in sync.',

  base,
  appearance: 'dark',

  // Isolate from the app's root postcss.config.js (Tailwind) — Vite would
  // otherwise walk up and load it, failing when root node_modules is absent.
  vite: {
    css: { postcss: { plugins: [] } },
  },

  themeConfig: {
    nav: [{ text: 'Guide', link: '/', activeMatch: '^/$' }],

    sidebar: [
      {
        text: 'Start',
        items: [{ text: 'Getting Started', link: '/getting-started/' }],
      },
      {
        text: 'Using PSflix',
        items: [
          { text: 'Browsing the Catalog', link: '/browsing/' },
          { text: 'Playing Games', link: '/playing/' },
          { text: 'Save States', link: '/save-states/' },
          { text: 'Memory Cards', link: '/memory-cards/' },
        ],
      },
      {
        text: 'Self-Hosting',
        items: [
          { text: 'Hosting & Running', link: '/hosting/' },
          { text: 'Administration', link: '/admin/' },
        ],
      },
      {
        text: 'Help',
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting/' },
          { text: 'FAQ', link: '/faq/' },
        ],
      },
    ],

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Search docs', buttonAriaLabel: 'Search docs' },
        },
      },
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/mode777/psflix' }],

    outline: { level: [2, 3], label: 'On this page' },

    footer: {
      message: 'PSflix user documentation — runs pcsx-rearmed & PocketBase',
      copyright: 'PlayStation is a trademark of Sony Interactive Entertainment. PSflix is a fan project.',
    },
  },
})
