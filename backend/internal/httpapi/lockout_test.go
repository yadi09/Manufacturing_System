package httpapi_test

import (
	"context"
	"strconv"
	"testing"
)

func failN(e env, email string, n int) {
	for i := 0; i < n; i++ {
		login(e, email, "wrong password!!")
	}
}

func countAudit(t *testing.T, e env, action string) int {
	t.Helper()
	var n int
	if err := e.pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_log WHERE action = $1`, action).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// The audit log is append-only; tests move time by briefly disabling its trigger.
func ageFailures(t *testing.T, e env, minutes int) {
	t.Helper()
	ctx := context.Background()
	for _, sql := range []string{
		`ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only`,
		`UPDATE audit_log SET at = at - make_interval(mins => ` + strconv.Itoa(minutes) + `)`,
		`ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only`,
	} {
		if _, err := e.pool.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
}

func TestLockout_AfterFiveFailures(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "a@crown.example", "cashier")
	failN(e, "a@crown.example", 5)

	rec := login(e, "a@crown.example", pw) // correct password, but locked
	if rec.Code != 429 || rec.Body.String() != "{\"error\":\"too_many_attempts\"}\n" {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	secs, err := strconv.Atoi(rec.Header().Get("Retry-After"))
	if err != nil || secs < 1 || secs > 15*60+1 {
		t.Fatalf("Retry-After = %q", rec.Header().Get("Retry-After"))
	}
	if n := countAudit(t, e, "login_failed"); n != 5 {
		t.Fatalf("attempts while locked must not be recorded, failed rows = %d", n)
	}
	if len(rec.Result().Cookies()) != 0 {
		t.Fatal("no session while locked")
	}
}

func TestLockout_UnknownEmailBehavesTheSame(t *testing.T) {
	e := setup(t)
	failN(e, "ghost@crown.example", 5)
	if rec := login(e, "ghost@crown.example", pw); rec.Code != 429 {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestLockout_OtherAccountsUnaffected(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "a@crown.example", "cashier")
	e.mustUser(t, "b@crown.example", "cashier")
	failN(e, "a@crown.example", 5)
	if rec := login(e, "b@crown.example", pw); rec.Code != 200 {
		t.Fatalf("b = %d", rec.Code)
	}
}

func TestLockout_LiftsAfterWindow(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "a@crown.example", "cashier")
	failN(e, "a@crown.example", 5)
	ageFailures(t, e, 16)
	if rec := login(e, "a@crown.example", pw); rec.Code != 200 {
		t.Fatalf("after the window: %d %s", rec.Code, rec.Body)
	}
}

func TestLockout_SuccessResetsTheCount(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "a@crown.example", "cashier")
	failN(e, "a@crown.example", 4)
	if rec := login(e, "a@crown.example", pw); rec.Code != 200 {
		t.Fatal(rec.Code)
	}
	failN(e, "a@crown.example", 4)
	if rec := login(e, "a@crown.example", pw); rec.Code != 200 {
		t.Fatalf("4+success+4 must not lock: %d", rec.Code)
	}
}

func TestLockout_ThresholdIsASetting(t *testing.T) {
	e := setup(t)
	e.mustUser(t, "a@crown.example", "cashier")
	if _, err := e.pool.Exec(context.Background(), `UPDATE settings SET value = '2' WHERE key = 'login_max_attempts'`); err != nil {
		t.Fatal(err)
	}
	failN(e, "a@crown.example", 2)
	if rec := login(e, "a@crown.example", pw); rec.Code != 429 {
		t.Fatalf("got %d", rec.Code)
	}
}
