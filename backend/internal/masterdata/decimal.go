package masterdata

import (
	"math/big"
	"regexp"
	"strings"
)

var decimalRE = regexp.MustCompile(`^(\d{1,9})(\.(\d{1,6}))?$`)

// parseDecimal accepts a plain positive decimal with at most maxDecimals places and returns it
// normalised. Quantities are exact decimals, never floating-point numbers.
func parseDecimal(s string, maxDecimals int) (string, *big.Rat, bool) {
	s = strings.TrimSpace(s)
	m := decimalRE.FindStringSubmatch(s)
	if m == nil || len(m[3]) > maxDecimals {
		return "", nil, false
	}
	r, ok := new(big.Rat).SetString(s)
	if !ok || r.Sign() <= 0 {
		return "", nil, false
	}
	return s, r, true
}

// optionalPct parses an optional percentage in (0, 100]. Empty or nil means "not set".
func optionalPct(s *string) (*string, *big.Rat, bool) {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil, nil, true
	}
	v, r, ok := parseDecimal(*s, 2)
	if !ok || r.Cmp(big.NewRat(100, 1)) > 0 {
		return nil, nil, false
	}
	return &v, r, true
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
