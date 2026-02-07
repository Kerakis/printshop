<script lang="ts">
	import { parseCardInput, processBatch, type ParsedInputCard } from '$lib/moxfieldFormatter';

	let inputText = '';
	let inputFile: FileList | undefined;
	let isProcessing = false;
	let processingStatus = '';
	let successCards: string[] = [];
	let failedCards: { name: string; reason: string }[] = [];
	let hasRun = false;
	let copyButtonText = 'Copy to Clipboard';
	let downloadButtonText = 'Download Text File';
	let sortOrder: 'oldest' | 'newest' = 'oldest';

	// Session cache for card lookups (keyed by cardName_sortOrder)
	const cardCache = new Map<string, any>();
	let cacheHits = 0;
	let cacheMisses = 0;

	// Track input state to prevent reprocessing unchanged inputs
	let lastProcessedInput = '';
	let lastProcessedFile = '';

	function getInputHash() {
		const text = inputFile && inputFile.length > 0 ? inputFile[0].name : inputText;
		return text;
	}

	function hasInputChanged() {
		const currentInput = getInputHash();
		return currentInput !== lastProcessedInput || currentInput !== lastProcessedFile;
	}

	async function batchLookup(
		cards: { name: string; quantity?: number; foilStatus?: string; tags?: string }[]
	) {
		const cachedResults: any[] = [];
		const uncachedCards: typeof cards = [];
		const cardIndexMap = new Map<number, number>(); // maps original index to result index

		// Check cache first
		cards.forEach((card, index) => {
			const cacheKey = `${card.name.toLowerCase()}_${sortOrder}`;
			const cached = cardCache.get(cacheKey);

			if (cached) {
				cacheHits++;
				cachedResults.push({
					found: cached.found,
					originalCard: card,
					result: cached.result
				});
				cardIndexMap.set(index, cachedResults.length - 1);
			} else {
				cacheMisses++;
				cardIndexMap.set(index, -uncachedCards.length - 1); // negative to indicate uncached
				uncachedCards.push(card);
			}
		});

		// Fetch uncached cards if any
		if (uncachedCards.length > 0) {
			const response = await fetch('/api/cards/batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cards: uncachedCards, sortOrder })
			});

			if (!response.ok) {
				throw new Error('Failed to lookup cards');
			}

			const data = await response.json();

			// Cache the results
			data.results.forEach((result: any, idx: number) => {
				const card = uncachedCards[idx];
				const cacheKey = `${card.name.toLowerCase()}_${sortOrder}`;
				cardCache.set(cacheKey, {
					found: result.found,
					result: result.result
				});
			});

			// Merge cached and fresh results in original order
			const allResults: any[] = [];
			let uncachedIdx = 0;
			let cachedIdx = 0;

			for (let i = 0; i < cards.length; i++) {
				const mapValue = cardIndexMap.get(i)!;
				if (mapValue >= 0) {
					// From cache
					allResults.push(cachedResults[mapValue]);
				} else {
					// From fresh fetch
					allResults.push(data.results[uncachedIdx++]);
				}
			}

			return { results: allResults };
		}

		// All cards were cached
		return { results: cachedResults };
	}

	async function handleProcess() {
		// Check if input has changed since last processing
		if (hasRun && !hasInputChanged()) {
			failedCards = [
				{
					name: 'Input',
					reason:
						'No changes detected. Modify your card input or select a different file to process.'
				}
			];
			return;
		}

		isProcessing = true;
		processingStatus = '';
		successCards = [];
		failedCards = [];
		hasRun = true;

		try {
			// Get input text from either textarea or file upload
			let text = inputText;

			if (inputFile && inputFile.length > 0) {
				text = await inputFile[0].text();
			}

			if (!text.trim()) {
				failedCards = [{ name: 'Input', reason: 'No card list provided' }];
				isProcessing = false;
				return;
			}

			const parsedCards = parseCardInput(text);
			if (parsedCards.length === 0) {
				failedCards = [{ name: 'Input', reason: 'No valid cards found in input' }];
				isProcessing = false;
				return;
			}

			const cacheStatsText = cardCache.size > 0 ? ` (${cardCache.size} cached)` : '';
			processingStatus = `Looking up ${parsedCards.length} card${parsedCards.length === 1 ? '' : 's'}${cacheStatsText}...`;

			const results = await processBatch(parsedCards, batchLookup);
			successCards = results.success;
			failedCards = results.failed;

			// Store the processed input state
			lastProcessedInput = inputText;
			lastProcessedFile = inputFile && inputFile.length > 0 ? inputFile[0].name : '';

			// Clear status once processing is complete
			processingStatus = '';
		} catch (err) {
			failedCards = [
				{
					name: 'Processing',
					reason: err instanceof Error ? err.message : 'Unknown error'
				}
			];
			processingStatus = '';
		} finally {
			isProcessing = false;
		}
	}

	function copyToClipboard() {
		const text = successCards.join('\n');
		navigator.clipboard.writeText(text).then(() => {
			copyButtonText = 'Copied!';
			setTimeout(() => {
				copyButtonText = 'Copy to Clipboard';
			}, 5000);
		});
	}

	function downloadMoxfield() {
		const text = successCards.join('\n');
		const element = document.createElement('a');
		element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
		element.setAttribute('download', 'moxfield-cards.txt');
		element.style.display = 'none';
		document.body.appendChild(element);
		element.click();
		document.body.removeChild(element);
		downloadButtonText = 'Downloaded!';
		setTimeout(() => {
			downloadButtonText = 'Download Text File';
		}, 5000);
	}

	function clearCache() {
		cardCache.clear();
		cacheHits = 0;
		cacheMisses = 0;
	}
