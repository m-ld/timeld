# timeld - Tiki connector

This package supports live update of timesheet entries:
- _from_ **timeld**
- _to_ [Tiki Timesheets](https://profiles.tiki.org/Timesheets).

## installation & configuration

This connector package is included in the Gateway.

The connector requires the following configuration:
- `api`: Tiki tracker items API URL e.g. `https://timesheet.dev3.evoludata.com/api/trackers/2/items`
- `token`: Tiki OAuth2 token

Configuration defaults may already be included in the Gateway. Timesheet-specific configuration can also be included when adding the connector, see below.

To activate the connector for a timesheet "my-work" (note this assumes authorisation has defaults in the gateway).

```shell
timeld admin
alice> add connector timeld-tiki --ts my-work --config.api "https://timesheet.dev3.evoludata.com/api/trackers/2/items"
```

## Tiki Timesheets references

- Tiki Profile: https://profiles.tiki.org/Timesheets
- Example server API docs: https://timesheet.dev3.evoludata.com/api/
