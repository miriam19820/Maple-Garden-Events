# Pure reverse-proxy image — no build stage. Routes to the client and server containers.
FROM nginx:stable-alpine

RUN rm -rf /etc/nginx/conf.d/default.conf

COPY routing/http.conf.template /etc/nginx/templates/http.conf.template
COPY routing/ssl.conf.template  /etc/nginx/templates/ssl.conf.template
COPY routing/entrypoint.sh      /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 443

CMD ["/entrypoint.sh"]
