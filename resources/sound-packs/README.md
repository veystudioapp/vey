# Built-in sound packs

The typing and click sounds' built-in packs (`docs/design.md` § Typing sounds)
are the packs that ship with [Mechvibes](https://github.com/hainguyents13/mechvibes),
copied unchanged at commit `16afce45bd7cf12be399e2d1a8d20f221067f534` —
`config.json` and the audio file it names, without the thumbnails:

- the ten keyboard packs from `soundpacks/keyboard/`, each in a folder of the
  same name;
- the four mouse packs from `soundpacks/mouse/`, each in `mouse-<name>`, the id
  their own configs give.

Mechvibes is MIT-licensed; its licence is `LICENSE` beside this file.

Each folder's name is the pack's id, and is what `typingSoundPack` /
`mouseSoundPack` store, so a folder renamed here is a choice silently reset for
everybody who made it.
