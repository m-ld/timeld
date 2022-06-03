import { BehaviorSubject } from 'rxjs';

// noinspection JSUnusedGlobalSymbols
export default class DeadRemotes {
  live = new BehaviorSubject(false);
  setLocal() {}
}