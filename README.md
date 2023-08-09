[![Project Status: Suspended – Initial development has started, but there has not yet been a stable, usable release; work has been stopped for the time being but the author(s) intend on resuming work.](https://www.repostatus.org/badges/latest/suspended.svg)](https://www.repostatus.org/#suspended)
[![actions](https://github.com/m-ld/timeld/actions/workflows/node.js.yml/badge.svg)](https://github.com/m-ld/timeld/actions)
[![Gitter](https://img.shields.io/gitter/room/federatedbookkeeping/timesheets)](https://gitter.im/federatedbookkeeping/timesheets)

# live shared timesheets

**timeld** is a tool for managing your time.

- Quickly record tasks in a timesheet, as you work on them, or with a start and end time, or a duration
- See and edit your tasks on any device

The [desktop tool](https://www.npmjs.com/package/timeld-cli) (called **timeld-cli**) is used to create and edit timesheets, and works on on MacOS, Windows and Linux.

## gateway

The [Gateway](https://www.npmjs.com/package/timeld-gateway) manages accounts and persists timesheets somewhere safe.

- Register accounts
- Manage projects
- Submit completed timesheets to other time-tracking systems
- Import timesheets from other time-tracking systems

---

## development

To publish, use e.g. `./publish.sh` in the root, to ensure that workspace packages stay in sync.
