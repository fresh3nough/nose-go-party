/**
 * MediaPipe WASM loaders are UMD. When loaded via ES module dynamic import()
 * (module workers cannot use importScripts), `var ModuleFactory` stays
 * module-scoped and never lands on `self`, causing:
 *   "ModuleFactory not set."
 *
 * Append a global assignment so FilesetResolver can find the factory.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wasmDir = path.join(root, 'public', 'wasm')
const marker = '/* nose-go ModuleFactory global patch */'

const patch = `
${marker}
try {
  var __g = (typeof self !== 'undefined') ? self : globalThis;
  if (typeof ModuleFactory === 'function') {
    __g.ModuleFactory = ModuleFactory;
  } else if (typeof module !== 'undefined' && module.exports) {
    __g.ModuleFactory = module.exports.default || module.exports;
  }
} catch (e) {}
`

async function main() {
  const files = (await readdir(wasmDir)).filter((f) => f.endsWith('.js'))
  for (const file of files) {
    const full = path.join(wasmDir, file)
    let src = await readFile(full, 'utf8')
    if (src.includes(marker)) {
      console.log('already patched', file)
      continue
    }
    src = src.replace(/\s+$/, '') + '\n' + patch + '\n'
    await writeFile(full, src)
    console.log('patched', file)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
