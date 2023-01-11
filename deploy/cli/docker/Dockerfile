FROM node:16-bullseye-slim
LABEL description="Docker image for timeld client" version="0.2"
ARG CLI_VERSION
RUN \
    --mount=type=cache,target=/var/cache/apt \
    apt-get update && apt-get upgrade -y && \
    apt-get install mlocate -y
WORKDIR /opt/timeld/
COPY *.tgz .
COPY ./docker/*.sh .

RUN /opt/timeld/client-build.sh

USER timeld
CMD ["bash", "-c", "echo Executing identity is $(whoami) > ~/identity.txt && tail -f /dev/null"]