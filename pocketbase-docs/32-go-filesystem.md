# Go Filesystem

PocketBase provides a filesystem abstraction layer that supports local storage and S3-compatible storage. Use `app.NewFilesystem()` to get a configured filesystem instance.

## Creating a Filesystem Instance

```go
fs, err := app.NewFilesystem()
if err != nil {
    return err
}
defer fs.Close()
```

## Uploading Files

Upload a file from bytes:

```go
import "github.com/pocketbase/pocketbase/tools/filesystem"

f, err := filesystem.NewFileFromBytes(fileBytes, "document.pdf")
if err != nil {
    return err
}

fs, err := app.NewFilesystem()
if err != nil {
    return err
}
defer fs.Close()

// Upload to a specific path
err = fs.Upload(f, "uploads/2024/document.pdf")
if err != nil {
    return err
}
```

Upload from a file path on disk:

```go
f, err := filesystem.NewFileFromPath("/tmp/image.jpg")
if err != nil {
    return err
}

err = fs.Upload(f, "uploads/images/image.jpg")
```

## Downloading / Getting Files

```go
// Get file as a reader
reader, err := fs.GetFile("uploads/2024/document.pdf")
if err != nil {
    return err
}
defer reader.Close()

// Copy to a local file
outFile, err := os.Create("/tmp/downloaded.pdf")
if err != nil {
    return err
}
defer outFile.Close()

_, err = io.Copy(outFile, reader)
```

## Checking File Existence

```go
exists, err := fs.Exists("uploads/document.pdf")
if err != nil {
    return err
}

if exists {
    log.Println("File exists!")
}
```

## Deleting Files

```go
err := fs.Delete("uploads/old-file.pdf")
if err != nil {
    return err
}
```

## Listing Files

```go
files, err := fs.List("uploads/2024/")
if err != nil {
    return err
}

for _, file := range files {
    log.Printf("File: %s, Size: %d, Modified: %v", file.Key, file.Size, file.Modified)
}
```

## Generating Presigned URLs (S3)

For S3 storage, generate temporary presigned URLs:

```go
url, err := fs.CreatePresignedUrl("uploads/private/document.pdf", 3600) // 1 hour expiry
if err != nil {
    return err
}
log.Printf("Presigned URL: %s", url)
```

## File Object Properties

The `filesystem.File` object:

```go
f, _ := filesystem.NewFileFromBytes(data, "myfile.pdf")

f.Name       // "myfile.pdf"
f.Size       // size in bytes
f.OrigName   // original filename
f.Type       // MIME type (detected automatically)
f.Reader     // io.ReadSeeker
```

## Local vs S3 Storage

PocketBase uses localStorage by default. Configure S3 via the PocketBase settings UI (Admin > Settings > File Storage) or programmatically:

```go
// Access file storage settings
settings := app.Settings()
// S3 configuration can be set in the admin UI
// PocketBase automatically uses the configured storage provider
```

### Environment Variables for S3

Set via environment or admin settings:

```
S3_STORAGE_BUCKET=your-bucket
S3_STORAGE_REGION=us-east-1
S3_STORAGE_ENDPOINT=https://s3.amazonaws.com
S3_STORAGE_ACCESS_KEY=your-access-key
S3_STORAGE_SECRET=your-secret-key
```

## Working with Records and Files

Upload files to records:

```go
se.Router.POST("/api/upload-avatar", func(e *core.RequestEvent) error {
    files, err := e.FindUploadedFiles("avatar")
    if err != nil {
        return e.BadRequestError("No file uploaded", err)
    }

    if len(files) == 0 {
        return e.BadRequestError("No file found", nil)
    }

    // Upload the file
    fs, err := app.NewFilesystem()
    if err != nil {
        return e.InternalServerError("Filesystem error", err)
    }
    defer fs.Close()

    uploadedFile := files[0]
    fileName := uploadedFile.Name

    // Set on record
    user := e.Auth
    user.Set("avatar", fileName)
    if err := app.Save(user); err != nil {
        return e.InternalServerError("Failed to save record", err)
    }

    return e.JSON(http.StatusOK, map[string]string{
        "avatar": fileName,
        "url":    "/api/files/" + user.Collection().Id + "/" + user.Id + "/" + fileName,
    })
})
```

Delete old files when updating:

```go
se.Router.POST("/api/update-avatar", func(e *core.RequestEvent) error {
    user := e.Auth
    oldAvatar := user.GetString("avatar")

    files, err := e.FindUploadedFiles("avatar")
    if err != nil || len(files) == 0 {
        return e.BadRequestError("No file uploaded", err)
    }

    // Delete old file
    if oldAvatar != "" {
        fs, err := app.NewFilesystem()
        if err == nil {
            defer fs.Close()
            fs.Delete(user.Collection().Id + "/" + user.Id + "/" + oldAvatar)
        }
    }

    // Set new file
    user.Set("avatar", files[0].Name)
    if err := app.Save(user); err != nil {
        return e.InternalServerError("Failed to save", err)
    }

    return e.JSON(http.StatusOK, map[string]string{"avatar": files[0].Name})
})
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-filesystem/)
