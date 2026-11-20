# Cookie Stitch 🍪

A cross-stitch companion for iPad and the web. Find the thread you need, park it at a square, and mark stitches as you finish them. Focus mode gives the pattern more room while keeping the stitching tools within reach.

- Pick a colour from the palette or tap a stitch in Move mode.
- Park threads, mark finished stitches and undo mistakes.
- Keep separate projects on the same device and export a full backup when you need it.
- Use the app in English or German. After the app files are available offline, you can continue without a connection.

## Try it

From the repository root, run:

```sh
python3 -m http.server 8765 --directory public
```

Open [localhost:8765](http://localhost:8765), select **My projects → Add project file**, and open [First Cookie](examples/first-cookie.cookie-stitch.json), the included demo with 480 stitches and empty progress. Choose **Continue stitching**. Try highlighting a thread colour, then park one thread or mark a stitch as finished.

To use your own pattern, you need a prepared Cookie Stitch project file. Direct PDF and scan import are outside the current app.

## Where your work lives

Cookie Stitch stores projects and progress in the browser. It has no account or cross-device sync. Export backups to Files before clearing browser data or changing devices. A full project backup includes the pattern and progress, and can be opened on another device.

## Work on the app

The app in `public/` runs without a build step. Node 22 or newer runs the tests:

```sh
npm ci
npm test
```

- `public/app.mjs` handles the stitching view and gestures.
- `public/progress.mjs` handles stitch state, undo and backup validation.
- `public/local-project.mjs` and `public/project-store.mjs` handle project files and local storage.
- `public/i18n.mjs` contains both languages. `public/sw.js` lists the files needed offline.
- `tests/` exercises the app against synthetic projects.

Serve only `public/` when hosting the app. A production site needs HTTPS for the offline cache and editing locks. The localhost URL above works for local testing.

## How Cookie Stitch was made

OpenAI Codex generated the implementation under the maintainer's direction. The maintainer made product decisions and tested the app in use. Codex is a development tool and the app runs without it.

## License

The code, documentation and [First Cookie demo](examples/first-cookie.cookie-stitch.json) are offered under the [MIT License](LICENSE) to the extent the project's contributors hold rights in them. Keep the license and its copyright notice when redistributing these files, including when sharing a release ZIP.

Use your own app name and logo when distributing a fork. See [branding](BRANDING.md) for the scope of the license and how to credit the original. The test dependency `fake-indexeddb` is distributed separately under its own Apache-2.0 license.
