package calendar

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

type vectorDate struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	Day   int `json:"day"`
}

type vectors struct {
	Dates []struct {
		Gregorian string     `json:"gregorian"`
		Ethiopian vectorDate `json:"ethiopian"`
		Weekday   int        `json:"weekday"`
		Notes     []string   `json:"notes"`
	} `json:"dates"`
	Instants []struct {
		UTC       string     `json:"utc"`
		TimeZone  string     `json:"time_zone"`
		Ethiopian vectorDate `json:"ethiopian"`
		Gregorian string     `json:"gregorian"`
		Note      string     `json:"note"`
	} `json:"instants"`
	Shifts []struct {
		ShiftStartUTC string `json:"shift_start_utc"`
		EventUTC      string `json:"event_utc"`
		TimeZone      string `json:"time_zone"`
		ShiftDay      struct {
			Gregorian string     `json:"gregorian"`
			Ethiopian vectorDate `json:"ethiopian"`
		} `json:"shift_day"`
		Note string `json:"note"`
	} `json:"shifts"`
}

func load(t *testing.T) vectors {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	raw, err := os.ReadFile(filepath.Join(filepath.Dir(file), "..", "..", "..", "docs", "calendar-vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Dates) == 0 || len(v.Instants) == 0 || len(v.Shifts) == 0 {
		t.Fatal("vector file is missing cases")
	}
	return v
}

func parseDate(t *testing.T, s string) Gregorian {
	t.Helper()
	d, err := time.Parse(time.DateOnly, s)
	if err != nil {
		t.Fatal(err)
	}
	return Gregorian{d.Year(), d.Month(), d.Day()}
}

func eth(v vectorDate) Ethiopian { return Ethiopian{v.Year, v.Month, v.Day} }

func zone(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := LoadZone(name)
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func TestVectors_BothDirections(t *testing.T) {
	for _, c := range load(t).Dates {
		g, want := parseDate(t, c.Gregorian), eth(c.Ethiopian)
		if got := ToEthiopian(g); got != want {
			t.Errorf("%s (%v): ToEthiopian = %+v, want %+v", c.Gregorian, c.Notes, got, want)
		}
		back, err := ToGregorian(want)
		if err != nil || back != g {
			t.Errorf("%s (%v): ToGregorian(%+v) = %v, %v", c.Gregorian, c.Notes, want, back, err)
		}
		if got := Weekday(g); int(got) != c.Weekday {
			t.Errorf("%s: Weekday = %v, want %d", c.Gregorian, got, c.Weekday)
		}
	}
}

func TestVectors_TimeZone(t *testing.T) {
	for _, c := range load(t).Instants {
		at, err := time.Parse(time.RFC3339, c.UTC)
		if err != nil {
			t.Fatal(err)
		}
		loc := zone(t, c.TimeZone)
		if got := EthiopianAt(at, loc); got != eth(c.Ethiopian) {
			t.Errorf("%s in %s (%s): got %+v, want %+v", c.UTC, c.TimeZone, c.Note, got, c.Ethiopian)
		}
		if got := LocalDate(at, loc).String(); got != c.Gregorian {
			t.Errorf("%s in %s: local date %s, want %s", c.UTC, c.TimeZone, got, c.Gregorian)
		}
	}
}

func TestVectors_ShiftDay(t *testing.T) {
	for _, c := range load(t).Shifts {
		start, _ := time.Parse(time.RFC3339, c.ShiftStartUTC)
		event, _ := time.Parse(time.RFC3339, c.EventUTC)
		loc := zone(t, c.TimeZone)
		day := ShiftDay(start, loc)
		if day.String() != c.ShiftDay.Gregorian || ToEthiopian(day) != eth(c.ShiftDay.Ethiopian) {
			t.Errorf("%s: shift day %s / %+v, want %s / %+v", c.Note, day, ToEthiopian(day), c.ShiftDay.Gregorian, c.ShiftDay.Ethiopian)
		}
		if !event.After(start) {
			t.Errorf("%s: event must be inside the shift", c.Note)
		}
	}
}

func TestNightShiftBelongsToStartDay(t *testing.T) {
	loc := zone(t, "")
	start := time.Date(2026, 10, 19, 22, 0, 0, 0, loc) // night shift 22:00 to 06:00
	event := time.Date(2026, 10, 20, 3, 0, 0, 0, loc)  // logged after midnight
	if LocalDate(event, loc) == ShiftDay(start, loc) {
		t.Fatal("test setup: event should be on the next calendar day")
	}
	if got, want := ShiftDay(start, loc), (Gregorian{2026, time.October, 19}); got != want {
		t.Fatalf("ShiftDay = %v, want %v", got, want)
	}
}

func TestRoundTripEveryDay(t *testing.T) {
	for y := 1890; y <= 2110; y++ {
		for m := 1; m <= 13; m++ {
			for d := 1; d <= DaysInMonth(y, m); d++ {
				e := Ethiopian{y, m, d}
				g, err := ToGregorian(e)
				if err != nil {
					t.Fatal(err)
				}
				if got := ToEthiopian(g); got != e {
					t.Fatalf("round trip %+v -> %v -> %+v", e, g, got)
				}
			}
		}
	}
}

func TestInvalidDates(t *testing.T) {
	for _, e := range []Ethiopian{{2016, 13, 6}, {2015, 13, 7}, {2016, 0, 1}, {2016, 14, 1}, {2016, 1, 31}, {2016, 1, 0}} {
		if _, err := ToGregorian(e); err == nil {
			t.Errorf("%+v should be rejected", e)
		}
	}
}

func TestDefaultZone(t *testing.T) {
	if zone(t, "").String() != DefaultTimeZone {
		t.Fatal("empty setting must use Africa/Addis_Ababa")
	}
}
