import {
  PublicKey,
  aggregatePublicKeys,
  aggregateSignatures,
  aggregateWithRandomness,
  AggregationSet,
} from "@chainsafe/blst";
import {ISignatureSet, SignatureSetType} from "@lodestar/state-transition";
import {LinkedList} from "../../util/array.js";
import {Metrics} from "../../metrics/metrics.js";
import {VerifySignatureOpts} from "./interface.js";
import {getAggregatedPubkey} from "./utils.js";
import {BlsWorkReq} from "./types.js";

export type JobQueueItem = JobQueueItemDefault | JobQueueItemSameMessage;

export type JobQueueItemDefault = {
  type: JobQueueItemType.default;
  resolve: (result: boolean) => void;
  reject: (error?: Error) => void;
  addedTimeMs: number;
  opts: VerifySignatureOpts;
  sets: ISignatureSet[];
};

export type JobQueueItemSameMessage = {
  type: JobQueueItemType.sameMessage;
  resolve: (result: boolean[]) => void;
  reject: (error?: Error) => void;
  addedTimeMs: number;
  opts: VerifySignatureOpts;
  sets: AggregationSet[];
  message: Uint8Array;
};

export enum JobQueueItemType {
  default = "default",
  sameMessage = "same_message",
}

/**
 * Return count of signature sets from a JobQueueItem
 */
export function jobItemSigSets(job: JobQueueItem): number {
  switch (job.type) {
    case JobQueueItemType.default:
      return job.sets.length;
    case JobQueueItemType.sameMessage:
      return 1;
  }
}

/**
 * Prepare BlsWorkReq from JobQueueItem
 * WARNING: May throw with untrusted user input
 */
export function jobItemWorkReq(job: JobQueueItem, metrics: Metrics | null): BlsWorkReq {
  switch (job.type) {
    case JobQueueItemType.default:
      return {
        opts: job.opts,
        sets: job.sets.map((set) => ({
          // this can throw, handled in the consumer code
          publicKey: getAggregatedPubkey(set, metrics),
          signature: set.signature,
          message: set.signingRoot,
        })),
      };
    case JobQueueItemType.sameMessage: {
      // validate signature = true, this is slow code on main thread so should only run with network thread mode (useWorker=true)
      // For a node subscribing to all subnets, with 1 signature per validator per epoch it takes around 80s
      // to deserialize 750_000 signatures per epoch
      // cpu profile on main thread has 250s idle so this only works until we reach 3M validators
      // However, for normal node with only 2 to 7 subnet subscriptions per epoch this works until 27M validators
      // and not a problem in the near future
      // this is monitored on v1.11.0 https://github.com/ChainSafe/lodestar/pull/5912#issuecomment-1700320307
      const timer = metrics?.blsThreadPool.signatureDeserializationMainThreadDuration.startTimer();
      const {pk, sig} = aggregateWithRandomness(job.sets);
      timer?.();

      return {
        opts: job.opts,
        sets: [
          {
            message: job.message,
            publicKey: pk,
            signature: sig,
          },
        ],
      };
    }
  }
}

/**
 * Convert a JobQueueItemSameMessage into multiple JobQueueItemDefault linked to the original promise
 */
export function jobItemSameMessageToMultiSet(job: JobQueueItemSameMessage): LinkedList<JobQueueItemDefault> {
  // Retry each individually
  // Create new jobs for each pubkey set, and Promise.all all the results
  const promises: Promise<boolean>[] = [];
  const jobs = new LinkedList<JobQueueItemDefault>();

  for (const set of job.sets) {
    promises.push(
      new Promise<boolean>((resolve, reject) => {
        jobs.push({
          type: JobQueueItemType.default,
          resolve,
          reject,
          addedTimeMs: job.addedTimeMs,
          opts: {batchable: false, priority: job.opts.priority},
          sets: [
            {
              type: SignatureSetType.single,
              pubkey: set.pk,
              signature: set.sig,
              signingRoot: job.message,
            },
          ],
        });
      })
    );
  }

  // Connect jobs to main job
  Promise.all(promises).then(job.resolve, job.reject);

  return jobs;
}
