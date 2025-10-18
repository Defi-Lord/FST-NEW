import { Buffer } from 'buffer'
;(window as any).Buffer ??= Buffer

import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
