// Where the rooms server lives. The deployed rooms address goes here, for
// example 'wss://rooms.example.org'. Empty means "the same host that served
// this page", which is right for local dev with arcade-rooms/dev/server.mjs.
// Inside a Discord Activity this is ignored: the socket goes through Discord's
// own proxy at /rt on the activity's host.
window.ARCADE_ROOMS_URL = '';
