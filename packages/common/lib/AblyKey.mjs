export default class AblyKey {
  constructor(keyStr) {
    const [keyName, secret] = keyStr.split(':');
    const [appId, keyid] = keyName.split('.');
    this.appId = appId;
    this.keyid = keyid;
    this.secret = secret;
    if (this.toString() !== keyStr)
      throw new RangeError(`${keyStr} is not a valid Ably key`);
  }

  get keyName() {
    return `${this.appId}.${this.keyid}`;
  }

  toString() {
    return `${this.keyName}:${this.secret}`;
  }
}