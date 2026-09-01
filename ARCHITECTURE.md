# NOSE GO! Architecture

This document describes the client SPA flow, vision stack choices, game state machine, win detection, worker usage, GCP static hosting, and security model for NOSE GO! Party Edition.

## Client SPA flow

```
Browser load
    |
    v
Bootstrap SPA (static JS/CSS/WASM from nginx)
    |
    v
Permission gate (camera)
    |
    v
Init vision runtime (MediaPipe Face Landmarker and/or TF.js)
    |
    v
Game state machine <---+
    |                  |
    v                  |
Capture frame ---------+
    |
    v
Landmark inference (main thread or worker)
    |
    v
Map nose tip (and helpers) to screen space
    |
    v
Hit-test targets / update scores
    |
    v
Render overlay + UI; transition states on timers or win
```

Production assets are entirely static after `npm run build`. There is no required origin API for core gameplay. Optional future `/api` routes can be added behind nginx (see `nginx.conf.template` stub) without changing the static hosting model for the SPA shell.

## MediaPipe vs TensorFlow.js

Both stacks can power nose tracking; Party Edition may ship one primary path with the other as fallback depending on app `src/` configuration.

| Concern | MediaPipe Face Landmarker | TensorFlow.js face models |
| --- | --- | --- |
| Delivery | Tasks Vision WASM / GPU delegates; `.task` model files | npm packages + model weights over HTTP |
| Landmarks | Stable facial topology including nose tip | Varies by model (e.g. face-landmarks-detection) |
| Performance | Strong on desktop; WASM size is non-trivial | Flexible backends (WebGL, WASM, CPU) |
| Offline / cache | Cache `.wasm` and `.task` aggressively at the edge/nginx | Cache model weight URLs and bundled JS |
| Integration | Graph/options API, often via `@mediapipe/tasks-vision` | tfjs + model-specific APIs |

**Guidance**

- Prefer a single primary pipeline in production to limit download size and CPU contention.
- Lazy-load models after the lobby UI so first paint stays fast.
- Pin model asset versions in `public/` or CDN paths so deploys are reproducible.
- nginx is configured to long-cache `wasm`, `task`, and fingerprinted `js` assets.

## State machine

The game is driven by an explicit finite state machine (names may match app constants in `src/`):

| State | Entry | Behavior | Exit |
| --- | --- | --- | --- |
| `idle` / lobby | App start or after dismiss win | Show start CTA, camera preview optional | User starts round |
| `countdown` | Start pressed | Short countdown overlay; inference may warm up | Timer elapsed |
| `playing` | Countdown done | Active hit-testing, score, remaining time | Win condition or timeout |
| `won` | Win detected | Celebrate UI (e.g. party hat), freeze or ease targets | User acknowledges |
| `lost` / `timeout` (optional) | Timer hit zero without win | Retry prompt | Back to lobby |
| `error` | Camera or model failure | Actionable message, retry init | Recover or reload |

Transitions should be pure functions of `(state, event, now)` where possible so tests can drive the machine without a camera. UI components subscribe to state; they should not mutate landmark buffers directly.

## Win detection

Win detection runs after landmarks are mapped into the same coordinate space as targets (CSS pixels or a normalized game canvas).

1. **Landmark selection** — typically the nose tip index from the face mesh topology; optional smoothing (EMA / one-euro) reduces jitter.
2. **Hit test** — point-in-circle or point-in-rect against each live target; respect z-order or “frontmost target only” if targets overlap.
3. **Claim rules** — dwell time (nose must stay on target for N ms) and/or instant claim; Party Edition should pick one rule and document it in UI copy.
4. **Aggregate win** — examples: first to N claims, all targets cleared, or a special target claimed. The reducer sets `won` when the predicate is true.
5. **Anti-cheat lite** — client games are inherently spoofable; still ignore frames with poor face presence scores and require continuous camera stream so still images are less effective.

