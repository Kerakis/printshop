export interface ParsedInputCard {
	name: string;
	quantity: number;
	foilStatus: string;
	tags: string;
}

interface CardLookupResult {
	found: boolean;
	card: {
		id: string;
		name: string;
		set_code: string;
		set_name: string;
		collector_number: string;
		released_at: string | null;
		foilStatus: string;
	} | null;
}

/**
 * Exported so callers can reuse the exact backend result type
 */
export interface BatchResultCard {
	id: string;
	name: string;
	set_code: string;
	set_name: string;
	collector_number: string;
	released_at: string | null;
	finishes: string;
	foilStatus: string;
}

/**
 * Parse bulk card list input with flexible format support
 */
export function parseCardInput(input: string): ParsedInputCard[] {
	const cards: ParsedInputCard[] = [];

	const lines = input
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	for (const line of lines) {
		const [lineWithoutTags, ...tagParts] = line.split('#');
		const tags = tagParts.map((tag) => '#' + tag.trim()).join(' ');

		let remaining = lineWithoutTags.trim();
		let quantity = 1;
		let foilStatus = '';

		const quantityMatch = remaining.match(/^(\d+)x?\s+/i);
		if (quantityMatch) {
			quantity = parseInt(quantityMatch[1], 10);
			remaining = remaining.substring(quantityMatch[0].length).trim();
		}

		const foilMatch = remaining.match(/\s+\*([FE])\*\s*$/i);
		if (foilMatch) {
			foilStatus = foilMatch[1].toUpperCase();
			remaining = remaining.substring(0, foilMatch.index).trim();
		}

		remaining = remaining.replace(/\s+\([^)]+\)\s+[^\s]+\s*$/i, '').trim();

		const cardName = remaining.replace(/\s+\/\s+/g, ' // ');

		if (!cardName) continue;

		console.log(`Parsed card: "${remaining.trim()}" -> "${cardName}"`);

		cards.push({
			name: cardName,
			quantity,
			foilStatus,
			tags
		});
	}

	return cards;
}

/**
 * Format card for Moxfield output while preserving original metadata
 */
function formatForMoxfield(dbResult: CardLookupResult, originalInput: ParsedInputCard): string {
	if (!dbResult.found || !dbResult.card) {
		return '';
	}

	const card = dbResult.card;
	const setCode = card.set_code.toUpperCase();

	const foilStatus = originalInput.foilStatus || '';

	const finishSuffix = foilStatus ? ` *${foilStatus}*` : '';
	const tagsSuffix = originalInput.tags ? ` ${originalInput.tags}` : '';

	return `${originalInput.quantity} ${card.name} (${setCode}) ${card.collector_number}${finishSuffix}${tagsSuffix}`;
}

/**
 * Batch format multiple cards for Moxfield while preserving metadata
 */
export async function processBatch(
	parsedCards: ParsedInputCard[],
	batchLookupFn: (
		cards: { name: string; quantity?: number; foilStatus?: string; tags?: string }[]
	) => Promise<{
		results: { found: boolean; originalCard: ParsedInputCard; result: BatchResultCard | null }[];
	}>
): Promise<{
	success: string[];
	failed: { name: string; reason: string }[];
}> {
	const success: string[] = [];
	const failed: { name: string; reason: string }[] = [];

	try {
		const results = await batchLookupFn(parsedCards);

		for (const result of results.results) {
			if (result.found && result.result) {
				const formatted = formatForMoxfield(
					{ found: true, card: result.result },
					result.originalCard
				);
				if (formatted) success.push(formatted);
			} else {
				failed.push({
					name: result.originalCard.name,
					reason: 'Card not found in database'
				});
			}
		}
	} catch (err) {
		for (const card of parsedCards) {
			failed.push({
				name: card.name,
				reason: err instanceof Error ? err.message : 'Unknown error'
			});
		}
	}

	return { success, failed };
}
