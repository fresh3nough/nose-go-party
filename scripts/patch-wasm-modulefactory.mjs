/**
 * MediaPipe WASM loaders are UMD. In module workers they are pulled in via
 * dynamic import() (strict mode), which breaks two things:
 *
 * 1) `var ModuleFactory` stays module-scoped → FilesetResolver throws
 *    "ModuleFactory not set."
 * 2) `custom_emscripten_dbgn` defines `function custom_dbg` inside a block;
 *    in strict mode that name does not leak, so GPU init throws
 *    "custom_dbg is not defined". MediaPipe then clears ModuleFactory and the
 *    CPU fallback fails with (1) again.
 *
 * Append globals so both paths work under dynamic import.
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
  // Required by vision_wasm_* glue when evaluated as an ES module (strict).
  if (typeof __g.custom_dbg !== 'function') {
    __g.custom_dbg = function () {
      try { console.warn.apply(console, arguments); } catch (_) {}
    };
  }
  if (typeof __g.dbg !== 'function') {
    __g.dbg = __g.custom_dbg;
  }
} catch (e) {}
`

async function main() {
  const files = (await readdir(wasmDir)).filter((f) => f.endsWith('.js'))
  for (const file of files) {
    const full = path.join(wasmDir, file)
    let src = await readFile(full, 'utf8')
    if (src.includes(marker)) {
      // Replace prior patch body so re-runs pick up custom_dbg fix.
      const idx = src.indexOf(marker)
      src = src.slice(0, idx).replace(/\s+$/, '') + '\n' + patch + '\n'
    } else {
      src = src.replace(/\s+$/, '') + '\n' + patch + '\n'
    }
    await writeFile(full, src)
    console.log('patched', file)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
