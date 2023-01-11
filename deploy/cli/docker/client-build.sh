#!/bin/bash
# Build script for CLI image executed from Dockerfile

# Create user timeld with restricted permissions
echo | tee --append /var/log/build.log
echo Creating user for timeld with restricted permissions... | tee --append /var/log/build.log
useradd --create-home --shell /bin/bash \
    --comment "User for timeld CLI" timeld \
    | tee --append /var/log/build.log

# Script emulates ps command absent from lightweight base image
mv ./ps.sh /usr/bin/ps
echo | tee --append /var/log/build.log
echo Installing timeld-cli... | tee --append /var/log/build.log
# Short-term approach until repo updated...install from node-generated tarball:
#npm install --global *.tgz | tee --append /var/log/build.log
# Medium-term approach...install from npmjs.com
npm install --global "timeld-cli@$CLI_VERSION" >> /var/log/build.log
# Longer-term approach will be to install direct from the GitHub repo