FROM node:16-bullseye-slim
LABEL description="Docker image for timeld Gateway" version="0.2"
RUN \
    --mount=type=cache,target=/var/cache/apt \
    apt-get update && apt-get upgrade -y &&\
    apt-get install mlocate -y
WORKDIR /opt/timeld/
VOLUME /opt/timeld/data

COPY . /tmp/
RUN /tmp/docker/gateway-build.sh

# Invoke node executable from script to enable precending permissions update:
CMD ["bash", "-c", "/home/timeld/gateway-launch.sh"]
# Alternative container launch point for error resolution:
# CMD ["bash", "-c", "ls -l > ~/files-image.txt && tail -f /dev/null"]

EXPOSE 8080