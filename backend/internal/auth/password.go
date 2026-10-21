package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"
	"testing"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters (OWASP minimum profile: 19 MiB, 2 passes, 1 lane).
var (
	argonMemory  uint32 = 19 * 1024
	argonTime    uint32 = 2
	argonThreads uint8  = 1
)

const (
	argonKeyLen = 32
	saltLen     = 16
)

// UseCheapHashingInTests makes new password hashes cheap so test suites stay fast. It panics
// outside a test binary, so it can never weaken the real server. Hashes record their own
// parameters, so cheap and real hashes both verify.
func UseCheapHashingInTests() {
	if !testing.Testing() {
		panic("auth: UseCheapHashingInTests called outside a test")
	}
	argonMemory, argonTime = 8, 1
}

const MinPasswordLength = 10

// HashPassword returns a PHC-format Argon2id hash with a random salt.
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// VerifyPassword checks a password against a hash in constant time.
func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var version, memory, time, threads int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, uint32(time), uint32(memory), uint8(threads), uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}
