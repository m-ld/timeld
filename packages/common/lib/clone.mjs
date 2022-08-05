import ablyModule from '@m-ld/m-ld/ext/ably';
import leveldown from 'leveldown';
import { clone as meldClone } from '@m-ld/m-ld';
import { AblyKey, UserKey } from '..';

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
        sign: data => userKey.sign(data, ablyKey),
        verify
      }
      // TODO: Security constraint: only gateway can add/remove users
    });
}

/**@type import('@m-ld/m-ld').MeldTransportSecurity['verify']*/
const verify = async (data, attr, state) => {
  // Load the declared user info from the data
  const [keyid] = UserKey.splitSignature(attr.sig);
  const keyRef = UserKey.refFromKeyid(keyid);
  if (!await state.ask({ '@where': { '@id': attr.pid, key: keyRef } }))
    throw new Error('Author not found');
  // noinspection JSCheckFunctionSignatures
  if (!UserKey.fromJSON(await state.get(keyRef['@id'])).verify(attr.sig, data))
    throw new Error('Signature not valid');
}