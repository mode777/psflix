# Going to Production

## Deployment Strategies

### Minimal Setup

One of the best PocketBase features is that it's completely portable. This means that it doesn't require any external dependency and could be deployed by just uploading the executable on your server.

Here is an example of starting a production HTTPS server (auto managed TLS with Let's Encrypt) on a clean Ubuntu 22.04 installation.

1. Consider the following app directory structure:

   ```
   myapp/
     pb_migrations/
     pb_hooks/
     pocketbase
   ```

2. Upload the binary and anything else required by your application to your remote server, for example using **rsync**:

   ```bash
   rsync -avz -e ssh /local/path/to/myapp root@YOUR_SERVER_IP:/root/pb
   ```

3. Start a SSH session with your server:

   ```bash
   ssh root@YOUR_SERVER_IP
   ```

4. Start the executable (specifying a domain name will issue a Let's Encrypt certificate for it):

   ```bash
   [root@dev ~]$ /root/pb/pocketbase serve yourdomain.com
   ```

   > Notice that in the above example we are logged in as **root** which allows us to bind to the **privileged 80 and 443 ports**.
   >
   > For **non-root** users usually you'll need special privileges to bind to privileged ports. Depending on your OS, you have several options: `authbind`, `setcap`, `iptables`, `sysctl`, etc. Here is an example using `setcap`:
   >
   > ```bash
   > [myuser@dev ~]$ sudo setcap 'cap_net_bind_service=+ep' /root/pb/pocketbase
   > ```

5. (Optional) Systemd service

   You can create a **Systemd service** to allow your application to start/restart on its own. Here is an example service file (usually created in `/lib/systemd/system/pocketbase.service`):

   ```ini
   [Unit]
   Description = pocketbase

   [Service]
   Type = simple
   User = root
   Group = root
   LimitNOFILE = 4096
   Restart = always
   RestartSec = 5s
   StandardOutput = append:/root/pb/std.log
   StandardError = append:/root/pb/std.log
   WorkingDirectory = /root/pb
   ExecStart = /root/pb/pocketbase serve yourdomain.com

   [Install]
   WantedBy = multi-user.target
   ```

   Enable and start the service:

   ```bash
   [root@dev ~]$ systemctl enable pocketbase.service
   [root@dev ~]$ systemctl start pocketbase
   ```

   > You can find a link to the Web UI installer in the `/root/pb/std.log`, but alternatively you can also create the first superuser explicitly:
   >
   > ```bash
   > [root@dev ~]$ /root/pb/pocketbase superuser create EMAIL PASS
   > ```

### Using Reverse Proxy

If you plan on hosting multiple applications on a single server or need finer network controls, you can put PocketBase behind a reverse proxy such as NGINX, Apache, Caddy, etc.

> When using a reverse proxy you may need to set up the "User IP proxy headers" in the PocketBase settings so that the application can extract and log the actual visitor/client IP (the headers are usually `X-Real-IP`, `X-Forwarded-For`).

**NGINX example:**

```nginx
server {
    listen 80;
    server_name example.com;
    client_max_body_size 10M;

    location / {
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_read_timeout 360s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # enable if you are serving under a subpath location
        # rewrite /yourSubpath/(.*) /$1 break;

        proxy_pass http://127.0.0.1:8090;
    }
}
```

**Caddy example:**

```
example.com {
    request_body {
        max_size 10MB
    }

    reverse_proxy 127.0.0.1:8090 {
        transport http {
            read_timeout 360s
        }
    }
}
```

### Using Docker

PocketBase doesn't have an official Docker image, but you could use this minimal Dockerfile:

```dockerfile
FROM alpine:latest

ARG PB_VERSION=0.39.7

RUN apk add --no-cache \
    unzip \
    ca-certificates

# download and unzip PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/

# uncomment to copy the local pb_migrations dir into the image
# COPY ./pb_migrations /pb/pb_migrations

# uncomment to copy the local pb_hooks dir into the image
# COPY ./pb_hooks /pb/pb_hooks

EXPOSE 8080

# start PocketBase
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080"]
```

To persist data, mount a volume at `/pb/pb_data`.

_For a full example check the ["Host for free on Fly.io"](https://github.com/pocketbase/pocketbase/discussions/537) guide._

## Backup and Restore

To backup/restore your application it is enough to manually copy/replace your `pb_data` directory (for transactional safety make sure that the application is not running).

PocketBase v0.16+ comes with builtin backups and restore APIs accessible from the Dashboard (_Settings > Backups_).

Backups can be stored locally (default) or in an S3 compatible storage (recommended to use a separate bucket only for backups). The generated backup represents a full snapshot as ZIP archive of your `pb_data` directory (including locally stored uploaded files but excluding any local backups or files uploaded to S3).

During the backup's ZIP generation the application will be temporarily set in read-only mode. For large `pb_data` (e.g. 2GB+) consider a different backup strategy, such as a [`backup.sh` script](https://github.com/pocketbase/pocketbase/discussions/4254#backups) combining `sqlite3 .backup` + `rsync`.

## Recommendations

### Use SMTP Mail Server _(highly recommended)_

By default, PocketBase uses the internal Unix `sendmail` command. While OK for development, emails in production will most likely get marked as spam or fail to deliver.

Consider using a local SMTP server or an external mail service like MailerSend, Brevo, SendGrid, Mailgun, AWS SES, etc.

Configure SMTP settings from _Dashboard > Settings > Mail settings_.

### Enable Rate Limiter _(highly recommended)_

To minimize the risk of API abuse (e.g. excessive auth or record create requests) set up a rate limiter.

PocketBase v0.23.0+ comes with a simple builtin rate limiter. Configure it from _Dashboard > Settings > Application_.

### Restrict Superusers to Specific IPs/Subnets _(highly recommended)_

PocketBase v0.38.0+ added support for superuser IPs whitelist. Even if a malicious actor gets a superuser auth token, they'll get a 403 error if not on the whitelist.

Enable from _Dashboard > Settings > Application > Superuser IPs_.

Reset/change the whitelist using the console command:

```bash
# clear whitelisted IPs
./pocketbase superuser ips --dir=/path/to/your/pb_data

# OR change the whitelisted IPs (replace with your real IP)
./pocketbase superuser ips 127.0.0.1 10.0.0.0 --dir=/path/to/your/pb_data
```

### Enable MFA for Superusers _(optional)_

Enable MFA and OTP options for the `_superusers` collection to enforce an additional one-time password requirement when authenticating as superuser.

In case of email deliverability issues, generate an OTP manually:

```bash
./pocketbase superuser otp yoursuperuser@example.com
```

### Increase the Open File Descriptors Limit _(optional)_

Unix uses "file descriptors" also for network connections. Most systems have a default limit of ~1024. If your application has a lot of concurrent realtime connections, you may get a "Too many open files" error.

Check current limits with `ulimit -a`. To increase the open files limit, run `ulimit -n 4096` before starting PocketBase, or adjust `LimitNOFILE` in your systemd service file.

### Set GOMEMLIMIT _(optional)_

If running in a memory constrained environment and/or allowing large file uploads, set the [`GOMEMLIMIT`](https://pkg.go.dev/runtime#hdr-Environment_Variables) environment variable to help prevent OOM termination:

```bash
GOMEMLIMIT=512MiB
```

### Enable Settings Encryption _(optional)_

By default, PocketBase stores application settings in the database as plain JSON text (including SMTP password and S3 credentials).

To store settings encrypted:

1. Create a new environment variable with a random 32 character string:
   ```bash
   export PB_ENCRYPTION_KEY="KClhZ5PVHgh7N1ZpA7x8OBCgKjsa9EME"
   ```
2. Start the application with the flag:
   ```bash
   pocketbase serve --encryptionEnv=PB_ENCRYPTION_KEY
   ```

---

**Navigation:** [← Extending PocketBase](08-use-as-framework.md)

---

> **Source:** [pocketbase.io/docs/going-to-production](https://pocketbase.io/docs/going-to-production)
