FROM valkey/valkey:9.0.0-alpine3.22

# Copy custom configuration
COPY valkey.conf /usr/local/etc/valkey/valkey.conf

# Expose Valkey default port
EXPOSE 6379

# Run Valkey with custom configuration
CMD [ "valkey-server", "/usr/local/etc/valkey/valkey.conf" ]
