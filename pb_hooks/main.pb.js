/// <reference path="../pb_data/types.d.ts" />

// cross-origin isolation (required by the browser app)
routerUse((e) => {
    e.response.header().set("Cross-Origin-Opener-Policy", "same-origin")
    e.response.header().set("Cross-Origin-Embedder-Policy", "require-corp")
    e.response.header().set("Cross-Origin-Resource-Policy", "same-origin")
    return e.next()
})

// disable read/write deadlines (replaces the pocketbase-no-timeout fork)
$app.onServe().bindFunc((e) => {
    e.server.readTimeout = 0      // 0 disables the deadline, like the Go patch
    e.server.writeTimeout = 0
    // e.server.readHeaderTimeout = 0 // if ever needed
    return e.next()
})