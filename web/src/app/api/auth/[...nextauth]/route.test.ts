import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Test de régression pour l'incident du 2026-07-13 : le wrapper
// d'observabilité appelait le handler NextAuth sans le contexte de route.
// NextAuth v4 détecte le mode App Router via la présence de `params` sur le
// second argument (next-auth/next/index.js) ; sans lui, il retombe en mode
// Pages Router, lit `req.query.nextauth` (inexistant sur un Request App
// Router) et toutes les routes /api/auth/* répondaient 500 en production.
//
// Le mock ci-dessous réplique fidèlement ce dispatch : si le contexte est
// perdu par le wrapper, le test reproduit le TypeError de l'incident.
vi.mock('next-auth', () => ({
	default: () => async (req: unknown, res?: { params?: { nextauth?: string[] } }) => {
		if (res?.params) {
			const nextauth = (await res.params).nextauth;
			return new Response(JSON.stringify({ action: nextauth?.[0] ?? null }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		// Mode Pages Router : même destructuration que next-auth v4, qui jette
		// « Cannot destructure property 'nextauth' of 'req.query' as it is
		// undefined » quand on lui passe un Request App Router.
		const { nextauth } = (req as { query?: { nextauth: string[] } }).query!;
		return new Response(JSON.stringify({ action: nextauth[0] }), { status: 200 });
	},
}));

describe('route NextAuth [...nextauth] (App Router)', () => {
	it('GET transmet le contexte App Router au handler NextAuth', async () => {
		const { GET } = await import('./route');
		const req = new NextRequest('http://localhost:3000/api/auth/providers');

		const response = await GET(req, { params: Promise.resolve({ nextauth: ['providers'] }) });

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.action).toBe('providers');
	});

	it('POST transmet le contexte App Router au handler NextAuth', async () => {
		const { POST } = await import('./route');
		const req = new NextRequest('http://localhost:3000/api/auth/signout', {
			method: 'POST',
		});

		const response = await POST(req, { params: Promise.resolve({ nextauth: ['signout'] }) });

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.action).toBe('signout');
	});

	it("ajoute l'en-tête de corrélation observabilité à la réponse", async () => {
		const { GET } = await import('./route');
		const req = new NextRequest('http://localhost:3000/api/auth/session');

		const response = await GET(req, { params: Promise.resolve({ nextauth: ['session'] }) });

		expect(response.headers.get('X-WellNeuro-Correlation-Id')).toMatch(/^cor_/);
	});
});
