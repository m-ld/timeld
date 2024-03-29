![stability-wip](https://img.shields.io/badge/stability-work_in_progress-lightgrey.svg)

# Deploying the timeld Gateway to a Docker container
The first part of these instructions explains how to run an instance of timeld Gateway in a Docker container using the existing image in Docker Hub.  If you prefer to create your own image, skip this section and see **Creating your own Docker container image** below.

## Running a timeld Gateway container

Runtime configuration for the container is accomplished through editing the file `/deploy/.env`.  The following table describes each of the settings:

| Setting                         | Default Value   |Description|
|---------------------------------|-----------------|-----------|
| TIMELD_GATEWAY_GATEWAY          | N/A             |The Fully Qualified Domain Name (FQDN) for the Gateway, used by the timeld CLI|
| TIMELD_GATEWAY_GENESIS          | true            |Indicates whether the Gateway is the first in a multi-node cluster|
 | TIMELD_GATEWAY_DATA_PATH        | /opt/timeld/data |File system location for timeld data on the Gateway|
 | TIMELD_GATEWAY_SMTP__HOST       | N/A             |Email provider's SMTP server|
 | TIMELD_GATEWAY_SMTP__FROM       | N/A             |From email address for verification emails sent for new client registration|
 | TIMELD_GATEWAY_SMTP__AUTH__USER | N/A             |User name for account with email provider|
 | TIMELD_GATEWAY_SMTP__AUTH__PASS | N/A             |Password for account with email provider|
 | TIMELD_GATEWAY_ADDRESS__PORT    | 8080            |TCP port used for inbound Gateway API requests|
 | TIMELD_GATEWAY_ADDRESS__HOST    | 0.0.0.0         |IP addresses the Gateway listens on (IPv6 not supported on Docker in Windows)|
 | LOG_LEVEL                       |info|Logging level for troubleshooting purposes|

In addition to the above, a set of [root access keys](../../packages/gateway/keyformat.md) must be provided, comprising a secret (auth) key and a public/private key pair. These should be different for every gateway deployment.

To assist creating keys in the correct format, a utility script is provided in this repository.
1. Ensure that npm dependencies have been installed, with `npm install`
2. In the project root, run `node ./packages/gateway/genkey.mjs >> ./deploy/.env` to append generated keys to the env file.

### Creating the network

A [custom network](https://docs.docker.com/engine/reference/commandline/network_create/) should be created for the container, e.g.:

```bash
docker network create -a timeld
```

### Linux shell run command

```bash
docker run --detach \
--publish 8080:8080 \
--name timeld-gateway \
--hostname timeld-gateway \
--network timeld \
--network alias ≪Gateway FQDN≫ \
--volume timeld:/opt/timeld \
--workdir /opt/timeld \
--env-file ./deploy/gateway/.env \
mldio/timeld-gateway
```

### PowerShell on Windows run command
<details>
<summary>PowerShell command</summary>

```bash
docker run --detach `
--publish 8080:8080 `
--name timeld-gateway `
--hostname timeld-gateway `
--network timeld `
--network-alias ≪Gateway FQDN≫ `
--volume timeld:/opt/timeld `
--workdir /opt/timeld `
--env-file ./deploy/gateway/.env `
mldio/timeld-gateway
```
</details>

To confirm that it's running as expected, enter the following command:

`docker logs timeld-gateway`

The output should include the text `Gateway initialised`.

If the error `Gateway failed to initialise` appears instead, check the preceding entries in the log for clues as to why.  It may prove necessary to remove the container and create a new one with `LOG_LEVEL` set to `debug` in the `.env` file to obtain more detailed information about the possible cause.

A related step is to replace the `CMD` step in the Dockerfile with one that launches a process that does not terminate, such as `bash -c "ls -l > ~/files-container.txt && tail -f > /dev/null"`.  This will keep the container running, and making it possible to create an interactive session with `docker exec -it timeld-gateway bash`, to investigate what is happening within the container itself.

# Creating your own Docker container image
This is an optional step to create your own image for the Gateway; if you prefer to use the existing container image in Docker Hub, refer to the section above **Running a timeld Gateway container**.

## Prerequisites

In addition to the **Common prerequisites** listed in the [main timeld Gateway README](../../README.md), you will also need to install the [Docker engine](https://docs.docker.com/engine/install/) appropriate to your environment.

## Building the container image

A new container image can be created from a version of the Gateway published on npm. See the root README for publishing steps.

In a Linux shell / MacOs terminal / Windows PowerShell session, enter:

```bash
docker build \
  --tag timeld-gateway \
  --file ./deploy/gateway/docker/Dockerfile \
  --build-arg GATEWAY_VERSION=≪version≫ \
  ./deploy/gateway/
```

Where ≪version≫ is a Gateway [version or npm tag](https://www.npmjs.com/package/timeld-gateway?activeTab=versions), such as `0.3.0-edge.2
` or `edge`. To always use the current version from this repository, use `$(npm run ver -w packages/gateway --silent)`.

This will take anything between 30 seconds and 10 minutes, depending on how many of the underlying Docker image layers are already cached in your local environment.  Once the image build is complete, you can run a container from it as directed above.

## Notes on Gateway container image build and container instance launch
### Gateway process security
In alignment with the principle of least privilege, the timeld Gateway process does not run with root privileges.  Instead, the container image build includes a script that creates a new system user `timeld` with limited privileges, in whose context the process runs.

### Data persistence
The Gateway container launched from the image needs to persists its data as the repository of last resort should all other clones vanish.  To support this, the image defines a `VOLUME` mounted at `/opt/timeld` in the container, enabling the Gateway process to write data to it, and retrieve persisted data from it in the event that it terminates and restarts.

The directory for the volume's mount point in the container is owned by `root`, as the underlying volume is on the host.  Since the process runs with restricted privileges, it cannot create the necessary subdirectories to write data to the volume unless it is given ownership of the mount point directory.  However, this cannot be done during the image build, since the volume is only mounted when a container image launches.  Therefore, the change of ownership to the `timeld` user is executed in the actual Gateway process launch script.

### Gateway process launch
This is initiated in `gateway-launch.sh`, a script that runs with root privileges to enact the change of ownership of the directory mount point for the container volume, invoked when the container is launched.  It uses `su` to run `node` with the `server.mjs` entry module as the `timeld` user, with restricted privileges.  That session inherits the `root` user's environment variables, set at container launch from the `.env` file.