<pre></pre>
<!--suppress HtmlDeprecatedAttribute -->
<p align="center">
  <a href="https://m-ld.org/">
    <img alt="m-ld" src="https://m-ld.org/m-ld.svg" width="300em" />
  </a>
</p>
<pre></pre>

[![stability-wip](https://img.shields.io/badge/stability-work_in_progress-lightgrey.svg)](https://github.com/m-ld/timeld/projects/1)
[![actions](https://github.com/m-ld/timeld/actions/workflows/node.js.yml/badge.svg)](https://github.com/m-ld/timeld/actions)
[![Gitter](https://img.shields.io/gitter/room/federatedbookkeeping/timesheets)](https://gitter.im/federatedbookkeeping/timesheets)

# live shared timesheets

**timeld** is a tool for managing your time.

- Quickly record tasks in a timesheet, as you work on them, or with a start and end time, or a duration
- See and edit your tasks on any device

The [desktop tool](https://www.npmjs.com/package/timeld-cli) can be used on MacOS, Windows and Linux.

## gateway

The [Gateway](https://www.npmjs.com/package/timeld-gateway) manages accounts and persists timesheets somewhere safe.

- Register accounts
- ![coming soon](https://img.shields.io/badge/-coming%20soon-red) Submit completed timesheets to other management systems
- ![coming soon](https://img.shields.io/badge/-coming%20soon-red) Import timesheets from other management systems

---

## development

[![project](https://raw.githubusercontent.com/primer/octicons/main/icons/table-16.svg) kanban board](https://github.com/m-ld/timeld/projects/1)

To publish, use e.g. `$VERSION=patch npm run publish` in the root, to ensure that workspace packages stay in sync.
