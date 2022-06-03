![stability-wip](https://img.shields.io/badge/stability-work_in_progress-lightgrey.svg)

# timeld Gateway

The timeld Gateway is a service to manage timeld accounts and persist timesheets safely. It can be deployed and scaled easily on a cloud platform.

## Fly.io Deployment Notes

### volumes

A volume is required for clone persistence (Gateway and Timesheet domains).

```bash
flyctl volumes create timeld_data --region lhr
```

> A volume is directly associated with only one app and exists in only one region.

Each _instance_ of an app must have dedicated storage. So we can either:
- [x] set `fly scale ... --max-per-region=1` (limits scaling), or
- [ ] create a directory under `/data` per [allocation ID](https://fly.io/docs/reference/runtime-environment/#fly_alloc_id) – (creates a garbage collection problem with rolling redeploy)

### secrets

```bash
flyctl secrets import < .env
```

Where the .env file contains:
- `TIMELD_ABLY__KEY`
- `TIMELD_ABLY__API_KEY`
- `TIMELD_COURIER__AUTHORIZATION_TOKEN`

### deploy

```bash
flyctl deploy
```

(For development, use `flyctl deploy ./packages/gateway` in the monorepo root, to pick up the local `.env`.)

The first deployment of a new Gateway must be started with the `genesis` flag. (You also have to include the gateway, because of a [Fly.io bug](https://github.com/superfly/flyctl/issues/560).)

```bash
flyctl deploy --env TIMELD_GENESIS=true --env TIMELD_GATEWAY=timeld.org
```

### random

- `engines.node` is set to 16.x in `package.json` due to a [bug in Restify](https://github.com/restify/node-restify/issues/1888).
- `simple-peer` is a dependency even if we don't use WebRTC (a bug in m-ld-js/ext/ably).