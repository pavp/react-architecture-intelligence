package main

import (
	"context"
	"os"

	"github.com/pavp/react-architecture-intelligence/internal/launcher"
)

func main() {
	code := launcher.Run(context.Background(), launcher.Options{Args: os.Args[1:]})
	if code != 0 {
		os.Exit(code)
	}
}
