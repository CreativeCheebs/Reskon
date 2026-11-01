// Package embed turns short texts (task titles) into meaning vectors with a
// small sentence-transformer, all-MiniLM-L6-v2, run in pure Go: no cgo, no
// separate service, no network once the model files are on disk. Similar
// meanings give vectors with a high cosine similarity.
//
// The model is a 6-layer BERT (384 wide, 12 heads). Load reads it from a
// folder holding vocab.txt and model.safetensors (see Download).
package embed

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"sync"
)

const (
	dim       = 384
	heads     = 12
	headDim   = dim / heads
	inner     = 1536
	numLayers = 6
	lnEps     = 1e-12
	// MaxTokens caps a text's length. Titles are far shorter.
	MaxTokens = 128
)

// ModelName names the model, stored beside each cached vector so a change
// of model re-embeds everything.
const ModelName = "all-MiniLM-L6-v2"

// Dim is the length of every vector.
const Dim = dim

type linear struct {
	w       []float32 // out rows of in weights
	b       []float32
	in, out int
}

type norm struct{ w, b []float32 }

type layer struct {
	q, k, v, o linear
	attnNorm   norm
	up, down   linear
	outNorm    norm
}

// Model is a loaded embedding model. Safe for concurrent use.
type Model struct {
	tok            *tokenizer
	word, pos, typ []float32
	embNorm        norm
	layers         []layer
}

// Load reads the model from dir.
func Load(dir string) (*Model, error) {
	tok, err := loadTokenizer(filepath.Join(dir, "vocab.txt"))
	if err != nil {
		return nil, err
	}
	t, err := readSafetensors(filepath.Join(dir, "model.safetensors"))
	if err != nil {
		return nil, err
	}
	get := func(name string, n int) ([]float32, error) {
		v, ok := t[name]
		if !ok {
			return nil, fmt.Errorf("model: missing %s", name)
		}
		if len(v) != n {
			return nil, fmt.Errorf("model: %s has %d values, want %d", name, len(v), n)
		}
		return v, nil
	}
	var firstErr error
	must := func(name string, n int) []float32 {
		v, err := get(name, n)
		if err != nil && firstErr == nil {
			firstErr = err
		}
		return v
	}
	lin := func(p string, in, out int) linear {
		return linear{w: must(p+".weight", in*out), b: must(p+".bias", out), in: in, out: out}
	}
	nrm := func(p string) norm { return norm{w: must(p+".weight", dim), b: must(p+".bias", dim)} }

	m := &Model{
		tok:     tok,
		word:    must("embeddings.word_embeddings.weight", len(tok.vocab)*dim),
		pos:     must("embeddings.position_embeddings.weight", 512*dim),
		typ:     must("embeddings.token_type_embeddings.weight", 2*dim),
		embNorm: nrm("embeddings.LayerNorm"),
	}
	for i := 0; i < numLayers; i++ {
		p := fmt.Sprintf("encoder.layer.%d.", i)
		m.layers = append(m.layers, layer{
			q:        lin(p+"attention.self.query", dim, dim),
			k:        lin(p+"attention.self.key", dim, dim),
			v:        lin(p+"attention.self.value", dim, dim),
			o:        lin(p+"attention.output.dense", dim, dim),
			attnNorm: nrm(p + "attention.output.LayerNorm"),
			up:       lin(p+"intermediate.dense", dim, inner),
			down:     lin(p+"output.dense", inner, dim),
			outNorm:  nrm(p + "output.LayerNorm"),
		})
	}
	return m, firstErr
}

// Embed returns text's unit-length vector: the mean of the last layer over
// every token, then normalised, as sentence-transformers does.
func (m *Model) Embed(text string) []float32 {
	ids := m.tok.encode(text, MaxTokens)
	n := len(ids)
	x := make([]float32, n*dim)
	for t, id := range ids {
		row := x[t*dim : (t+1)*dim]
		w := m.word[int(id)*dim:]
		p := m.pos[t*dim:]
		for i := range row {
			row[i] = w[i] + p[i] + m.typ[i]
		}
	}
	m.embNorm.apply(x, n)

	q, k, v := make([]float32, n*dim), make([]float32, n*dim), make([]float32, n*dim)
	ctx, tmp := make([]float32, n*dim), make([]float32, n*dim)
	up := make([]float32, n*inner)
	scores := make([]float32, n)
	scale := float32(1 / math.Sqrt(headDim))
	for _, l := range m.layers {
		l.q.apply(x, q, n)
		l.k.apply(x, k, n)
		l.v.apply(x, v, n)
		for h := 0; h < heads; h++ {
			off := h * headDim
			for i := 0; i < n; i++ {
				qi := q[i*dim+off : i*dim+off+headDim]
				maxS := float32(math.Inf(-1))
				for j := 0; j < n; j++ {
					s := dot(qi, k[j*dim+off:j*dim+off+headDim]) * scale
					scores[j] = s
					if s > maxS {
						maxS = s
					}
				}
				var sum float32
				for j := 0; j < n; j++ {
					scores[j] = float32(math.Exp(float64(scores[j] - maxS)))
					sum += scores[j]
				}
				out := ctx[i*dim+off : i*dim+off+headDim]
				for d := range out {
					out[d] = 0
				}
				for j := 0; j < n; j++ {
					p := scores[j] / sum
					vj := v[j*dim+off : j*dim+off+headDim]
					for d := range out {
						out[d] += p * vj[d]
					}
				}
			}
		}
		l.o.apply(ctx, tmp, n)
		addInto(x, tmp)
		l.attnNorm.apply(x, n)
		l.up.apply(x, up, n)
		for i, u := range up {
			up[i] = gelu(u)
		}
		l.down.apply(up, tmp, n)
		addInto(x, tmp)
		l.outNorm.apply(x, n)
	}

	out := make([]float32, dim)
	for t := 0; t < n; t++ {
		addInto(out, x[t*dim:(t+1)*dim])
	}
	var ss float64
	for i := range out {
		out[i] /= float32(n)
		ss += float64(out[i]) * float64(out[i])
	}
	if ss > 0 {
		inv := float32(1 / math.Sqrt(ss))
		for i := range out {
			out[i] *= inv
		}
	}
	return out
}

