// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				MTG_CARDS_DB: D1Database;
				MOXFIELD_USER_AGENT: { get(): Promise<string> };
				/** Local-dev only: Secrets Store bindings don't resolve in `wrangler dev`. */
				MOXFIELD_USER_AGENT_DEV?: string;
			};
		}
	}
}

export {};
