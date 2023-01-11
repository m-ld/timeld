#!/bin/bash
# timeld user needs write permissions to volume on host through container
echo "Changing permissions on /opt/timeld directory" | tee --append /var/log/build.log
chown --verbose --recursive timeld:timeld /opt/timeld >> /var/log/build.log
# ^ ^ Check whether this runs every time the container restarts, or just when created

# Clean up files copied in for image build
echo "Cleaning up /tmp directory" | tee --append /var/log/build.log
rm /tmp/*.tgz
rm /tmp/docker/*
rmdir /tmp/docker

su timeld --command "node /home/timeld/node_modules/timeld-gateway/server.mjs"