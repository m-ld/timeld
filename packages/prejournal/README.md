⚠️ This package is an untested sketch for [prejournal](https://prejournal.org/) timesheets  sync integration.

## API docs

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
