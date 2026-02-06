export interface MoxfieldCard {
	quantity: number;
	cardName: string;
	setCode: string;
	foilStatus: string;
	collectorNumber?: string;
	tags?: string;
}

export interface ParsedInputCard {
	name: string;
	quantity: number;
	foilStatus: string;
	tags: string;
}

export interface CardLookupResult {
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

interface BatchResultCard {
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
 * Supports:
 * - "Abrade"
 * - "1 Abrade" or "1x Abrade"
 * - "1 Abrade F" (F = Foil, E = Etched)
 * - "1 Aetherflux Reservoir (KHM) 311 *F* #Tag1 #Tag2" (full Moxfield format)
 */
export function parseCardInput(input: string): ParsedInputCard[] {
	const cards: ParsedInputCard[] = [];

	const lines = input
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	for (const line of lines) {
		// Remove tags (everything after #)
		const [lineWithoutTags, ...tagParts] = line.split('#');
		const tags = tagParts.map((tag) => '#' + tag.trim()).join(' ');

		// Parse: [quantity] cardName [set] [collector] [*foil*]
		// Examples:
		// "Abrade" => name only
		// "1 Abrade" => quantity + name
		// "1x Abrade" => quantity + name (with x separator)
		// "1 Aetherflux Reservoir (KHM) 311 *F*" => full Moxfield format
		// "Birgi, God of Storytelling / Harnfel, Horn of Bounty" => dual-faced

		let remaining = lineWithoutTags.trim();
		let quantity = 1;
		let foilStatus = '';

		// Try to extract quantity from the beginning
		const quantityMatch = remaining.match(/^(\d+)x?\s+/i);
		if (quantityMatch) {
			quantity = parseInt(quantityMatch[1], 10);
			remaining = remaining.substring(quantityMatch[0].length).trim();
		}

		// Try to extract foil status from the end (*F* or *E*)
		const foilMatch = remaining.match(/\s+\*([FE])\*\s*$/i);
		if (foilMatch) {
			foilStatus = foilMatch[1].toUpperCase();
			remaining = remaining.substring(0, foilMatch.index).trim();
		}

		// Remove (SET) CODE pattern if present
		// This regex is more flexible to handle:
		// - (PUMA) U31
		// - (40K) 204★
		// - (PMEI) 2023-8
		// - (PLST) 2XM-267
		// Basically: (ANYTHING) ANYTHING_ELSE
		remaining = remaining.replace(/\s+\([^)]+\)\s+[^\s]+\s*$/i, '').trim();

		// Convert single slash to double slash for dual-faced cards
		// E.g., "Birgi, God of Storytelling / Harnfel, Horn of Bounty"
		// becomes "Birgi, God of Storytelling // Harnfel, Horn of Bounty"
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
 * Format: "quantity cardName (setCode) collectorNumber [*finish*] [tags]"
 * Example: "1 Big Score (SNC) 102 *F* #Card Advantage"
 */
export function formatForMoxfield(
	dbResult: CardLookupResult,
	originalInput: ParsedInputCard
): string {
	if (!dbResult.found || !dbResult.card) {
		return '';
	}

	const card = dbResult.card;
	const setCode = card.set_code.toUpperCase();

	// Use requested foil status if explicitly set, otherwise use detected
	const foilStatus = originalInput.foilStatus || card.foilStatus || '';

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
