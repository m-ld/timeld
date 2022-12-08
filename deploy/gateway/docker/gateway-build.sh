#!/bin/bash
# Config and install script for Gateway image executed from Dockerfile

# Create user timeld with restricted permissions
echo | tee --append /var/log/build.log
useradd --create-home --system --shell /bin/bash \
    --comment "User account for timeld Gateway" timeld \
    | tee --append /var/log/build.log

# Script emulates ps command absent from lightweight base image
mv /tmp/docker/ps.sh /usr/bin/ps
# Script updates permissions on working dir for timeld user, launches Gateway
mv /tmp/docker/gateway-launch.sh /home/timeld/
echo | tee --append /var/log/build.log
echo Installing timeld-gateway... | tee --append /var/log/build.log
# Install gateway from tarball (interim approach until repo updated):
su --login timeld --command "npm install /tmp/*.tgz" >> /var/log/build.log
# Longer-term approach - install from cloned source:
# su --login timeld --command "npm install timeld-gateway" | tee --append /var/log/build.log