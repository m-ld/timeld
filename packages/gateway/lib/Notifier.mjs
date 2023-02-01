import nodemailer from 'nodemailer';
import LOG from 'loglevel';

/**
 * @typedef {import('nodemailer/lib/smtp-transport').Options} SmtpOptions
 */

export default class Notifier {
  /**
   * @param {SmtpOptions & { from: string }} options
   * @param {string} name gateway domain, used as a default self hostname
   * @see https://community.nodebb.org/post/81300
   */
  constructor({ smtp: options, '@domain': name }) {
    if (options === 'disable') {
      LOG.warn('Mailing of activation codes is disabled. ' +
        'Codes will appear in server log.')
    } else {
      // noinspection JSCheckFunctionSignatures
      this.transporter = nodemailer.createTransport({ name, ...options });
      this.from = options.from;
      this.domain = name;
    }
  }

  sendActivationCode(email, activationCode) {
    if (this.transporter == null) {
      LOG.info('ACTIVATION', email, activationCode);
    } else {
      return this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: `Hi from ${this.domain}`, // Subject line
        text: `Your activation code is ${activationCode}\n\n` +
          'This code is usable for the next 10 minutes.\n' +
          'Cheers,\n' +
          `the ${this.domain} team`
      });
    }
  }
}