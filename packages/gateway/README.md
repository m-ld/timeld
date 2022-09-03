![stability-wip](https://img.shields.io/badge/stability-work_in_progress-lightgrey.svg)

# timeld Gateway

The timeld Gateway is a service to manage timeld accounts and persist timesheets safely. It can be deployed and scaled easily on a cloud platform.

## Fly.io Deployment Notes

### prerequisites

```bash
git clone https://github.com/m-ld/timeld
cd timeld/packages/gateway
```

You will need:
1. A [fly.io](https://fly.io) account (requires a credit card); and install `flyctl`.
3. An SMTP service and account, for sending activation codes.
4. An app name!

```shell
flyctl apps create {your great name}
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

### deploy

_NB: If you have made any changes to timeld-common, it needs to be published first._

A script is provided to generate, and optionally run, the correct deploy command.

```shell
chmod +x deploy.sh
```

In preparation for a first deployment ("genesis") you need a local `.env` file (in this directory or in the repo root), containing:

- `TIMELD_GATEWAY_AUTH__KEY={some root access key, you choose}`
- `TIMELD_GATEWAY_SMTP__HOST={your SMTP host}`
- `TIMELD_GATEWAY_SMTP__FROM={an email account to send activation codes}`
- `TIMELD_GATEWAY_SMTP__AUTH__USER={your SMTP account}`
- `TIMELD_GATEWAY_SMTP__AUTH__PASS={your SMTP account password}`
- Any additional secrets for extensions, e.g. see ../prejournal/secrets.mjs

`deploy.sh` takes three optional arguments:
1. app name (root); defaults to `timeld`
2. app name suffix; defaults to git branch name e.g. `timeld-edge`. If `main`, no suffix is used, i.e. just `timeld`.
3. `genesis` (if used, the 1st two arguments must also be given, and the secrets will be pushed to fly.io)

```shell
./deploy.sh timeld main genesis
```

### random

- `engines.node` is set to 16.x in `package.json` due to a [bug in Restify](https://github.com/restify/node-restify/issues/1888).
- `simple-peer` is a dependency even if we don't use WebRTC (a bug in m-ld-js/ext/ably).