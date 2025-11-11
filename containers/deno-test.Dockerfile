# --- Noscrypt Build Stage ---
FROM gcc:15.2.0 AS noscrypt
WORKDIR /usr/src/noscrypt

# Prerequisites
RUN apt update && \
    apt install -y sudo && \
    apt install -y cmake && \
    curl -1sLf 'https://dl.cloudsmith.io/public/task/task/setup.deb.sh' | sudo -E bash && \
    apt install -y task

# Build and install (requires root user)
RUN wget https://www.vaughnnugent.com/public/resources/software/builds/noscrypt/711a22c569d1ae06ae2f454ece57ad7a2152aaa3/noscrypt/noscrypt-src.tgz && \
    tar -xzf noscrypt-src.tgz && \
    task && \
    task install

# --- Deno Test Stage ---
FROM denoland/deno:alpine-2.5.5
WORKDIR /app

# Copy noscrypt library binaries and headers from noscrypt build stage
COPY --from=noscrypt /usr/local/lib/libnoscrypt.so /usr/local/lib/libnoscrypt.so
COPY --from=noscrypt /usr/local/lib/libnoscrypt_static.a /usr/local/lib/libnoscrypt_static.a
COPY --from=noscrypt /usr/local/include/noscrypt/noscrypt.h /usr/local/include/noscrypt/noscrypt.h
COPY --from=noscrypt /usr/local/include/noscrypt/platform.h /usr/local/include/noscrypt/platform.h

# Set up full project similar to the project's deployable `deno.Dockerfile`.
COPY . .
RUN deno install
RUN deno cache main.ts

# Run all tests.
# Runs as root user -- DO NOT DEPLOY THIS CONTAINER TO PRODUCTION
CMD ["test", "--allow-ffi"]
