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
    task -- -DNC_ENABLE_UTILS=ON && \
    task install

# --- Deno Runtime Stage ---
FROM denoland/deno:alpine-2.6.3

ARG GIT_REVISION
ENV DENO_DEPLOYMENT_ID=${GIT_REVISION}

WORKDIR /app

# Copy noscrypt library binaries and headers from noscrypt build stage
COPY --from=noscrypt /usr/local/lib/libnoscrypt.so /usr/local/lib/libnoscrypt.so
COPY --from=noscrypt /usr/local/lib/libnoscrypt_static.a /usr/local/lib/libnoscrypt_static.a
COPY --from=noscrypt /usr/local/include/noscrypt/noscrypt.h /usr/local/include/noscrypt/noscrypt.h
COPY --from=noscrypt /usr/local/include/noscrypt/noscryptutil.h /usr/local/include/noscrypt/noscryptutil.h
COPY --from=noscrypt /usr/local/include/noscrypt/platform.h /usr/local/include/noscrypt/platform.h

COPY . .
RUN deno install
RUN deno task build
RUN deno cache _fresh/server.js

USER deno
EXPOSE 8000

CMD ["serve", "-A", "_fresh/server.js"]
