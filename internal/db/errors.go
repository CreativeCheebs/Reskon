package db

import (
	"errors"
	"fmt"
)

// ErrNotFound is returned when a row does not exist (or is soft-deleted).
var ErrNotFound = errors.New("not found")

// InvalidError means the caller sent something the rules reject.
// The API turns it into 400.
type InvalidError struct{ Msg string }

func (e *InvalidError) Error() string { return e.Msg }

func invalid(format string, args ...any) error {
	return &InvalidError{Msg: fmt.Sprintf(format, args...)}
}

// ConflictError means the write cannot proceed as asked. The API turns it
// into 409 and sends Current (the row as it is now) when set.
type ConflictError struct {
	Msg     string
	Current any
}

func (e *ConflictError) Error() string { return e.Msg }
