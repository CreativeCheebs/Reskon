package db

import (
	"context"
	"math"
	"testing"
)

func fp(x float64) *float64 { return &x }

func TestMidpoint(t *testing.T) {
	cases := []struct {
		before, after *float64
		want          float64
		ok            bool
	}{
		{fp(1), fp(2), 1.5, true},
		{fp(1), nil, 2, true},
		{nil, fp(1), 0, true},
		{nil, nil, 1, true},
		{fp(1), fp(1 + 1.5e-6), 0, false}, // new card would sit 7.5e-7 from each
		{fp(1), fp(1 + 4e-6), 1 + 2e-6, true},
	}
	for _, c := range cases {
		got, ok := midpoint(c.before, c.after)
		if ok != c.ok || (ok && math.Abs(got-c.want) > 1e-12) {
			t.Errorf("midpoint(%v,%v) = %v,%v want %v,%v", c.before, c.after, got, ok, c.want, c.ok)
		}
	}
}

func idp(n int64) *int64 { return &n }

func TestMoveRenormalisesWhenGapTooSmall(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	x := mustTask(t, d, a.ID, "x") // pos 1
	y := mustTask(t, d, a.ID, "y") // pos 2
	z := mustTask(t, d, a.ID, "z") // pos 3
	const todo = 2

	// Repeatedly drop z between x and y until the gap collapses. Each drop
	// halves the gap; after ~20 drops it is below 1e-6 and must renormalise.
	for i := 0; i < 30; i++ {
		if _, err := d.Move(ctx, z.ID, MoveRequest{StatusID: todo, BeforeID: idp(x.ID), AfterID: idp(y.ID)}); err != nil {
			t.Fatal(err)
		}
		// Move y back between x and z: order is x, y, z again, gap halved.
		if _, err := d.Move(ctx, y.ID, MoveRequest{StatusID: todo, BeforeID: idp(x.ID), AfterID: idp(z.ID)}); err != nil {
			t.Fatal(err)
		}
	}
	tasks, _ := d.ListTasks(ctx)
	for i := 1; i < len(tasks); i++ {
		if tasks[i].BoardPos-tasks[i-1].BoardPos < renormaliseGap {
			t.Errorf("neighbours %v and %v closer than threshold", tasks[i-1].BoardPos, tasks[i].BoardPos)
		}
	}
	if tasks[0].ID != x.ID {
		t.Errorf("x should still be first")
	}
}

func TestMoveReportsRenumbering(t *testing.T) {
	d := openTest(t)
	ctx := context.Background()
	a := mustArea(t, d, "Personal", "PER")
	x := mustTask(t, d, a.ID, "x")
	y := mustTask(t, d, a.ID, "y")
	z := mustTask(t, d, a.ID, "z")
	const todo = 2
	renumbered := 0
	for i := 0; i < 30; i++ {
		_, r1, err := d.MoveReporting(ctx, z.ID, MoveRequest{StatusID: todo, BeforeID: idp(x.ID), AfterID: idp(y.ID)})
		if err != nil {
			t.Fatal(err)
		}
		_, r2, err := d.MoveReporting(ctx, y.ID, MoveRequest{StatusID: todo, BeforeID: idp(x.ID), AfterID: idp(z.ID)})
		if err != nil {
			t.Fatal(err)
		}
		if r1 {
			renumbered++
		}
		if r2 {
			renumbered++
		}
	}
	// Each drop halves the gap; it collapses about every 20 drops.
	if renumbered < 1 || renumbered > 4 {
		t.Errorf("renumbered %d times in 60 drops, want a few", renumbered)
	}
	if _, r, _ := d.MoveReporting(ctx, x.ID, MoveRequest{StatusID: 3}); r {
		t.Error("a move to the end of a column reported renumbering")
	}
}
