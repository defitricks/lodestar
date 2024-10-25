import {MessagePort, Worker} from "node:worker_threads";
import {Thread} from "@chainsafe/threads";
import {Logger} from "@lodestar/logger";
import {sleep} from "@lodestar/utils";
import {Metrics} from "../metrics/metrics.js";
import {NetworkCoreWorkerMetrics} from "../network/core/metrics.js";
import {StrictEventEmitterSingleArg} from "./strictEvents.js";
import {NetworkWorkerThreadEventType} from "../network/core/events.js";

/** Use as lightweight message as possible when passing through thread boundary to minimize structural clone cost */
export type WorkerBridgeEvent<EventData> = {
  type: NetworkWorkerThreadEventType;
  event: number;
  posted: number;
  data: EventData[keyof EventData];
};

export enum EventDirection {
  workerToMain,
  mainToWorker,
  /** Event not emitted through worker boundary */
  none,
}

/**
 * Bridges events from worker to main thread
 * Each event can only have one direction:
 * - worker to main
 * - main to worker
 */
export function wireEventsOnWorkerThread<EventData extends Record<string, unknown>>(
  mainEventName: NetworkWorkerThreadEventType,
  events: StrictEventEmitterSingleArg<EventData>,
  parentPort: MessagePort,
  metrics: NetworkCoreWorkerMetrics | null,
  isWorkerToMain: {[K in keyof EventData]: EventDirection}
): void {
  // Subscribe to events from main thread
  const networkEvents = Object.keys(isWorkerToMain) as (keyof EventData)[];
  parentPort.on("message", (data: WorkerBridgeEvent<EventData>) => {
    if (
      typeof data === "object" &&
      data.type === mainEventName &&
      // This check is not necessary but added for safety in case of improper implemented events
      isWorkerToMain[data.event] === EventDirection.mainToWorker
    ) {
      const networkWorkerLatency = (Date.now() - data.posted) / 1000;
      metrics?.networkWorkerWireEventsOnWorkerThreadLatency.observe(
        {eventName: networkEvents[data.event] as string},
        networkWorkerLatency
      );
      events.emit(networkEvents[data.event], data.data);
    }
  });

  for (const eventName of Object.keys(isWorkerToMain) as (keyof EventData)[]) {
    if (isWorkerToMain[eventName] === EventDirection.workerToMain) {
      // Pick one of the events to comply with StrictEventEmitter function signature
      events.on(eventName, (data) => {
        const workerEvent: WorkerBridgeEvent<EventData> = {
          type: mainEventName,
          event: networkEvents.indexOf(eventName),
          posted: Date.now(),
          data,
        };
        parentPort.postMessage(workerEvent);
      });
    }
  }
}

export function wireEventsOnMainThread<EventData extends Record<string, unknown>>(
  mainEventName: NetworkWorkerThreadEventType,
  events: StrictEventEmitterSingleArg<EventData>,
  worker: Pick<Worker, "on" | "postMessage">,
  metrics: Metrics | null,
  isWorkerToMain: {[K in keyof EventData]: EventDirection}
): void {
  const networkEvents = Object.keys(isWorkerToMain) as (keyof EventData)[];
  // Subscribe to events from main thread
  worker.on("message", (data: WorkerBridgeEvent<EventData>) => {
    if (
      typeof data === "object" &&
      data.type === mainEventName &&
      // This check is not necessary but added for safety in case of improper implemented events
      isWorkerToMain[data.event] === EventDirection.workerToMain
    ) {
      const networkWorkerLatency = (Date.now() - data.posted) / 1000;
      metrics?.networkWorkerWireEventsOnMainThreadLatency.observe(
        {eventName: networkEvents[data.event] as string},
        networkWorkerLatency
      );
      events.emit(networkEvents[data.event], data.data);
    }
  });

  for (const eventName of Object.keys(isWorkerToMain) as (keyof EventData)[]) {
    if (isWorkerToMain[eventName] === EventDirection.mainToWorker) {
      // Pick one of the events to comply with StrictEventEmitter function signature
      events.on(eventName, (data) => {
        const workerEvent: WorkerBridgeEvent<EventData> = {
          type: mainEventName,
          event: networkEvents.indexOf(eventName),
          posted: Date.now(),
          data,
        };
        worker.postMessage(workerEvent);
      });
    }
  }
}

export async function terminateWorkerThread({
  worker,
  retryMs,
  retryCount,
  logger,
}: {
  worker: Thread;
  retryMs: number;
  retryCount: number;
  logger?: Logger;
}): Promise<void> {
  const terminated = new Promise((resolve) => {
    Thread.events(worker).subscribe((event) => {
      if (event.type === "termination") {
        resolve(true);
      }
    });
  });

  for (let i = 0; i < retryCount; i++) {
    await Thread.terminate(worker);
    const result = await Promise.race([terminated, sleep(retryMs).then(() => false)]);

    if (result) return;

    logger?.warn("Worker thread failed to terminate, retrying...");
  }

  throw new Error(`Worker thread failed to terminate in ${retryCount * retryMs}ms.`);
}
