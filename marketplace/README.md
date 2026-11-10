# The plugin marketplace

`plugins.json` is the list the app's **Plugins › Marketplace** searches and
installs from, and the list the site's `/plugins` page shows. The app reads it
off this repository's `main` branch, so a plugin is listed by a pull request
that adds an entry here — nothing else is deployed.

```json
{
  "plugins": [
    {
      "id": "my-plugin",
      "name": "My plugin",
      "version": "1.0.0",
      "description": "One sentence about what it does.",
      "author": "Your name",
      "repo": "https://github.com/you/my-plugin",
      "download": "https://github.com/you/my-plugin/releases/download/1.0.0/my-plugin.zip",
      "sha256": "…64 hex characters of the zip…",
      "tags": ["git", "editor"]
    }
  ]
}
```

- `id` is the manifest's `id`, and the app refuses a download whose manifest
  says otherwise. It cannot be the id of a built-in plugin.
- `download` is an `https` URL of a `.zip` holding `manifest.json` and
  `main.js` (and optionally `styles.css` and the manifest's icon), at the
  archive's root or inside one folder — the shape **Install from .zip…** reads.
- `sha256` is the zip's, lower-case (`shasum -a 256 my-plugin.zip`). The app
  checks it before unpacking anything, so a release asset replaced after review
  is refused rather than installed. A new version is a new `version`,
  `download` and `sha256` together.

A plugin is code with the whole of the app's reach — `docs/design.md`
§ Plugins. An entry is reviewed before it is merged.
