# Go Console Commands

PocketBase uses [Cobra](https://github.com/spf13/cobra) for its CLI. You can add custom commands by modifying `app.RootCmd`.

## Adding a Custom Command

```go
import (
    "fmt"
    "github.com/spf13/cobra"
)

func main() {
    app := pocketbase.New()

    app.RootCmd.AddCommand(&cobra.Command{
        Use:   "hello",
        Short: "Prints a hello message",
        Run: func(cmd *cobra.Command, args []string) {
            fmt.Println("Hello from PocketBase!")
        },
    })

    if err := app.Start(); err != nil {
        log.Fatal(err)
    }
}
```

Run it:

```bash
./myapp hello
# Output: Hello from PocketBase!
```

## Command with Arguments

```go
app.RootCmd.AddCommand(&cobra.Command{
    Use:   "greet [name]",
    Short: "Greets a user by name",
    Args:  cobra.ExactArgs(1),
    Run: func(cmd *cobra.Command, args []string) {
        fmt.Printf("Hello, %s!\n", args[0])
    },
})
```

```bash
./myapp greet Alice
# Output: Hello, Alice!
```

## Command with Flags

```go
app.RootCmd.AddCommand(&cobra.Command{
    Use:   "seed",
    Short: "Seeds the database with test data",
    Run: func(cmd *cobra.Command, args []string) {
        count, _ := cmd.Flags().GetInt("count")
        verbose, _ := cmd.Flags().GetBool("verbose")

        for i := 0; i < count; i++ {
            if verbose {
                fmt.Printf("Creating record %d/%d\n", i+1, count)
            }
            // Create records...
        }

        fmt.Printf("Seeded %d records.\n", count)
    },
})

// Register flags
seedCmd := app.RootCmd.Commands()
// Or register inline before adding:
cmd := &cobra.Command{
    Use:   "seed",
    Short: "Seeds the database",
    Run:   func(cmd *cobra.Command, args []string) { /* ... */ },
}
cmd.Flags().IntP("count", "c", 10, "Number of records to create")
cmd.Flags().BoolP("verbose", "v", false, "Verbose output")
app.RootCmd.AddCommand(cmd)
```

```bash
./myapp seed --count=50 --verbose
./myapp seed -c 50 -v
```

## Using App Inside Commands

Commands have access to the PocketBase app instance via the `app` closure:

```go
app.RootCmd.AddCommand(&cobra.Command{
    Use:   "user-count",
    Short: "Shows total number of users",
    Run: func(cmd *cobra.Command, args []string) {
        // Bootstrap the app to initialize DB
        // (not needed if using app.Start() which bootstraps automatically)
        count, err := app.DB().
            NewQuery("SELECT COUNT(*) FROM users").
            Row(&count)
        if err != nil {
            fmt.Println("Error:", err)
            return
        }
        fmt.Printf("Total users: %d\n", count)
    },
})
```

## Subcommands

```go
// Parent command
dbCmd := &cobra.Command{
    Use:   "db",
    Short: "Database operations",
}

// Subcommands
dbCmd.AddCommand(&cobra.Command{
    Use:   "reset",
    Short: "Resets the database",
    Run: func(cmd *cobra.Command, args []string) {
        fmt.Println("Resetting database...")
        // Reset logic
    },
})

dbCmd.AddCommand(&cobra.Command{
    Use:   "seed",
    Short: "Seeds the database",
    Run: func(cmd *cobra.Command, args []string) {
        fmt.Println("Seeding database...")
        // Seed logic
    },
})

app.RootCmd.AddCommand(dbCmd)
```

```bash
./myapp db reset
./myapp db seed
```

## PersistentPreRun / PreRun Hooks

```go
cmd := &cobra.Command{
    Use: "migrate",
    PersistentPreRun: func(cmd *cobra.Command, args []string) {
        // Runs before the command and all subcommands
        fmt.Println("Preparing migration...")
    },
    PreRun: func(cmd *cobra.Command, args []string) {
        // Runs before Run, but after PersistentPreRun
        fmt.Println("Migration starting...")
    },
    Run: func(cmd *cobra.Command, args []string) {
        fmt.Println("Running migration...")
    },
    PostRun: func(cmd *cobra.Command, args []string) {
        fmt.Println("Migration complete!")
    },
}
```

## Hidden Commands

Mark a command as hidden (not shown in help):

```go
cmd := &cobra.Command{
    Use:    "internal-task",
    Short:  "Internal task",
    Hidden: true,
    Run:    func(cmd *cobra.Command, args []string) { /* ... */ },
}
```

## Example: Full Seed Command

```go
app.RootCmd.AddCommand(&cobra.Command{
    Use:   "seed-posts",
    Short: "Seeds the posts collection with sample data",
    Run: func(cmd *cobra.Command, args []string) {
        collection, err := app.FindCollectionByNameOrId("posts")
        if err != nil {
            fmt.Println("Error: posts collection not found")
            return
        }

        titles := []string{"First Post", "Second Post", "Third Post"}
        for _, title := range titles {
            record := core.NewRecord(collection)
            record.Set("title", title)
            record.Set("status", "published")
            record.Set("content", fmt.Sprintf("Content for %s", title))

            if err := app.SaveNoValidate(record); err != nil {
                fmt.Printf("Error creating '%s': %v\n", title, err)
                continue
            }
            fmt.Printf("Created: %s (ID: %s)\n", title, record.Id)
        }

        fmt.Println("Done!")
    },
})
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-console-commands/)
