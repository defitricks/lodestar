// /* eslint-disable @typescript-eslint/strict-boolean-expressions */
// import {spawn, Worker} from "@chainsafe/threads";
// // `threads` library creates self global variable which breaks `timeout-abort-controller` https://github.com/jacobheun/timeout-abort-controller/issues/9
// // Don't add an eslint disable here as a reminder that this has to be fixed eventually
// // eslint-disable-next-line
// // @ts-ignore
// // eslint-disable-next-line
// self = undefined;
// import {Logger} from "@lodestar/utils";
// import {ISignatureSet} from "@lodestar/state-transition";
// import {QueueError, QueueErrorCode} from "../../../util/queue/index.js";
// import {Metrics} from "../../../metrics/index.js";
// import {IBlsVerifier, VerifySignatureOpts} from "../interface.js";
// import {getAggregatedPubkey, getAggregatedPubkeysCount} from "../utils.js";
// import {asyncVerifySignatureSetsMaybeBatch, verifySignatureSetsMaybeBatch} from "../maybeBatch.js";
// import {LinkedList} from "../../../util/array.js";
// import {
//   BlsWorkReq,
//   BlsWorkResult,
//   DeserializedBlsWorkReq,
//   SerializedBlsWorkReq,
//   WorkerData,
//   WorkResultCode,
//   WorkResultError,
// } from "./types.js";
// import {chunkifyMaximizeChunkSize} from "./utils.js";
// import {defaultPoolSize} from "./poolSize.js";
// import {asyncVerifyManySignatureSets} from "./verifyManySignatureSets.js";
// import {
//   JobQueueItem,
//   JobQueueItemSameMessage,
//   JobQueueItemType,
//   jobItemSameMessageToMultiSet,
//   jobItemSigSets,
//   jobItemWorkReq,
// } from "./jobItem.js";

// export type BlsMultiThreadWorkerPoolModules = {
//   logger: Logger;
//   metrics: Metrics | null;
// };

// export type BlsMultiThreadWorkerPoolOptions = {
//   blsVerifyAllMultiThread?: boolean;
//   blsVerifyAllLibuv?: boolean;
// };

// /**
//  * Split big signature sets into smaller sets so they can be sent to multiple workers.
//  *
//  * The biggest sets happen during sync, on mainnet batches of 64 blocks have around ~8000 signatures.
//  * The latency cost of sending the job to and from the worker is approx a single sig verification.
//  * If you split a big signature into 2, the extra time cost is `(2+2N)/(1+2N)`.
//  * For 128, the extra time cost is about 0.3%. No specific reasoning for `128`, it's just good enough.
//  */
// const MAX_SIGNATURE_SETS_PER_JOB = 128;

// /**
//  * If there are more than `MAX_BUFFERED_SIGS` buffered sigs, verify them immediately without waiting `MAX_BUFFER_WAIT_MS`.
//  *
//  * The efficiency improvement of batching sets asymptotically reaches x2. However, for batching large sets
//  * has more risk in case a signature is invalid, requiring to revalidate all sets in the batch. 32 is sweet
//  * point for this tradeoff.
//  */
// const MAX_BUFFERED_SIGS = 32;
// /**
//  * Gossip objects usually come in bursts. Buffering them for a short period of time allows to increase batching
//  * efficiency, at the cost of delaying validation. Unless running in production shows otherwise, it's not critical
//  * to hold attestations and aggregates for 100ms. Lodestar existing queues may hold those objects for much more anyway.
//  *
//  * There's no exact reasoning for the `100` milliseconds number. The metric `batchSigsSuccess` should indicate if this
//  * value needs revision
//  */
// const MAX_BUFFER_WAIT_MS = 100;

// /**
//  * Max concurrent jobs on `canAcceptWork` status
//  */
// const MAX_JOBS_CAN_ACCEPT_WORK = 512;

// type WorkerApi = {
//   verifyManySignatureSets(workReqArr: BlsWorkReq[]): Promise<BlsWorkResult>;
// };

// enum WorkerStatusCode {
//   notInitialized,
//   initializing,
//   initializationError,
//   idle,
//   running,
// }

// type WorkerStatus =
//   | {code: WorkerStatusCode.notInitialized}
//   | {code: WorkerStatusCode.initializing; initPromise: Promise<WorkerApi>}
//   | {code: WorkerStatusCode.initializationError; error: Error}
//   | {code: WorkerStatusCode.idle | WorkerStatusCode.running; workerApi: WorkerApi};

// type WorkerDescriptor = {
//   worker: Worker;
//   status: WorkerStatus;
// };

// /**
//  * Wraps "threads" library thread pool queue system with the goals:
//  * - Complete total outstanding jobs in total minimum time possible.
//  *   Will split large signature sets into smaller sets and send to different workers
//  * - Reduce the latency cost for small signature sets. In NodeJS 12,14 worker <-> main thread
//  *   communication has very high latency, of around ~5 ms. So package multiple small signature
//  *   sets into packages of work and send at once to a worker to distribute the latency cost
//  */
// export class BlsMultiThreadWorkerPool implements IBlsVerifier {
//   private readonly logger: Logger;
//   private readonly metrics: Metrics | null;

