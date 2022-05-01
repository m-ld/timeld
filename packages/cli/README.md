# timeld CLI

## requirements

You need an Apple Mac, Windows PC or a Linux device.

The manager of your timesheets (maybe just you) needs an account with the global messaging provider Ably. Whoever led you here may have an Ably "key" for you; otherwise sign up for a [free Ably account here](https://ably.com/signup).

![coming soon](https://img.shields.io/badge/-coming%20soon-red) With the [**timeld gateway**](https://github.com/m-ld/timeld#gateway), having an Ably account & key will not be necessary.

## install

Install [Node.js](https://nodejs.org/).

In a terminal: `npm install timeld-cli -g`

![coming soon](https://img.shields.io/badge/-coming%20soon-red) When we've developed an installer, this will be just one step.

## configure

`timeld config --ably.key your-ably-key`

You can set up your default organisation name, e.g.

`timeld config --organisation your-organisation-name`

You can also use a different organisation for each timesheet you create.

## use

`timeld open your-timesheet --create` creates a new timesheet called "your-timesheet" and opens a session for you to start adding time entries. If you didn't set up a default organisation (above), or you want to open a timesheet against a different organisation, include it in the name like this: `another-organisation/your-timesheet`.

In the session, you can add new time entries like this: `add your-task`. (If your task name has spaces in it, put it in quotes e.g. `add "your task"`.) **timeld** will confirm what you have added.

If you want the task to have an end, you can set a duration using a time unit e.g. `add the-task 1h`.

You can also set the start time and/or the end time e.g. `add the-task --start 11am --end 12pm`.

Once you've added an entry, you can always modify it e.g. `modify the-task --end now`.

To see all the entries you have added, use the `list` command.

You can `exit` the session and return to the normal terminal. To re-open it, use `timeld open your-timesheet` (without the `--create` option).

## help

Every **timeld** command has a Help page describing what you can do. You can see it using the `--help` option. (It's also shown if **timeld** doesn't understand you.)

`timeld --help`

`timeld open --help`

In a timesheet session you can just press `<Enter>` to see the available commands. For each individual command use the `--help` option, e.g.:

`add --help`

## switching devices

A timesheet is not stored on the cloud or on any servers, only on your devices.

Still, you can open and modify a timesheet that you've created on one device, on a different device. Just use `timeld open your-timesheet` on the new device _while you have a session open on the first device._ After that, you can use your devices independently, and they will synchronise whenever they both have a session open.