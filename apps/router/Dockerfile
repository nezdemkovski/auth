FROM caddy:2.11.3-alpine@sha256:86deaf5e3d3408a6ccec08fbb79989783dd26e206ae10bcf78a801dc8c9ab794
RUN cp /usr/bin/caddy /usr/bin/caddy-unprivileged
CMD ["/usr/bin/caddy-unprivileged", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