//   private readonly workers: WorkerDescriptor[];
//   // <<<<<<< HEAD
//   //   private readonly workerJobs: JobQueueItem<boolean>[] = [];
//   //   private bufferedWorkerJobs: {
//   //     jobs: JobQueueItem[];
//   // =======
//   private readonly jobs = new LinkedList<JobQueueItem>();
//   private bufferedJobs: {
//     jobs: LinkedList<JobQueueItem>;
//     prioritizedJobs: LinkedList<JobQueueItem>;
//     // >>>>>>> 4720a5bf75036b180bc7b904d4cf3741a2a4c098
//     sigCount: number;
//     firstPush: number;
//     timeout: NodeJS.Timeout;
//   } | null = null;

//   private readonly libuvJobs: JobQueueItem<boolean>[] = [];
//   private bufferedLibuvJobs: {
//     jobs: JobQueueItem[];
//     sigCount: number;
//     firstPush: number;
//     timeout: NodeJS.Timeout;
//   } | null = null;

//   private blsVerifyAllMultiThread: boolean;
//   private blsVerifyAllLibuv: boolean;
//   private closed = false;
//   private workersBusy = 0;

//   constructor(options: BlsMultiThreadWorkerPoolOptions, modules: BlsMultiThreadWorkerPoolModules) {
//     const {logger, metrics} = modules;
//     this.logger = logger;
//     this.metrics = metrics;
//     this.blsVerifyAllMultiThread = options.blsVerifyAllMultiThread ?? false;
//     this.blsVerifyAllLibuv = options.blsVerifyAllLibuv ?? false;

//     // Use compressed for herumi for now.
//     // The worker is not able to deserialize from uncompressed
//     // `Error: err _wrapDeserialize`
//     this.workers = this.createWorkers(defaultPoolSize);

//     if (metrics) {
//       metrics.bls.workerThreadPool.queueLength.addCollect(() => {
//         metrics.bls.workerThreadPool.queueLength.set(this.jobs.length);
//         metrics.bls.workerThreadPool.workersBusy.set(this.workersBusy);
//       });
//     }
//   }

//   canAcceptWork(): boolean {
//     if (this.blsVerifyAllLibuv) return true;

//     return (
//       this.workersBusy < defaultPoolSize &&
//       // TODO: Should also bound the jobs queue?
//       this.jobs.length < MAX_JOBS_CAN_ACCEPT_WORK
//     );
//   }

//   async close(): Promise<void> {
//     if (this.bufferedJobs) {
//       clearTimeout(this.bufferedJobs.timeout);
//     }

//     // Abort all jobs
//     for (const job of this.jobs) {
//       job.reject(new QueueError({code: QueueErrorCode.QUEUE_ABORTED}));
//     }
//     this.jobs.clear();

//     // Terminate all workers. await to ensure no workers are left hanging
//     await Promise.all(
//       Array.from(this.workers.entries()).map(([id, worker]) =>
//         // NOTE: 'threads' has not yet updated types, and NodeJS complains with
//         // [DEP0132] DeprecationWarning: Passing a callback to worker.terminate() is deprecated. It returns a Promise instead.
//         (worker.worker.terminate() as unknown as Promise<void>).catch((e: Error) => {
//           this.logger.error("Error terminating worker", {id}, e);
//         })
//       )
//     );
//   }

//   /**
//    * Verify signature sets of the same message, only supports worker verification.
//    */
//   async verifySignatureSetsSameMessage(
//     sets: {publicKey: PublicKey; signature: Uint8Array}[],
//     message: Uint8Array,
//     opts: Omit<VerifySignatureOpts, "verifyOnMainThread"> = {}
//   ): Promise<boolean[]> {
//     // chunkify so that it reduce the risk of retrying when there is at least one invalid signature
//     const results = await Promise.all(
//       chunkifyMaximizeChunkSize(sets, MAX_SIGNATURE_SETS_PER_JOB).map(
//         (setsChunk) =>
//           new Promise<boolean[]>((resolve, reject) => {
//             this.queueBlsWork({
//               type: JobQueueItemType.sameMessage,
//               resolve,
//               reject,
//               addedTimeMs: Date.now(),
//               opts,
//               sets: setsChunk,
//               message,
//             });
//           })
//       )
//     );

//     return results.flat();
//   }

//   // canAcceptWork(): boolean {
//   //   return (
//   //     this.workersBusy < defaultPoolSize &&
//   //     // TODO: Should also bound the jobs queue?
//   //     this.jobs.length < MAX_JOBS_CAN_ACCEPT_WORK
//   //   );
//   // }

//   async verifySignatureSets(sets: ISignatureSet[], opts: VerifySignatureOpts = {}): Promise<boolean> {
//     // Pubkeys are aggregated in the main thread regardless if verified in workers or in main thread
//     this.metrics?.bls.aggregatedPubkeys.inc(getAggregatedPubkeysCount(sets));
//     this.metrics?.blsThreadPool.totalSigSets.inc(sets.length);
//     if (opts.priority) {
//       this.metrics?.blsThreadPool.prioritizedSigSets.inc(sets.length);
//     }
//     if (opts.batchable) {
//       this.metrics?.blsThreadPool.batchableSigSets.inc(sets.length);
//     }

