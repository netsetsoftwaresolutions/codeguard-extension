import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

/** The one `node:crypto` API the shared rule engine uses (finding fingerprints), on @noble/hashes. */
export function createHash(_algorithm: 'sha256') {
  const h = sha256.create();
  return {
    update(data: string | Uint8Array) {
      h.update(typeof data === 'string' ? utf8ToBytes(data) : data);
      return this;
    },
    digest(_encoding: 'hex') {
      return bytesToHex(h.digest());
    },
  };
}
