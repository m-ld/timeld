/**
 * Note this file is named to prevent being run directly by Jest
 */

import CliCmd from './CliCmd.mjs';
import GwCmd from './GwCmd.mjs';
import Cmd from './Cmd.mjs';
import { faker } from '@faker-js/faker/locale/en';
import { EventEmitter, once } from 'events';
import { setTimeout } from 'timers/promises';

/**
 * ## Dramatis Personae
 *
 * Alice and Bob are users, admins of the 'testers' organisation in a Gateway,
 * and so, providers for its timesheet entries. They collaborate on a single
 * shared timesheet, 'testing'. Alice has two devices (two CLI instances).
 *
 * During the test, the Alice and Bob will randomly:
 * - Open and exit timesheet sessions
 * - Create and modify timesheet entries in their timesheet sessions
 * - Add and remove each other from the 'testers' organisation
 *
 * Each of these activities will be conducted 'asynchronously' across the two
 * users, such that Alice may be doing something at the same time as Bob. The
 * orchestration uses an explicit randomisation seed, and the single JS event
 * loop, so that test runs are at least approximately repeatable – though
 * variable network latency may incur some discrepancies between runs.
 *
 * The latter activity incurs the possibility of timesheet entry changes
 * concurrent with a loss of privilege, leading to voiding of the change. We
 * track such voiding by holding an expected state of each user's entry set.
 *
 * Periodically during the test, we confirm that the timesheet has the same
 * content on all user 'devices'.
 */
const /**@type TestUser[]*/USERS = [];
const ROUNDS = {
  sessionsPerRound: 5,
  adminProbability: 0.2,
  entriesPerSession: 3
};
const clock = new EventEmitter;

class TestUser {
  /**
   * @param {string} name
   * @param {boolean} [isAdmin]
   */
  constructor(name, isAdmin = false) {
    this.name = name;
    this.devices = /**@type TestDevice[]*/[];
    this.isProvider = isAdmin;
    this.isPlaying = false;
    USERS.push(this);
  }

  /**
   * @param {string} deviceName
   * @param {GwCmd} gw
   * @returns {Promise<TestDevice>}
   */
  async addDevice(deviceName, gw) {
    const device = new TestDevice(this.name, deviceName);
    this.devices.push(device);
    await device.configure();
    await device.activate(gw);
    return device;
  }

  async round() {
    this.isPlaying = true;
    for (let i = 0; i < ROUNDS.sessionsPerRound; i++) {
      const device = this.chooseDevice();
      try {
        await maybeOr(ROUNDS.adminProbability, async () => {
          await device.toggleAdmin(this.chooseOtherUser());
        }, async () => {
          await device.timesheetSession(async session => {
            for (let i = 0; i < ROUNDS.entriesPerSession; i++) {
              await session.addEntry();
            }
          });
        });
        clock.emit('tick');
      } catch (e) {
        device.log(`${e}`);
        await device.exit(); // Tidy the running process
        if (USERS.some(u => u !== this && u.isPlaying))
          await once(clock, 'tick');
      }
    }
    this.isPlaying = false;
  }

  /** @param {Object} entries */
  async report(entries) {
    if (!this.isProvider)
      await this.chooseOtherUser().chooseDevice().toggleAdmin(this);
    for (let device of this.devices)
      await device.timesheetSession(async session => {
        await setTimeout(1000);
        return entries[device.name] = await session.getEntries();
      });
  }

  chooseDevice() {
    return faker.helpers.arrayElement(this.devices);
  }

  chooseOtherUser() {
    const notThis = USERS.filter(u => u !== this);
    return faker.helpers.arrayElement(notThis);
  }

  cleanup() {
    return Promise.all(this.devices.map(d => d.cleanup()));
  }
}

class TestDevice extends CliCmd {
  /** @param {TestUser} user */
  async toggleAdmin(user) {
    await this.run('admin', '--account', 'testers');
    const verb = user.isProvider ? 'remove' : 'add';
    await this.nextPrompt(`${verb} admin ${user.name}`);
    await this.nextPrompt();
    user.isProvider = verb === 'add';
    await this.exit();
  }

  /** @param {(session: {addEntry, getEntries}) => any} proc */
  async timesheetSession(proc) {
    await this.run('open', 'testers/testing');
    await this.nextPrompt();
    await proc({
      addEntry: async () => {
        const activity = `${faker.word.verb()} ${faker.word.noun()}`;
        await this.nextPrompt(`add "${activity}"`);
        await this.findByText(`"${activity}"`);
        return activity;
      },
      getEntries: async () => {
        await this.nextPrompt('list');
        await this.nextPrompt();
        return new Set((this.getOut().match(/#\d+:\sEntry\s.*/g) ?? [])
          .map(e => e.replace(/^#\d+:\sEntry\s/, ''))
        );
      }
    });
    await this.exit();
  }
}

////////////////////////////////////////////////////////////////////////////////
console.log('--- Setup ---');
Cmd.logging = true;
faker.seed(0); // Change to generate new test
const gw = new GwCmd();
await gw.start().catch(async e => {
  await gw.cleanup();
  throw e;
});
const alice = new TestUser('alice', true);
const bob = new TestUser('bob');
try {
  const aliceLaptop = await alice.addDevice('laptop', gw);
  await alice.addDevice('desktop', gw);
  await bob.addDevice('laptop', gw);
  // Register the testers organisation and add Bob
  await aliceLaptop.run('admin');
  await aliceLaptop.nextPrompt('add org testers');
  await aliceLaptop.exit(); // Alice is implicitly an admin
  await aliceLaptop.toggleAdmin(bob);

  //////////////////////////////////////////////////////////////////////////////
  console.log('--- Chaos round ---');
  await Promise.all([
    alice.round(),
    bob.round()
  ]);

  //////////////////////////////////////////////////////////////////////////////
  console.log('--- Round report ---');
  const entries = {};
  for (let user of USERS)
    await user.report(entries);
  console.log(entries);

} finally {
  await alice.cleanup();
  await bob.cleanup();
  await gw.cleanup();
}

function maybeOr(probability, cb1, cb2) {
  return faker.helpers.maybe(cb1, { probability }) || cb2();
}