//     if (opts.verifyOnMainThread && !this.blsVerifyAllMultiThread) {
//       const timer = this.metrics?.blsThreadPool.mainThreadDurationInThreadPool.startTimer();
//       try {
//         return verifySignatureSetsMaybeBatch(
//           sets.map((set) => ({
//             publicKey: getAggregatedPubkey(set),
//             message: set.signingRoot.valueOf(),
//             signature: set.signature,
//           }))
//         );
//       } finally {
//         if (timer) timer();
//       }
//     }

//     // Split large array of sets into smaller.
//     // Very helpful when syncing finalized, sync may submit +1000 sets so chunkify allows to distribute to many workers
//     const results = await Promise.all(
//       chunkifyMaximizeChunkSize(sets, MAX_SIGNATURE_SETS_PER_JOB).map(
//         (setsChunk) =>
//           new Promise<boolean>((resolve, reject) => {
//             return this.queueBlsWork({
//               type: JobQueueItemType.default,
//               resolve,
//               reject,
//               addedTimeMs: Date.now(),
//               opts,
//               sets: setsChunk,
//             });
//           })
//       )
//     );

//     // .every on an empty array returns true
//     if (results.length === 0) {
//       throw Error("Empty results array");
//     }

//     return results.every((isValid) => isValid === true);
//   }

//   async verifySignatureSets(sets: ISignatureSet[], opts: VerifySignatureOpts = {}): Promise<boolean> {
//     // Pubkeys are aggregated in the main thread regardless if verified in workers or in main thread
//     this.metrics?.bls.aggregatedPubkeys.inc(getAggregatedPubkeysCount(sets));

//     if (opts.verifyOnMainThread && !this.blsVerifyAllMultiThread) {
//       const timer = this.metrics?.bls.mainThread.durationOnThread.startTimer();
//       try {
//         return this.blsVerifyAllLibuv
//           ? await asyncVerifySignatureSetsMaybeBatch(
//               this.logger,
//               sets.map((set) => ({
//                 publicKey: getAggregatedPubkey(set),
//                 message: set.signingRoot.valueOf(),
//                 signature: set.signature,
//               }))
//             )
//           : verifySignatureSetsMaybeBatch(
//               sets.map((set) => ({
//                 publicKey: getAggregatedPubkey(set).serialize(false),
//                 message: set.signingRoot.valueOf(),
//                 signature: set.signature,
//               }))
//             );
//       } finally {
//         if (timer) timer();
//       }
//     }

//     let results: boolean[];
//     // Allow for option to use libuv pool for verify or worker pool
//     //
//     // Split large array of sets into smaller.
//     // Very helpful when syncing finalized, sync may submit +1000 sets so chunkify allows to distribute to many workers
//     const timer = this.metrics?.bls.libuvThreadPool.durationInThreadPool.startTimer();
//     if (opts.verifyWithLibuvPool || this.blsVerifyAllLibuv || !this.blsVerifyAllMultiThread) {
//       results = await Promise.all(
//         chunkifyMaximizeChunkSize(sets, MAX_SIGNATURE_SETS_PER_JOB).map((chunk) =>
//           this.queWorkLibuv({
//             opts,
//             sets: chunk.map((s) => ({
//               publicKey: getAggregatedPubkey(s),
//               message: s.signingRoot,
//               signature: s.signature,
//             })),
//           })
//         )
//       );
//     } else {
//       results = await Promise.all(
//         chunkifyMaximizeChunkSize(sets, MAX_SIGNATURE_SETS_PER_JOB).map((chunk) =>
//           this.queueWorkWorkerPool({
//             opts,
//             sets: chunk.map((s) => ({
//               publicKey: getAggregatedPubkey(s).serialize(true),
//               message: s.signingRoot,
//               signature: s.signature,
//             })),
//           })
//         )
//       );
//     }
//     if (timer) timer();

//     // .every on an empty array returns true
//     if (results.length === 0) {
//       throw Error("Empty results array");
//     }

//     return results.every((isValid) => isValid === true);
//   }

//   /**
//    * Creates a worker pool with the given implementation and size
//    */
//   private createWorkers(poolSize: number): WorkerDescriptor[] {
//     const workers: WorkerDescriptor[] = [];

//     if (!this.blsVerifyAllLibuv) {
//       for (let i = 0; i < poolSize; i++) {
//         const workerData: WorkerData = {workerId: i};
//         const worker = new Worker("./worker.js", {workerData} as ConstructorParameters<typeof Worker>[1]);

//         const workerDescriptor: WorkerDescriptor = {
//           worker,
//           status: {code: WorkerStatusCode.notInitialized},
//         };
//         workers.push(workerDescriptor);

//         // TODO: Consider initializing only when necessary
//         const initPromise = spawn<WorkerApi>(worker, {
//           // A Lodestar Node may do very expensive task at start blocking the event loop and causing
//           // the initialization to timeout. The number below is big enough to almost disable the timeout
//           timeout: 5 * 60 * 1000,
//         });

//         workerDescriptor.status = {code: WorkerStatusCode.initializing, initPromise};

