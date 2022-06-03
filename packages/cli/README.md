![stability-wip](https://img.shields.io/badge/stability-work_in_progress-lightgrey.svg)

# timeld CLI

## requirements

You need an Apple Mac, Windows PC or a Linux device.

If not using a [**timeld gateway**](https://github.com/m-ld/timeld#gateway), the manager of your timesheets (maybe just you) needs an account with the global messaging provider Ably. Whoever led you here may have an Ably "key" for you; otherwise sign up for a [free Ably account here](https://ably.com/signup).

## install

Install [Node.js](https://nodejs.org/).

In a terminal: `npm install timeld-cli -g`

![coming soon](https://img.shields.io/badge/-coming%20soon-red) When we've developed an installer, this will be just one step.

## configure

If using a Gateway:

`timeld config --gateway gateway-domain-or-url`

The `gateway-domain-or-url` can be a plain domain name e.g. `timeld.org` or a URL e.g. `http://my-iMac.local:8080`.

If not using a Gateway:

`timeld config --ably.key your-ably-key`

In either case, you must provide a URI for yourself, as a user (you could use a link to your profile on your favourite social media site):

`timeld config --user http://you.example.org/#profile`

When creating timesheets, their identity will have two parts: an 'account' name and a timesheet name. You can set up a default account name:

`timeld config --account your-account-name`

You can also use a different account for each timesheet you create.

## use

`timeld open your-timesheet` creates or opens a timesheet called "your-timesheet" and opens a session for you to start adding time entries. If you didn't set up a default account (above), or you want to open a timesheet against a different account, include it in the name like this: `the-account/your-timesheet`.

In the session, you can add new time entries like this: `add your-activity`. (If your activity name has spaces in it, put it in quotes e.g. `add "your activity"`.) **timeld** will confirm what you have added.

If you want the activity to have an end, you can set a duration using a time unit e.g. `add the-activity 1h`.

You can also set the start time and/or the end time e.g. `add the-activity --start 11am --end 12pm`.

Once you've added an entry, you can always modify it e.g. `modify the-activity --end now`.

To see all the entries you have added, use the `list` command.

You can `exit` the session and return to the normal terminal. To re-open it, use `timeld open your-timesheet` (without the `--create` option).

## help

Every **timeld** command has a Help page describing what you can do. You can see it using the `--help` option. (It's also shown if **timeld** doesn't understand you.)

`timeld --help`

`timeld open --help`

In a timesheet session you can just press `<Enter>` to see the available commands. For each individual command use the `--help` option, e.g.:

`add --help`

## switching devices

If using a Gateway, your timesheets are stored on the gateway and are accessible from any device with a network connection to it. Each new device will be registered the first time you use it.

If not using a Gateway, your timesheets are not stored on the cloud or on any servers, only on your devices.

Still, you can open and modify a timesheet that you've created on one device, on a different device. Just use `timeld open your-timesheet` on the new device _while you have a session open on the first device._ After that, you can use your devices independently, and they will synchronise whenever they both have a session open.