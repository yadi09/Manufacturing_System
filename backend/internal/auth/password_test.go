package auth

import (
	"strings"
	"testing"
)

func TestPasswordHashAndVerify(t *testing.T) {
	h, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$") {
		t.Fatalf("unexpected format %q", h)
	}
	if !VerifyPassword("correct horse battery", h) {
		t.Fatal("right password rejected")
	}
	if VerifyPassword("wrong password!!", h) {
		t.Fatal("wrong password accepted")
	}
	h2, _ := HashPassword("correct horse battery")
	if h == h2 {
		t.Fatal("hashes must be salted")
	}
}

func TestVerifyRejectsMalformedHashes(t *testing.T) {
	for _, h := range []string{"", "plain", "$argon2id$v=19$m=1,t=1,p=1$bad", "$bcrypt$v=19$m=1,t=1,p=1$AAAA$AAAA"} {
		if VerifyPassword("x", h) {
			t.Errorf("accepted %q", h)
		}
	}
}