//         initPromise
//           .then((workerApi) => {
//             workerDescriptor.status = {code: WorkerStatusCode.idle, workerApi};
//             // Potentially run jobs that were queued before initialization of the first worker
//             setTimeout(this.runJobWorkerPool, 0);
//           })
//           .catch((error: Error) => {
//             workerDescriptor.status = {code: WorkerStatusCode.initializationError, error};
//           });
//       }
//     }

//     return workers;
//   }

//   /**
//    * Register BLS work to be done eventually in a worker
//    */
//   private queueBlsWork(job: JobQueueItem): void {
//     if (this.closed) {
//       throw new QueueError({code: QueueErrorCode.QUEUE_ABORTED});
//     }

//     // TODO: Consider if limiting queue size is necessary here.
//     // It would be bad to reject signatures because the node is slow.
//     // However, if the worker communication broke jobs won't ever finish

//     if (
//       this.workers.length > 0 &&
//       this.workers[0].status.code === WorkerStatusCode.initializationError &&
//       this.workers.every((worker) => worker.status.code === WorkerStatusCode.initializationError)
//     ) {
//       return job.reject(this.workers[0].status.error);
//     }

//     // Append batchable sets to `bufferedJobs`, starting a timeout to push them into `jobs`.
//     // Do not call `runJob()`, it is called from `runBufferedJobs()`
//     if (job.opts.batchable) {
//       if (!this.bufferedJobs) {
//         this.bufferedJobs = {
//           jobs: new LinkedList(),
//           prioritizedJobs: new LinkedList(),
//           sigCount: 0,
//           firstPush: Date.now(),
//           timeout: setTimeout(this.runBufferedJobs, MAX_BUFFER_WAIT_MS),
//         };
//       }
//       const jobs = job.opts.priority ? this.bufferedJobs.prioritizedJobs : this.bufferedJobs.jobs;
//       jobs.push(job);
//       this.bufferedJobs.sigCount += jobItemSigSets(job);
//       if (this.bufferedJobs.sigCount > MAX_BUFFERED_SIGS) {
//         clearTimeout(this.bufferedJobs.timeout);
//         this.runBufferedJobs();
//       }
//     }
//     // Push job and schedule to call `runJob` in the next macro event loop cycle.
//     // This is useful to allow batching job submitted from a synchronous for loop,
//     // and to prevent large stacks since runJob may be called recursively.
//     else {
//       if (job.opts.priority) {
//         this.jobs.unshift(job);
//       } else {
//         this.jobs.push(job);
//       }
//       setTimeout(this.runJob, 0);
//     }
//   }

//   // private async queueWorkWorkerPool(workReq: SerializedBlsWorkReq): Promise<boolean> {
//   //   if (this.closed) {
//   //     throw new QueueError({code: QueueErrorCode.QUEUE_ABORTED});
//   //   }

//   //   // TODO: Consider if limiting queue size is necessary here.
//   //   // It would be bad to reject signatures because the node is slow.
//   //   // However, if the worker communication broke jobs won't ever finish

//   //   if (
//   //     this.workers.length > 0 &&
//   //     this.workers[0].status.code === WorkerStatusCode.initializationError &&
//   //     this.workers.every((worker) => worker.status.code === WorkerStatusCode.initializationError)
//   //   ) {
//   //     return job.reject(this.workers[0].status.error);
//   //   }

//   //   return new Promise<boolean>((resolve, reject) => {
//   //     const job = {resolve, reject, addedTimeMs: Date.now(), workReq};

//   //     // Append batchable sets to `bufferedJobs`, starting a timeout to push them into `jobs`.
//   //     // Do not call `runJob()`, it is called from `runBufferedJobs()`
//   //     if (workReq.opts.batchable) {
//   //       if (!this.bufferedWorkerJobs) {
//   //         this.bufferedWorkerJobs = {
//   //           jobs: [],
//   //           sigCount: 0,
//   //           firstPush: Date.now(),
//   //           timeout: setTimeout(this.runBufferedJobsWorkerPool, MAX_BUFFER_WAIT_MS),
//   //         };
//   //       }
//   //       this.bufferedWorkerJobs.jobs.push(job);
//   //       this.bufferedWorkerJobs.sigCount += job.workReq.sets.length;
//   //       if (this.bufferedWorkerJobs.sigCount > MAX_BUFFERED_SIGS) {
//   //         clearTimeout(this.bufferedWorkerJobs.timeout);
//   //         this.runBufferedJobsWorkerPool();
//   //       }
//   //     }
//   //     const jobs = job.opts.priority ? this.bufferedJobs.prioritizedJobs : this.bufferedJobs.jobs;
//   //     jobs.push(job);
//   //     this.bufferedJobs.sigCount += jobItemSigSets(job);
//   //     if (this.bufferedJobs.sigCount > MAX_BUFFERED_SIGS) {
//   //       clearTimeout(this.bufferedJobs.timeout);
//   //       this.runBufferedJobs();
//   //     }
//   //   }
//   //   // Push job and schedule to call `runJob` in the next macro event loop cycle.
//   //   // This is useful to allow batching job submitted from a synchronous for loop,
//   //   // and to prevent large stacks since runJob may be called recursively.
//   //   else {
//   //     this.workerJobs.push(job);
//   //     setTimeout(this.runJobWorkerPool, 0);
//   //     }
//   //     setTimeout(this.runJob, 0);
//   //   }
//   // }

