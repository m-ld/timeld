![stability-wip](https://img.shields.io/badge/stability-work_in_progress-lightgrey.svg)

# timeld CLI

## requirements

You need an Apple Mac, Windows PC or a Linux device.

## install

Install version 16 or higher of [Node.js](https://nodejs.org/). Then, in a terminal:

```bash
npm install timeld-cli -g
```

![coming soon](https://img.shields.io/badge/-coming%20soon-red) When we've developed an installer, this will be just one step.

## configure

```bash
timeld config --gateway timeld.org --user my-name
```

`timeld.org` is a **timeld** web service, called a 'gateway', on the internet. If you have your own gateway, you can use its domain name instead, or a URL e.g. `http://my-iMac.local:8080`. The user name you provide will be registered with the gateway when you first open a timesheet or an admin session, unless it already exists.

When you create a timesheet, it will belong to your user account; and to start with, only you will be able to view it. You can make a timesheet visible to others later by adding it to a project. Also, it's possible to create organisation accounts with shared timesheets; see the admin section below.

When you become a member of an organisation, you can configure the app to use that account by default instead of your user account, like this:

```bash
timeld config --account your-organisation
```

You can also use a different account for each timesheet you create.

## timesheeting

`timeld open your-timesheet` creates or opens a timesheet called "your-timesheet" and opens a session for you to start adding time entries. If you want to open a timesheet from a different account, include it in the name like this: `the-account/your-timesheet`.

In the session, you can add new time entries like this:
```
add the-activity
```

(If your activity has spaces in it, put it in quotes e.g. `add "the activity"`.)

**timeld** will confirm what you have added.
  
If you want the activity to have an end time, you can set a duration using a time unit e.g. `add the-activity 1h`.

You can also set the start time and/or the end time e.g. `add the-activity --start 11am --end 12pm`. You can use natural language to set these times, e.g. `--start last Tuesday 10am`.

Once you've added an entry, you can always modify it e.g.
```
modify the-activity --end now
```

`modify` has the same options as `add`.

To see all the entries you have added, use
```
list
```

After you've used `list`, you can use the list numbers instead of activity names to modify entries, e.g. `modify 2 --end tomorrow`.

You can `exit` the session and return to the normal terminal. To re-open it, use `timeld open your-timesheet`.

## admin

`timeld admin` opens a session for you to administer your gateway account, including personal details, organisations and projects; report on projects and timesheets; and manage connectors with other federated time-tracking systems.

By default, this will open your user account, or your default account, if configured. To open an organisation account use the `--account` option. When the session is open you will see a prompt with the account name, e.g. `my-org>`.

Then, for a user account, you can:

- `list email` will show the email addresses for the user, which can be used to register new devices
- `add email alice@ex.org` will add an email address to the account
- `remove email alice@ex.org` will remove an email address from the account

- `list organisation` will show the organisations that the user is an admin of
- `add org my-org` will create an organisation called "my-org"
- `remove org my-org` will delete the organisation "my-org"

  ⚠️This will delete all projects and timesheets in the organisation!

For organisation accounts, you can:

- `list admin` will show the administrators of the account
- `add admin alice` will add the user alice as an administrator to the organisation
- `remove admin alice` will remove alice as an administrator from the organisation

For **both** user and organisation accounts, you can:

- `list timesheet` will show the timesheets owned by the account (typically, this means the account that is working on the timesheet)
- `add timesheet my-timesheet` will add a new empty timesheet "my-timesheet" to the account (which can then be opened with a timesheet session, see above)
- `remove timesheet my-timesheet` will delete "my-timesheet" from the account
 
  ⚠️ This will delete the timesheet and all its entries and links

- `list project` will show all projects owned by the account (typically, this means the account is having someone work on these projects)
- `add project my-project` will add a new empty project "my-project" to the account
- `remove project my-project` will delete "my-project" (timesheets in the project will continue to exist)

- `list link --project my-project` will list the timesheets that are linked to "my-project"
- `list link --timesheet my-timesheet` will list the projects that are linked to "my-timesheet"
- `add link my-timesheet --project my-project` will link the timesheet to the project. The project name can be prefixed with another account, such as `them/their-project`. This means that the owner of the project (e.g. "them") will be able to report on the timesheet.
- `remove link my-timesheet --project my-project` will remove the link between the timesheet and the project. This means that the owner of the project will not be able to report on the timesheet (unless they own it anyway)

- `report my-timesheet` will show the entries in "my-timesheet", if you have access to it. The name can be prefixed with another account, such as `them/their-timesheet`
- `report my-project` will show all timesheets and their entries linked to "my-project"

The output of all the `list` and `report` commands in a session can be piped to a file using `>`. For reporting, you may also specify a different output format, e.g.:

```
report my-project --format json-ld > my-project-report.json
```

You can synchronise your timesheets with other federated time-tracking systems; currently:

| system                                                                       | connector module                                                   |
|------------------------------------------------------------------------------|----------------------------------------------------------------------|
| Ponder Source's [PreJournal](https://github.com/pondersource/prejournal/)    | [timeld-prejournal](https://www.npmjs.com/package/timeld-prejournal) |
| Evoludata's [Tiki](https://timesheet.dev3.evoludata.com/Timesheets-homepage) | [timeld-tiki](https://www.npmjs.com/package/timeld-tiki)             |
| [CalDAV](https://www.rfc-editor.org/rfc/rfc4791)                             | [timeld-caldav](https://www.npmjs.com/package/timeld-caldav)         |

This is done individually for each timesheet; here's how:

```
add connector ≪connector-module≫ --timesheet my-timesheet --config.≪key≫ ≪config-value≫
```
where:
- `≪connector-module≫` is one of `timeld-prejournal`, `timeld-tiki`, or `timeld-caldav`
- `≪key≫` and `≪config-value≫` are any configuration required for the connector (see connector module links above)

## help

Every **timeld** command has a Help page describing what you can do. You can see it using the `--help` option. (It's also shown if **timeld** doesn't understand you.)

```bash
timeld --help
```

```bash
timeld open --help
```

In a timesheet or admin session you can just press `<Enter>` to see the available commands. For each individual command use the `--help` option, e.g.:

```bash
add --help
```

## switching devices and going offline

Your timesheets are stored on the gateway and can be opened from any device with a network connection to it. Each new device will be registered the first time you use it.

Once opened the first time, timesheets are also stored on the device, so you can continue working if the internet is not available. Entries in the timesheet will be synchronised between all devices as soon as the internet is available again.