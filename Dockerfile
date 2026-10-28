# Build the frontend, embed it in a static Go binary, ship the binary alone.

FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
# Pure Go SQLite: no cgo, no libc dependency.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /jitterbug ./cmd/jitterbug

FROM alpine:3.22
RUN apk add --no-cache tzdata && adduser -D -u 10001 jitterbug && mkdir /data && chown jitterbug /data
COPY --from=build /jitterbug /usr/local/bin/jitterbug
USER jitterbug
ENV JITTERBUG_DB=/data/jitterbug.db \
    JITTERBUG_ADDR=:8080
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["jitterbug"]
