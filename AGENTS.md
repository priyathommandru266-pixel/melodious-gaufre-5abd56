# AGENTS.md

Guidance for AI agents and developers working on **File Converter Physical Drop Box** — a college Cloud Computing Lab project that replaces a hardware button + LED with a web UI over a serverless AWS conversion pipeline.

## Architecture

- **Frontend** (this repo root): TanStack Start + React 19 + TypeScript + Tailwind 4, hosted on Netlify. It is a pure client of the AWS API — there are no Netlify Functions and no Netlify data stores by design (the brief requires S3 / Lambda / DynamoDB).
- **Backend** (`aws/`): plain ESM JavaScript Lambdas deployed separately with AWS SAM. Not built or deployed by Netlify. `aws/lambdas/*/package.json` are independent packages; do not add them to the root workspace.

## Key directories

| Path | Contents |
|------|----------|
| `src/routes/` | `index.tsx` dashboard, `convert.tsx` upload & convert flow, `history.tsx`, `setup.tsx` AWS status page, `__root.tsx` shell + providers |
| `src/context/AppContext.tsx` | Single source of truth for mode (`live` / `demo` / `offline`), backend capabilities, job list |
| `src/lib/api.ts` | API client, presigned S3 upload (XHR for progress), polling |
| `src/lib/conversions.ts` | Catalog of conversion labels; filtered by `GET /capabilities` |
| `src/lib/validation.ts` | Client validation (mirrors server rules in `aws/lambdas/api/index.mjs`) |
| `src/lib/demo.ts` | **All demo fixtures** + local TXT conversion |
| `aws/template.yaml` | Full AWS stack |
| `docs/API_CONTRACT.md` | The contract both sides must follow — update it when changing either side |

## Non-negotiable rules

1. **Honesty about state.** Never display success, "uploaded to S3" or "saved to DynamoDB" unless the API response confirms it. Demo data must stay labelled (`source: 'demo-sample' | 'demo-local'`, DEMO MODE banner).
2. **No credentials in the frontend.** Only public values in `VITE_*`. All AWS access happens in Lambda via IAM roles; browsers get presigned URLs only.
3. **No browser storage for history.** `localStorage` holds only the demo-mode toggle. Local demo jobs live in memory.
4. **Only show supported conversions.** Live mode = intersection of catalog and `/capabilities`; demo = `LOCAL_DEMO_CONVERSIONS`.
5. **No S3 event triggers** for conversion; output goes to a separate bucket. This prevents recursive invocations.

## Conventions

- Path alias `@/` → `src/`. Shared UI primitives and button styles in `src/components/ui.tsx` (`btn.primary` etc.).
- Colours: slate neutrals, blue-600 → violet-600 gradient accents, emerald/rose/amber for status. Rounded-2xl cards, subtle shadows.
- Accessibility: every control is keyboard reachable, uses `focus-ring` utility, labelled inputs, `aria-live` for status/toasts.
- Job statuses: `PENDING_UPLOAD → QUEUED → PROCESSING → SUCCEEDED | FAILED` (see `StatusBadge.tsx`).
- Adding a conversion: add it to `CONVERSIONS` in both Lambdas + a converter function, to `ConversionType` and `CONVERSION_CATALOG` in `src/lib`, and to `docs/API_CONTRACT.md`.

## Remaining work

See the Roadmap in `README.md` (auth via Cognito, more conversions, malware scanning, WebSocket updates).
