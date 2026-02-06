import { json, error as httpError } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

interface Card {
	id: string;
	name: string;
	set_code: string;
	set_name: string;
	collector_number: string;
	released_at: string | null;
	finishes: string; // JSON string
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const name = (url.searchParams.get('name') || '').trim();

	if (!name) {
		return httpError(400, 'Missing required query parameter: name');
	}

	if (!platform?.env?.MTG_CARDS_DB) {
		return httpError(500, 'D1 database not configured');
	}

	try {
		// Try exact match first (case-insensitive)
		const exactQuery = `
			SELECT id, name, set_code, set_name, collector_number, released_at, finishes
			FROM cards
			WHERE lower(name) = lower(?)
			ORDER BY (released_at IS NULL) ASC, released_at ASC, CAST(collector_number AS INTEGER) ASC
			LIMIT 1
		`;

		let result = await platform.env.MTG_CARDS_DB.prepare(exactQuery).bind(name).first<Card>();

		// Fallback to LIKE search if no exact match
		if (!result) {
			const likeQuery = `
				SELECT id, name, set_code, set_name, collector_number, released_at, finishes
				FROM cards
				WHERE lower(name) LIKE lower(?)
				ORDER BY (released_at IS NULL) ASC, released_at ASC, CAST(collector_number AS INTEGER) ASC
				LIMIT 1
			`;
			result = await platform.env.MTG_CARDS_DB.prepare(likeQuery).bind(`%${name}%`).first<Card>();
		}

		if (!result) {
			return json({ found: false, card: null }, { status: 404 });
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

		return json({
			found: true,
			card: {
				...result,
				foilStatus
			}
		});
	} catch (err) {
		console.error('D1 query error:', err);
		return httpError(500, 'Failed to query card database');
	}
};
