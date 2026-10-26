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

func TestCheapHashingStillVerifiesAndRealHashesStillVerify(t *testing.T) {
	real, err := HashPassword("correct horse battery") // real parameters
	if err != nil {
		t.Fatal(err)
	}
	UseCheapHashingInTests()
	t.Cleanup(func() { argonMemory, argonTime = 19*1024, 2 })
	cheap, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	for _, h := range []string{real, cheap} {
		if !VerifyPassword("correct horse battery", h) || VerifyPassword("wrong horse battery", h) {
			t.Fatalf("hash does not verify: %s", h)
		}
	}
	if !strings.Contains(real, "m=19456,t=2") || !strings.Contains(cheap, "m=8,t=1") {
		t.Fatalf("hashes record their own parameters: %s / %s", real, cheap)
	}
}