</script>

<div class="min-h-screen bg-slate-900 p-8">
	<div class="mx-auto max-w-6xl">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="mb-2 text-4xl font-bold text-white">Printshop</h1>
			<p class="text-slate-300">Find the oldest or newest printing of each card in your deck!</p>
		</div>

		<div class="space-y-8">
			<!-- Input Section -->
			<div class="rounded-lg bg-slate-700 p-6 shadow-xl">
				<h2 class="mb-4 text-xl font-semibold text-white">Card Input</h2>

				<div class="space-y-4">
					<!-- Textarea Input -->
					<div class={inputFile && inputFile.length > 0 ? 'pointer-events-none opacity-50' : ''}>
						<label
							for="textarea"
							class="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300"
						>
							<span>Paste your card list from Moxfield's Bulk Editor</span>
							{#if !inputFile || inputFile.length === 0}
								<span
									class="inline-block rounded bg-green-600/40 px-2 py-0.5 text-xs text-green-300"
									>Active</span
								>
							{/if}
						</label>
						<textarea
							id="textarea"
							bind:value={inputText}
							placeholder="Enter one card per line."
							class="h-40 w-full rounded border border-slate-500 bg-slate-600 px-4 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
							disabled={isProcessing || (inputFile && inputFile.length > 0)}
						></textarea>
					</div>

					<div class="relative">
						<div class="absolute inset-0 flex items-center">
							<div class="w-full border-t border-slate-500"></div>
						</div>
						<div class="relative flex justify-center text-sm">
							<span class="bg-slate-700 px-2 text-slate-400">OR</span>
						</div>
					</div>

					<!-- File Input -->
					<div>
						<label
							for="file"
							class="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300"
						>
							<span>Upload Text File</span>
							{#if inputFile && inputFile.length > 0}
								<span
									class="inline-block rounded bg-green-600/40 px-2 py-0.5 text-xs text-green-300"
									>Active</span
								>
							{/if}
						</label>
						<input
							id="file"
							type="file"
							accept=".txt"
							bind:files={inputFile}
							class="hidden"
							disabled={isProcessing}
						/>
						<div class="flex flex-col gap-2">
							<button
								on:click={() => document.getElementById('file')?.click()}
								class="w-full rounded bg-slate-600 px-4 py-2 text-white transition hover:bg-slate-500 disabled:opacity-50"
								disabled={isProcessing}
							>
								{inputFile && inputFile.length > 0 ? 'Change file' : 'Select file'}
							</button>
							{#if inputFile && inputFile.length > 0}
								<div
									class="flex items-center justify-between rounded border border-slate-500 bg-slate-600/50 p-3"
								>
									<div class="flex-1 text-sm">
										<div class="text-xs text-slate-400">Selected:</div>
										<div class="truncate text-slate-200">{inputFile[0].name}</div>
									</div>
									<button
										on:click={(e) => {
											e.preventDefault();
											inputFile = undefined;
										}}
										class="ml-2 rounded bg-red-600/40 px-3 py-1 text-xs text-red-300 transition hover:bg-red-600/60"
										disabled={isProcessing}
									>
										Clear
									</button>
								</div>
							{/if}
						</div>
					</div>

					<div>
						<label for="sortOrder" class="mb-2 block text-sm font-medium text-slate-300">
							Find
						</label>
						<select
							id="sortOrder"
							bind:value={sortOrder}
							class="w-full rounded border border-slate-500 bg-slate-600 px-4 py-2 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
							disabled={isProcessing}
						>
							<option value="oldest">Oldest Printings</option>
							<option value="newest">Newest Printings</option>
						</select>
					</div>

					<button
						on:click={handleProcess}
						disabled={isProcessing ||
							(!inputText.trim() && (!inputFile || inputFile.length === 0)) ||
							(hasRun && !hasInputChanged())}
						class="w-full rounded bg-slate-500 px-6 py-3 font-semibold text-white transition hover:bg-slate-400 disabled:cursor-not-allowed disabled:bg-slate-600"
					>
						{isProcessing ? 'Processing...' : 'Process Cards'}
					</button>

					{#if isProcessing && processingStatus}
						<div class="flex items-center gap-2 rounded bg-slate-600/50 p-3 text-sm text-slate-200">
							<div
								class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent"
							></div>
							{processingStatus}
						</div>
					{/if}
				</div>
			</div>

			<!-- Info Box -->
			<div class="rounded-lg bg-slate-700 p-6 shadow-xl">
				<h3 class="mb-3 text-lg font-semibold text-white">Supported Formats</h3>
				<ul class="space-y-2 text-sm text-slate-300">
					<li>
						<span class="rounded bg-slate-600 px-2 py-1 font-mono text-xs">Abrade</span>
					</li>
					<li>
						<span class="rounded bg-slate-600 px-2 py-1 font-mono text-xs">1 Abrade</span>
					</li>
					<li>
						<span class="rounded bg-slate-600 px-2 py-1 font-mono text-xs">2x Abrade</span>
					</li>
					<li>
						<span class="rounded bg-slate-600 px-2 py-1 font-mono text-xs"
							>2 Abrade (HOU) 83 *F*</span
						>
					</li>
				</ul>
				<p class="mt-3 text-xs text-slate-400">
					Tags and foil data are preserved where possible. Not all foil treatments are available for
					every printing.
				</p>
			</div>

			<!-- Cache Info -->
			{#if cardCache.size > 0}
				<div class="rounded-lg bg-slate-700 p-6 shadow-xl">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="text-lg font-semibold text-white">Cache Info</h3>
						<button
							on:click={clearCache}
							class="rounded bg-slate-500 px-3 py-1 text-sm text-white transition hover:bg-slate-400"
						>
							Clear Cache
						</button>
					</div>
					<div class="grid grid-cols-2 gap-4 text-sm">
						<div>
							<div class="text-slate-400">Cached Cards</div>
							<div class="text-2xl font-bold text-blue-400">{cardCache.size}</div>
						</div>
						<div>
							<div class="text-slate-400">Cache Hit Rate</div>
							<div class="text-2xl font-bold text-green-400">
								{cacheHits + cacheMisses > 0
									? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100)
									: 0}%
							</div>
						</div>
					</div>
					<p class="mt-3 text-xs text-slate-400">
						Cards are cached for this session. Switching between oldest/newest reuses cached data.
					</p>
				</div>
			{/if}

			<!-- Output Section -->
			{#if hasRun}
				<div class="rounded-lg bg-slate-700 p-6 shadow-xl">
					<h2 class="mb-4 text-xl font-semibold text-white">Moxfield Output</h2>

					{#if isProcessing}
						<div class="py-8 text-center">
							<div
								class="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-slate-500 border-t-slate-300"
							></div>
							<p class="mt-4 text-slate-300">Processing your cards...</p>
						</div>
					{:else if successCards.length > 0}
						<div class="space-y-4">
							<div
								class="max-h-64 overflow-auto rounded border border-slate-500 bg-slate-600 p-4 font-mono text-sm text-slate-100"
							>
								{#each successCards as card (card)}
									<div class="py-1">{card}</div>
								{/each}
							</div>

							<div class="flex gap-3">
								<button
									on:click={copyToClipboard}
									class="flex-1 rounded bg-slate-500 px-4 py-2 font-semibold text-white transition hover:bg-slate-400"
								>
									{copyButtonText}
								</button>
								<button
									on:click={downloadMoxfield}
									class="flex-1 rounded bg-slate-500 px-4 py-2 font-semibold text-white transition hover:bg-slate-400"
								>
									{downloadButtonText}
								</button>
							</div>
						</div>
					{/if}

					{#if failedCards.length > 0}
						<div class="mt-6">
							<h3 class="mb-3 text-lg font-semibold text-red-400">
								Failed Cards ({failedCards.length})
							</h3>
							<div
								class="max-h-40 space-y-2 overflow-auto rounded border border-red-900/50 bg-red-900/20 p-4"
							>
								{#each failedCards as failed (failed.name)}
									<div class="text-sm text-red-300">
										<span class="font-semibold">{failed.name}:</span>
										{failed.reason}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Stats Box -->
			{#if hasRun && (successCards.length > 0 || failedCards.length > 0)}
				<div class="rounded-lg bg-slate-700 p-6 shadow-xl">
					<h3 class="mb-3 text-lg font-semibold text-white">Summary</h3>
					<div class="grid grid-cols-2 gap-4 text-sm">
						<div>
							<div class="text-slate-400">Found</div>
							<div class="text-2xl font-bold text-green-400">{successCards.length}</div>
						</div>
						<div>
							<div class="text-slate-400">Not Found</div>
							<div class="text-2xl font-bold text-red-400">{failedCards.length}</div>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<footer class="mt-8 border-t border-slate-700 pt-6 text-center">
			<p class="text-sm text-slate-400">
				<a
					href="https://github.com/Kerakis"
					target="_blank"
					rel="noopener noreferrer"
					class="text-slate-300 transition hover:text-white"
				>
					Kerakis
				</a>
			</p>
		</footer>
	</div>
</div>
