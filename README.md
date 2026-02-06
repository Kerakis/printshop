# MTG Card Finder

A Svelte + SvelteKit application that finds the oldest printing of Magic: The Gathering cards and formats them for Moxfield import.

## Features

- **Bulk Card Lookup**: Paste or upload a list of card names
- **Oldest Printing Detection**: Automatically finds the earliest release of each card
- **Moxfield Formatting**: Generate properly formatted output for deck import
- **Foil Support**: Specify foil/etched foil preferences (F, E)
- **Zero Scryfall Dependency**: Uses private D1 database for all lookups

## Setup

### Prerequisites

- Node.js 18+
- A Cloudflare D1 database with MTG card data
- Cloudflare account with Wrangler CLI

### Installation

```bash
npm install
```

### Configuration

This app requires a Cloudflare D1 database binding named `MTG_CARDS_DB`.

#### For Local Development

1. Create a `.dev.vars` file in the root
2. Run the dev server:

```bash
npm run dev -- --open
```

#### For Production Deployment

1. Ensure your `wrangler.toml` includes the D1 binding
2. Deploy via Wrangler:

```bash
wrangler deploy
```

## File Structure

```
src/
├── routes/
│   ├── +page.svelte          # Main UI component
│   └── api/
│       └── cards/
│           └── +server.ts    # D1 card lookup endpoint
├── lib/
│   └── moxfieldFormatter.ts   # Card parsing and formatting utilities
└── app.html
```

## Input Format

Enter card names one per line with optional quantity and foil status:

```
4 Serra Angel
1 Big Score F
2 Island E
3 Mountain
```

## Output Format

Generated output follows Moxfield standard:

```
4 Serra Angel (3ED) 310
1 Big Score (SNC) 102 *F*
2 Island (MIR) 60
3 Mountain (TSB) 84 *E*
```

## Development

- `npm run dev` — Start dev server
- `npm run build` — Build for production
- `npm run preview` — Preview built site
- `npm run lint` — Run ESLint
- `npm run format` — Format code with Prettier
