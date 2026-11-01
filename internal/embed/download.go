package embed

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// The model files, pinned to one revision of the Hugging Face repository
// and checked by SHA-256, so a download is always the model this code was
// verified against (to 1e-7 of the onnxruntime reference). Apache-2.0.
const revision = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"

var files = []struct{ name, sha256 string }{
	{"vocab.txt", "07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3"},
	{"model.safetensors", "53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db"},
}

// DownloadSize is roughly how much Download fetches, for the UI.
const DownloadSize = 91 << 20

// Present reports whether dir holds the model files.
func Present(dir string) bool {
	for _, f := range files {
		if st, err := os.Stat(filepath.Join(dir, f.name)); err != nil || st.Size() == 0 {
			return false
		}
	}
	return true
}

// Download fetches the model into dir, once. Each file is written to a
// temporary name, checked, then renamed, so a cut-off download never
// looks complete.
func Download(ctx context.Context, dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for _, f := range files {
		dst := filepath.Join(dir, f.name)
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		url := fmt.Sprintf("https://huggingface.co/sentence-transformers/%s/resolve/%s/%s", ModelName, revision, f.name)
		if err := fetch(ctx, url, dst, f.sha256); err != nil {
			return fmt.Errorf("download %s: %w", f.name, err)
		}
	}
	return nil
}

func fetch(ctx context.Context, url, dst, want string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s", resp.Status)
	}
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".part-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	h := sha256.New()
	if _, err := io.Copy(io.MultiWriter(tmp, h), resp.Body); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != want {
		return fmt.Errorf("checksum %s, want %s", got, want)
	}
	return os.Rename(tmp.Name(), dst)
}
