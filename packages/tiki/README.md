# timeld - Tiki integration

This packages supports live update of timesheet entries:
- _from_ **timeld**
- _to_ [Tiki Timesheets](https://profiles.tiki.org/Timesheets).

## installation & configuration

This integration package is included in the gateway.

The integration requires the following configuration:
- `api`: Tiki tracker items API URL e.g. `https://timesheet.dev3.evoludata.com/api/trackers/2/items`
- `token`: Tiki OAuth2 token

Configuration defaults may already be included in the gateway. Timesheet-specific configuration can also be included when adding the integration, see below.

To activate the integration for a timesheet "my-work" (note this assumes authorisation has defaults in the gateway).

```shell
timeld admin
alice> add integration timeld-tiki --ts my-work --config.api "https://timesheet.dev3.evoludata.com/api/trackers/2/items"
```

## Tiki Timesheets references

- Tiki Profile: https://profiles.tiki.org/Timesheets
- Example server API docs: https://timesheet.dev3.evoludata.com/api/
