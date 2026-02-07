<script lang="ts">
	import { parseCardInput, processBatch, type ParsedInputCard } from '$lib/moxfieldFormatter';

	let inputText = '';
	let inputFile: FileList;
	let isProcessing = false;
	let processingStatus = '';
	let successCards: string[] = [];
	let failedCards: { name: string; reason: string }[] = [];
	let hasRun = false;

	async function batchLookup(
		cards: { name: string; quantity?: number; foilStatus?: string; tags?: string }[]
	) {
		const response = await fetch('/api/cards/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ cards })
		});

		if (!response.ok) {
			throw new Error('Failed to lookup cards');
		}

		return response.json();
	}

	async function handleProcess() {
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

			processingStatus = `Looking up ${parsedCards.length} card${parsedCards.length === 1 ? '' : 's'}...`;

			const results = await processBatch(parsedCards, batchLookup);
			successCards = results.success;
			failedCards = results.failed;

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
			alert('Copied to clipboard!');
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
	}
</script>

<div class="min-h-screen bg-linear-to-br from-slate-900 to-slate-800 p-8">
	<div class="mx-auto max-w-6xl">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="mb-2 text-4xl font-bold text-white">Printshop</h1>
			<p class="text-slate-300">Swap your current card list for the oldest versions!</p>
		</div>

		<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
			<!-- Input Section -->
			<div class="space-y-6">
				<div class="rounded-lg bg-slate-700 p-6 shadow-xl">
					<h2 class="mb-4 text-xl font-semibold text-white">Card Input</h2>

					<div class="space-y-4">
						<div>
							<label for="textarea" class="mb-2 block text-sm font-medium text-slate-300">
								Paste Your Card List from Moxfield's Bulk Editor
							</label>
							<textarea
								id="textarea"
								bind:value={inputText}
								placeholder="Enter one card per line."
								class="h-40 w-full rounded border border-slate-500 bg-slate-600 px-4 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
								disabled={isProcessing}
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

						<div>
							<label for="file" class="mb-2 block text-sm font-medium text-slate-300">
								Upload Text File
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
									Select file
								</button>
								{#if inputFile && inputFile.length > 0}
									<div class="text-sm text-slate-400">
										Selected: <span class="text-slate-200">{inputFile[0].name}</span>
									</div>
								{/if}
							</div>
						</div>

						<button
							on:click={handleProcess}
							disabled={isProcessing ||
								(!inputText.trim() && (!inputFile || inputFile.length === 0))}
							class="w-full rounded bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-600"
						>
							{isProcessing ? 'Processing...' : 'Find Oldest Printings'}
						</button>

						{#if isProcessing && processingStatus}
							<div class="flex items-center gap-2 rounded bg-blue-900/30 p-3 text-sm text-blue-300">
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-transparent"
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
						Tags and foil data are preserved where possible. Not all printings are available in
						every treatment.
					</p>
				</div>
			</div>

			<!-- Output Section -->
			<div class="space-y-6">
				<div class="rounded-lg bg-slate-700 p-6 shadow-xl">
					<h2 class="mb-4 text-xl font-semibold text-white">Moxfield Output</h2>

					{#if !hasRun}
						<div class="py-8 text-center text-slate-400">
							Process your cards above to see Moxfield-formatted results
						</div>
					{:else if isProcessing}
						<div class="py-8 text-center">
							<div
								class="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-slate-500 border-t-blue-400"
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
									class="flex-1 rounded bg-green-600 px-4 py-2 font-semibold text-white transition hover:bg-green-700"
								>
									Copy to Clipboard
								</button>
								<button
									on:click={downloadMoxfield}
									class="flex-1 rounded bg-purple-600 px-4 py-2 font-semibold text-white transition hover:bg-purple-700"
								>
									Download .txt
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
		</div>
	</div>
</div>
