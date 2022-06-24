![stability-wip](https://img.shields.io/badge/stability-work_in_progress-lightgrey.svg)

# timeld CLI

## requirements

You need an Apple Mac, Windows PC or a Linux device.

If not using a [**timeld gateway**](https://github.com/m-ld/timeld#gateway), the manager of your timesheets (maybe just you) needs an account with the global messaging provider Ably. Whoever led you here may have an Ably "key" for you; otherwise sign up for a [free Ably account here](https://ably.com/signup).

## install

Install [Node.js](https://nodejs.org/). Then, in a terminal:

```bash
npm install timeld-cli -g
```

![coming soon](https://img.shields.io/badge/-coming%20soon-red) When we've developed an installer, this will be just one step.

## configure

If using a Gateway:

```bash
timeld config --gateway gateway-domain-or-url --user my-name
```

The `gateway-domain-or-url` can be a plain domain name e.g. `timeld.org` or a URL e.g. `http://my-iMac.local:8080`. The user name you provide may be registered with the Gateway when you first work on a timesheet.

If not using a Gateway, you need to provide your ably key, and the user as a URI, such as your favourite social media profile page:

```bash
timeld config --ably.key your-ably-key --user http://you.example.org/#profile
```

When creating timesheets, their identity will have two parts: an 'account' name and a timesheet name. You can set up a default account name:

```bash
timeld config --account your-account-name
```

You can also use a different account for each timesheet you create, see below.

## timesheeting

`timeld open your-timesheet` creates or opens a timesheet called "your-timesheet" and opens a session for you to start adding time entries. If you didn't set up a default account (above), or you want to open a timesheet against a different account, include it in the name like this: `the-account/your-timesheet`.

In the session, you can add new time entries like this: `add your-activity`. (If your activity name has spaces in it, put it in quotes e.g. `add "your activity"`.) **timeld** will confirm what you have added.

If you want the activity to have an end, you can set a duration using a time unit e.g. `add the-activity 1h`.

You can also set the start time and/or the end time e.g. `add the-activity --start 11am --end 12pm`.

Once you've added an entry, you can always modify it e.g. `modify the-activity --end now`.

To see all the entries you have added, use the `list` command.

You can `exit` the session and return to the normal terminal. To re-open it, use `timeld open your-timesheet` (without the `--create` option).

## admin

_Only available with a Gateway._

`timeld admin` opens a session for you to administer your gateway account, including personal details, organisations and projects; and report on projects and timesheets.

By default, this will open your user account, or your default account, if configured. To open an organisation account use the `--account` option. When the session is open you will see a prompt with the account name, e.g. `my-project>`.

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

- `list timesheet` will show the timesheets owned by the account (typically, this means the account is working on the timesheet)
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

## switching devices

If using a Gateway, your timesheets are stored on the gateway and are accessible from any device with a network connection to it. Each new device will be registered the first time you use it.

If not using a Gateway, your timesheets are not stored on the cloud or on any servers, only on your devices.

Still, you can open and modify a timesheet that you've created on one device, on a different device. Just use `timeld open your-timesheet` on the new device _while you have a session open on the first device._ After that, you can use your devices independently, and they will synchronise whenever they both have a session open.