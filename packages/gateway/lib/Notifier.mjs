import nodemailer from 'nodemailer';

/**
 * @typedef {import('nodemailer/lib/smtp-transport').Options} SmtpOptions
 */

export default class Notifier {
  /**
   * @param {SmtpOptions & { from: string }} options
   */
  constructor({ smtp: options }) {
    this.transporter = nodemailer.createTransport(options);
    this.from = options.from;
    let [, domain] = options.from.match(/@(\w+)/) || [];
    this.domain = domain || 'timeld';
  }

  sendActivationCode(email, activationCode) {
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