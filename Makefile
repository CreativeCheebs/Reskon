# make build   frontend + single binary (./jitterbug)
# make test    Go tests (the arithmetic and derivations)
# make run     build and run on :8080 with ./jitterbug.db
# make docker  container image "jitterbug"

GO ?= go

.PHONY: build web test run docker clean

build: web
	CGO_ENABLED=0 $(GO) build -trimpath -o jitterbug ./cmd/jitterbug

web:
	cd web && npm ci && npm run build

test:
	$(GO) vet ./...
	$(GO) test ./...
	cd web && npx tsc -b

run: build
	./jitterbug

docker:
	docker build -t jitterbug .

clean:
	rm -f jitterbug
	find web/dist -mindepth 1 ! -name .gitkeep -delete
