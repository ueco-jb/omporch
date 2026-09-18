
ARG BUN_TAG=1.3.14-debian
ARG RUST_TAG=1.95.0-slim-trixie
FROM rust:${RUST_TAG} AS rust
FROM oven/bun:${BUN_TAG}

ARG OMP_VERSION=18.1.16

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates git curl less ripgrep openssh-client nix-bin \
 && rm -rf /var/lib/apt/lists/*

COPY --from=rust /usr/local/cargo /usr/local/cargo
COPY --from=rust /usr/local/rustup /usr/local/rustup

ENV BUN_INSTALL=/usr/local
RUN bun install -g "@oh-my-pi/pi-coding-agent@${OMP_VERSION}" \
 && /usr/local/bin/omp --version

RUN usermod -l u -d /home/u -m bun \
 && groupmod -n u bun

ENV PI_CODING_AGENT_DIR=/home/u/.omp/agent
ENV HOME=/home/u
ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/home/u/.cargo
ENV PATH=/usr/local/cargo/bin:${PATH}
ENV NIX_SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

COPY directives/ /opt/ompbox/directives/
COPY docker/entrypoint.sh /usr/local/bin/ompbox-entrypoint

RUN chmod +x /usr/local/bin/ompbox-entrypoint \
 && mkdir -p /home/u/.omp/agent /home/u/.pi/agent /home/u/.cargo /home/u/projects /nix/store /nix/var/nix /etc/nix \
 && printf 'experimental-features = nix-command flakes\nsandbox = false\nbuild-users-group =\naccept-flake-config = true\n' > /etc/nix/nix.conf \
 && chown -R u:u /home/u /nix

USER u

RUN cargo --version \
 && rustc --version \
 && nix --version \
 && nix eval --expr '1 + 1'
WORKDIR /home/u

ENTRYPOINT ["/usr/local/bin/ompbox-entrypoint"]
CMD ["sleep", "infinity"]
