import {itBench} from "@dapplion/benchmark";
import {config} from "@lodestar/config/default";
import {ForkSeq} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {processEffectiveBalanceUpdates} from "../../../src/epoch/processEffectiveBalanceUpdates.js";
import {CachedBeaconStateAllForks, EpochTransitionCache, beforeProcessEpoch} from "../../../src/index.js";
import {createCachedBeaconStateTest} from "../../utils/state.js";
import {StateEpoch} from "../types.js";
import {numValidators} from "../util.js";

// PERF: Cost 'proportional' to $VALIDATOR_COUNT, to iterate over all balances. Then cost is proportional to the amount
// of validators whose effectiveBalance changed. Worst case is a massive network leak or a big slashing event which
// causes a large amount of the network to decrease their balance simultaneously.

// Worst case:
// statuses: All balances are low enough to trigger an effective balance change

describe("phase0 processEffectiveBalanceUpdates", () => {
  const vc = numValidators;
  const testCases: {id: string; changeRatio: number}[] = [
    // Normal (optimal) mainnet network conditions: No effectiveBalance is udpated
    {id: "normalcase", changeRatio: 0},
    // Worst case: All effective balance are updated
    // NOTE: The maximum bad case will practically never happen and it's too slow.
    // Use a 50% worst case since it's not that slow.
    {id: "worstcase 0.5", changeRatio: 0.5},
  ];

  // Provide flat `cache.balances` + flat `cache.validators`
  // which will it update validators tree

  for (const {id, changeRatio} of testCases) {
    itBench<StateEpoch, StateEpoch>({
      id: `phase0 processEffectiveBalanceUpdates - ${vc} ${id}`,
      yieldEventLoopAfterEach: true, // So SubTree(s)'s WeakRef can be garbage collected https://github.com/nodejs/node/issues/39902
      minRuns: 5, // Worst case is very slow
      before: () => getEffectiveBalanceTestData(vc, changeRatio),
      beforeEach: ({state, cache}) => ({state: state.clone(), cache}),
      fn: ({state, cache}) => {
        processEffectiveBalanceUpdates(ForkSeq.phase0, state, cache);
      },
    });
  }
});

/**
 * Create a state that causes `changeRatio` fraction (0,1) of validators to change their effective balance.
 */
function getEffectiveBalanceTestData(
  vc: number,
  changeRatio: number
): {
  state: CachedBeaconStateAllForks;
  cache: EpochTransitionCache;
} {
  const stateTree = ssz.phase0.BeaconState.defaultViewDU();
  stateTree.slot = 1;

  const activeValidator = ssz.phase0.Validator.toViewDU({
    ...ssz.phase0.Validator.defaultValue(),
    exitEpoch: Infinity,
    withdrawableEpoch: Infinity,
    // Set current effective balance to max
    effectiveBalance: 32e9,
  });

  const balances: number[] = [];
  for (let i = 0; i < vc; i++) {
    // Set flat balance to lower value
    const balance = i < vc * changeRatio ? 30e9 : 32e9;
    stateTree.balances.push(balance);
    balances.push(balance);

    // Initialize tree
    stateTree.validators.push(activeValidator);
  }

  stateTree.commit();

  const cachedBeaconState = createCachedBeaconStateTest(stateTree, config, {skipSyncPubkeys: true});
  const cache = beforeProcessEpoch(cachedBeaconState);
  cache.balances = balances;

  return {
    state: cachedBeaconState,
    cache: cache,
  };
}
