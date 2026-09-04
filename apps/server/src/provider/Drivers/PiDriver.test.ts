import { expect, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { PI_SCAFFOLD_NOTICE } from "../Layers/PiAdapter.ts";
import { PiDriver } from "./PiDriver.ts";

const DRIVER_KIND = ProviderDriverKind.make("pi");

const createScaffoldInstance = Effect.gen(function* () {
  return yield* PiDriver.create({
    instanceId: ProviderInstanceId.make("pi"),
    displayName: undefined,
    environment: [],
    enabled: true,
    config: PiDriver.defaultConfig(),
  });
});

it.effect("default config decodes the empty envelope with Pi defaults", () =>
  Effect.gen(function* () {
    const config = PiDriver.defaultConfig();
    expect(config.enabled).toBe(true);
    expect(config.binaryPath).toBe("pi");
  }),
);

it.effect("create yields a registered Pi instance", () =>
  Effect.gen(function* () {
    const instance = yield* createScaffoldInstance;
    expect(instance.driverKind).toBe(DRIVER_KIND);
    expect(instance.enabled).toBe(true);
    expect(instance.adapter.provider).toBe(DRIVER_KIND);
    expect(yield* instance.adapter.hasSession("thread" as never)).toBe(false);
    expect(yield* instance.adapter.listSessions()).toEqual([]);
  }),
);

it.effect("snapshot reports the scaffold notice as unavailable", () =>
  Effect.gen(function* () {
    const instance = yield* createScaffoldInstance;
    const snapshot = yield* instance.snapshot.getSnapshot;
    expect(snapshot.availability).toBe("unavailable");
    expect(snapshot.unavailableReason).toBe(PI_SCAFFOLD_NOTICE);
    expect(snapshot.installed).toBe(false);
    expect(snapshot.message).toBe(PI_SCAFFOLD_NOTICE);
  }),
);
