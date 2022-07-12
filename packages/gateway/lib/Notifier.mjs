import { CourierClient } from '@trycourier/courier';

/**
 * @typedef {import('@trycourier/courier').ICourierClientOptions} CourierOptions
 */

export default class Notifier {
  /**
   * @param {CourierOptions & { activationTemplate: string }} options
   */
  constructor(options) {
    this.courier = CourierClient(options);
    this.activationTemplate = options.activationTemplate;
  }

  sendActivationCode(email, activationCode) {
    return this.courier.send({
      message: {
        template: this.activationTemplate,
        to: { email },
        data: { activationCode }
      }
    });
  }
}