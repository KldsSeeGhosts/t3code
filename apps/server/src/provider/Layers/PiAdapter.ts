/**
 * PiAdapter — fork scaffold for the Pi coding agent driver.
 *
 * Fork-only file (pingdotgg/t3code does not ship a `pi` driver). This module
 * provides the `ProviderAdapterShape` half of the driver with every
 * conversation-bearing operation failing a clear "not implemented yet" error,
 * while the bookkeeping operations behave as no-ops (nothing can be running
 * while `startSession` fails, so stop/interrupt/respond have nothing to do).
 *
 * The real implementation wraps Pi's process-integration protocol:
 *
 *   - spawn `pi --mode rpc` in the thread's working directory (strict
 *     LF-delimited JSONL over stdin/stdout — split on `\n` only; generic
 *     line readers that also split on other terminators will corrupt
 *     records),
 *   - resume sessions with `--session <id>` / `-c`, matching T3's session
 *     directory onto Pi's JSONL session tree under `~/.pi/agent/sessions/`,
 *   - map Pi runtime events onto `ProviderRuntimeEvent` the same way
 *     `CodexAdapter` maps the Codex app-server protocol (Pi has no ACP
 *     support, so the ACP helpers under `provider/acp/` do not apply),
 *   - feed harness identity through `RuntimeInstructions` as a per-turn
 *     context block (ACP-style; Pi's RPC prompts have no system field),
 *   - translate Pi's tool allowlist (`--tools`, `--no-approve`) and project
 *     trust settings onto T3's permission modes — Pi ships no permission
 *     popups, so an unsandboxed Pi run is by design fully trusted.
 *
 * Follow `Layers/CodexAdapter.ts` for the native-protocol structure and
 * `FORK.md` at the fork root for the implementation checklist.
 *
 * @module provider/Layers/PiAdapter
 */
import { ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { ProviderAdapterRequestError, type ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";

/**
 * Surfaced through the provider snapshot so the UI shows why the Pi
 * instance is unavailable instead of a generic error.
 */
export const PI_SCAFFOLD_NOTICE =
  "Pi driver scaffold: the pi --mode rpc adapter is not implemented yet. See FORK.md in the t3code fork.";

const failNotImplemented = (method: string) =>
  new ProviderAdapterRequestError({
    provider: "pi",
    method,
    detail: PI_SCAFFOLD_NOTICE,
  });

/**
 * Build the scaffold adapter. The returned value satisfies the full
 * `ProviderAdapterShape` so the driver registration typechecks against
 * `ProviderInstance`; replacing the failing closures with real protocol
 * calls is additive — the shape does not change.
 */
export const makePiAdapter = (): ProviderAdapterShape<ProviderAdapterError> => ({
  provider: ProviderDriverKind.make("pi"),
  capabilities: {
    // Pi branches sessions in place via its JSONL session tree; model
    // switching mid-session is a decision for the real adapter.
    sessionModelSwitch: "unsupported",
  },

  startSession: () => Effect.fail(failNotImplemented("startSession")),
  sendTurn: () => Effect.fail(failNotImplemented("sendTurn")),

  // No session can exist while startSession fails, so lifecycle and
  // response operations complete as no-ops rather than erroring.
  interruptTurn: () => Effect.void,
  respondToRequest: () => Effect.void,
  respondToUserInput: () => Effect.void,
  stopSession: () => Effect.void,
  stopAll: () => Effect.void,

  listSessions: () => Effect.succeed([]),
  hasSession: () => Effect.succeed(false),

  readThread: () => Effect.fail(failNotImplemented("readThread")),
  rollbackThread: () => Effect.fail(failNotImplemented("rollbackThread")),

  streamEvents: Stream.empty,
});
