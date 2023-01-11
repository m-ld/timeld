#!/bin/bash
# Config and install script for Gateway image executed from Dockerfile

# Create user timeld with restricted permissions
echo | tee --append /var/log/build.log
echo Creating user for timeld with restricted permissions... | tee --append /var/log/build.log
useradd --create-home --system --shell /bin/bash \
    --comment "User account for timeld Gateway" timeld \
    | tee --append /var/log/build.log

# Script emulates ps command absent from lightweight base image
mv /tmp/docker/ps.sh /usr/bin/ps
# Script updates permissions on working dir for timeld user, launches Gateway
mv /tmp/docker/gateway-launch.sh /home/timeld/
echo | tee --append /var/log/build.log
echo Installing timeld-gateway... | tee --append /var/log/build.log
# Short-term approach until repo updated...install from node-generated tarball:
#su --login timeld --command "npm install /tmp/*.tgz" >> /var/log/build.log
# Medium-term approach...install from npmjs.com:
su --login timeld --command "npm install timeld-gateway@$GATEWAY_VERSION" | tee --append /var/log/build.log
# Longer-term approach will be to install direct from the GitHub repo