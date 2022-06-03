import { CourierClient } from '@trycourier/courier';

export default class Notifier {
  /**
   * @param {object} options
   */
  constructor(options) {
    this.courier = CourierClient(options);
  }

  sendActivationCode(email, activationCode) {
    return this.courier.send({
      message: {
        to: { email },
        template: '94M2TGH2T1MZRMHY98QSR925GGDF',
        data: { activationCode }
      }
    });
  }
}