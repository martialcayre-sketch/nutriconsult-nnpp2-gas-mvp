import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/observability/logger';
import { EVENT_CODES } from '@/lib/observability/eventCodes';
import {
	createRequestContext,
	finalizeLogContext,
	withCorrelationHeader,
} from '@/lib/observability/requestContext';

const handler = NextAuth(authOptions);

// NextAuth v4 détecte le mode App Router via la présence de `params` sur le
// second argument : l'omettre le fait retomber en mode Pages Router
// (`req.query.nextauth`) et casse toute l'authentification en production.
// Next 15 rend `params` asynchrone. next-auth await déjà la valeur
// (`next-auth/next/index.js` : `(await context.params)?.nextauth`) et ne teste
// que la PRÉSENCE de `params` pour détecter l'App Router : passer la promesse
// telle quelle préserve donc la détection décrite ci-dessus.
type RouteContext = { params: Promise<{ nextauth: string[] }> };

export async function GET(req: Request, context: RouteContext): Promise<Response> {
	const requestContext = createRequestContext(req);
	try {
		const response = await handler(req as never, context as never);
		return withCorrelationHeader(response, requestContext);
	} catch (error) {
		logger.error({
			event: EVENT_CODES.AUTH_PROVIDER_ERROR,
			domain: 'AUTH',
			message: 'Erreur provider NextAuth sur GET',
			context: finalizeLogContext(requestContext, { statusCode: 500, retryable: true }),
			error,
		});
		throw error;
	}
}

export async function POST(req: Request, context: RouteContext): Promise<Response> {
	const requestContext = createRequestContext(req);
	try {
		const response = await handler(req as never, context as never);
		return withCorrelationHeader(response, requestContext);
	} catch (error) {
		logger.error({
			event: EVENT_CODES.AUTH_PROVIDER_ERROR,
			domain: 'AUTH',
			message: 'Erreur provider NextAuth sur POST',
			context: finalizeLogContext(requestContext, { statusCode: 500, retryable: true }),
			error,
		});
		throw error;
	}
}
