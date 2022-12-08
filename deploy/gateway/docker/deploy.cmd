docker run --detach `
--publish 8080:8080 `
--name timeld-gateway `
--hostname timeld-gateway `
--network timeld `
--network-alias gateway.local `
--mount source=timeld-data,target=/opt/timeld/data `
--workdir /opt/timeld `
--env-file .env `
--user="timeld" `
timeld-gateway bash -c "export LOG_LEVEL=DEBUG && node /home/timeld/node_modules/timeld-gateway/server.mjs && tail -f > /dev/null"

rem --entrypoint "su --login timeld --command 'node /home/timeld/node_modules/timeld-gateway/server.mjs'" `
rem --entrypoint "ls -l > ~/files.txt && tail -f > /dev/null" `
rem --entrypoint "bash -c echo hostname" `
rem --entrypoint "" `
rem bash -c "ls -l > ~/files-container.txt && tail -f > /dev/null"
rem bash -c "echo Executing identity is $(whoami) > ~/identity.txt && tail -f > /dev/null"
