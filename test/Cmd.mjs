import path from 'path';
import { dirSync } from 'tmp';
import { EventEmitter, once } from 'events';
import { mkdirSync } from 'fs';
import { fork } from 'child_process';

class CmdProcess extends EventEmitter {
  /**@type number | null*/exitCode = null;
  /**@type string*/buffer = '';
  /**@type import('child_process').ChildProcess['kill']*/kill;
  /**@type (text: string) => void*/input;

  /** @param {ChildProcess} process */
  constructor(process) {
    super();
    process.on('exit', (exitCode, signal) => {
      this.exitCode = exitCode;
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
        for (let out of this.buffer.slice(prevLf + 1).split('\n'))
          out && this.emit('out', out);
      });
    captureOut(process.stdout);
    captureOut(process.stderr);
    this.kill = process.kill.bind(process);
  }

  /** @param {(out: string) => boolean} match */
  async find(match) {
    return this.query(match) || await new Promise(resolve => {
      const listener = out => {
        if (match(out)) {
          this.off('out', listener);
          return resolve(out);
        }
      };
      this.on('out', listener);
    });
  }

  /** @param {(out: string) => boolean} match */
  query(match) {
    return this.buffer.split('\n').find(match);
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
    this.logging = Cmd.logging;
  }

  set logging(logging) {
    this.log = logging ? console.log.bind(console, this.name) : () => {};
  }

  createDir() {
    mkdirSync(this.rootDir, { recursive: true });
    // noinspection JSCheckFunctionSignatures
    const dir = dirSync({
      unsafeCleanup: true,
      tmpdir: this.rootDir
    });
    this.dirs.push(dir);
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
    const debugListener = (...args) => {
      if (this.debug)
        this.log(...args);
    };
    this.process.on('out', debugListener);
    this.process.on('exit', debugListener.bind(this, 'exited'));
    return opts;
  }

  /** @param {string | RegExp | ((out: string) => boolean)} text */
  async findByText(text) {
    this.log('→', await this.process.find(this.matcher(text)));
  }

  /** @param {string | RegExp | ((out: string) => boolean)} text */
  queryByText(text) {
    return !!this.process.query(this.matcher(text));
  }

  /** @param {string | RegExp | ((out: string) => boolean)} text */
  matcher(text) {
    return typeof text == 'function' ? text :
      typeof text == 'string' ? line => line.includes(text) :
        line => text.test(line);
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
