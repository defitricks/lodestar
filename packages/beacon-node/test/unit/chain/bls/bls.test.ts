import {AggregationSet, PublicKey, SecretKey} from "@chainsafe/blst";
import {describe, it, expect, beforeEach} from "vitest";
import {ISignatureSet, SignatureSetType} from "@lodestar/state-transition";
import {signatureFromBytes} from "@lodestar/utils";
import {BlsSingleThreadVerifier} from "../../../../src/chain/bls/singleThread.js";
import {BlsMultiThreadWorkerPool} from "../../../../src/chain/bls/index.js";
import {testLogger} from "../../../utils/logger.js";

describe("BlsVerifier ", function () {
  // take time for creating thread pool
  const numKeys = 3;
  const secretKeys = Array.from({length: numKeys}, (_, i) => SecretKey.fromKeygen(Buffer.alloc(32, i)));
  const verifiers = [
    new BlsSingleThreadVerifier({metrics: null}),
    new BlsMultiThreadWorkerPool({}, {metrics: null, logger: testLogger()}),
  ];

  for (const verifier of verifiers) {
    describe(`${verifier.constructor.name} - verifySignatureSets`, () => {
      let sets: ISignatureSet[];

      beforeEach(() => {
        sets = secretKeys.map((secretKey, i) => {
          // different signing roots
          const signingRoot = Buffer.alloc(32, i);
          return {
            type: SignatureSetType.single,
            pubkey: secretKey.toPublicKey(),
            signingRoot,
            signature: secretKey.sign(signingRoot).serialize(),
          };
        });
      });

      it("should verify all signatures", async () => {
        expect(await verifier.verifySignatureSets(sets)).toBe(true);
      });

      it("should return false if at least one signature is invalid", async () => {
        // signature is valid but not respective to the signing root
        sets[1].signingRoot = Buffer.alloc(32, 10);
        expect(await verifier.verifySignatureSets(sets)).toBe(false);
      });

      it("should return false if at least one signature is malformed", async () => {
        // signature is malformed
        const malformedSignature = Buffer.alloc(96, 10);
        expect(() => {
          signatureFromBytes(malformedSignature);
        }).toThrow();
        sets[1].signature = malformedSignature;
        expect(await verifier.verifySignatureSets(sets)).toBe(false);
      });
    });

    describe(`${verifier.constructor.name} - verifySignatureSetsSameMessage`, () => {
      let sets: AggregationSet[] = [];
      // same signing root for all sets
      const signingRoot = Buffer.alloc(32, 100);

      beforeEach(() => {
        sets = secretKeys.map((secretKey) => {
          return {
            pk: secretKey.toPublicKey(),
            sig: secretKey.sign(signingRoot).serialize(),
          };
        });
      });

      it("should verify all signatures", async () => {
        expect(await verifier.verifySignatureSetsSameMessage(sets, signingRoot)).toEqual([true, true, true]);
      });

      it("should return false for invalid signature", async () => {
        // signature is valid but not respective to the signing root
        sets[1].sig = secretKeys[1].sign(Buffer.alloc(32)).serialize();
        expect(await verifier.verifySignatureSetsSameMessage(sets, signingRoot)).toEqual([true, false, true]);
      });

      it("should return false for malformed signature", async () => {
        // signature is malformed
        const malformedSignature = Buffer.alloc(96, 10);
        expect(() => {
          signatureFromBytes(malformedSignature);
        }).toThrow();
        sets[1].sig = malformedSignature;
        expect(await verifier.verifySignatureSetsSameMessage(sets, signingRoot)).toEqual([true, false, true]);
      });
    });
  }
});
