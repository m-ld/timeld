# timeld - Tiki integration

This packages supports live update of timesheet entries from **timeld** to [Tiki Timesheets](https://profiles.tiki.org/Timesheets).

## installation

This integration package is included in the gateway.

To activate the integration for a timesheet "my-work":

```shell
timeld admin
alice> add integration timeld-tiki --ts my-work
```

## API docs

- Tiki Profile: https://profiles.tiki.org/Timesheets
- Example server API docs: https://timesheet.dev3.evoludata.com/api/
