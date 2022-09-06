<pre></pre>
<!--suppress HtmlDeprecatedAttribute -->
<p align="center">
  <a href="https://m-ld.org/">
    <img alt="m-ld" src="https://m-ld.org/m-ld.svg" width="300em" />
  </a>
</p>
<pre></pre>

[![Project Status: WIP – Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)
[![actions](https://github.com/m-ld/timeld/actions/workflows/node.js.yml/badge.svg)](https://github.com/m-ld/timeld/actions)
[![Gitter](https://img.shields.io/gitter/room/federatedbookkeeping/timesheets)](https://gitter.im/federatedbookkeeping/timesheets)
[![Project](https://img.shields.io/badge/project-in%20progress-success)](https://github.com/m-ld/timeld/projects/1)

# live shared timesheets

**timeld** is a tool for managing your time.

- Quickly record tasks in a timesheet, as you work on them, or with a start and end time, or a duration
- See and edit your tasks on any device

The [desktop tool](https://www.npmjs.com/package/timeld-cli) (called **timeld-cli**) is used to create and edit timesheets, and works on on MacOS, Windows and Linux.

## gateway

The [Gateway](https://www.npmjs.com/package/timeld-gateway) manages accounts and persists timesheets somewhere safe.

- Register accounts
- Manage projects
- Submit completed timesheets to other management systems
- Import timesheets from other management systems

---

## development

To publish, use e.g. `./publish.sh` in the root, to ensure that workspace packages stay in sync.
