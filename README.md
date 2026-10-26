# Welcome Favorites

A SillyTavern extension that puts your favorite characters and group chats right on the welcome screen, above Recent Chats.

## Features

- A row of your favorited bots and groups on the welcome screen. Tap one to jump in.
- Five icon shapes: Card, Rounded square, Circle, Hexagon, Cameo (an oval portrait in an ornate frame).
- Icon sizes: Small, Medium, Large.
- Chat count, message count for the current chat, and "last chatted" under each bot.
- Sorting: favorited order, A–Z, Z–A, recently chatted, or most messages.
- Heartbeat glow: a soft pulsing glow around each bot in your theme's color, with adjustable speed and intensity. Only the cards pulse.
- Long-press (or right-click) menu: open last chat, start a new chat, open the character card, or remove from favorites.
- Live updates: star or unstar a bot and the row updates on its own.
- Scroll arrows that loop around when you have lots of favorites.
- Matches any theme automatically, including Moonlit Echoes.
- Themes: pick **Auto** to match your SillyTavern colors, or one of the extension's themes, **Pink Vampire**, **Dark Blood Vampire** or **Regency Cameo** (ornate title, lacy crowns, glowing rings, corner text and a footer). New themes arrive through extension updates.

## Install

1. In SillyTavern, open **Extensions** (the stacked-cubes icon).
2. Click **Install extension**.
3. Paste this repository's link and click **Install**.
4. Star a few characters (the ★ button on their card) and open the welcome screen.

## Settings

All options are under **Extensions → Welcome Favorites**:

| Section   | Options |
|-----------|---------|
| General   | Favorites bar, Live updates, Include group chats |
| Display   | Icon shape, Icon size, Sort by, Show names, Show chat counts, Show message count, Show last chatted |
| Heartbeat | Heartbeat glow, Speed, Intensity |
| Behavior  | Tap to open (last chat / new chat), Long-press menu |
| Themes    | Theme (Auto, or one of the extension's themes) |

On/off options use toggle switches; the rest are dropdowns.

## Adding a theme (for the author)

Themes live in `themes.json`. To add one, copy an entry, change it, and upload the file to GitHub. Users get it the next time they press **Update** on the extension.

```json
{
  "id": "red-vampire",
  "name": "Red Vampire",
  "style": "vampire",
  "colors": {
    "accent": "#d4364f",
    "accent2": "#ff7a8a",
    "title": "#f5d6d9",
    "text": "#f3e6e8",
    "border": "#6e1f2c"
  },
  "texts": {
    "left": "Same|Beautiful|Chaos",
    "right": "danger|looks better|here ♡",
    "footer": "Favorite people|Darker conversations|A softer you"
  }
}
```

- `id`: a unique name with no spaces. Don't change it after release, or people using the theme get switched back to Auto.
- `name`: what shows in the Theme dropdown.
- `style`: every style works with every Icon shape.
  - `classic`: plain look.
  - `vampire` (Pink Vampire layout): ornaments above and below the title, crowns, rings, left and right corner text, stacked caps footer.
  - `regency` (Regency Cameo layout): serif title, scroll flourish, italic subtitle, no crowns or rings.
  - `blood` (Dark Blood Vampire layout): crowns and rings too, plus a star divider and subtitle, a brand block top-left, an italic line top-right, a script footer between long lines, and small caps in the bottom corners.
- `shape` (optional): an Icon shape (`card`, `square`, `circle`, `hexagon`, `cameo`) that gets switched on when someone picks the theme. They can still change it afterwards.
- `crownStyle` (optional): `lace` (filigree crown) or `solid` (polished silver-style crown). Pink Vampire's layout uses `lace` by default, Dark Blood Vampire's uses `solid`.
- `colors`: `accent` is the glow and ring, `accent2` the second ring color and crown tint, `title` the heading, `text` names and info, `border` outlines, and `crown` (optional) sets the crown color directly, e.g. `#d9d6e0` for silver, `script` (optional, blood style) sets the footer script color, and `ring` (optional) sets the ring's highlight color, which defaults to the title color, and `rose` (optional, regency style) sets the petal color of the title roses. Leave one out to use the default.
- `texts`: `title` (any style except classic) replaces the word "Favorites". `|` starts a new line, and an empty `""` hides that piece. Leave a key out to use the default wording.
  - `vampire` keys: `left`, `right`, `footer`.
  - `regency` keys: `title`, `subtitle`.
  - `blood` keys: `subtitle`, `brand` (the first line is the big name), `topRight`, `footer`, `bottomLeft`, `bottomRight`.
- Separate entries with a comma. Check the file at jsonlint.com before uploading.

## Author

Arriana