// apply computes y = x·Wᵀ + b for n rows, split over the CPU's cores when
// there is enough work to be worth it.
func (l linear) apply(x, y []float32, n int) {
	rows := func(from, to int) {
		for t := 0; t < n; t++ {
			xt := x[t*l.in : (t+1)*l.in]
			yt := y[t*l.out : (t+1)*l.out]
			for j := from; j < to; j++ {
				yt[j] = dot(l.w[j*l.in:(j+1)*l.in], xt) + l.b[j]
			}
		}
	}
	workers := runtime.GOMAXPROCS(0)
	if workers < 2 || n*l.in*l.out < 1<<20 {
		rows(0, l.out)
		return
	}
	var wg sync.WaitGroup
	step := (l.out + workers - 1) / workers
	for from := 0; from < l.out; from += step {
		to := min(from+step, l.out)
		wg.Add(1)
		go func(from, to int) {
			defer wg.Done()
			rows(from, to)
		}(from, to)
	}
	wg.Wait()
}

func (nm norm) apply(x []float32, n int) {
	for t := 0; t < n; t++ {
		row := x[t*dim : (t+1)*dim]
		var mean, vr float64
		for _, v := range row {
			mean += float64(v)
		}
		mean /= dim
		for _, v := range row {
			d := float64(v) - mean
			vr += d * d
		}
		inv := 1 / math.Sqrt(vr/dim+lnEps)
		for i, v := range row {
			row[i] = float32((float64(v)-mean)*inv)*nm.w[i] + nm.b[i]
		}
	}
}

func gelu(x float32) float32 {
	return float32(0.5 * float64(x) * (1 + math.Erf(float64(x)/math.Sqrt2)))
}

func dot(a, b []float32) float32 {
	b = b[:len(a)]
	var s0, s1, s2, s3 float32
	i := 0
	for ; i+4 <= len(a); i += 4 {
		s0 += a[i] * b[i]
		s1 += a[i+1] * b[i+1]
		s2 += a[i+2] * b[i+2]
		s3 += a[i+3] * b[i+3]
	}
	for ; i < len(a); i++ {
		s0 += a[i] * b[i]
	}
	return s0 + s1 + s2 + s3
}

func addInto(dst, src []float32) {
	src = src[:len(dst)]
	for i := range dst {
		dst[i] += src[i]
	}
}

// Cosine of two unit vectors (their dot product).
func Cosine(a, b []float32) float32 { return dot(a, b) }

// readSafetensors reads every F32 tensor of a .safetensors file.
func readSafetensors(path string) (map[string][]float32, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var n uint64
	if err := binary.Read(f, binary.LittleEndian, &n); err != nil {
		return nil, err
	}
	if n > 10<<20 {
		return nil, fmt.Errorf("model: header too large")
	}
	head := make([]byte, n)
	if _, err := io.ReadFull(f, head); err != nil {
		return nil, err
	}
	var meta map[string]json.RawMessage
	if err := json.Unmarshal(head, &meta); err != nil {
		return nil, fmt.Errorf("model: %v", err)
	}
	data, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}
	out := map[string][]float32{}
	for name, raw := range meta {
		var t struct {
			Dtype   string `json:"dtype"`
			Offsets [2]int `json:"data_offsets"`
		}
		if name == "__metadata__" || json.Unmarshal(raw, &t) != nil || t.Dtype != "F32" {
			continue
		}
		if t.Offsets[0] < 0 || t.Offsets[1] > len(data) || t.Offsets[0] > t.Offsets[1] {
			return nil, fmt.Errorf("model: %s is out of range", name)
		}
		b := data[t.Offsets[0]:t.Offsets[1]]
		v := make([]float32, len(b)/4)
		for i := range v {
			v[i] = math.Float32frombits(binary.LittleEndian.Uint32(b[i*4:]))
		}
		out[name] = v
	}
	return out, nil
}
