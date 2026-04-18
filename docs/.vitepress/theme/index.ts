import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './custom.css'

/** Extends the default VitePress theme; register global components with `app.component` here. */
const theme: Theme = {
  ...DefaultTheme,
}

export default theme
