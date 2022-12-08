#!/bin/bash
# Initial build script for Gateway image executed from Dockerfile
# echo Getting latest container image updates... | tee --append /var/log/build.log
# apt-get update && apt-get upgrade -y | tee --append /var/log/build.log

# The following two steps will be removed from the final build script:
# apt-get install mlocate -y >> /var/log/build.log

# === The following commands copied from gateway-launch.sh, as Docker build didn't bring it in!

# Enable Gateway data to be written in data directory within running container
chown --verbose timeld:timeld /opt/timeld/data >> /var/log/build.log
# ^ ^ Check whether this runs every time the container restarts, or just when created

su --login timeld --command "node /home/timeld/node_modules/timeld-gateway/server.mjs"