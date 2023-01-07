![stability-wip](https://img.shields.io/badge/stability-work_in_progress-lightgrey.svg)

# timeld Gateway

The timeld Gateway is a service to manage timeld accounts and persist timesheets safely. It can be deployed conventionally or in a Docker container - to a local machine, an on-premises server, or cloud platform - and scaled easily.

## Common prerequisites
Regardless of the target deployment environment, you need the following:

1. Account credentials for an SMTP service (for sending activation codes to timeld clients); and
2. A local clone of the [timeld repo](https://github.com/m-ld/timeld).

To obtain 2., enter the following in a terminal / shell / PowerShell session:
```bash
git clone https://github.com/m-ld/timeld
cd timeld/packages/gateway
```
## Deployment to a Docker container
You can either use the container image published to Docker Hub for the timeld Gateway, or build your own.  For further instructions, see the [README for timeld Gateway Docker deployment](../../deploy/docker).


## Deployment to Fly.io

### prerequisites

In addition to the **Common prerequisites** above, you will need:
1. A [fly.io](https://fly.io) account (requires a credit card);
2. To install the [`flyctl`](https://fly.io/docs/flyctl/installing/) command-line utility for working with fly.io.
3. An app name!

```
flyctl apps create ≪your-great-name≫
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

- `TIMELD_GATEWAY_AUTH__KEY=≪some-root-access-key≫` (see below)
- `TIMELD_GATEWAY_SMTP__HOST=≪your-smtp-host≫`
- `TIMELD_GATEWAY_SMTP__FROM=≪an-email-account-to-send-activation-codes≫`
- `TIMELD_GATEWAY_SMTP__AUTH__USER=≪your-smtp-account≫`
- `TIMELD_GATEWAY_SMTP__AUTH__PASS=≪your-smtp-account-password≫`
- Any additional configuration secrets for extensions, e.g. see ../prejournal/index.mjs

The root access key is invented by you; it must be of the form `≪appid≫.≪keyid≫:≪secret≫`, where:
- `appid` is some application identifier (the app name will do)
- `keyid` is the key identifier (at least 5 characters), used for logging
- `secret` is the secret key material (at least 20 characters)

e.g. `timeld.rootkey:123456789abcdefghijk`

`deploy.sh` takes three optional arguments:
1. app name (root); defaults to `timeld`
2. app name suffix; defaults to git branch name e.g. `timeld-edge`. If `main`, no suffix is used, i.e. just `timeld`.
3. `genesis` (if used, the 1st two arguments must also be given, and the secrets will be pushed to fly.io)

```shell
./deploy.sh timeld main genesis
```

### random

- `engines.node` is set to 16.x in `package.json` due to a [bug in Restify](https://github.com/restify/node-restify/issues/1888).
- When using Ably, `simple-peer` is a dependency even if we don't use WebRTC (a bug in m-ld-js/ext/ably).