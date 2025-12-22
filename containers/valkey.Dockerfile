FROM valkey/valkey:9.0.0-alpine3.22

# Expose Valkey default port
EXPOSE 6379

CMD [ "valkey-server" ]