Unit tests should cover coordinate transforms, dwell thresholds, and boundary conditions without MediaPipe loaded.

## Worker performance

Landmark inference and pre/post-processing can block the main thread and drop UI frames.

**Recommended split**

- **Main thread:** camera `Video` element, canvas/DOM overlay, input, state machine timers, audio stings.
- **Worker:** model inference, optional smoothing, serialized landmark arrays posted back via `postMessage` (transferables where possible).

**Practices**

- Do not ship `ImageBitmap` or video frames faster than the worker can process; use an “latest frame wins” queue (drop stale frames).
- Cap inference rate (e.g. 30 FPS) independent of display refresh.
- Warm up the model during `countdown` to avoid first-frame stalls in `playing`.
- Measure with browser performance panels; budget main-thread long tasks under ~50 ms where possible on mid-tier laptops.

If the Worker + WASM path is unavailable on a browser, fall back to main-thread inference with a reduced resolution or frame rate rather than failing hard.

## GCP static hosting

NOSE GO! is deployed as static files on a small Compute Engine VM.

```
GitHub main branch
    -> GitHub Actions (Node 20: ci, test, build)
    -> scp/rsync dist/ to VM:/var/www/nosego/dist
    -> nginx reload

Client
    -> DNS or static IP
    -> nginx :80 / :443
    -> try_files SPA fallback to index.html
    -> long-cache immutable assets (js/wasm/task)
```

**Provisioning**

- `scripts/gcp-setup.sh` creates project-level resources: API enablement, address `nose-go-ip`, VM `nose-go-vm` (e2-medium, Ubuntu 22.04, 20 GB disk, `us-central1-a`), firewall rules for 22/80/443, IP association.
- `install-server.sh` hardens the guest: nginx, certbot packages, directory layout, site config from `nginx.conf.template`, UFW notes.
- `deploy.sh` is the repeatable artifact ship step used both manually and from CI.

**Why a VM instead of pure object storage**

- Simple single-box mental model for parties and demos.
- Easy certbot TLS and future `/api` sidecar without redesign.
- Predictable cost at e2-medium scale; can shrink machine type later if CPU is idle (vision runs client-side).

Object storage + HTTPS load balancer remains a valid alternative; the nginx layout still applies if assets are mirrored.

## Security

| Topic | Approach |
| --- | --- |
| Camera data | Processed in-browser only; not uploaded by the core game path |
| Transport | HTTPS in production (certbot); HSTS after TLS is stable |
| Static XSS | Avoid `innerHTML` with untrusted strings; keep CSP-friendly inline policy tight over time |
| nginx headers | `X-Content-Type-Options`, `X-Frame-Options` / `frame-ancestors`, `Referrer-Policy`, and CSP baseline in `nginx.conf.template` |
| SSH | Key-only access; CI uses a dedicated deploy key in GitHub secrets |
| Secrets | `GCP_SSH_KEY`, `STATIC_IP`, `DEPLOY_USER` live in GitHub Actions secrets — never in the repo |
| Supply chain | Lockfile commits, `npm ci` in CI, pin Node 20 |
| Firewall | Only 22, 80, 443 to the VM; no public DB or app admin ports |
| Future `/api` | Terminate TLS at nginx; rate-limit and validate inputs; do not trust client scores for ranked/global leaderboards without auth and server verification |

**Privacy**

Show a clear camera permission rationale. Do not record or persist video unless a future feature explicitly opts in with separate consent and storage design.

## Related files

- `nginx.conf.template` — production site template
- `deploy.sh` — rsync/scp + nginx reload
- `install-server.sh` — Ubuntu 22.04 bootstrap
- `scripts/gcp-setup.sh` — GCP resource provisioning
- `.github/workflows/deploy.yml` — CI deploy on `main`

## Production URL

- https://nose-go.com/
- https://www.nose-go.com/
- Google-managed SSL via HTTPS load balancer IP 34.49.115.26
- Origin VM: nose-go-vm 34.68.53.223
