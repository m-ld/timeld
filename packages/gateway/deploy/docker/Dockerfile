FROM node:16-bullseye-slim
LABEL description="Docker image for timeld Gateway" version="0.1"
VOLUME /opt/timeld/data
WORKDIR /opt/timeld/
COPY gateway-build.sh .
RUN /opt/timeld/gateway-build.sh

# Create script to view running processes, as slim source image lacks such tools
RUN echo 'for proc in /proc/[0-9]*/cmdline; do' > /usr/bin/ps
RUN echo '  echo $(cat $proc | tr "\\0" " ");' >> /usr/bin/ps
RUN echo 'done' >> /usr/bin/ps
RUN chmod +x /usr/bin/ps

USER timeld
# Source image's ENTRYPOINT is node executable, so only the parameter is required:
CMD ["/home/timeld/node_modules/timeld-gateway/server.mjs"]
# CMD ["bash", "-c", "ls -l > ~/files-image.txt && tail -f /dev/null"]
EXPOSE 8080