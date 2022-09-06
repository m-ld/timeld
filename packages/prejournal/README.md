# timeld - Prejournal integration

This packages supports live update of timesheet entries:
- _from_ **timeld**
- _to_ [prejournal](https://prejournal.org/).

## installation & configuration

This integration package is included in the gateway.

The integration requires the following configuration:
- `user`: Prejournal account (user) name (required)
- `key`: Prejournal account key (required)
- `api`: API URL e.g. `https://time.pondersource.com/v1/` (required)
- `client`: default timesheet "client" (for whom the work is being done; required)

Configuration defaults may already be included in the gateway. Timesheet-specific configuration can also be included when adding the integration, see below.

To activate the integration for a timesheet "my-work" (note this assumes authorisation and API defaults in the gateway).

```shell
timeld admin
alice> add integration timeld-prejournal --ts my-work --config.client "Federated Timesheets Virtual Organisation"
```

## Prejournal API reference

- https://github.com/pondersource/prejournal#usage-timepondersourcecom

```typescript
/**
 * `worked-hours` command structure
 * @see https://github.com/pondersource/prejournal/blob/main/src/commands/worked-hours.php
 */
type workedHours = [
  'worked-hours',
  timestamp: string, // https://www.php.net/manual/en/function.strtotime.php
  worker: string, // Used to suffix project
  project: string,
  amount: number, // hours
  description?: string
]
```

```typescript
/**
 * `update-entry` command structure
 * @see https://github.com/pondersource/prejournal/blob/main/src/commands/update-entry.php
 */
type updateEntry = [
  'update-entry',
  timestamp: string,
  project: string,
  amount: number,
  description: string, // not optional
  id: number // Movement ID
]
```
