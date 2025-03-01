import {PubkeyIndexMap} from "@chainsafe/pubkey-index-map";
import {CompositeTypeAny, TreeView, Type} from "@chainsafe/ssz";
import {BeaconConfig} from "@lodestar/config";
import {CheckpointWithHex, IForkChoice, ProtoBlock} from "@lodestar/fork-choice";
import {
  BeaconStateAllForks,
  CachedBeaconStateAllForks,
  EpochShuffling,
  Index2PubkeyCache,
} from "@lodestar/state-transition";
import {
  BeaconBlock,
  BlindedBeaconBlock,
  Epoch,
  ExecutionPayload,
  Root,
  RootHex,
  SignedBeaconBlock,
  Slot,
  UintNum64,
  ValidatorIndex,
  Wei,
  altair,
  capella,
  deneb,
  phase0,
} from "@lodestar/types";
import {Logger} from "@lodestar/utils";
import {IEth1ForBlockProduction} from "../eth1/index.js";
import {IExecutionBuilder, IExecutionEngine} from "../execution/index.js";
import {Metrics} from "../metrics/metrics.js";
import {BufferPool} from "../util/bufferPool.js";
import {IClock} from "../util/clock.js";
import {CheckpointBalancesCache} from "./balancesCache.js";
import {BeaconProposerCache, ProposerPreparationData} from "./beaconProposerCache.js";
import {BlockInput, ImportBlockOpts} from "./blocks/types.js";
import {IBlsVerifier} from "./bls/index.js";
import {ChainEventEmitter} from "./emitter.js";
import {ForkchoiceCaller} from "./forkChoice/index.js";
import {LightClientServer} from "./lightClient/index.js";
import {AggregatedAttestationPool} from "./opPools/aggregatedAttestationPool.js";
import {AttestationPool, OpPool, SyncCommitteeMessagePool, SyncContributionAndProofPool} from "./opPools/index.js";
import {IChainOptions} from "./options.js";
import {AssembledBlockType, BlockAttributes, BlockType} from "./produceBlock/produceBlockBody.js";
import {IStateRegenerator, RegenCaller} from "./regen/index.js";
import {ReprocessController} from "./reprocess.js";
import {AttestationsRewards} from "./rewards/attestationsRewards.js";
import {BlockRewards} from "./rewards/blockRewards.js";
import {SyncCommitteeRewards} from "./rewards/syncCommitteeRewards.js";
import {
  SeenAggregators,
  SeenAttesters,
  SeenBlockProposers,
  SeenContributionAndProof,
  SeenSyncCommitteeMessages,
} from "./seenCache/index.js";
import {SeenGossipBlockInput} from "./seenCache/index.js";
import {SeenAggregatedAttestations} from "./seenCache/seenAggregateAndProof.js";
import {SeenAttestationDatas} from "./seenCache/seenAttestationData.js";
import {SeenBlockAttesters} from "./seenCache/seenBlockAttesters.js";
import {ShufflingCache} from "./shufflingCache.js";

export {BlockType, type AssembledBlockType};
export {type ProposerPreparationData};
export type BlockHash = RootHex;

export type StateGetOpts = {
  allowRegen: boolean;
};

export enum FindHeadFnName {
  recomputeForkChoiceHead = "recomputeForkChoiceHead",
  predictProposerHead = "predictProposerHead",
  getProposerHead = "getProposerHead",
}

/**
 * The IBeaconChain service deals with processing incoming blocks, advancing a state transition
 * and applying the fork choice rule to update the chain head
 */
export interface IBeaconChain {
  readonly genesisTime: UintNum64;
  readonly genesisValidatorsRoot: Root;
  readonly eth1: IEth1ForBlockProduction;
  readonly executionEngine: IExecutionEngine;
  readonly executionBuilder?: IExecutionBuilder;
  // Expose config for convenience in modularized functions
  readonly config: BeaconConfig;
  readonly logger: Logger;
  readonly metrics: Metrics | null;
  readonly bufferPool: BufferPool | null;

