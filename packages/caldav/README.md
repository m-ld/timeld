# timeld - CalDAV connector

This package supports live update of timesheet entries:
- _from_ a CalDAV end-point, such as iCloud Calendar
- _to_ **timeld**.

## installation & configuration

This connector package is included in the Gateway.

The connector requires the following configuration:
- `uri`: calendar URI (https)
- `auth.user`: CalDAV account user (optional if calendar is public)
- `auth.pass`: CalDAV account password (optional if calendar is public)
- `owner`: calendar owner IRI (optional; defaults to the timesheet owner account)
- `pollInterval` CalDAV polling interval, in milliseconds (optional; defaults to 10000)

Configuration defaults may already be included in the Gateway. Timesheet-specific configuration can also be included when adding the connector, see below.

To activate the connector for a timesheet "my-work" (note this assumes authorisation has defaults in the gateway).

```shell
timeld admin
alice> add connector timeld-caldav --ts my-work --config.uri "https://p116-caldav.icloud.com/151157399/calendars/work"
```

## CalDAV library reference

https://github.com/peerigon/scrapegoat

### connecting to iCloud

https://askubuntu.com/a/927358