FROM alpine:3.19

ARG PB_VERSION=0.25.9

RUN apk add --no-cache ca-certificates wget unzip \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pb.zip \
    && unzip /tmp/pb.zip -d /pb/ \
    && rm /tmp/pb.zip \
    && chmod +x /pb/pocketbase

EXPOSE 8090

CMD sh -c "/pb/pocketbase serve --http=0.0.0.0:${PORT:-8090} --dir=/pb_data/pb_data --publicDir=/pb_data/pb_public"