  /** The initial slot that the chain is started with */
  readonly anchorStateLatestBlockSlot: Slot;

  readonly bls: IBlsVerifier;
  readonly forkChoice: IForkChoice;
  readonly clock: IClock;
  readonly emitter: ChainEventEmitter;
  readonly regen: IStateRegenerator;
  readonly lightClientServer?: LightClientServer;
  readonly reprocessController: ReprocessController;
  readonly pubkey2index: PubkeyIndexMap;
  readonly index2pubkey: Index2PubkeyCache;

  // Ops pool
  readonly attestationPool: AttestationPool;
  readonly aggregatedAttestationPool: AggregatedAttestationPool;
  readonly syncCommitteeMessagePool: SyncCommitteeMessagePool;
  readonly syncContributionAndProofPool: SyncContributionAndProofPool;
  readonly opPool: OpPool;

  // Gossip seen cache
  readonly seenAttesters: SeenAttesters;
  readonly seenAggregators: SeenAggregators;
  readonly seenAggregatedAttestations: SeenAggregatedAttestations;
  readonly seenBlockProposers: SeenBlockProposers;
  readonly seenSyncCommitteeMessages: SeenSyncCommitteeMessages;
  readonly seenContributionAndProof: SeenContributionAndProof;
  readonly seenAttestationDatas: SeenAttestationDatas;
  readonly seenGossipBlockInput: SeenGossipBlockInput;
  // Seen cache for liveness checks
  readonly seenBlockAttesters: SeenBlockAttesters;

  readonly beaconProposerCache: BeaconProposerCache;
  readonly checkpointBalancesCache: CheckpointBalancesCache;
  readonly producedContentsCache: Map<BlockHash, deneb.Contents>;
  readonly producedBlockRoot: Map<RootHex, ExecutionPayload | null>;
  readonly shufflingCache: ShufflingCache;
  readonly producedBlindedBlockRoot: Set<RootHex>;
  readonly opts: IChainOptions;

  /** Stop beacon chain processing */
  close(): Promise<void>;
  /** Chain has seen the specified block root or not. The block may not be processed yet, use forkchoice.hasBlock to check it  */
  seenBlock(blockRoot: RootHex): boolean;
  /** Populate in-memory caches with persisted data. Call at least once on startup */
  loadFromDisk(): Promise<void>;
  /** Persist in-memory data to the DB. Call at least once before stopping the process */
  persistToDisk(): Promise<void>;

  validatorSeenAtEpoch(index: ValidatorIndex, epoch: Epoch): boolean;

  getHeadState(): CachedBeaconStateAllForks;
  getHeadStateAtCurrentEpoch(regenCaller: RegenCaller): Promise<CachedBeaconStateAllForks>;
  getHeadStateAtEpoch(epoch: Epoch, regenCaller: RegenCaller): Promise<CachedBeaconStateAllForks>;

  getHistoricalStateBySlot(
    slot: Slot
  ): Promise<{state: Uint8Array; executionOptimistic: boolean; finalized: boolean} | null>;

  /** Returns a local state canonical at `slot` */
  getStateBySlot(
    slot: Slot,
    opts?: StateGetOpts
  ): Promise<{state: BeaconStateAllForks; executionOptimistic: boolean; finalized: boolean} | null>;
  /** Returns a local state by state root */
  getStateByStateRoot(
    stateRoot: RootHex,
    opts?: StateGetOpts
  ): Promise<{state: BeaconStateAllForks; executionOptimistic: boolean; finalized: boolean} | null>;
  /** Returns a cached state by checkpoint */
  getStateByCheckpoint(
    checkpoint: CheckpointWithHex
  ): {state: BeaconStateAllForks; executionOptimistic: boolean; finalized: boolean} | null;
  /** Return state bytes by checkpoint */
  getStateOrBytesByCheckpoint(
    checkpoint: CheckpointWithHex
  ): Promise<{state: CachedBeaconStateAllForks | Uint8Array; executionOptimistic: boolean; finalized: boolean} | null>;

