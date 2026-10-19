// Package calendar converts between the Gregorian and Ethiopian calendars for
// display. The database always stores UTC; nothing here changes stored values.
//
// The TypeScript twin lives in frontend/src/lib/calendar. Both are tested
// against docs/calendar-vectors.json, generated from ICU, so they cannot drift.
package calendar

import (
	"fmt"
	"time"
	_ "time/tzdata" // the server must not depend on the host's zone files
)

// DefaultTimeZone is used when the time zone setting is empty.
const DefaultTimeZone = "Africa/Addis_Ababa"

// Julian day number of Meskerem 1, year 1 (Amete Mihret era).
const ethiopianEpoch = 1724221

// Ethiopian is a date in the Ethiopian calendar. Month 1 is Meskerem, 13 is Pagume.
type Ethiopian struct {
	Year, Month, Day int
}

// Gregorian is a civil date in the proleptic Gregorian calendar.
type Gregorian struct {
	Year  int
	Month time.Month
	Day   int
}

func (g Gregorian) String() string { return fmt.Sprintf("%04d-%02d-%02d", g.Year, g.Month, g.Day) }

// IsLeapYear reports whether Pagume has 6 days in Ethiopian year y.
func IsLeapYear(y int) bool { return mod(y, 4) == 3 }

// DaysInMonth returns the number of days in Ethiopian month m of year y.
func DaysInMonth(y, m int) int {
	if m < 13 {
		return 30
	}
	if IsLeapYear(y) {
		return 6
	}
	return 5
}

// Valid reports whether e is a real Ethiopian date.
func (e Ethiopian) Valid() bool {
	return e.Month >= 1 && e.Month <= 13 && e.Day >= 1 && e.Day <= DaysInMonth(e.Year, e.Month)
}

// ToEthiopian converts a Gregorian date.
func ToEthiopian(g Gregorian) Ethiopian { return fromJDN(gregorianJDN(g)) }

// ToGregorian converts an Ethiopian date, rejecting dates that do not exist.
func ToGregorian(e Ethiopian) (Gregorian, error) {
	if !e.Valid() {
		return Gregorian{}, fmt.Errorf("calendar: invalid Ethiopian date %d-%02d-%02d", e.Year, e.Month, e.Day)
	}
	return gregorianFromJDN(ethiopianJDN(e)), nil
}

// Weekday returns the day of the week of a Gregorian date.
func Weekday(g Gregorian) time.Weekday { return time.Weekday(mod(gregorianJDN(g)+1, 7)) }

// LoadZone loads the display time zone setting; an empty name means DefaultTimeZone.
func LoadZone(name string) (*time.Location, error) {
	if name == "" {
		name = DefaultTimeZone
	}
	return time.LoadLocation(name)
}

// LocalDate returns the Gregorian date of instant t in loc.
func LocalDate(t time.Time, loc *time.Location) Gregorian {
	y, m, d := t.In(loc).Date()
	return Gregorian{y, m, d}
}

// EthiopianAt returns the Ethiopian date of instant t in loc.
func EthiopianAt(t time.Time, loc *time.Location) Ethiopian { return ToEthiopian(LocalDate(t, loc)) }

// ShiftDay returns the local day a shift belongs to: the day it started, even
// when it crosses midnight. Every event in the shift uses this day.
func ShiftDay(shiftStart time.Time, loc *time.Location) Gregorian { return LocalDate(shiftStart, loc) }

func ethiopianJDN(e Ethiopian) int {
	return ethiopianEpoch + 365*(e.Year-1) + div(e.Year, 4) + 30*(e.Month-1) + e.Day - 1
}

// Reingold and Dershowitz, Calendrical Calculations (coptic-from-fixed).
func fromJDN(jdn int) Ethiopian {
	y := div(4*(jdn-ethiopianEpoch)+1463, 1461)
	m := div(jdn-ethiopianJDN(Ethiopian{y, 1, 1}), 30) + 1
	return Ethiopian{Year: y, Month: m, Day: jdn - ethiopianJDN(Ethiopian{y, m, 1}) + 1}
}

// Fliegel and Van Flandern, proleptic Gregorian.
func gregorianJDN(g Gregorian) int {
	a := div(14-int(g.Month), 12)
	y := g.Year + 4800 - a
	m := int(g.Month) + 12*a - 3
	return g.Day + div(153*m+2, 5) + 365*y + div(y, 4) - div(y, 100) + div(y, 400) - 32045
}

func gregorianFromJDN(jdn int) Gregorian {
	a := jdn + 32044
	b := div(4*a+3, 146097)
	c := a - div(146097*b, 4)
	d := div(4*c+3, 1461)
	e := c - div(1461*d, 4)
	m := div(5*e+2, 153)
	return Gregorian{
		Year:  100*b + d - 4800 + div(m, 10),
		Month: time.Month(m + 3 - 12*div(m, 10)),
		Day:   e - div(153*m+2, 5) + 1,
	}
}

// Floor division and modulo, so dates before the epochs stay correct.
func div(a, b int) int {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

func mod(a, b int) int { return a - b*div(a, b) }
