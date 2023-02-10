import { timeldVocab, UserKey } from '../data/index.mjs';
import {
  asSubjectUpdates, MeldError, Optional, propertyValue, Reference, updateSubject
} from '@m-ld/m-ld';

/**
 * @implements {InitialApp}
 */
export default class TimeldApp {
  /**
   * @param {string} domain
   * @param {TimeldPrincipal} principal
   */
  constructor(domain, principal) {
    this.principal = principal;
    // noinspection JSUnusedGlobalSymbols
    this.transportSecurity = {
      wire: data => data, // We don't apply wire encryption, yet
      sign: this.sign,
      verify: TimeldApp.verify(domain)
    };
    // TODO: Security constraint: only gateway can add/remove users
  }

  /**
   * @param {Buffer} data
   * @returns {{sig: Buffer, pid: string}}
   */
  sign = data => ({
    sig: this.principal.sign(data),
    pid: this.principal['@id']
  });

  /**
   * @param {string} domain name
   * @returns import('@m-ld/m-ld').MeldTransportSecurity['verify']
   */
  static verify(domain) {
    return async (data, attr, state) => {
      // Load the declared user info from the data
      const [keyid] = UserKey.splitSignature(attr.sig);
      // Gotcha: verify is called without a context; all IRIs must be absolute
      const keyRef = UserKey.refFromKeyid(keyid, domain);
      const exists = await state.ask({
        '@where': { '@id': attr.pid, [timeldVocab.keyProp]: keyRef }
      });
      if (!exists)
        throw new Error(`Principal ${attr.pid} not found`);
      const keySrc = await state.get(keyRef['@id']);
      // noinspection JSCheckFunctionSignatures
      const userKey = new UserKey({
        keyid: UserKey.keyidFromRef(keySrc),
        publicKey: propertyValue(keySrc, timeldVocab.publicProp, Uint8Array)
      });
      if (!userKey.verify(attr.sig, data))
        throw new Error('Signature not valid');
    };
  }

  /**
   * @param {MeldReadState} state
   * @param {InterimUpdate} interim
   */
  checkEditOwnEntries = async (state, interim) => {
    const update = await interim.update;
    const subjectUpdates = asSubjectUpdates(update);
    return Promise.all(Object.keys(subjectUpdates).map(async id => {
      // Load the existing type and provider
      const before =
        await state.get(id, '@type', timeldVocab.providerProp) ?? { '@id': id };
      const after = updateSubject({ ...before }, subjectUpdates);
      if (before['@type'] === timeldVocab.entryType ||
        after['@type'] === timeldVocab.entryType) {
        this.checkProvider(before, update['@principal']);
        this.checkProvider(after, update['@principal']);
      }
    }));
  };

  checkProvider(entry, principal) {
    const provider = propertyValue(entry, timeldVocab.providerProp, Optional, Reference);
    if (provider && provider['@id'] !== principal['@id'])
      throw new MeldError('Unauthorised',
        `${principal['@id']} cannot edit entry from ${provider['@id']}`);
  }

  // noinspection JSUnusedGlobalSymbols
  /** @type {[MeldConstraint]} */
  constraints = [{
    check: this.checkEditOwnEntries,
    apply: this.checkEditOwnEntries
  }];
}