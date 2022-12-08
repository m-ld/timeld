FROM node:16-bullseye-slim
LABEL description="Docker image for timeld client" version="0.1"
WORKDIR /opt/timeld/
COPY *.tgz .
COPY ./deploy/docker/client-build.sh .
RUN /opt/timeld/client-build.sh

# Next 4 lines create script to view running processes, since slim source image lacks such tools
RUN echo 'for proc in /proc/[0-9]*/cmdline; do' > /usr/bin/ps
RUN echo '  echo $(cat $proc | tr "\\0" " ");' >> /usr/bin/ps
RUN echo 'done' >> /usr/bin/ps
RUN chmod +x /usr/bin/ps

USER timeld
CMD ["bash", "-c", "echo Executing identity is $(whoami) > ~/identity.txt && tail -f /dev/null"]