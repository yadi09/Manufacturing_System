// Command createuser adds a user from the terminal, for the first administrator
// and for support. The password is read from stdin (or typed hidden on a terminal),
// never from arguments, so it stays out of shell history.
//
//	go run ./cmd/createuser -email admin@crown.example -name "Admin" -roles admin
package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/term"

	"github.com/yadi09/Manufacturing_System/backend/internal/auth"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	email := flag.String("email", "", "user email (required)")
	name := flag.String("name", "", "full name (required)")
	roles := flag.String("roles", "", "comma-separated role keys, e.g. admin or owner,finance")
	// The developer creating the first administrator chose the password at the terminal, so by
	// default it need not be changed. Use -must-change when someone else will be told the password.
	mustChange := flag.Bool("must-change", false, "require the user to change the password at first sign-in")
	flag.Parse()
	if *email == "" || *name == "" {
		return fmt.Errorf("-email and -name are required")
	}
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}

	var password string
	if term.IsTerminal(int(os.Stdin.Fd())) {
		fmt.Fprint(os.Stderr, "Password: ")
		b, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		if err != nil {
			return err
		}
		password = string(b)
	} else {
		line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		password = strings.TrimRight(line, "\r\n")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return err
	}
	defer pool.Close()

	var keys []string
	for _, k := range strings.Split(*roles, ",") {
		if k = strings.TrimSpace(k); k != "" {
			keys = append(keys, k)
		}
	}
	u, err := auth.NewService(pool).CreateUser(ctx, "cli", *email, *name, password, keys, *mustChange)
	if err != nil {
		return err
	}
	fmt.Printf("created %s (%s) with roles %v\n", u.Email, u.ID, keys)
	return nil
}