//   /**
//    * Potentially submit jobs to an idle worker, only if there's a worker and jobs
//    *
//    * @note arrow function to preserve class binding in setTimeout
//    */
//   private runJobWorkerPool = async (): Promise<void> => {
//     if (this.closed) {
//       return;
//     }

//     // Find idle worker
//     const worker = this.workers.find((worker) => worker.status.code === WorkerStatusCode.idle);
//     if (!worker || worker.status.code !== WorkerStatusCode.idle) {
//       return;
//     }

//     // Prepare work package
//     const jobs = this.prepareWorkerPoolWork();
//     if (jobs.length === 0) {
//       return;
//     }

//     // TODO: After sending the work to the worker the main thread can drop the job arguments
//     // and free-up memory, only needs to keep the job's Promise handlers.
//     // Maybe it's not useful since all data referenced in jobs is likely referenced by others
//     worker.status.code = WorkerStatusCode.running;
//     this.workersBusy++;

//     try {
//       let startedSigSets = 0;
//       for (const job of jobs) {
//         this.metrics?.bls.workerThreadPool.jobWaitTime.observe((Date.now() - job.addedTimeMs) / 1000);
//         startedSigSets += job.workReq.sets.length;
//       }

//       this.metrics?.bls.workerThreadPool.totalJobsGroupsStarted.inc(1);
//       this.metrics?.bls.workerThreadPool.totalJobsStarted.inc(jobs.length);
//       this.metrics?.bls.workerThreadPool.totalSigSetsStarted.inc(startedSigSets);

//       // Send work package to the worker
//       // If the job, metrics or any code below throws: the job will reject never going stale.
//       // Only downside is the the job promise may be resolved twice, but that's not an issue

//       const jobStartNs = process.hrtime.bigint();
//       const workResult = await worker.status.workerApi.verifyManySignatureSets(jobs.map((job) => job.workReq));
//       // const workResult = await workerApi.verifyManySignatureSets(workReqs);
//       const jobEndNs = process.hrtime.bigint();
//       const {workerId, batchRetries, batchSigsSuccess, workStartNs, workEndNs, results} = workResult;

//       let successCount = 0;
//       let errorCount = 0;

//       // Un-wrap work package
//       for (let i = 0; i < jobsStarted.length; i++) {
//         const job = jobsStarted[i];
//         const jobResult = results[i];
//         const sigSetCount = jobItemSigSets(job);

//         // TODO: enable exhaustive switch case checks lint rule
//         switch (job.type) {
//           case JobQueueItemType.default:
//             if (!jobResult || jobResult.code !== WorkResultCode.success) {
//               job.reject(getJobResultError(jobResult, i));
//               errorCount += sigSetCount;
//             } else {
//               job.resolve(jobResult.result);
//               successCount += sigSetCount;
//             }
//             break;

//           // handle result of the verification of aggregated signature against aggregated pubkeys
//           case JobQueueItemType.sameMessage:
//             if (!jobResult || jobResult.code !== WorkResultCode.success) {
//               job.reject(getJobResultError(jobResult, i));
//               errorCount += 1;
//             } else {
//               if (jobResult.result) {
//                 // All are valid, most of the time it goes here
//                 job.resolve(job.sets.map(() => true));
//               } else {
//                 // Retry each individually
//                 this.retryJobItemSameMessage(job);
//               }
//               successCount += 1;
//             }
//             break;
//         }
//       }

//       const workerJobTimeSec = Number(workEndNs - workStartNs) / 1e9;
//       const latencyToWorkerSec = Number(workStartNs - jobStartNs) / 1e9;
//       const latencyFromWorkerSec = Number(jobEndNs - workEndNs) / 1e9;

//       this.metrics?.bls.workerThreadPool.timePerSigSet.observe(workerJobTimeSec / startedSigSets);
//       this.metrics?.bls.workerThreadPool.jobsWorkerTime.inc({workerId}, workerJobTimeSec);
//       this.metrics?.bls.workerThreadPool.latencyToWorker.observe(latencyToWorkerSec);
//       this.metrics?.bls.workerThreadPool.latencyFromWorker.observe(latencyFromWorkerSec);
//       this.metrics?.bls.workerThreadPool.successJobsSignatureSetsCount.inc(successCount);
//       this.metrics?.bls.workerThreadPool.errorJobsSignatureSetsCount.inc(errorCount);
//       this.metrics?.bls.workerThreadPool.batchRetries.inc(batchRetries);
//       this.metrics?.bls.workerThreadPool.batchSigsSuccess.inc(batchSigsSuccess);
//     } catch (e) {
//       // Worker communications should never reject
//       if (!this.closed) {
//         this.logger.error("BlsMultiThreadWorkerPool error", {}, e as Error);
//       }
//       // Reject all
//       for (const job of jobsInput) {
//         job.reject(e as Error);
//       }
//     }

//     worker.status.code = WorkerStatusCode.idle;
//     this.workersBusy--;

//     // Potentially run a new job
//     setTimeout(this.runJobWorkerPool, 0);
//   };

//   // private runJobWorkerPool = async (): Promise<void> => {
//   //   if (this.closed) {
//   //     return;
//   //   }

