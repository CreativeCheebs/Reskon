# make build   frontend + single binary (./jitterbug)
# make test    format check, vet, Go tests (server and phone core), web lint/types/tests
# make check   test + race tests + vulnerability scan (needs a C compiler; run on Linux)
# make run     build and run on :8080 with ./jitterbug.db
# make docker  container image "jitterbug"

GO ?= go

.PHONY: build web test check lint race vuln run docker clean

build: web
	CGO_ENABLED=0 $(GO) build -trimpath -o jitterbug ./cmd/jitterbug

web:
	cd web && npm ci && npm run build

test:
	@bad="$$(gofmt -l $$(git ls-files '*.go'))"; test -z "$$bad" || { echo "gofmt needed:"; echo "$$bad"; exit 1; }
	$(GO) vet ./...
	$(GO) test ./...
	cd mobile && $(GO) vet ./... && $(GO) test ./...
	cd web && npx tsc -b && npm run lint && npm test

lint:
	$(GO) run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 run ./...
	cd mobile && $(GO) run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 run ./...

# -race needs cgo and a C compiler, so it is not part of `make test`.
race:
	CGO_ENABLED=1 $(GO) test -race ./...
	cd mobile && CGO_ENABLED=1 $(GO) test -race ./...

vuln:
	$(GO) run golang.org/x/vuln/cmd/govulncheck@latest ./...
	cd mobile && $(GO) run golang.org/x/vuln/cmd/govulncheck@latest ./...

check: test lint race vuln

docker:
	docker build -t jitterbug .

clean:
	rm -f jitterbug
	find web/dist -mindepth 1 ! -name .gitkeep -delete
