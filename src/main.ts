import "dotenv/config";
import { AppContext, initializeAppContext } from "./appContext";
import { confirmPendingTransactions } from "./pendingTransactionManager";
import {
	fetchMissedEvents,
	subscribeToPingEvents,
	attachWebSocketErrorHandlers,
	testWebsocketFallback,
} from "./sentPong";
import { logger } from "./logger";

async function main() {
	logger.info("Ping Pong App Starting Up...");
	await initializeAppContext();
	await confirmPendingTransactions();
	await fetchMissedEvents(
		AppContext.pendingState.lastProcessedBlock ||
			AppContext.confirmedState.lastProcessedBlock
	);
	subscribeToPingEvents();
	attachWebSocketErrorHandlers();

	setInterval(async () => {
		await confirmPendingTransactions();
	}, 30_000);

	logger.info("Bot initialized!");

	testWebsocketFallback();
}

main().catch((err) => {
	logger.error(err);
	logger.info("Application is shutting down...");
	return 0;
});