//   //   // Find idle worker
//   //   const worker = this.workers.find((worker) => worker.status.code === WorkerStatusCode.idle);
//   //   if (!worker || worker.status.code !== WorkerStatusCode.idle) {
//   //     return;
//   //   }

//   //   // Prepare work package
//   //   const jobs = this.prepareWorkerPoolWork();
//   //   if (jobs.length === 0) {
//   //     return;
//   //   }

//   //   // TODO: After sending the work to the worker the main thread can drop the job arguments
//   //   // and free-up memory, only needs to keep the job's Promise handlers.
//   //   // Maybe it's not useful since all data referenced in jobs is likely referenced by others
//   //   worker.status.code = WorkerStatusCode.running;
//   //   this.workersBusy++;

//   //   try {
//   //     let startedJobsDefault = 0;
//   //     let startedJobsSameMessage = 0;
//   //     let startedSetsDefault = 0;
//   //     let startedSetsSameMessage = 0;
//   //     const workReqs: BlsWorkReq[] = [];
//   //     const jobsStarted: JobQueueItem[] = [];

//   //     for (const job of jobsInput) {
//   //       this.metrics?.blsThreadPool.jobWaitTime.observe((Date.now() - job.addedTimeMs) / 1000);

//   //       let workReq: BlsWorkReq;
//   //       try {
//   //         // Note: This can throw, must be handled per-job.
//   //         // Pubkey and signature aggregation is defered here
//   //         workReq = jobItemWorkReq(job, this.format);
//   //       } catch (e) {
//   //         this.metrics?.blsThreadPool.errorAggregateSignatureSetsCount.inc({type: job.type});

//   //         switch (job.type) {
//   //           case JobQueueItemType.default:
//   //             job.reject(e as Error);
//   //             break;

//   //           case JobQueueItemType.sameMessage:
//   //             // there could be an invalid pubkey/signature, retry each individually
//   //             this.retryJobItemSameMessage(job);
//   //             break;
//   //         }

//   //         continue;
//   //       }
//   //       // Re-push all jobs with matching workReq for easier accounting of results
//   //       workReqs.push(workReq);
//   //       jobsStarted.push(job);

//   //       if (job.type === JobQueueItemType.sameMessage) {
//   //         startedJobsSameMessage += 1;
//   //         startedSetsSameMessage += job.sets.length;
//   //       } else {
//   //         startedJobsDefault += 1;
//   //         startedSetsDefault += job.sets.length;
//   //       }
//   //     }

//   //     const startedSigSets = startedSetsDefault + startedSetsSameMessage;
//   //     this.metrics?.blsThreadPool.totalJobsGroupsStarted.inc(1);
//   //     this.metrics?.blsThreadPool.totalJobsStarted.inc({type: JobQueueItemType.default}, startedJobsDefault);
//   //     this.metrics?.blsThreadPool.totalJobsStarted.inc({type: JobQueueItemType.sameMessage}, startedJobsSameMessage);
//   //     this.metrics?.blsThreadPool.totalSigSetsStarted.inc({type: JobQueueItemType.default}, startedSetsDefault);
//   //     this.metrics?.blsThreadPool.totalSigSetsStarted.inc({type: JobQueueItemType.sameMessage}, startedSetsSameMessage);
//   //     // Send work package to the worker
//   //     // If the job, metrics or any code below throws: the job will reject never going stale.
//   //     // Only downside is the the job promise may be resolved twice, but that's not an issue

//   //     const jobStartNs = process.hrtime.bigint();
//   //     const workResult = await worker.status.workerApi.verifyManySignatureSets(jobs.map((job) => job.workReq));
//   //     const jobEndNs = process.hrtime.bigint();
//   //     const {workerId, batchRetries, batchSigsSuccess, workStartNs, workEndNs, results} = workResult;

//   //     let successCount = 0;
//   //     let errorCount = 0;

//   //     // Un-wrap work package
//   //     for (let i = 0; i < jobsStarted.length; i++) {
//   //       const job = jobsStarted[i];
//   //       const jobResult = results[i];
//   //       const sigSetCount = jobItemSigSets(job);

//   //       // TODO: enable exhaustive switch case checks lint rule
//   //       switch (job.type) {
//   //         case JobQueueItemType.default:
//   //           if (!jobResult || jobResult.code !== WorkResultCode.success) {
//   //             job.reject(getJobResultError(jobResult, i));
//   //             errorCount += sigSetCount;
//   //           } else {
//   //             job.resolve(jobResult.result);
//   //             successCount += sigSetCount;
//   //           }
//   //           break;

//   //         // handle result of the verification of aggregated signature against aggregated pubkeys
//   //         case JobQueueItemType.sameMessage:
//   //           if (!jobResult || jobResult.code !== WorkResultCode.success) {
//   //             job.reject(getJobResultError(jobResult, i));
//   //             errorCount += 1;
//   //           } else {
//   //             if (jobResult.result) {
//   //               // All are valid, most of the time it goes here
//   //               job.resolve(job.sets.map(() => true));
//   //             } else {
//   //               // Retry each individually
//   //               this.retryJobItemSameMessage(job);
//   //             }
//   //             successCount += 1;
//   //           }
//   //           break;
//   //       }
//   //     }

