import { json, error as httpError } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';

interface Card {
	id: string;
	name: string;
	set_code: string;
	set_name: string;
	collector_number: string;
	released_at: string | null;
	finishes: string; // JSON string
}

interface BatchRequestCard {
	name: string;
	quantity?: number;
	foilStatus?: string;
	tags?: string;
}

interface BatchResultCard extends Card {
	foilStatus: string;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.MTG_CARDS_DB) {
		return httpError(500, 'D1 database not configured');
	}

	let body: { cards: BatchRequestCard[]; sortOrder?: 'oldest' | 'newest' };
	try {
		body = await request.json();
	} catch {
		return httpError(400, 'Invalid JSON body');
	}

	const sortOrder = body.sortOrder || 'oldest';

	if (!Array.isArray(body.cards) || body.cards.length === 0) {
		return httpError(400, 'Missing or empty cards array');
	}

	// Log what we're receiving for debugging
	console.log(
		'Batch request received with cards:',
		body.cards.map((c) => c.name)
	);

	const results: {
		found: boolean;
		originalCard: BatchRequestCard;
		result: BatchResultCard | null;
	}[] = [];

	// Process in parallel batches of 50 to maximize throughput
	// (Higher concurrency reduces overall latency vs sequential lookups)
	const batchSize = 50;
	for (let i = 0; i < body.cards.length; i += batchSize) {
		const batch = body.cards.slice(i, i + batchSize);
		const promises = batch.map((card) => lookupCard(card, platform.env.MTG_CARDS_DB, sortOrder));
		const batchResults = await Promise.all(promises);
		results.push(...batchResults);
	}

	return json({ results });
};

async function lookupCard(
	inputCard: BatchRequestCard,
	db: D1Database,
	sortOrder: 'oldest' | 'newest'
): Promise<{
	found: boolean;
	originalCard: BatchRequestCard;
	result: BatchResultCard | null;
}> {
	try {
		const cardName = inputCard.name.trim();

		if (!cardName) {
			return {
				found: false,
				originalCard: inputCard,
				result: null
			};
		}

		console.log(`Looking up card: "${cardName}"`);

		// Build ORDER BY clause based on sort order
		const orderClause =
			sortOrder === 'newest'
				? 'ORDER BY (released_at IS NULL) ASC, released_at DESC, CAST(collector_number AS INTEGER) DESC'
				: 'ORDER BY (released_at IS NULL) ASC, released_at ASC, CAST(collector_number AS INTEGER) ASC';

		// Try exact match first (case-insensitive)
		let result = await db
			.prepare(
				`
			SELECT id, name, set_code, set_name, collector_number, released_at, finishes
			FROM cards
			WHERE lower(name) = lower(?)
			${orderClause}
			LIMIT 1
		`
			)
			.bind(cardName)
			.first<Card>();

		if (result) {
			console.log(`  Found exact match: ${result.name} (${result.set_code})`);
		}

		// Fallback to LIKE search if no exact match
		// Use first word of card name to avoid complex LIKE pattern errors in D1
		if (!result) {
			console.log(`  No exact match, trying LIKE search...`);
			// Extract first word (up to first space or special char) for LIKE pattern
			const firstWord = cardName.split(/[\s,/]/)[0] || cardName;
			console.log(`  Searching with first word: "${firstWord}"`);

			result = await db
				.prepare(
					`
				SELECT id, name, set_code, set_name, collector_number, released_at, finishes
				FROM cards
				WHERE lower(name) LIKE lower(?)
				${orderClause}
				LIMIT 1
			`
				)
				.bind(`%${firstWord}%`)
				.first<Card>();

			if (result) {
				console.log(`  Found LIKE match: ${result.name} (${result.set_code})`);
			} else {
				console.log(`  No match found`);
			}
		}

		if (!result) {
			return {
				found: false,
				originalCard: inputCard,
				result: null
			};
		}

		// Parse finishes JSON to determine foil status
		let foilStatus = '';
		try {
			const finishes = JSON.parse(result.finishes || '[]');
			if (finishes.includes('foil')) foilStatus = 'F';
			else if (finishes.includes('etched')) foilStatus = 'E';
		} catch {
			// Ignore parsing errors
		}

		return {
			found: true,
			originalCard: inputCard,
			result: {
				...result,
				foilStatus
			} as BatchResultCard
		};
	} catch (err) {
		console.error('D1 lookup error:', err);
		return {
			found: false,
			originalCard: inputCard,
			result: null
		};
	}
}
