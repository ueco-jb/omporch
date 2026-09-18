
ARG BUN_TAG=1.3.14-debian
FROM oven/bun:${BUN_TAG}

ARG OMP_VERSION=16.0.4

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates git curl less ripgrep openssh-client \
 && rm -rf /var/lib/apt/lists/*

ENV BUN_INSTALL=/usr/local
RUN bun install -g "@oh-my-pi/pi-coding-agent@${OMP_VERSION}" \
 && /usr/local/bin/omp --version

RUN usermod -l u -d /home/u -m bun \
 && groupmod -n u bun

ENV PI_CODING_AGENT_DIR=/home/u/.omp/agent
ENV HOME=/home/u

COPY directives/ /opt/ompbox/directives/
COPY docker/entrypoint.sh /usr/local/bin/ompbox-entrypoint

RUN chmod +x /usr/local/bin/ompbox-entrypoint \
 && mkdir -p /home/u/.omp/agent /home/u/.pi/agent /home/u/projects \
 && chown -R u:u /home/u

USER u
WORKDIR /home/u

ENTRYPOINT ["/usr/local/bin/ompbox-entrypoint"]
CMD ["sleep", "infinity"]
