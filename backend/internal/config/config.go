package config

import (
	"fmt"
	"os"
)

type Config struct {
	DatabaseURL string
	Addr        string
}

func Load() (Config, error) {
	c := Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		Addr:        os.Getenv("API_ADDR"),
	}
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}
	if c.Addr == "" {
		c.Addr = ":8080"
	}
	return c, nil
}