//   //     const workerJobTimeSec = Number(workEndNs - workStartNs) / 1e9;
//   //     const latencyToWorkerSec = Number(workStartNs - jobStartNs) / 1e9;
//   //     const latencyFromWorkerSec = Number(jobEndNs - workEndNs) / 1e9;

//   //     this.metrics?.bls.workerThreadPool.timePerSigSet.observe(workerJobTimeSec / startedSigSets);
//   //     this.metrics?.bls.workerThreadPool.jobsWorkerTime.inc({workerId}, workerJobTimeSec);
//   //     this.metrics?.bls.workerThreadPool.latencyToWorker.observe(latencyToWorkerSec);
//   //     this.metrics?.bls.workerThreadPool.latencyFromWorker.observe(latencyFromWorkerSec);
//   //     this.metrics?.bls.workerThreadPool.successJobsSignatureSetsCount.inc(successCount);
//   //     this.metrics?.bls.workerThreadPool.errorJobsSignatureSetsCount.inc(errorCount);
//   //     this.metrics?.bls.workerThreadPool.batchRetries.inc(batchRetries);
//   //     this.metrics?.bls.workerThreadPool.batchSigsSuccess.inc(batchSigsSuccess);
//   //   } catch (e) {
//   //     // Worker communications should never reject
//   //     if (!this.closed) {
//   //       this.logger.error("BlsMultiThreadWorkerPool error", {}, e as Error);
//   //     }
//   //     // Reject all
//   //     for (const job of jobsInput) {
//   //       job.reject(e as Error);
//   //     }
//   //   }

//   //   worker.status.code = WorkerStatusCode.idle;
//   //   this.workersBusy--;

//   //   // Potentially run a new job
//   //   setTimeout(this.runJobWorkerPool, 0);
//   // };

//   /**
//    * Grab pending work up to a max number of signatures
//    *
//    * @note arrow function to preserve class binding in setTimeout
//    */
//   private prepareWork(): JobQueueItem[] {
//     const jobs: JobQueueItem[] = [];
//     let totalSigs = 0;

//     while (totalSigs < MAX_SIGNATURE_SETS_PER_JOB) {
//       const job = this.workerJobs.shift();
//       if (!job) {
//         break;
//       }

//       jobs.push(job);
//       totalSigs += jobItemSigSets(job);
//     }

//     return jobs;
//   }

//   /**
//    * Add all buffered jobs to the job queue and potentially run them immediately
//    *
//    * @note arrow function to preserve class binding in setTimeout
//    */
//   private runBufferedJobs = (): void => {
//     if (this.bufferedJobs) {
//       for (const job of this.bufferedJobs.jobs) {
//         this.jobs.push(job);
//       }
//       for (const job of this.bufferedJobs.prioritizedJobs) {
//         this.jobs.unshift(job);
//       }
//       this.bufferedJobs = null;
//       setTimeout(this.runJob, 0);
//     }
//   };

//   private retryJobItemSameMessage(job: JobQueueItemSameMessage): void {
//     // Create new jobs for each pubkey set, and Promise.all all the results
//     for (const j of jobItemSameMessageToMultiSet(job)) {
//       if (j.opts.priority) {
//         this.jobs.unshift(j);
//       } else {
//         this.jobs.push(j);
//       }
//     }
//     this.metrics?.blsThreadPool.sameMessageRetryJobs.inc(1);
//     this.metrics?.blsThreadPool.sameMessageRetrySets.inc(job.sets.length);
//   }

//   // /**
//   //  * Add all buffered jobs to the job queue and potentially run them immediately
//   //  *
//   //  * @note arrow function to preserve class binding in setTimeout
//   //  */
//   // private runBufferedJobsWorkerPool = (): void => {
//   //   if (this.bufferedWorkerJobs) {
//   //     this.workerJobs.push(...this.bufferedWorkerJobs.jobs);
//   //     this.bufferedWorkerJobs = null;
//   //     setTimeout(this.runJobWorkerPool, 0);
//   //   }
//   // };

//   /**
//    * Register BLS work to be done by the libuv worker pool
//    */
//   private queWorkLibuv(workReq: DeserializedBlsWorkReq): Promise<boolean> {
//     return new Promise<boolean>((resolve, reject) => {
//       const job = {resolve, reject, addedTimeMs: Date.now(), workReq};
//       // Append batchable sets to `bufferedLibuvJobs`, starting a timeout to push them into `jobs`.
//       // Do not call `runJobLibuv()`, it is called from `runBufferedJobsLibuv()`
//       if (workReq.opts.batchable) {
//         if (!this.bufferedLibuvJobs) {
//           this.bufferedLibuvJobs = {
//             jobs: [],
//             sigCount: 0,
//             firstPush: Date.now(),
//             timeout: setTimeout(this.runBufferedJobsLibuv, MAX_BUFFER_WAIT_MS),
//           };
//         }
//         this.bufferedLibuvJobs.jobs.push(job);
//         this.bufferedLibuvJobs.sigCount += job.workReq.sets.length;
//         if (this.bufferedLibuvJobs.sigCount > MAX_BUFFERED_SIGS) {
//           clearTimeout(this.bufferedLibuvJobs.timeout);
//           this.runBufferedJobsLibuv();
//         }
//       }

