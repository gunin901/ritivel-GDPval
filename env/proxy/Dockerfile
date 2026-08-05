# Lightweight forward-proxy image (not the full gdpval-video sandbox).
FROM python:3.11-slim-bookworm
WORKDIR /app
COPY allowlist_proxy.py /app/allowlist_proxy.py
COPY allowlist.txt /etc/proxy/allowlist.txt
RUN mkdir -p /var/cache/gdpval-proxy
ENV ALLOWLIST_PATH=/etc/proxy/allowlist.txt \
    CACHE_DIR=/var/cache/gdpval-proxy
EXPOSE 3128
CMD ["python", "/app/allowlist_proxy.py", "--listen", "0.0.0.0", "--port", "3128"]
