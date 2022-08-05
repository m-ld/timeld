import ablyModule from '@m-ld/m-ld/ext/ably';
import leveldown from 'leveldown';
import { clone as meldClone, propertyValue } from '@m-ld/m-ld';
import { AblyKey, UserKey } from '../index.mjs';
import { timeldVocab } from '../data/index.mjs';

/**
 * TODO: This is a duplication of m-ld-cli/ext/ably.js
 * @param {TimeldConfig} config
 */
async function ably(config) {
  // Load WRTC config from Xirsys if available
  if ('xirsys' in config) {
    const xirsys = await import('@m-ld/io-web-runtime/dist/server/xirsys');
    config.wrtc = await xirsys.loadWrtcConfig(config.xirsys);
  }
  if (config['wrtc'])
    return ablyModule.AblyWrtcRemotes;
  else
    return ablyModule.AblyRemotes;
}

/**
 * @param {TimeldConfig} config
 * @param {string} dataDir
 * @param {import('@m-ld/m-ld').AppPrincipal} [principal]
 * @returns {Promise<import('@m-ld/m-ld').MeldClone>}
 */
export default async function clone(
  config, dataDir, principal) {
  const ablyKey = new AblyKey(config.ably.key);
  const userKey = UserKey.fromConfig(config);
  // noinspection JSCheckFunctionSignatures
  return meldClone(
    leveldown(dataDir),
    await ably(config),
    config,
    {
      principal,
      transportSecurity: {
        wire: data => data, // We don't apply wire encryption, yet
        sign: data => ({
          sig: userKey.sign(data, ablyKey),
          pid: principal['@id']
        }),
        verify: verify(config['@domain'])
      }
      // TODO: Security constraint: only gateway can add/remove users
    });
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
    '@where': {
      '@id': attr.pid, [timeldVocab('key')]: keyRef
    }
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