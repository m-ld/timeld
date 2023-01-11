import { AuthKey, UserKey } from '../index.mjs';
import { timeldVocab } from '../data/index.mjs';
import { propertyValue } from '@m-ld/m-ld';

/**
 * @param {UserKeyConfig} config
 * @param {AppPrincipal} principal
 * @returns {InitialApp}
 */
export default function TimeldApp(config, principal) {
  const authKey = AuthKey.fromString(config.auth.key);
  const userKey = UserKey.fromConfig(config);
  return {
    principal,
    transportSecurity: {
      wire: data => data, // We don't apply wire encryption, yet
      sign: data => ({
        sig: userKey.sign(data, authKey),
        pid: principal['@id']
      }),
      verify: verify(config['@domain'])
    }
    // TODO: Security constraint: only gateway can add/remove users
  };
}

/**
 * @param {string} domain name
 * @returns import('@m-ld/m-ld').MeldTransportSecurity['verify']
 */
export const verify = domain => async (data, attr, state) => {
  // Load the declared user info from the data
  const [keyid] = UserKey.splitSignature(attr.sig);
  // Gotcha: verify is called without a context; all IRIs must be absolute
  const keyRef = UserKey.refFromKeyid(keyid, domain);
  const exists = await state.ask({
    '@where': { '@id': attr.pid, [timeldVocab('key')]: keyRef }
  });
  if (!exists)
    throw new Error(`Principal ${attr.pid} not found`);
  const keySrc = await state.get(keyRef['@id']);
  // noinspection JSCheckFunctionSignatures
  const userKey = new UserKey({
    keyid: UserKey.keyidFromRef(keySrc),
    publicKey: propertyValue(keySrc, timeldVocab('public'), Uint8Array)
  });
  if (!userKey.verify(attr.sig, data))
    throw new Error('Signature not valid');
};