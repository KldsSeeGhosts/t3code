# Fork: T3 Code + Pi harness

This is a fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) that
adds the [Pi coding agent](https://github.com/earendil-works/pi)
(`pi`, npm `@earendil-works/pi-coding-agent`) as a driver, while tracking
upstream's fast-moving `main` (nightlies are cut from it continuously).

The architecture makes this cheap: drivers are a server-side concept, and the
contracts layer deliberately treats driver kinds as an _open_ slug and driver
configs as an opaque blob
(`packages/contracts/src/providerInstance.ts`, "Forward/backward
compatibility invariant"). Adding Pi required **no contract changes and no
client changes** — official desktop/web/mobile clients keep working against
this server.

## Fork layout

| Ref         | Contents                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`      | Clean mirror of `upstream/main`. Fast-forward only, never commit here.                                                                      |
| `pi-driver` | **Default branch.** `main` + fork commits. Scheduled workflows only run from the default branch, which is why the sync workflow lives here. |

Fork commits are kept small and almost entirely _new files_, so daily merges
from upstream rarely conflict:

1. `apps/server/src/provider/Drivers/PiDriver.ts` — driver + config schema (fork-only file)
2. `apps/server/src/provider/Layers/PiAdapter.ts` — adapter (fork-only file)
3. `apps/server/src/provider/builtInDrivers.ts` — one import, one union line, one array entry
4. `.github/workflows/sync-upstream.yml`, this file

## Nightly sync (automated)

`.github/workflows/sync-upstream.yml` runs daily (05:23 UTC) and on manual
dispatch:

1. fast-forwards `main` to `upstream/main` and pushes it,
2. merges `main` into `pi-driver`,
3. installs deps and runs `pnpm --filter t3 typecheck`,
4. pushes `pi-driver` **only if the typecheck passed**, so a bad merge never
   lands. A server bundle step runs afterwards, non-blocking.

### When the sync fails

A red run means either a merge conflict or an upstream refactor that the Pi
scaffold no longer satisfies. Fix locally:

```bash
git checkout pi-driver
git fetch upstream
git merge upstream/main     # resolve conflicts (git rerere is enabled)
CI=true pnpm install
pnpm --filter t3 typecheck
git push origin pi-driver
```

Then re-run the workflow ("Run workflow" on the Actions page) to confirm
green. Note: GitHub disables scheduled workflows after 60 days without repo
activity; daily pushes normally prevent this, but if you pause the fork,
trigger a manual run once before relying on the schedule again.

## Pi driver status: scaffold

`pi` is registered and configurable, and instances surface in every client,
but the harness itself is not implemented yet — instances show an
"unavailable" snapshot whose reason says exactly that
(`PI_SCAFFOLD_NOTICE`), and conversation operations fail with the same
message.

Implementation checklist (all in `apps/server/src/provider/`):

- [ ] `Layers/PiAdapter.ts` — spawn `pi --mode rpc` per session in the
      thread's cwd; strict LF-delimited JSONL framing (split on `\n` only —
      Pi's docs warn generic line readers corrupt records).
- [ ] Map Pi events → `ProviderRuntimeEvent`; follow `Layers/CodexAdapter.ts`
      (native-protocol precedent — Pi has no ACP support, so the helpers in
      `provider/acp/` do not apply). The smallest full example is the Grok
      driver: `Drivers/GrokDriver.ts` + `Layers/GrokAdapter.ts`.
- [ ] Session resume: T3 session ids ↔ Pi `--session <id>` / `-c`; Pi stores
      JSONL session trees under `~/.pi/agent/sessions/`.
- [ ] Harness identity per turn via `RuntimeInstructions.ts` (Pi's RPC
      prompts have no system field — append a context block like the ACP
      drivers do).
- [ ] Permissions: Pi has no permission popups by design; map its
      `--tools` / `--no-approve` / project-trust settings onto T3's
      permission modes and document that an unsandboxed Pi run is fully
      trusted.
- [ ] `Drivers/PiDriver.ts` — replace the unavailable-snapshot scaffold with
      a real health probe (`pi --version` + login/model listing, mirroring
      `checkGrokProviderStatus`), and a text-generation spin (see
      `textGeneration/OpenCodeTextGeneration.ts`).
- [ ] Model catalog: expose Pi's `--provider/--model` selection through the
      snapshot's `models` list so the model picker works.

Reference docs: `docs/internals/providers.md` ("Adding a driver means writing
the driver plus adapter and adding it to `BUILT_IN_DRIVERS`. No orchestration,
contract, or client change is required for the common case.").

### Configuring an instance

Add to the server's `settings.json`
(`~/.t3/userdata/settings.json` for a normal install; `dev/userdata/` when
running from a dev worktree):

```json
{
  "providerInstances": {
    "pi": {
      "driver": "pi",
      "enabled": true,
      "config": { "binaryPath": "pi", "defaultModel": "" }
    }
  }
}
```

Any unknown driver kind in a _stock_ build renders as an "unavailable" shadow
instance instead of breaking — that behavior is what makes rolling between
this fork and upstream safe.

## Running from source

```bash
CI=true pnpm install          # pnpm 11.x, Node 24 (repo-pinned versions)
pnpm --filter t3 dev          # dev server
pnpm --filter t3 build:bundle # dist/bin.mjs
node apps/server/dist/bin.mjs serve
```

Pair the phone (recommended: tailnet):

```bash
npx t3 pair --tailscale
```

### Desktop launcher entry

`~/.local/share/applications/t3code-fork.desktop` (Caelestia app grid,
intentionally not a favorite) launches the fork server and opens its web UI.
It is backed by `~/.local/bin/t3code-fork`, which:

- runs the built server on fixed port `8960` (override with `T3_FORK_PORT`),
- uses an isolated data dir `~/.t3-fork` — threads and settings do not mix
  with the official desktop app's shared install,
- opens a freshly minted pairing URL (`pair#token=…`) instead of the bare
  origin, so the browser is always authenticated — no manual code entry,
- normally leaves serving to the `t3code-fork` systemd user unit
  (`~/.config/systemd/user/t3code-fork.service`; logs via `journalctl --user
-u t3code-fork`), and only starts a fallback process when that service is
  inactive.

The UI is served from `apps/web/dist` (auto-discovered). After syncing
upstream, rebuild both bundles or the launcher serves a stale or missing UI:

```bash
pnpm --filter t3 build:bundle && pnpm --filter @t3tools/web build
systemctl --user restart t3code-fork.service
```

### Pairing

Pairing always happens through `pair#token=` URLs minted against a specific
base dir — a token minted for one install says nothing about another, and
`pair` finds its server by reading `server-runtime.json` from that base dir:

```bash
# Local browser (the wrapper does this on every launch):
node apps/server/dist/bin.mjs pair --base-dir ~/.t3-fork

# Phone: publish over Tailscale Serve on a free HTTPS port
# (443 on this tailnet is already taken by another mapping):
node apps/server/dist/bin.mjs pair --base-dir ~/.t3-fork --tailscale \
  --tailscale-serve-port 8443
```

The `--tailscale` path requires this user to be the Tailscale operator
(one-time, needs sudo): `sudo tailscale set --operator=$USER`. The Serve
mapping itself persists until `tailscale serve --https=8443 off`; re-run the
pair command whenever a device needs a fresh token.

## Mobile

No mobile build is required for Pi support: the official iOS/Android apps are
clients and render whatever the server reports. Unknown driver kinds fall
back to a generic icon/initials (`apps/mobile/src/components/ProviderIcon.tsx`,
`apps/web/src/components/chat/ProviderInstanceIcon.tsx`), so Pi instances
appear in the official app once the adapter works.

If you later want a customized app (Pi icon, client behavior), the app is
Expo + EAS Build (`apps/mobile/eas.json`): `eas build -p ios` builds in
Expo's cloud — no Mac needed, but distribution (TestFlight/App Store)
requires an Apple Developer Program membership.

## Upstreaming

The driver interface here is built for additions, so the endgame is a PR to
pingdotgg/t3code with the completed Pi driver. If it merges, this fork
collapses back to a plain clone — sync the branch, delete it, done.
