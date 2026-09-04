/**
 * PiDriver — fork driver for the Pi coding agent (`pi`, earendil-works/pi).
 *
 * Fork-only file (pingdotgg/t3code does not ship a `pi` driver). Mirrors the
 * built-in drivers: a plain `ProviderDriver` value whose `create()` bundles
 * the `snapshot` / `adapter` / `textGeneration` closures for one configured
 * instance. The config schema lives here, not in `@t3tools/contracts` — the
 * contracts layer treats `ProviderInstanceConfig.config` as an opaque blob
 * and `ProviderDriverKind` as an open slug, so this file plus one entry in
 * `BUILT_IN_DRIVERS` is the entire server-side registration surface.
 *
 * Current state: scaffold. The instance reports an "unavailable" snapshot
 * whose reason explains that the `pi --mode rpc` adapter is still to be
 * written, and every conversation-bearing adapter/text-generation operation
 * fails with that same notice. Implementing the adapter (see
 * `Layers/PiAdapter.ts` and `FORK.md` at the fork root) upgrades the same
 * registration to a fully working harness without further orchestration,
 * contract, or client changes.
 *
 * @module provider/Drivers/PiDriver
 */
import { ProviderDriverKind, TextGenerationError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { PI_SCAFFOLD_NOTICE, makePiAdapter } from "../Layers/PiAdapter.ts";
import type { ServerProviderShape } from "../Services/ServerProvider.ts";
import type { TextGeneration } from "../../textGeneration/TextGeneration.ts";
import { buildUnavailableProviderSnapshot } from "../unavailableProviderSnapshot.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";

const DRIVER_KIND = ProviderDriverKind.make("pi");

/**
 * Driver-owned instance config (decoded by the registry from the opaque
 * `ProviderInstanceConfig.config` envelope). Every field defaults so the
 * legacy empty-config and auto-bootstrap paths decode cleanly; the real
 * adapter consumes `binaryPath`, `defaultModel`, and `extraArgs` when it
 * spawns `pi --mode rpc`.
 */
export const PiSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  binaryPath: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed("pi"))),
  defaultModel: Schema.optionalKey(Schema.String),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type PiSettings = typeof PiSettings.Type;

const decodePiSettings = Schema.decodeSync(PiSettings);

/**
 * Text-generation scaffold. Commit/PR/branch/title generation fails with the
 * scaffold notice until the real adapter owns a text-generation spin (see
 * `textGeneration/OpenCodeTextGeneration.ts` for the shape of a working one).
 */
const makeStubTextGeneration = (): TextGeneration["Service"] => {
  const fail = (operation: string) =>
    Effect.fail(
      new TextGenerationError({
        operation,
        detail: PI_SCAFFOLD_NOTICE,
      }),
    );
  return {
    generateCommitMessage: () => fail("generateCommitMessage"),
    generatePrContent: () => fail("generatePrContent"),
    generateBranchName: () => fail("generateBranchName"),
    generateThreadTitle: () => fail("generateThreadTitle"),
  };
};

export type PiDriverEnv = never;

export const PiDriver: ProviderDriver<PiSettings, PiDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "Pi",
    supportsMultipleInstances: true,
  },
  configSchema: PiSettings,
  defaultConfig: (): PiSettings => decodePiSettings({}),
  create: ({ instanceId, displayName, accentColor }) =>
    Effect.gen(function* () {
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });

      const buildSnapshot = () =>
        buildUnavailableProviderSnapshot({
          driverKind: DRIVER_KIND,
          instanceId,
          displayName: displayName ?? "Pi",
          reason: PI_SCAFFOLD_NOTICE,
        });

      const snapshot: ServerProviderShape = {
        maintenanceCapabilities: {
          provider: DRIVER_KIND,
          packageName: null,
          update: null,
        },
        getSnapshot: buildSnapshot(),
        refresh: buildSnapshot(),
        streamChanges: Stream.empty,
        applyUsageLimits: () => Effect.void,
      };

      return {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName,
        accentColor,
        enabled: true,
        snapshot,
        adapter: makePiAdapter(),
        textGeneration: makeStubTextGeneration(),
      } satisfies ProviderInstance;
    }),
};