//       // Push job and schedule to call `runJobLibuv` in the next macro event loop cycle.
//       // This is useful to allow batching job submitted from a synchronous for loop,
//       // and to prevent large stacks since runJob may be called recursively.
//       else {
//         this.libuvJobs.push(job);
//         setTimeout(this.runJobLibuv, 0);
//       }
//     });
//   }

//   /**
//    * Potentially submit jobs to libuv, only if there's jobs
//    *
//    * @note arrow function to preserve class binding in setTimeout
//    */
//   private runJobLibuv = async (): Promise<void> => {
//     // Prepare work package
//     const jobs = this.prepareWorkLibuv();
//     if (jobs.length === 0) {
//       return;
//     }

//     try {
//       let startedSigSets = 0;
//       for (const job of jobs) {
//         this.metrics?.bls.libuvThreadPool.jobWaitTime.observe((Date.now() - job.addedTimeMs) / 1000);
//         startedSigSets += job.workReq.sets.length;
//       }

//       this.metrics?.bls.libuvThreadPool.totalJobsGroupsStarted.inc(1);
//       this.metrics?.bls.libuvThreadPool.totalJobsStarted.inc(jobs.length);
//       this.metrics?.bls.libuvThreadPool.totalSigSetsStarted.inc(startedSigSets);

//       // Send work package to libuv
//       // If any code below throws: the job will reject never going stale.
//       // Only downside is the the job promise may be resolved twice, but that's not an issue

//       const workResult = await asyncVerifyManySignatureSets(
//         this.logger,
//         jobs.map((job) => job.workReq as DeserializedBlsWorkReq)
//       );
//       const {batchRetries, batchSigsSuccess, workStartNs, workEndNs, results} = workResult;

//       let successCount = 0;
//       let errorCount = 0;

//       // Un-wrap work package
//       for (let i = 0; i < jobs.length; i++) {
//         const job = jobs[i];
//         const jobResult = results[i];
//         const sigSetCount = job.workReq.sets.length;
//         if (!jobResult) {
//           job.reject(Error(`No jobResult for index ${i}`));
//           errorCount += sigSetCount;
//         } else if (jobResult.code === WorkResultCode.success) {
//           job.resolve(jobResult.result);
//           successCount += sigSetCount;
//         } else {
//           const libuvError = Error(jobResult.error.message);
//           if (jobResult.error.stack) libuvError.stack = jobResult.error.stack;
//           job.reject(libuvError);
//           errorCount += sigSetCount;
//         }
//       }

//       const workerJobTimeSec = Number(workEndNs - workStartNs) / 1e9;
//       this.metrics?.bls.libuvThreadPool.timePerSigSet.observe(workerJobTimeSec / startedSigSets);
//       this.metrics?.bls.libuvThreadPool.jobsWorkTime.inc(workerJobTimeSec);
//       this.metrics?.bls.libuvThreadPool.successJobsSignatureSetsCount.inc(successCount);
//       this.metrics?.bls.libuvThreadPool.errorJobsSignatureSetsCount.inc(errorCount);
//       this.metrics?.bls.libuvThreadPool.batchRetries.inc(batchRetries);
//       this.metrics?.bls.libuvThreadPool.batchSigsSuccess.inc(batchSigsSuccess);
//     } catch (e) {
//       this.logger.error("BlsMultiThreadLibuv error", {}, e as Error);
//       // Reject all
//       for (const job of jobs) {
//         job.reject(e as Error);
//       }
//     }

//     // Potentially run a new job
//     setTimeout(this.runJobLibuv, 0);
//   };

//   /**
//    * Grab pending work up to a max number of signatures
//    *
//    * @note arrow function to preserve class binding in setTimeout
//    */
//   private prepareWorkLibuv = (): JobQueueItem<boolean>[] => {
//     const jobs: JobQueueItem<boolean>[] = [];
//     let totalSigs = 0;

//     while (totalSigs < MAX_SIGNATURE_SETS_PER_JOB) {
//       const job = this.libuvJobs.shift();
//       if (!job) {
//         break;
//       }

//       jobs.push(job);
//       totalSigs += job.workReq.sets.length;
//     }

//     return jobs;
//   };

//   private runBufferedJobsLibuv = (): void => {
//     if (this.bufferedLibuvJobs) {
//       this.libuvJobs.push(...this.bufferedLibuvJobs.jobs);
//       this.bufferedLibuvJobs = null;
//       setTimeout(this.runJobLibuv, 0);
//     }
//   };

//   /** For testing */
//   private async waitTillInitialized(): Promise<void> {
//     await Promise.all(
//       this.workers.map(async (worker) => {
//         if (worker.status.code === WorkerStatusCode.initializing) {
//           await worker.status.initPromise;
//         }
//       })
//     );
//   }
// }

// function getJobResultError(jobResult: WorkResultError | null, i: number): Error {
//   const workerError = jobResult ? Error(jobResult.error.message) : Error(`No jobResult for index ${i}`);
//   if (jobResult?.error?.stack) workerError.stack = jobResult.error.stack;
//   return workerError;
// }
