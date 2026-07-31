# Go Sending Emails

PocketBase provides a built-in mail client for sending emails from your Go code. You can send plain HTML emails or template-based emails.

## Basic Email Sending

```go
import (
    "net/mail"
    "github.com/pocketbase/pocketbase/mailer"
)

app.OnServe().BindFunc(func(se *core.ServeEvent) error {
    se.Router.POST("/api/send-welcome", func(e *core.RequestEvent) error {
        data := struct {
            Email string `json:"email"`
            Name  string `json:"name"`
        }{}
        if err := e.BindBody(&data); err != nil {
            return e.BadRequestError("Invalid input", err)
        }

        err := app.NewMailClient().Send(mailer.Message{
            From: mail.Address{
                Name:    "My App",
                Address: app.Settings().Meta.SenderAddress,
            },
            To: []mail.Address{
                {Address: data.Email},
            },
            Subject: "Welcome to My App!",
            HTML:    "<h1>Welcome " + data.Name + "!</h1><p>Thanks for signing up.</p>",
        })

        if err != nil {
            return e.InternalServerError("Failed to send email", err)
        }

        return e.JSON(http.StatusOK, map[string]string{"status": "sent"})
    })
    return se.Next()
})
```

## Mailer Message Struct

```go
mailer.Message{
    From:    mail.Address{Name: "Name", Address: "from@example.com"},
    To:      []mail.Address{{Address: "to@example.com"}},
    Bcc:     []mail.Address{{Address: "bcc@example.com"}},
    Cc:      []mail.Address{{Address: "cc@example.com"}},
    Subject: "Email Subject",
    HTML:    "<h1>Hello</h1><p>World</p>",
}
```

## Using App Settings for Sender

Always use the configured sender address from settings:

```go
fromAddress := app.Settings().Meta.SenderAddress
fromName := app.Settings().Meta.SenderName

err := app.NewMailClient().Send(mailer.Message{
    From: mail.Address{
        Name:    fromName,
        Address: fromAddress,
    },
    To:      []mail.Address{{Address: user.GetString("email")}},
    Subject: "Your Subject",
    HTML:    emailHTML,
})
```

## Sending with BCC and CC

```go
err := app.NewMailClient().Send(mailer.Message{
    From: mail.Address{
        Name:    "Newsletter",
        Address: app.Settings().Meta.SenderAddress,
    },
    To: []mail.Address{
        {Address: "user1@example.com"},
        {Address: "user2@example.com"},
    },
    Bcc: []mail.Address{
        {Address: "admin@example.com"},
    },
    Cc: []mail.Address{
        {Address: "manager@example.com"},
    },
    Subject: "Monthly Newsletter",
    HTML:    "<h1>This Month's Update</h1><p>Content here...</p>",
})
```

## Template-Based Emails

Use `html/template` for dynamic email content:

```go
import "html/template"

emailTemplate := `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        .header { background: #007bff; color: white; padding: 20px; }
        .content { padding: 20px; }
        .button { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Welcome, {{.Name}}!</h1>
    </div>
    <div class="content">
        <p>Thank you for registering at My App.</p>
        <p>Your account has been created successfully.</p>
        <a href="{{.VerifyURL}}" class="button">Verify Your Email</a>
    </div>
</body>
</html>
`

tmpl, err := template.New("welcome").Parse(emailTemplate)
if err != nil {
    return err
}

var body strings.Builder
err = tmpl.Execute(&body, map[string]string{
    "Name":      user.GetString("name"),
    "VerifyURL": "https://example.com/verify?token=" + user.GetString("token"),
})
if err != nil {
    return err
}

err = app.NewMailClient().Send(mailer.Message{
    From: mail.Address{
        Name:    "My App",
        Address: app.Settings().Meta.SenderAddress,
    },
    To:      []mail.Address{{Address: user.GetString("email")}},
    Subject: "Welcome! Please verify your email",
    HTML:    body.String(),
})
```

## Sending Emails from Hooks

Common pattern: send emails in response to record events:

```go
app.OnRecordAfterCreateSuccess("users").BindFunc(func(e *core.RecordEvent) error {
    // Send welcome email after user registration
    if !e.Record.GetBool("verified") {
        err := app.NewMailClient().Send(mailer.Message{
            From: mail.Address{
                Name:    "My App",
                Address: app.Settings().Meta.SenderAddress,
            },
            To: []mail.Address{
                {Address: e.Record.GetString("email")},
            },
            Subject: "Welcome to My App!",
            HTML:    fmt.Sprintf("<h1>Welcome %s!</h1><p>Your account has been created.</p>", e.Record.GetString("name")),
        })
        if err != nil {
            app.Logger().Error("Failed to send welcome email", "error", err)
        }
    }
    return e.Next()
})
```

## Error Handling

```go
err := app.NewMailClient().Send(mailer.Message{...})
if err != nil {
    app.Logger().Error("Email send failed",
        "error", err,
        "recipient", toEmail,
        "subject", subject,
    )
    // Decide whether to fail the request or continue
}
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-sending-emails/)
