package api

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestStaticCachingAndGzip(t *testing.T) {
	js := strings.Repeat("console.log('jitterbug');\n", 200)
	web := fstest.MapFS{
		"index.html":        {Data: []byte("<!doctype html><script src=/assets/app-abc.js></script>")},
		"assets/app-abc.js": {Data: []byte(js)},
	}
	srv := httptest.NewServer(spa(web))
	defer srv.Close()
	get := func(path string, hdr map[string]string) *http.Response {
		req, _ := http.NewRequest("GET", srv.URL+path, nil)
		req.Header.Set("Accept-Encoding", "identity") // stop the transport adding gzip and decoding it for us
		for k, v := range hdr {
			req.Header.Set(k, v)
		}
		res, err := http.DefaultTransport.RoundTrip(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { res.Body.Close() })
		return res
	}

	res := get("/assets/app-abc.js", map[string]string{"Accept-Encoding": "gzip, br"})
	if res.Header.Get("Content-Encoding") != "gzip" || !strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("asset headers: %v", res.Header)
	}
	zr, err := gzip.NewReader(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := io.ReadAll(zr); string(b) != js {
		t.Fatal("gzipped asset does not round-trip")
	}

	if res := get("/assets/app-abc.js", nil); res.Header.Get("Content-Encoding") != "" {
		t.Fatal("gzip sent to a client that did not ask for it")
	}

	res = get("/view/3", nil) // client-side route falls back to index.html
	etag := res.Header.Get("ETag")
	if res.StatusCode != 200 || res.Header.Get("Cache-Control") != "no-cache" || etag == "" {
		t.Fatalf("index: %d %v", res.StatusCode, res.Header)
	}
	if res := get("/", map[string]string{"If-None-Match": etag}); res.StatusCode != http.StatusNotModified {
		t.Fatalf("revalidation: got %d, want 304", res.StatusCode)
	}
}

func TestAPIResponsesGzipped(t *testing.T) {
	srv := newServer(t)
	req, _ := http.NewRequest("GET", srv.URL+"/api/health", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	res, err := http.DefaultTransport.RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.Header.Get("Content-Encoding") != "gzip" {
		t.Fatalf("health not gzipped: %v", res.Header)
	}
	zr, err := gzip.NewReader(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := io.ReadAll(zr); !strings.Contains(string(b), `"ok":true`) {
		t.Fatalf("body %q", b)
	}
}
