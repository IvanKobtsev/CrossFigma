# CrossFigma

Figma helper for CrossBreeze. Open the plugin and choose **Send design tokens to CrossBreeze** or **Export design tokens as JSON**. No configuration is required.

## Development

Install dependencies with `pnpm install`, then run `pnpm build` (or `pnpm watch`). Import `manifest.json` through Figma's development plugins menu. Run `pnpm lint` and `node tests/conversion.cjs` for checks. The generated `code.js` contains the converter followed by the Figma entry point; no runtime dependencies are required.

## Output

Both actions produce the same self-contained DTCG 2025.10 resolver JSON, named `<document>.resolver.json`. Collections with multiple modes become independent modifiers; single-mode collections and styles become sets. Defaults follow Figma collection defaults. All sources are inline; aliases refer to the final resolved token tree. Consumers must support the resolver format, not merely a flat token file.

All local variables and local styles are exported, independent of selection. Referenced remote variables are included only when accessible through the plugin API. Missing dependencies, incompatible aliases, cycles, duplicate paths, or unsupported variable types fail conversion. Numeric variables remain numbers; units are not inferred. Alias-cycle validation conservatively rejects cycles across the union of modes.

Variables are namespaced under `variables/<collection>` and styles under `styles/<category>`. Slash-separated names form groups. Forbidden characters and percent signs are percent-escaped; empty segments become `%00`. Original IDs and names remain under `$extensions.io.crossfigma`. Duplicate names that would collide fail explicitly.

Solid paint styles, shadow-only effect styles, and text styles with explicit line height and recognized font weights become standard tokens. Other styles remain metadata-only groups with warnings. Text metadata preserves properties that typography tokens cannot express. Figma-specific metadata requires explicit consumer support; it is not a standard DTCG token value. AUTO line height and unrecognized font weights are not guessed.

Specifications: https://www.designtokens.org/tr/2025.10/format/ and https://www.designtokens.org/tr/2025.10/resolver/.

## CrossBreeze server contract (server not implemented here)

Bind `127.0.0.1:38473` while the IDE import process is active.

- `GET /health`: HTTP 200, JSON `{ "service": "CrossBreeze", "protocolVersion": 1 }`.
- `POST /design-tokens`: receives the resolver document directly as `application/json`. Return any 2xx status only when accepted. For failures return non-2xx with useful diagnostic text.
- Support CORS for the Figma UI sandbox, including its opaque/null origin, and OPTIONS preflight for POST with Content-Type. Browser private/local network access restrictions may also require browser permission or appropriate server headers. Bind only to loopback; do not expose this service to the network.

CrossFigma checks health before reading tokens. Health requests time out after three seconds, transfers after 30 seconds. POST is never retried automatically. The UI disables duplicate actions, retains errors until the next action, and offers full diagnostic copying with a selectable-text fallback.

## Manual acceptance checks

In both Figma desktop and browser: export a multi-mode fixture, confirm a downloaded JSON file, test successful transfer with a compatible server, stop the server and confirm the health warning, return a POST error and confirm diagnostic copying, deny clipboard access and confirm selectable fallback, test both Figma themes and rapid repeated clicks. Live Figma/browser checks require an interactive Figma session and are not covered by the automated fixtures.
