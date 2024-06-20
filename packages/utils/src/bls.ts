import {Signature} from "@chainsafe/blst";

/**
 * De-serialize bytes into Signature.
 * No need to verify Signature is valid, already run sig-verify = false
 */
export function signatureFromBytesNoCheck(signature: Uint8Array): Signature {
  return Signature.deserialize(signature);
}

/**
 * De-serialize bytes into Signature.
 * No need to verify Signature is valid, already run sig-verify = false
 */
export function signatureFromBytes(signature: Uint8Array): Signature {
  const sig = Signature.deserialize(signature);
  sig.sigValidate();
  return sig;
}
