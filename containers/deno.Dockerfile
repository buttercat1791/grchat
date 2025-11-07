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

# --- Deno Runtime Stage ---
FROM denoland/deno:alpine-2.5.5
WORKDIR /app
EXPOSE 1993
USER deno

# Copy noscrypt library binaries and headers from noscrypt build stage
COPY --from=noscrypt /usr/local/lib/libnoscrypt.so /usr/local/lib/libnoscrypt.so
COPY --from=noscrypt /usr/local/lib/libnoscrypt_static.a /usr/local/lib/libnoscrypt_static.a
COPY --from=noscrypt /usr/local/include/noscrypt/noscrypt.h /usr/local/include/noscrypt/noscrypt.h
COPY --from=noscrypt /usr/local/include/noscrypt/platform.h /usr/local/include/noscrypt/platform.h

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
COPY deps.ts .
RUN deno install --entrypoint deps.ts

# These steps will be re-run upon each file change in your working directory:
COPY . .
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache main.ts

CMD ["run", "--allow-net", "--allow-ffi", "main.ts"]
