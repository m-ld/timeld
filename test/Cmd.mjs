import path from 'path';
import { dirSync } from 'tmp';
import { EventEmitter, once } from 'events';
import { mkdirSync } from 'fs';
import { fork } from 'child_process';

/**
 * @typedef {string | RegExp | ((out: string) => boolean)} OutMatcher
 */

class CmdProcess extends EventEmitter {
  /**@type number | null*/exitCode = null;
  /**@type string*/buffer = '';
  /**@type import('child_process').ChildProcess['kill']*/kill;
  /**@type (text: string) => void*/input;

  /** @param {ChildProcess} process */
  constructor(process) {
    super();
    process.on('spawn', () => this.emit('spawn'));
    process.on('exit', (exitCode, signal) => {
      this.exitCode = exitCode;
      if (!this.buffer.endsWith('\n'))
        this.emit('line', this.buffer.slice(this.buffer.lastIndexOf('\n') + 1));
      this.emit('exit', exitCode, signal);
    });
    this.input = text => {
      process.stdin.write(text + '\n');
    };
    /** @param {import('stream').Readable} readable */
    const captureOut = readable =>
      readable.on('readable', () => {
        const prevLf = this.buffer.lastIndexOf('\n');
        let chunk;
        while (null !== (chunk = readable.read()))
          this.buffer += chunk;
        const lines = this.buffer.slice(prevLf + 1).split('\n');
        for (let i = 0; i < lines.length; i++) {
          i < lines.length - 1 && this.emit('line', lines[i]);
          lines[i] && this.emit('out', lines[i]);
        }
      });
    captureOut(process.stdout);
    captureOut(process.stderr);
    this.kill = process.kill.bind(process);
  }

  /**
   * @param {OutMatcher} match
   * @param {OutMatcher} [matchError]
   * @param {number} [timeout]
   */
  async find(match, {
    matchError = 'MeldError',
    timeout = Infinity
  } = {}) {
    const matchFn = this.matcher(match);
    const matchErrorFn = this.matcher(matchError);
    return this.query(matchFn) || await new Promise((resolved, rejected) => {
      const foundListener = out => {
        if (matchFn(out))
          settle(resolved, out);
        else if (matchErrorFn(out))
          settle(rejected, out);
      };
      this.on('out', foundListener);
      const timer = timeout < Infinity &&
        setTimeout(() => settle(rejected, 'timed out'), timeout);
      const exitListener = () => settle(rejected, `process exited:\n${this.buffer}`);
      this.on('exit', exitListener);
      const settle = (fn, arg) => {
        timer !== false && clearTimeout(timer);
        this.off('out', foundListener);
        this.off('exit', exitListener);
        fn(arg);
      };
    });
  }

  /** @param {OutMatcher} match */
  query(match) {
    const matchFn = this.matcher(match);
    const lines = this.buffer.split('\n');
    for (let i = lines.length - 1; i >= 0; i--)
      if (matchFn(lines[i]))
        return lines[i];
    return false;
  }

  /** @param {OutMatcher} match */
  matcher(match) {
    return typeof match == 'function' ? match :
      typeof match == 'string' ? line => line.includes(match) :
        line => match.test(line);
  }

  clear() {
    this.buffer = '';
  }
}

export default class Cmd {
  /**@type CmdProcess | null*/process = null;
  /**@type import('tmp').DirSyncObject[]*/dirs = [];
  /**@type string*/rootDir;
  /**@type boolean*/debug = false;
  /**@type Console['log']*/log;
  /**@type boolean*/static logging = false;

  constructor(...name) {
    this.rootDir = path.join(process.cwd(), 'test', ...name);
    this.name = name.join(' ');
    this.logger = Cmd.logging ? console : null;
  }

  set logger(console) {
    this.log = console ? console.log.bind(console, this.name) : () => {};
  }

  createDir(purpose) {
    mkdirSync(this.rootDir, { recursive: true });
    // noinspection JSCheckFunctionSignatures
    const dir = dirSync({
      unsafeCleanup: true,
      tmpdir: this.rootDir
    });
    this.dirs.push(dir);
    this.log('Created dir',
      dir.name.replace(process.cwd(), '.'),
      ...(purpose ? ['for', purpose] : []));
    return dir.name;
  }

  /**
   * @param {string | Partial<ForkOptions>} args
   */
  async run(...args) {
    if (this.process)
      throw new RangeError('Already running');
    const [modulePath, ...argv] = args.filter(a => typeof a == 'string');
    // noinspection JSCheckFunctionSignatures
    const opts = Object.assign({
      cwd: this.rootDir, silent: true
    }, ...args.filter(a => typeof a == 'object'));
    this.process = new CmdProcess(fork(modulePath, argv, opts));
    await once(this.process, 'spawn');
    const debugListener = (...args) => {
      if (this.debug)
        this.log(...args);
    };
    this.process.on('line', debugListener);
    this.process.on('exit', debugListener.bind(this, 'exited'));
    return opts;
  }

  /**
   * @param {OutMatcher} text
   * @param {Object} [opts]
   */
  async findByText(text, opts) {
    this.log('→', await this.process.find(text, opts));
  }

  /** @param {OutMatcher} text */
  queryByText(text) {
    return this.process.query(text);
  }

  type(text) {
    this.clear(); // We always want following output
    this.process.input(text);
    this.log('←', text);
  }

  getOut() {
    return this.process.buffer;
  }

  async waitForExit() {
    if (this.process) {
      if (this.process.exitCode == null)
        await once(this.process, 'exit');
      delete this.process;
    }
  }

  clear() {
    if (this.process)
      this.process.clear();
  }

  async cleanup() {
    if (this.process) {
      this.process.kill();
      await this.waitForExit();
    }
    // automatic remove doesn't work
    this.dirs.forEach(dir => dir.removeCallback());
  }
}
