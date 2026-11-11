# Ship Names

A dry party game for the Cyborg Garden arcade. It runs inside a Discord
Activity and on the web.

Each round puts a ship in an awkward situation ("You arrive three centuries
late to a war that was about you"). Everyone has a minute to name the ship.
The names are shown shuffled, with no authors, and everyone votes for one
that is not their own. Then the authors and the points are revealed. After
five rounds the winning names are entered in the fleet registry.

Two can play. Three or more is better. Eight is the most a room holds.

## What is in here

This folder is only the browser client. The rules, the timers and the
situations live on the rooms server, in
`arcade-rooms/games/ship-names/`.

| File | What it is |
| --- | --- |
| `index.html` | The page. No inline scripts or handlers, which Discord blocks. |
| `style.css` | The look. System fonts, no images. |
| `game.js` | Draws what the server sends, and sends your name and your vote. |
| `config.js` | Where the rooms server is. Empty means the same host. |
| `rooms-client.js` | An unchanged copy of `arcade-rooms/client/rooms-client.js`. |
| `meta.json` | The card the arcade shows for this game. |

The page makes no network requests apart from its own files and the one
socket to the rooms server.

## Run it locally

With `arcade-rooms` checked out next to this folder:

```sh
cd ../arcade-rooms
npm install
node dev/server.mjs --port 8801 --client ../ship-names
```

Open <http://localhost:8801/> in two or three windows. Copy the invite link
from the first into the others so they share a room. Use private windows
(or different browsers) for the extra players, since a player's id is kept
in the browser.

## Tests

The game logic is tested in `arcade-rooms`:

```sh
cd ../arcade-rooms
node --test games/ship-names/logic.test.mjs

# A whole three-player game over real sockets, against the server above:
node games/ship-names/e2e.mjs ws://localhost:8801
```

## Deploying

Set the rooms address in `config.js`, for example
`window.ARCADE_ROOMS_URL = 'wss://rooms.example.org';`. Inside Discord that
setting is ignored: the socket goes through the Activity's own host at `/rt`.

## Credit

Made in the Cyborg Garden. The situations, the example names and the code
are original to this game. It is a fond nod to the old science fiction habit
of giving spaceships long, wry names, and borrows no names or terms from
anyone's books.
