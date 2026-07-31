# FAQ - PocketBase

## 0. Why?

PocketBase was created to assist building self-contained applications that can run on a single server without requiring to install anything in addition (_see [Presentator#183](https://github.com/presentator/presentator/issues/183)_). The basic idea is that the common functionality like crud, auth, files upload, auto TLS, etc. are handled out of the box, allowing you to focus on the UI and your actual app business requirements.

Please note that PocketBase is neither a startup, nor a business. There is no paid team or company behind it. It is a personal open source project with intentionally limited scope and developed entirely on volunteer basis. There are no promises for maintenance and support beyond what is already available.

**If you don't have the time to at least skim through the documentation and you plan to solely rely on some AI tool, then please do NOT use PocketBase!**

## 1. Do you offer hosting?

No. PocketBase is self-hosted only. If you are looking for free options for small PoC and hobby apps, you can check:

- [Google Cloud Free Tier](https://cloud.google.com/free/docs/free-cloud-features#compute) - The free tier e2-micro compute instance comes with 0.25vCPU, 30GB disk storage, 1GB memory, and 200GB standard tier egress per month and region must be us-central1 | us-west1 | us-east1.
- [Oracle Cloud Always Free Services](https://www.oracle.com/cloud/free/) - AMD and ARM based compute instances with varying free allowance and storage options (note: there were unconfirmed reports for randomly deleted "inactive" accounts).
- [IBM LinuxONE Open Source Software Community Cloud](https://community.ibm.com/zsystems/form/l1cc-oss-vm-request/) - Free IBM Z (s390x) VMs for open source projects (requires filling a form).

For a more traditional setup you can use any VPS provider that comes with a persistent storage, like: [Hetzner](https://www.hetzner.com/), [Vultr](https://www.vultr.com/), [UpCloud](https://upcloud.com/), [Linode](https://www.linode.com/), etc.

See [Going to production](09-going-to-production.md) for deployment details.

## 2. Does it scale?

Only on a single server, aka. vertical. Most of the time, you may not need the complexity of managing a fleet of machines and services just to run your backend.

**PocketBase could be a great choice for small and midsize applications** - SaaS, mobile api backend, intranet, etc. Even without optimizations, PocketBase can easily serve 10 000+ persistent realtime connections on a cheap $4 Hetzner CAX11 VPS (2vCPU, 4GB RAM).

You can find performance tests for various read & write operations in the official [benchmarks repo](https://github.com/pocketbase/benchmarks).

## 3. How to run custom code?

PocketBase differs from the other similar backend solutions like Firebase, Supabase, Nhost, etc. and doesn't support running cloud functions.

**Instead, PocketBase could be used as a Go or JS framework that enables you to build your own custom app specific business logic and still have a portable backend at the end** (check [Use as framework](08-use-as-framework.md) guide).

## 4. Does it support Google or Facebook login?

Yes, currently there is support for more than 15+ OAuth2 providers - Apple, Google, Facebook, Microsoft, VK, GitHub, GitLab, and many more.

## 5. Does it come with frontend UI for user login, register, etc. screens?

No. PocketBase provides only SDKs for client-side integration and you are free to implement your own frontend. For convenience, there are default user facing pages for the user email confirmation links (password reset, verification, etc.) but you can also set your own by updating the urls in the email template collection settings.

## 6. Can I use database X?

No, at least not out of the box. PocketBase uses embedded SQLite (in WAL mode) and there are no plans for supporting other databases.

**For the majority of the queries SQLite (in WAL mode) outperforms traditional databases like MySQL, MariaDB or PostgreSQL (especially for read operations).** If you need replication and disaster recovery, a great companion app could be [Litestream](https://litestream.io/).

## 7. How to import/export my data in/from PocketBase?

We don't have builtin data import/export helpers at the moment but you can explore some of the suggestions mentioned in [discussions#6287](https://github.com/pocketbase/pocketbase/discussions/6287).

## 8. Can I donate?

No. In the past donations were welcomed (I'm very grateful for everyone who contributed) but financial contributions from individuals usually comes with some "unspoken expectations" and to avoid the mental burden and the sense of feeling guilty when not working on the contributor's feature request, I've decided to stop accepting donations for PocketBase.

If you are part of an organization that offers sponsorships or grants and want to support the project development financially, feel free to reach out to _support at pocketbase.io_ but only if there are no strings attached.

## 9. Where can I find help for my PocketBase application?

You could always look for help in our public [Discussions board](https://github.com/pocketbase/pocketbase/discussions), [open an issue](https://github.com/pocketbase/pocketbase) or contact _support at pocketbase.io_.

---

> **Source:** [pocketbase.io/faq](https://pocketbase.io/faq)
