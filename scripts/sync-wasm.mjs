/**
 * Copy MediaPipe WASM binaries from node_modules into public/wasm and
 * patch ModuleFactory onto the worker global (see patch-wasm-modulefactory.mjs).
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const dest = path.join(root, 'public', 'wasm')

async function main() {
  await rm(dest, { recursive: true, force: true })
  await mkdir(dest, { recursive: true })
  await cp(src, dest, { recursive: true })
  console.log('copied wasm ->', dest)

  const patch = path.join(root, 'scripts', 'patch-wasm-modulefactory.mjs')
  const r = spawnSync(process.execPath, [patch], { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
