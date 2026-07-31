# Go Jobs Scheduling

PocketBase includes a built-in cron scheduler for running periodic tasks. Register jobs using `app.Cron().MustAdd()`.

## Registering a Cron Job

Cron jobs are typically registered inside the `OnBootstrap` hook:

```go
app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
    app.Cron().MustAdd("cleanup", "0 * * * *", func(cronJob core.CronJob) {
        // Runs every hour
        log.Println("Running cleanup job...")
    })

    return e.Next()
})
```

## Cron Schedule Syntax

Standard cron format: `minute hour day month weekday`

| Schedule      | Description              |
| ------------- | ------------------------ |
| `* * * * *`   | Every minute             |
| `0 * * * *`   | Every hour               |
| `0 0 * * *`   | Every day at midnight    |
| `0 0 * * 0`   | Every Sunday at midnight |
| `0 0 1 * *`   | First day of every month |
| `*/5 * * * *` | Every 5 minutes          |
| `0 9 * * 1-5` | Weekdays at 9 AM         |

## Inside a Cron Job

Use `app.RefreshApp()` inside cron jobs to get a fresh app state with updated collections and settings:

```go
app.Cron().MustAdd("send-daily-digest", "0 9 * * *", func(cronJob core.CronJob) {
    // Refresh to get latest settings and collections
    cronJob.App().RefreshApp()

    app := cronJob.App()

    // Find all subscribers
    subscribers, err := app.FindRecordsByFilter("subscribers", "verified = true", "", 0, 0)
    if err != nil {
        app.Logger().Error("Failed to find subscribers", "error", err)
        return
    }

    // Get today's posts
    today := time.Now().Format("2006-01-02")
    posts, err := app.FindRecordsByFilter("posts", "published >= '" + today + "'", "-created", 10, 0)
    if err != nil {
        app.Logger().Error("Failed to find posts", "error", err)
        return
    }

    if len(posts) == 0 {
        return
    }

    // Send emails to subscribers
    mailClient := app.NewMailClient()
    for _, sub := range subscribers {
        email := sub.GetString("email")
        err := mailClient.Send(mailer.Message{
            From:    mail.Address{Name: "My App", Address: app.Settings().Meta.SenderAddress},
            To:      []mail.Address{{Address: email}},
            Subject: "Daily Digest - " + today,
            HTML:    "<h1>Today's posts</h1><p>There are new posts!</p>",
        })
        if err != nil {
            app.Logger().Error("Failed to send email", "error", err, "email", email)
        }
    }
})
```

## Logging in Jobs

Use `app.Logger()` for structured logging:

```go
app.Cron().MustAdd("maintenance", "0 3 * * *", func(cronJob core.CronJob) {
    app := cronJob.App()

    app.Logger().Info("Starting maintenance job")

    // Your job logic...

    app.Logger().Debug("Cleanup completed", "records_deleted", count)
    app.Logger().Error("Something went wrong", "error", err)
})
```

## Running a Job Immediately

Trigger a registered cron job manually:

```go
app.Cron().Get("cleanup").Run()
```

## Job with Run-Only-Once Behavior

If a cron job is already running, subsequent triggers are skipped until the current one completes. For one-time jobs:

```go
app.Cron().MustAdd("one-time-job", "0 0 1 1 *", func(cronJob core.CronJob) {
    // This job will run every January 1st
    // If it takes longer than a minute, the next trigger is skipped
})
```

## Dynamic Jobs

Add or remove jobs dynamically:

```go
// Add job dynamically
app.Cron().MustAdd("dynamic-job", "* * * * *", func(cronJob core.CronJob) {
    // job logic
})

// Remove job
app.Cron().Remove("dynamic-job")
```

## Example: Stat Aggregation Job

```go
app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
    app.Cron().MustAdd("aggregate-stats", "*/15 * * * *", func(cronJob core.CronJob) {
        app := cronJob.App()

        today := time.Now().UTC().Format("2006-01-02")

        var totalSignups int
        var totalPosts int
        var totalViews int

        app.DB().NewQuery("SELECT COUNT(*) FROM users WHERE created >= {:today}").
            Bind(map[string]any{"today": today}).
            Row(&totalSignups)

        app.DB().NewQuery("SELECT COUNT(*) FROM posts WHERE created >= {:today}").
            Bind(map[string]any{"today": today}).
            Row(&totalPosts)

        app.DB().NewQuery("SELECT COALESCE(SUM(views), 0) FROM posts WHERE created >= {:today}").
            Bind(map[string]any{"today": today}).
            Row(&totalViews)

        // Save to a stats collection
        collection, err := app.FindCollectionByNameOrId("daily_stats")
        if err != nil {
            app.Logger().Error("Stats collection not found", "error", err)
            return
        }

        stat := core.NewRecord(collection)
        stat.Set("date", today)
        stat.Set("signups", totalSignups)
        stat.Set("posts", totalPosts)
        stat.Set("views", totalViews)

        if err := app.SaveNoValidate(stat); err != nil {
            app.Logger().Error("Failed to save stats", "error", err)
        }
    })

    return e.Next()
})
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-jobs-scheduling/)
