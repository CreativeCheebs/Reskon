package api

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"sync"
)

// staticFile is one embedded file, read and compressed once at startup.
type staticFile struct {
	body  []byte
	gz    []byte // nil when compression would not help
	ctype string
	etag  string
}

// spa serves the embedded frontend, falling back to index.html for any path
// that is not a file, so client-side navigation survives a reload.
//
// Files under assets/ have content hashes in their names (Vite), so they are
// cached for a year and never revalidated. index.html must always be checked,
// so it goes out with no-cache and an ETag; a reload then costs a 304.
func spa(web fs.FS) http.Handler {
	files := map[string]*staticFile{}
	_ = fs.WalkDir(web, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		body, err := fs.ReadFile(web, p)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(body)
		f := &staticFile{body: body, ctype: mime.TypeByExtension(path.Ext(p)), etag: `"` + hex.EncodeToString(sum[:8]) + `"`}
		if f.ctype == "" {
			f.ctype = http.DetectContentType(body)
		}
		if compressible(f.ctype) && len(body) > 1024 {
			var buf bytes.Buffer
			zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
			_, _ = zw.Write(body) // writing to a buffer cannot fail
			_ = zw.Close()
			if buf.Len() < len(body) {
				f.gz = buf.Bytes()
			}
		}
		files[p] = f
		return nil
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		f, ok := files[p]
		if !ok {
			p, f = "index.html", files["index.html"]
		}
		if f == nil {
			http.NotFound(w, r)
			return
		}
		h := w.Header()
		h.Set("Content-Type", f.ctype)
		h.Set("ETag", f.etag)
		h.Add("Vary", "Accept-Encoding")
		if strings.HasPrefix(p, "assets/") {
			h.Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			h.Set("Cache-Control", "no-cache")
		}
		if r.Header.Get("If-None-Match") == f.etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		body := f.body
		if f.gz != nil && acceptsGzip(r) {
			h.Set("Content-Encoding", "gzip")
			body = f.gz
		}
		if r.Method == http.MethodHead {
			return
		}
		w.Write(body)
	})
}

func compressible(ctype string) bool {
	return strings.HasPrefix(ctype, "text/") || strings.Contains(ctype, "javascript") ||
		strings.Contains(ctype, "json") || strings.Contains(ctype, "svg")
}

func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		if strings.TrimSpace(strings.SplitN(part, ";", 2)[0]) == "gzip" {
			return true
		}
	}
	return false
}

// gzipJSON compresses API responses for clients that accept it. The task
// list for a big board is a few hundred KB of repetitive JSON; gzip makes it
// a tenth of that. BestSpeed keeps the cost well under a millisecond.
type gzipJSON struct {
	http.ResponseWriter
	zw      *gzip.Writer
	decided bool
}

var gzipPool = sync.Pool{New: func() any { zw, _ := gzip.NewWriterLevel(nil, gzip.BestSpeed); return zw }}

func (g *gzipJSON) WriteHeader(code int) {
	if !g.decided {
		g.decided = true
		h := g.Header()
		h.Add("Vary", "Accept-Encoding")
		if code != http.StatusNoContent && code != http.StatusNotModified && strings.HasPrefix(h.Get("Content-Type"), "application/json") {
			h.Set("Content-Encoding", "gzip")
			h.Del("Content-Length")
			g.zw = gzipPool.Get().(*gzip.Writer)
			g.zw.Reset(g.ResponseWriter)
		}
	}
	g.ResponseWriter.WriteHeader(code)
}

func (g *gzipJSON) Write(b []byte) (int, error) {
	if !g.decided {
		g.WriteHeader(http.StatusOK)
	}
	if g.zw != nil {
		return g.zw.Write(b)
	}
	return g.ResponseWriter.Write(b)
}

func (g *gzipJSON) close() {
	if g.zw != nil {
		_ = g.zw.Close()
		gzipPool.Put(g.zw)
	}
}
