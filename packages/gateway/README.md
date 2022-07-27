![stability-wip](https://img.shields.io/badge/stability-work_in_progress-lightgrey.svg)

# timeld Gateway

The timeld Gateway is a service to manage timeld accounts and persist timesheets safely. It can be deployed and scaled easily on a cloud platform.

## Fly.io Deployment Notes

### app

Decide your app name.

```shell
flyctl apps create timeld
```

If developing off the `main` branch, the deploy script (below) will use your current branch name as a suffix; in preparation you should run the above command with the suffixed name e.g. `timeld-edge`.

### volumes

A volume is required for clone persistence (Gateway and Timesheet domains).

_NB: The `-a` parameter must match your app name._

```shell
flyctl volumes create timeld_data --region lhr -a timeld
```


> NB: "A volume is directly associated with only one app and exists in only one region."
>
> Each _instance_ of an app must have dedicated storage. So we can either:
> - [x] set `fly scale ... --max-per-region=1` (limits scaling), or
> - [ ] create a directory under `/data` per [allocation ID](https://fly.io/docs/reference/runtime-environment/#fly_alloc_id) – (creates a garbage collection problem with rolling redeploy)

### secrets

```shell
flyctl secrets import < .env -a timeld
```

Where the .env file contains:
- `TIMELD_GATEWAY_ABLY__KEY={your root ably key}`
- `TIMELD_GATEWAY_ABLY__API_KEY={your ably control API key}`
- `TIMELD_GATEWAY_COURIER__AUTHORIZATION_TOKEN={your courier auth token}`
- `TIMELD_GATEWAY_COURIER__ACTIVATION_TEMPLATE={courier activation email template ID}`

### deploy

_NB: If you have made any changes to timeld-common, it needs to be published first._

A script is provided to generate, and optionally run, the correct deploy command.

```shell
chmod +x deploy.sh
./deploy.sh
```

`deploy.sh` takes three optional arguments:
1. app name (root); defaults to `timeld`
2. app name suffix; defaults to git branch name e.g. `timeld-edge`. If `main`, no suffix is used, i.e. just `timeld`.
3. `genesis` (if used, the 1st two arguments must also be given)

The first deployment of a new Gateway **must** be started with the `genesis` flag.

### random

- `engines.node` is set to 16.x in `package.json` due to a [bug in Restify](https://github.com/restify/node-restify/issues/1888).
- `simple-peer` is a dependency even if we don't use WebRTC (a bug in m-ld-js/ext/ably).