  /**
   * Since we can have multiple parallel chains,
   * this methods returns blocks in current chain head according to
   * forkchoice. Works for finalized slots as well
   */
  getCanonicalBlockAtSlot(
    slot: Slot
  ): Promise<{block: SignedBeaconBlock; executionOptimistic: boolean; finalized: boolean} | null>;
  /**
   * Get local block by root, does not fetch from the network
   */
  getBlockByRoot(
    root: RootHex
  ): Promise<{block: SignedBeaconBlock; executionOptimistic: boolean; finalized: boolean} | null>;

  getContents(beaconBlock: deneb.BeaconBlock): deneb.Contents;

  produceCommonBlockBody(blockAttributes: BlockAttributes): Promise<CommonBlockBody>;
  produceBlock(blockAttributes: BlockAttributes & {commonBlockBody?: CommonBlockBody}): Promise<{
    block: BeaconBlock;
    executionPayloadValue: Wei;
    consensusBlockValue: Wei;
    shouldOverrideBuilder?: boolean;
  }>;
  produceBlindedBlock(blockAttributes: BlockAttributes & {commonBlockBody?: CommonBlockBody}): Promise<{
    block: BlindedBeaconBlock;
    executionPayloadValue: Wei;
    consensusBlockValue: Wei;
  }>;

  /** Process a block until complete */
  processBlock(block: BlockInput, opts?: ImportBlockOpts): Promise<void>;
  /** Process a chain of blocks until complete */
  processChainSegment(blocks: BlockInput[], opts?: ImportBlockOpts): Promise<void>;

  getStatus(): phase0.Status;

  recomputeForkChoiceHead(caller: ForkchoiceCaller): ProtoBlock;

  /** When proposerBoostReorg is enabled, this is called at slot n-1 to predict the head block to build on if we are proposing at slot n */
  predictProposerHead(slot: Slot): ProtoBlock;

  /** When proposerBoostReorg is enabled and we are proposing a block, this is called to determine which head block to build on */
  getProposerHead(slot: Slot): ProtoBlock;

  waitForBlock(slot: Slot, root: RootHex): Promise<boolean>;

  updateBeaconProposerData(epoch: Epoch, proposers: ProposerPreparationData[]): Promise<void>;

  persistBlock(data: BeaconBlock | BlindedBeaconBlock, suffix?: string): void;
  persistInvalidSszValue<T>(type: Type<T>, sszObject: T | Uint8Array, suffix?: string): void;
  persistInvalidSszBytes(type: string, sszBytes: Uint8Array, suffix?: string): void;
  /** Persist bad items to persistInvalidSszObjectsDir dir, for example invalid state, attestations etc. */
  persistInvalidSszView(view: TreeView<CompositeTypeAny>, suffix?: string): void;
  regenStateForAttestationVerification(
    attEpoch: Epoch,
    shufflingDependentRoot: RootHex,
    attHeadBlock: ProtoBlock,
    regenCaller: RegenCaller
  ): Promise<EpochShuffling>;
  updateBuilderStatus(clockSlot: Slot): void;

  regenCanAcceptWork(): boolean;
  blsThreadPoolCanAcceptWork(): boolean;

  getBlockRewards(blockRef: BeaconBlock | BlindedBeaconBlock): Promise<BlockRewards>;
  getAttestationsRewards(
    epoch: Epoch,
    validatorIds?: (ValidatorIndex | string)[]
  ): Promise<{rewards: AttestationsRewards; executionOptimistic: boolean; finalized: boolean}>;
  getSyncCommitteeRewards(
    blockRef: BeaconBlock | BlindedBeaconBlock,
    validatorIds?: (ValidatorIndex | string)[]
  ): Promise<SyncCommitteeRewards>;
}

export type SSZObjectType =
  | "state"
  | "signedBlock"
  | "block"
  | "attestation"
  | "signedAggregatedAndProof"
  | "syncCommittee"
  | "contributionAndProof";

export type CommonBlockBody = phase0.BeaconBlockBody &
  Pick<capella.BeaconBlockBody, "blsToExecutionChanges"> &
  Pick<altair.BeaconBlockBody, "syncAggregate">;
