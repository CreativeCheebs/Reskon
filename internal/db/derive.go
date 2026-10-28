package db

import (
	"context"
	"time"
)

// TaskDerived holds values computed on read from the transition log.
type TaskDerived struct{}

// derive fills the derived fields of tasks as of now.
func (d *DB) derive(ctx context.Context, tasks []*Task, now time.Time) error {
	return nil
}
