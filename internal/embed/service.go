package embed

import (
	"context"
	"log"
	"sync"
	"time"
)

// Service holds the one model the server shares between everyone (it
// holds no one's data). It loads the model on first use when the files
// are present, and can fetch them once. Until then search runs on word
// matching alone; nothing waits on the model.
type Service struct {
	dir string

	mu    sync.Mutex
	model *Model
	state string // "missing", "downloading", "ready", "error"
	err   string
}

// Status is what Settings shows about the model.
type Status struct {
	Model string `json:"model"`
	State string `json:"state"`
	Error string `json:"error,omitempty"`
	Size  int    `json:"download_bytes"`
}

func NewService(dir string) *Service { return &Service{dir: dir, state: "missing"} }

// Model returns the loaded model, loading it if its files are on disk, or
// nil while there is none.
func (s *Service) Model() *Model {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.model != nil || s.state == "downloading" {
		return s.model
	}
	if !Present(s.dir) {
		s.state = "missing"
		return nil
	}
	start := time.Now()
	m, err := Load(s.dir)
	if err != nil {
		s.state, s.err = "error", err.Error()
		return nil
	}
	log.Printf("semantic search: loaded %s in %v", ModelName, time.Since(start).Round(time.Millisecond))
	s.model, s.state, s.err = m, "ready", ""
	return m
}

func (s *Service) Status() Status {
	s.Model() // picks up files put there by hand
	s.mu.Lock()
	defer s.mu.Unlock()
	return Status{Model: ModelName, State: s.state, Error: s.err, Size: DownloadSize}
}

// StartDownload fetches the model in the background. A second call while
// one runs does nothing.
func (s *Service) StartDownload() {
	s.mu.Lock()
	if s.state == "downloading" || s.model != nil {
		s.mu.Unlock()
		return
	}
	s.state, s.err = "downloading", ""
	s.mu.Unlock()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()
		err := Download(ctx, s.dir)
		s.mu.Lock()
		if err != nil {
			s.state, s.err = "error", err.Error()
			s.mu.Unlock()
			log.Printf("semantic search: %v", err)
			return
		}
		s.state = "missing" // Model() loads it next
		s.mu.Unlock()
		s.Model()
	}()
}
