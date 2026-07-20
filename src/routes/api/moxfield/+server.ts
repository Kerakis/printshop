import { json, error as httpError } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

interface MoxfieldEntry {
	quantity: number;
	finish: 'foil' | 'etched' | 'nonFoil';
	tags?: string[];
	card: { name: string; set: string; cn: string };
}

interface MoxfieldDeck {
	name?: string;
	boards: Record<string, { cards: Record<string, MoxfieldEntry> }>;
}

// ponytail: only mainboard. Add other boards when someone asks.
export const POST: RequestHandler = async ({ request, platform }) => {
	const { url } = (await request.json()) as { url?: string };
	const deckId = url?.match(/moxfield\.com\/decks\/([\w-]+)/)?.[1];
	if (!deckId) {
		return httpError(400, 'Invalid Moxfield deck URL. Expected https://moxfield.com/decks/{id}');
	}

	// Secrets Store bindings only resolve remotely — plain `wrangler dev` throws.
	// ponytail: fall back to MOXFIELD_USER_AGENT_DEV in .dev.vars for local dev.
	const env = platform?.env;
	const userAgent =
		(await env?.MOXFIELD_USER_AGENT?.get().catch(() => undefined)) ?? env?.MOXFIELD_USER_AGENT_DEV;
	if (!userAgent) {
		return httpError(
			500,
			'Moxfield user agent unavailable. Locally, set MOXFIELD_USER_AGENT_DEV in .dev.vars or run `wrangler dev --remote`.'
		);
	}

	const res = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`, {
		headers: { 'User-Agent': userAgent, Accept: 'application/json' }
	});
	if (!res.ok) return httpError(502, `Moxfield returned ${res.status} ${res.statusText}`);

	const deck = (await res.json()) as MoxfieldDeck;
	const cards = Object.values(deck?.boards?.mainboard?.cards ?? {});
	if (!cards.length) return httpError(404, 'Deck has no mainboard cards (is it public?)');

	const lines = cards.map(({ quantity, card, finish, tags }) => {
		const parts = [String(quantity), card.name, `(${card.set.toUpperCase()})`];
		if (card.cn) parts.push(card.cn);
		if (finish === 'etched') parts.push('*E*');
		else if (finish === 'foil') parts.push('*F*');
		if (tags?.length) parts.push(tags.map((t) => `#${t}`).join(' '));
		return parts.join(' ');
	});

	return json({ name: deck.name ?? '', text: lines.join('\n') });
};
