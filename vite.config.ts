import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const CLOUD_DB_FILE = path.resolve(process.cwd(), '.cloud-db.json')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'territorios-cloud-sync-api',
      configureServer(server) {
        server.middlewares.use('/api/cloud-state', (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')

          if (req.method === 'GET') {
            if (fs.existsSync(CLOUD_DB_FILE)) {
              try {
                const raw = fs.readFileSync(CLOUD_DB_FILE, 'utf-8')
                res.statusCode = 200
                res.end(raw)
                return
              } catch {
                res.statusCode = 200
                res.end('null')
                return
              }
            }
            res.statusCode = 200
            res.end('null')
            return
          }

          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', () => {
              try {
                JSON.parse(body)
                fs.writeFileSync(CLOUD_DB_FILE, body, 'utf-8')
                res.statusCode = 200
                res.end(JSON.stringify({ ok: true }))
              } catch {
                res.statusCode = 400
                res.end(JSON.stringify({ ok: false }))
              }
            })
            return
          }

          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
        })
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
  },
})
